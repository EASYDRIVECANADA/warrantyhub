import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Users, Search, ShieldCheck, ArrowRight, User, Building2, ChevronDown, ChevronRight, Store, ArrowUpRight } from "lucide-react";

import { PageShell } from "../components/PageShell";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { getAppMode } from "../lib/runtime";
import { getSupabaseClient } from "../lib/supabase/client";
import { confirmProceed, sanitizeWordsOnly } from "../lib/utils";
import type { Role } from "../lib/auth/types";
import { useAuth } from "../providers/AuthProvider";
import { logAuditEvent } from "../lib/auditLog";

type AdminProfile = {
  id: string;
  email?: string;
  role: Role;
  displayName?: string;
  companyName?: string;
  createdAt?: string;
  provider_company_id?: string;
};

type DealerRow = {
  id: string;
  name: string;
};

type ProviderCompany = {
  id: string;
  provider_company_name: string;
};

type DealerMemberRow = {
  id: string;
  dealer_id: string;
  user_id: string;
  role: string;
  status: string;
};

const LOCAL_USERS_KEY = "warrantyhub.local.users";

type LocalUserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role | "DEALER";
};

function readLocalUsers(): LocalUserRecord[] {
  const raw = localStorage.getItem(LOCAL_USERS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LocalUserRecord[];
  } catch {
    return [];
  }
}

function writeLocalUsers(users: LocalUserRecord[]) {
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

function roleLabel(r: Role) {
  if (r === "ADMIN") return "Admin";
  if (r === "PROVIDER") return "Provider";
  if (r === "DEALER_ADMIN") return "Dealer Admin";
  if (r === "DEALER_EMPLOYEE") return "Dealer Employee";
  return "Unassigned";
}

function roleBadgeClass(role: Role) {
  if (role === "ADMIN") return "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20";
  if (role === "PROVIDER") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20";
  if (role === "DEALER_ADMIN") return "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20";
  if (role === "DEALER_EMPLOYEE") return "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20";
  return "bg-muted text-muted-foreground";
}

export function AdminUsersPage() {
  const mode = useMemo(() => getAppMode(), []);
  const qc = useQueryClient();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedDealers, setExpandedDealers] = useState<Record<string, boolean>>({});
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});

  const profilesQuery = useQuery({
    queryKey: ["admin-profiles", mode],
    queryFn: async (): Promise<AdminProfile[]> => {
      if (mode === "supabase") {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Supabase is not configured");

        const { data, error } = await supabase
          .from("profiles")
          .select("id, email, role, display_name, company_name, created_at, provider_company_id")
          .order("created_at", { ascending: false });

        if (error) throw error;
        return (data as any[]).map((r) => ({
          id: r.id,
          email: r.email ?? undefined,
          role: ((r.role ?? "UNASSIGNED") === "DEALER" ? "DEALER_ADMIN" : r.role) as Role,
          displayName: r.display_name ?? undefined,
          companyName: r.company_name ?? undefined,
          createdAt: r.created_at ?? undefined,
          provider_company_id: r.provider_company_id ?? undefined,
        }));
      }

      return readLocalUsers()
        .map((u) => ({
          id: u.id,
          email: u.email,
          role: (u.role === "DEALER" ? "DEALER_ADMIN" : u.role) as Role,
        }))
        .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
    },
  });

  const dealersQuery = useQuery({
    queryKey: ["superadmin-dealers-users", mode],
    queryFn: async (): Promise<DealerRow[]> => {
      if (mode !== "supabase") return [];
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("dealers")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as any[]) as DealerRow[];
    },
  });

  const providerCompaniesQuery = useQuery({
    queryKey: ["admin-provider-companies-users", mode],
    queryFn: async (): Promise<ProviderCompany[]> => {
      if (mode !== "supabase") return [];
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("provider_companies")
        .select("id, provider_company_name")
        .order("provider_company_name", { ascending: true });
      if (error) throw error;
      return (data as any[]) as ProviderCompany[];
    },
  });

  const dealerMembersQuery = useQuery({
    queryKey: ["admin-dealer-members-all", mode],
    queryFn: async (): Promise<DealerMemberRow[]> => {
      if (mode !== "supabase") return [];
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("dealer_members")
        .select("id, dealer_id, user_id, role, status");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (input: { id: string; nextRole: Role }) => {
      if (input.nextRole === "SUPER_ADMIN") throw new Error("Super Admin cannot be assigned");
      if (input.nextRole === "ADMIN" && user?.role !== "SUPER_ADMIN") {
        throw new Error("Only Super Admin can assign Admin role");
      }
      if (input.nextRole === "DEALER_ADMIN" && user?.role !== "ADMIN") {
        throw new Error("Only Admin can assign Dealer Admin role");
      }

      if (mode === "supabase") {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Supabase is not configured");

        const { error } = await supabase.from("profiles").update({ role: input.nextRole }).eq("id", input.id);
        if (error) throw error;
        return;
      }

      const users = readLocalUsers();
      const idx = users.findIndex((u) => u.id === input.id);
      if (idx < 0) throw new Error("User not found");
      const next = [...users];
      next[idx] = { ...next[idx], role: input.nextRole };
      writeLocalUsers(next);
    },
    onSuccess: async (_, variables) => {
      const target = (profilesQuery.data ?? []).find((p) => p.id === variables.id);
      logAuditEvent({
        kind: "ROLE_CHANGED",
        actorUserId: user?.id,
        actorEmail: user?.email,
        actorRole: user?.role,
        entityType: "profile",
        entityId: variables.id,
        message: `Changed role for ${target?.email ?? variables.id} to ${variables.nextRole}`,
      });
      await qc.invalidateQueries({ queryKey: ["admin-profiles", mode] });
    },
  });

  const busy = updateRoleMutation.isPending;

  const allProfiles = profilesQuery.data ?? [];
  const dealers = dealersQuery.data ?? [];
  const providerCompanies = providerCompaniesQuery.data ?? [];
  const dealerMembers = dealerMembersQuery.data ?? [];

  const dealerAdmins = allProfiles.filter((p) => p.role === "DEALER_ADMIN");
  const dealerEmployees = allProfiles.filter((p) => p.role === "DEALER_EMPLOYEE");
  const providers = allProfiles.filter((p) => p.role === "PROVIDER");
  const admins = allProfiles.filter((p) => p.role === "ADMIN");

  const dealerMap = useMemo(() => {
    const map: Record<string, DealerRow> = {};
    for (const d of dealers) map[d.id] = d;
    return map;
  }, [dealers]);

  const providerMap = useMemo(() => {
    const map: Record<string, ProviderCompany> = {};
    for (const p of providerCompanies) map[p.id] = p;
    return map;
  }, [providerCompanies]);

  const getDealerForUser = (userId: string): string | null => {
    const member = dealerMembers.find((m) => m.user_id === userId);
    return member?.dealer_id ?? null;
  };

  const filtered = allProfiles.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (p.email ?? "").toLowerCase().includes(q) ||
      (p.companyName ?? "").toLowerCase().includes(q) ||
      (p.displayName ?? "").toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    );
  });

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const toggleDealer = (dealerId: string) => {
    setExpandedDealers((prev) => ({ ...prev, [dealerId]: !prev[dealerId] }));
  };

  const toggleProvider = (providerId: string) => {
    setExpandedProviders((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  const groupedDealers = useMemo(() => {
    const groups: Record<string, { admins: AdminProfile[]; employees: AdminProfile[] }> = {};
    for (const admin of dealerAdmins) {
      const dealerId = getDealerForUser(admin.id);
      if (dealerId && dealerMap[dealerId]) {
        if (!groups[dealerId]) groups[dealerId] = { admins: [], employees: [] };
        groups[dealerId].admins.push(admin);
      }
    }
    for (const emp of dealerEmployees) {
      const dealerId = getDealerForUser(emp.id);
      if (dealerId && dealerMap[dealerId]) {
        if (!groups[dealerId]) groups[dealerId] = { admins: [], employees: [] };
        groups[dealerId].employees.push(emp);
      }
    }
    return groups;
  }, [dealerAdmins, dealerEmployees, dealerMap, dealerMembers]);

  const groupedProviders = useMemo(() => {
    const groups: Record<string, AdminProfile[]> = {};
    for (const provider of providers) {
      const companyId = provider.provider_company_id;
      if (companyId && providerMap[companyId]) {
        if (!groups[companyId]) groups[companyId] = [];
        groups[companyId].push(provider);
      }
    }
    return groups;
  }, [providers, providerMap]);

  const handleRoleChange = (profileId: string, currentEmail: string | undefined, newRole: Role) => {
    void (async () => {
      if (!(await confirmProceed(`Change role for ${currentEmail ?? profileId} to ${roleLabel(newRole)}?`))) return;
      updateRoleMutation.mutate({ id: profileId, nextRole: newRole });
    })();
  };

  return (
    <PageShell
      title="User Management"
      subtitle="Manage user roles and view hierarchy"
      badge="SUPER ADMIN"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="gap-2">
            <Link to="/admin-access-requests">
              <ShieldCheck className="w-4 h-4" />
              Access Requests
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="gap-2">
            <Link to="/admin-dealerships">
              <Building2 className="w-4 h-4" />
              Dealerships
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="gap-2">
            <Link to="/platform">
              <ArrowRight className="w-4 h-4 rotate-180" />
              Dashboard
            </Link>
          </Button>
        </div>
      }
    >
      <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b bg-gradient-to-r from-blue-600/5 via-transparent to-transparent">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-foreground">User Hierarchy</div>
                <div className="text-sm text-muted-foreground">Expand groups to view members</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-violet-500/10 text-violet-700">
                <span className="text-sm font-medium">{admins.length}</span>
                <span className="text-xs text-muted-foreground ml-1">Admins</span>
              </div>
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-700">
                <span className="text-sm font-medium">{dealerAdmins.length + dealerEmployees.length}</span>
                <span className="text-xs text-muted-foreground ml-1">Dealers</span>
              </div>
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-700">
                <span className="text-sm font-medium">{providers.length}</span>
                <span className="text-xs text-muted-foreground ml-1">Providers</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-b">
          <div className="relative max-w-md">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Search className="w-4 h-4" />
            </div>
            <Input
              value={search}
              onChange={(e) => setSearch(sanitizeWordsOnly(e.target.value))}
              placeholder="Search by email, company, or ID..."
              className="pl-10 bg-background/70"
            />
          </div>
        </div>

        <div className="divide-y">
          {profilesQuery.isLoading && (
            <div className="p-6">
              <div className="animate-pulse space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 bg-muted rounded-xl" />
                ))}
              </div>
            </div>
          )}

          {profilesQuery.isError && (
            <div className="p-6 text-center">
              <div className="text-sm text-destructive">Failed to load users. Please try again.</div>
            </div>
          )}

          {!profilesQuery.isLoading && !profilesQuery.isError && filtered.length === 0 && (
            <div className="px-6 py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="text-sm font-medium">No users found</div>
              <div className="text-sm text-muted-foreground mt-1">
                {search ? `No results for "${search}"` : "No users in the system yet."}
              </div>
            </div>
          )}

          {!profilesQuery.isLoading && !profilesQuery.isError && filtered.length > 0 && (
            <>
              {admins.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => toggleGroup("admins")}
                    className="w-full px-6 py-4 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors text-left bg-gradient-to-r from-violet-500/5 via-transparent to-transparent"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-lg bg-violet-500/10 text-violet-600">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-sm">Platform Admins</div>
                        <div className="text-xs text-muted-foreground">{admins.length} administrators</div>
                      </div>
                    </div>
                    {expandedGroups.admins ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                  </button>
                  {expandedGroups.admins && (
                    <div className="divide-y bg-muted/20">
                      {admins.map((p) => (
                        <div key={p.id} className="px-6 py-4 pl-14 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="p-2 rounded-lg bg-muted/50 text-muted-foreground">
                                <User className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 flex-wrap">
                                  <span className="text-sm font-medium break-all">{p.email ?? "(email unknown)"}</span>
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${roleBadgeClass(p.role)}`}>
                                    {roleLabel(p.role)}
                                  </span>
                                </div>
                                {p.displayName && <div className="text-xs text-muted-foreground mt-1">{p.displayName}</div>}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {Object.keys(groupedDealers).length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => toggleGroup("dealers")}
                    className="w-full px-6 py-4 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors text-left bg-gradient-to-r from-blue-500/5 via-transparent to-transparent"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-sm">Dealership Users</div>
                        <div className="text-xs text-muted-foreground">{Object.keys(groupedDealers).length} dealerships</div>
                      </div>
                    </div>
                    {expandedGroups.dealers ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                  </button>
                  {expandedGroups.dealers && (
                    <div className="bg-muted/20">
                      {Object.entries(groupedDealers).map(([dealerId, { admins: dealerAdminsList, employees: dealerEmployeesList }]) => {
                        const dealer = dealerMap[dealerId];
                        const isExpanded = expandedDealers[dealerId];
                        const totalUsers = dealerAdminsList.length + dealerEmployeesList.length;

                        return (
                          <div key={dealerId}>
                            <button
                              type="button"
                              onClick={() => toggleDealer(dealerId)}
                              className="w-full px-6 py-3 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors text-left border-t"
                            >
                              <div className="flex items-center gap-3">
                                <Building2 className="w-4 h-4 text-blue-600" />
                                <div className="font-medium text-sm">{dealer?.name ?? dealerId}</div>
                                <span className="text-xs text-muted-foreground">({totalUsers} users)</span>
                              </div>
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                            </button>
                            {isExpanded && (
                              <div className="bg-background/50">
                                <div className="px-6 py-2 pl-16 bg-muted/20">
                                  <div className="text-xs text-muted-foreground font-medium">Admins ({dealerAdminsList.length})</div>
                                </div>
                                {dealerAdminsList.map((p) => (
                                  <div key={p.id} className="px-6 py-3 pl-20 hover:bg-muted/30 transition-colors">
                                    <div className="flex items-center justify-between gap-4 flex-wrap">
                                      <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="p-1.5 rounded-md bg-muted/50 text-muted-foreground">
                                          <ShieldCheck className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-3 flex-wrap">
                                            <span className="text-sm break-all">{p.email ?? "(email unknown)"}</span>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${roleBadgeClass(p.role)}`}>
                                              {roleLabel(p.role)}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                      <select
                                        value={p.role}
                                        disabled={busy}
                                        onChange={(e) => handleRoleChange(p.id, p.email, e.target.value as Role)}
                                        className="h-7 rounded-md border border-input bg-background px-2 text-xs shadow-sm"
                                      >
                                        <option value="DEALER_ADMIN">Dealer Admin</option>
                                        <option value="DEALER_EMPLOYEE">Dealer Employee</option>
                                        <option value="PROVIDER">Provider</option>
                                      </select>
                                    </div>
                                  </div>
                                ))}
                                {dealerEmployeesList.length > 0 && (
                                  <>
                                    <div className="px-6 py-2 pl-16 bg-muted/20 border-t">
                                      <div className="text-xs text-muted-foreground font-medium">Employees ({dealerEmployeesList.length})</div>
                                    </div>
                                    {dealerEmployeesList.map((p) => (
                                      <div key={p.id} className="px-6 py-3 pl-20 hover:bg-muted/30 transition-colors">
                                        <div className="flex items-center justify-between gap-4 flex-wrap">
                                          <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="p-1.5 rounded-md bg-muted/50 text-muted-foreground">
                                              <User className="w-3.5 h-3.5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-3 flex-wrap">
                                                <span className="text-sm break-all">{p.email ?? "(email unknown)"}</span>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${roleBadgeClass(p.role)}`}>
                                                  {roleLabel(p.role)}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                          <select
                                            value={p.role}
                                            disabled={busy}
                                            onChange={(e) => handleRoleChange(p.id, p.email, e.target.value as Role)}
                                            className="h-7 rounded-md border border-input bg-background px-2 text-xs shadow-sm"
                                          >
                                            <option value="DEALER_EMPLOYEE">Dealer Employee</option>
                                            <option value="DEALER_ADMIN">Dealer Admin</option>
                                            <option value="PROVIDER">Provider</option>
                                          </select>
                                        </div>
                                      </div>
                                    ))}
                                  </>
                                )}
                                <div className="px-6 py-2 pl-20 border-t">
                                  <Button variant="ghost" size="sm" asChild className="text-xs gap-1">
                                    <Link to="/admin-dealerships">
                                      Manage in Dealerships
                                      <ArrowUpRight className="w-3 h-3" />
                                    </Link>
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {Object.keys(groupedProviders).length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => toggleGroup("providers")}
                    className="w-full px-6 py-4 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors text-left bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                        <Store className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-sm">Provider Users</div>
                        <div className="text-xs text-muted-foreground">{Object.keys(groupedProviders).length} companies</div>
                      </div>
                    </div>
                    {expandedGroups.providers ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                  </button>
                  {expandedGroups.providers && (
                    <div className="bg-muted/20">
                      {Object.entries(groupedProviders).map(([companyId, companyProviders]) => {
                        const company = providerMap[companyId];
                        const isExpanded = expandedProviders[companyId];

                        return (
                          <div key={companyId}>
                            <button
                              type="button"
                              onClick={() => toggleProvider(companyId)}
                              className="w-full px-6 py-3 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors text-left border-t"
                            >
                              <div className="flex items-center gap-3">
                                <Store className="w-4 h-4 text-emerald-600" />
                                <div className="font-medium text-sm">{company?.provider_company_name ?? companyId}</div>
                                <span className="text-xs text-muted-foreground">({companyProviders.length} users)</span>
                              </div>
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                            </button>
                            {isExpanded && (
                              <div className="bg-background/50">
                                {companyProviders.map((p) => (
                                  <div key={p.id} className="px-6 py-3 pl-20 hover:bg-muted/30 transition-colors">
                                    <div className="flex items-center justify-between gap-4 flex-wrap">
                                      <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="p-1.5 rounded-md bg-muted/50 text-muted-foreground">
                                          <User className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-3 flex-wrap">
                                            <span className="text-sm break-all">{p.email ?? "(email unknown)"}</span>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${roleBadgeClass(p.role)}`}>
                                              {roleLabel(p.role)}
                                            </span>
                                          </div>
                                          {p.displayName && <div className="text-xs text-muted-foreground mt-1">{p.displayName}</div>}
                                        </div>
                                      </div>
                                      <select
                                        value={p.role}
                                        disabled={busy}
                                        onChange={(e) => handleRoleChange(p.id, p.email, e.target.value as Role)}
                                        className="h-7 rounded-md border border-input bg-background px-2 text-xs shadow-sm"
                                      >
                                        <option value="PROVIDER">Provider</option>
                                        <option value="DEALER_EMPLOYEE">Dealer Employee</option>
                                        <option value="DEALER_ADMIN">Dealer Admin</option>
                                      </select>
                                    </div>
                                  </div>
                                ))}
                                <div className="px-6 py-2 pl-20 border-t">
                                  <Button variant="ghost" size="sm" asChild className="text-xs gap-1">
                                    <Link to="/admin-providers">
                                      View in Providers
                                      <ArrowUpRight className="w-3 h-3" />
                                    </Link>
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t bg-muted/30">
          <div className="text-xs text-muted-foreground">
            Showing {filtered.length} of {allProfiles.length} total users
          </div>
        </div>
      </div>

      {updateRoleMutation.isError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200">
          {updateRoleMutation.error instanceof Error ? updateRoleMutation.error.message : "Failed to update role."}
        </div>
      )}

      {mode === "supabase" && (
        <div className="mt-4 text-xs text-muted-foreground rounded-lg bg-muted/50 p-3">
          <strong>Tip:</strong> Click on a group to expand and view members. Use the dropdown to change user roles.
        </div>
      )}
    </PageShell>
  );
}
