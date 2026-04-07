import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, Search, ShieldCheck, UserCircle, Users, Store, BriefcaseBusiness, Clock, Activity, AlertCircle, CheckCircle2, XCircle, ChevronRight } from "lucide-react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { BRAND } from "../lib/brand";
import { getAppMode } from "../lib/runtime";
import { getSupabaseClient } from "../lib/supabase/client";
import type { Role } from "../lib/auth/types";

type AccessRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

type AccessRequest = {
  id: string;
  requestType: "DEALER" | "PROVIDER";
  company: string;
  name: string;
  email: string;
  status: AccessRequestStatus;
  createdAt: string;
  reviewedAt?: string;
};

type AdminProfile = {
  id: string;
  email?: string;
  role: Role;
};

const LOCAL_ACCESS_REQUESTS_KEY = "warrantyhub.local.access_requests";
const LOCAL_USERS_KEY = "warrantyhub.local.users";

function readLocalAccessRequests(): AccessRequest[] {
  const raw = localStorage.getItem(LOCAL_ACCESS_REQUESTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as any[];
    return parsed.map((r) => ({
      id: r.id,
      requestType: r.requestType,
      company: r.company,
      name: r.name,
      email: r.email,
      status: (r.status ?? "PENDING") as AccessRequestStatus,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt ?? undefined,
    }));
  } catch {
    return [];
  }
}

function readLocalProfiles(): AdminProfile[] {
  const raw = localStorage.getItem(LOCAL_USERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as any[];
    return parsed.map((u) => ({ id: u.id, email: u.email ?? undefined, role: u.role as Role }));
  } catch {
    return [];
  }
}

export function SuperAdminPlatformPage() {
  const mode = useMemo(() => getAppMode(), []);

  const [globalSearch, setGlobalSearch] = useState("");

  const profilesQuery = useQuery({
    queryKey: ["superadmin", "profiles", mode],
    queryFn: async (): Promise<AdminProfile[]> => {
      if (mode === "supabase") {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Supabase is not configured");

        const { data, error } = await supabase.from("profiles").select("id, email, role");
        if (error) throw error;

        return (data as any[]).map((r) => ({
          id: r.id,
          email: r.email ?? undefined,
          role: ((r.role ?? "UNASSIGNED") === "DEALER" ? "DEALER_ADMIN" : r.role) as Role,
        }));
      }

      return readLocalProfiles();
    },
  });

  const accessRequestsQuery = useQuery({
    queryKey: ["superadmin", "access-requests", mode],
    queryFn: async (): Promise<AccessRequest[]> => {
      if (mode === "supabase") {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Supabase is not configured");

        const { data, error } = await supabase
          .from("access_requests")
          .select("id, request_type, company, name, email, status, created_at, reviewed_at")
          .order("created_at", { ascending: false });

        if (error) throw error;
        return (data as any[]).map((r) => ({
          id: r.id,
          requestType: r.request_type,
          company: r.company,
          name: r.name,
          email: r.email,
          status: (r.status ?? "PENDING") as AccessRequestStatus,
          createdAt: r.created_at,
          reviewedAt: r.reviewed_at ?? undefined,
        }));
      }

      return readLocalAccessRequests().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  });

  const profiles = profilesQuery.data ?? [];
  const accessRequests = accessRequestsQuery.data ?? [];

  const totalUsers = profiles.length;
  const activeDealers = profiles.filter((p) => p.role === "DEALER_ADMIN").length;
  const activeProviders = profiles.filter((p) => p.role === "PROVIDER").length;

  const pendingApprovals = accessRequests.filter((r) => r.status === "PENDING");
  const alertCount = pendingApprovals.length;

  const filteredUsers = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return [];
    return profiles
      .filter((p) => [p.email, p.role, p.id].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      .slice(0, 5);
  }, [profiles, globalSearch]);

  const auditLog = useMemo(() => {
    const events: { at: string; label: string; detail: string }[] = [];
    for (const r of accessRequests) {
      events.push({
        at: r.createdAt,
        label: "Access request submitted",
        detail: `${r.requestType} • ${r.company} • ${r.email}`,
      });
      if (r.reviewedAt) {
        events.push({
          at: r.reviewedAt,
          label: `Access request ${r.status.toLowerCase()}`,
          detail: `${r.requestType} • ${r.company} • ${r.email}`,
        });
      }
    }

    return events
      .filter((e) => Boolean(e.at))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 8);
  }, [accessRequests]);

  const isLoading =
    profilesQuery.isLoading || accessRequestsQuery.isLoading;

  const isError = profilesQuery.isError || accessRequestsQuery.isError;

  const kpis = useMemo(
    () => [
      {
        label: "Total Users",
        value: totalUsers,
        icon: Users,
        tone: "blue" as const,
        href: "/admin-users",
      },
      {
        label: "Pending Approvals",
        value: pendingApprovals.length,
        icon: ShieldCheck,
        tone: "amber" as const,
        href: "/admin-access-requests",
      },
      {
        label: "Active Dealers",
        value: activeDealers,
        icon: Store,
        tone: "emerald" as const,
        href: "/admin-dealers",
      },
      {
        label: "Active Providers",
        value: activeProviders,
        icon: BriefcaseBusiness,
        tone: "violet" as const,
        href: "/admin-providers",
      },
    ],
    [totalUsers, pendingApprovals.length, activeDealers, activeProviders],
  );

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-background to-violet-50 dark:from-blue-950/30 dark:via-background dark:to-violet-950/25" />
      </div>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b bg-gradient-to-r from-blue-600/5 via-transparent to-transparent">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <img src={BRAND.logoUrl} alt={BRAND.name} className="w-7 h-7 invert" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 text-[10px] font-semibold uppercase tracking-wider">
                      Super Admin
                    </span>
                  </div>
                  <div className="text-xl font-bold text-foreground mt-1">Platform Dashboard</div>
                  <div className="text-sm text-muted-foreground">Overview of users and access requests</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild className="gap-2">
                  <Link to="/admin-access-requests">
                    <Bell className="w-4 h-4" />
                    Access Requests
                    {alertCount > 0 ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                        {alertCount}
                      </span>
                    ) : null}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild className="gap-2">
                  <Link to="/profile">
                    <UserCircle className="w-4 h-4" />
                    Profile
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="relative max-w-md">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Search className="w-4 h-4" />
              </div>
              <Input
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search users by email, role, or ID…"
                className="pl-10 bg-background/70"
              />
            </div>

            {globalSearch.trim() ? (
              <div className="mt-4 max-w-md rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="px-4 py-3 text-xs font-semibold text-muted-foreground border-b bg-muted/50">Search Results</div>
                <div className="divide-y">
                  {filteredUsers.map((p) => (
                    <Link key={p.id} to="/admin-users" className="block px-4 py-3 hover:bg-muted/50 transition-colors">
                      <div className="text-sm font-medium break-all">{p.email ?? "(email unknown)"}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {p.role}
                        </span>
                      </div>
                    </Link>
                  ))}
                  {filteredUsers.length === 0 && (
                    <div className="px-4 py-6 text-sm text-muted-foreground text-center">No users found matching "{globalSearch}"</div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <Link
              key={kpi.label}
              to={kpi.href}
              className="group rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-200 overflow-hidden block"
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-muted-foreground">{kpi.label}</div>
                    <div className="text-3xl font-bold text-foreground mt-2 tracking-tight">{kpi.value}</div>
                  </div>
                  <div
                    className={
                      kpi.tone === "blue"
                        ? "p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : kpi.tone === "amber"
                          ? "p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : kpi.tone === "emerald"
                            ? "p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "p-2.5 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400"
                    }
                  >
                    <kpi.icon className="w-5 h-5" />
                  </div>
                </div>
              </div>
              <div
                className={
                  kpi.tone === "blue"
                    ? "h-1 bg-gradient-to-r from-blue-500 to-blue-400"
                    : kpi.tone === "amber"
                      ? "h-1 bg-gradient-to-r from-amber-500 to-amber-400"
                      : kpi.tone === "emerald"
                        ? "h-1 bg-gradient-to-r from-emerald-500 to-emerald-400"
                        : "h-1 bg-gradient-to-r from-violet-500 to-violet-400"
                }
              />
            </Link>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between gap-4 bg-gradient-to-r from-amber-500/5 via-transparent to-transparent">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">Pending Approvals</div>
                  <div className="text-sm text-muted-foreground">Dealer/provider access requests awaiting review</div>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild className="gap-2">
                <Link to="/admin-access-requests">
                  Review All
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>

            <div className="divide-y">
              {pendingApprovals.slice(0, 5).map((r) => (
                <div key={r.id} className="px-5 py-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-[10px] font-semibold uppercase">
                          {r.requestType}
                        </span>
                        <span className="text-sm font-medium truncate">{r.company}</span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1 truncate">{r.email}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {accessRequestsQuery.isLoading && (
                <div className="px-5 py-8 text-sm text-muted-foreground text-center">Loading approvals…</div>
              )}
              {!accessRequestsQuery.isLoading && pendingApprovals.length === 0 && (
                <div className="px-5 py-8 text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 mb-3">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="text-sm font-medium">All caught up!</div>
                  <div className="text-sm text-muted-foreground mt-1">No pending approvals at this time.</div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center gap-3 bg-gradient-to-r from-violet-500/5 via-transparent to-transparent">
              <div className="p-2 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-foreground">Recent Activity</div>
                <div className="text-sm text-muted-foreground">Latest approval events</div>
              </div>
            </div>

            <div className="divide-y">
              {auditLog.slice(0, 5).map((e, idx) => {
                const isApproval = e.label.toLowerCase().includes('approved');
                const isRejection = e.label.toLowerCase().includes('rejected');
                return (
                  <div key={`${e.label}-${e.at}-${idx}`} className="px-5 py-3">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 p-1 rounded-full ${isApproval ? 'bg-emerald-500/10 text-emerald-600' : isRejection ? 'bg-red-500/10 text-red-600' : 'bg-blue-500/10 text-blue-600'}`}>
                        {isApproval ? <CheckCircle2 className="w-3 h-3" /> : isRejection ? <XCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{e.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">{e.detail}</div>
                        <div className="text-[11px] text-muted-foreground/70 mt-1">
                          {new Date(e.at).toLocaleDateString()} {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {auditLog.length === 0 && (
                <div className="px-5 py-8 text-sm text-muted-foreground text-center">No recent activity</div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Button variant="outline" asChild className="h-auto py-4 justify-start gap-3">
            <Link to="/admin-users">
              <Users className="w-5 h-5 text-blue-600" />
              <div className="text-left">
                <div className="font-medium">Manage Users</div>
                <div className="text-xs text-muted-foreground">View and edit user roles</div>
              </div>
            </Link>
          </Button>
          <Button variant="outline" asChild className="h-auto py-4 justify-start gap-3">
            <Link to="/admin-providers">
              <Store className="w-5 h-5 text-emerald-600" />
              <div className="text-left">
                <div className="font-medium">Provider Companies</div>
                <div className="text-xs text-muted-foreground">View provider details</div>
              </div>
            </Link>
          </Button>
          <Button variant="outline" asChild className="h-auto py-4 justify-start gap-3">
            <Link to="/superadmin-companies">
              <BriefcaseBusiness className="w-5 h-5 text-violet-600" />
              <div className="text-left">
                <div className="font-medium">Company Management</div>
                <div className="text-xs text-muted-foreground">Create and manage companies</div>
              </div>
            </Link>
          </Button>
          <Button variant="outline" asChild className="h-auto py-4 justify-start gap-3">
            <Link to="/admin-access-requests">
              <ShieldCheck className="w-5 h-5 text-amber-600" />
              <div className="text-left">
                <div className="font-medium">Access Requests</div>
                <div className="text-xs text-muted-foreground">{alertCount > 0 ? `${alertCount} pending` : 'Review requests'}</div>
              </div>
            </Link>
          </Button>
        </div>

        <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
          {isLoading ? "Loading dashboard data…" : isError ? "Some data failed to load. Please refresh." : ""}
          <div className="flex items-center gap-4">
            <span>Mode: {mode}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
