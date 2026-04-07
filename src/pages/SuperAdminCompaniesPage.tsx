import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Building2, Search, Plus, Mail, Users, ArrowRight, Store } from "lucide-react";

import { PageShell } from "../components/PageShell";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { getAppMode } from "../lib/runtime";
import { getSupabaseClient } from "../lib/supabase/client";
import { confirmProceed } from "../lib/utils";

type ProviderCompanyStatus = "ACTIVE" | "PENDING" | "SUSPENDED";

type ProviderCompany = {
  id: string;
  providerCompanyName: string;
  legalBusinessName: string;
  businessType: "WARRANTY_PROVIDER";
  contactEmail: string;
  status: ProviderCompanyStatus;
  phone?: string;
  address?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

function statusBadgeClass(status: ProviderCompanyStatus) {
  if (status === "ACTIVE") return "border-emerald-500/15 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "SUSPENDED") return "border-red-500/15 bg-red-500/10 text-red-700 dark:text-red-300";
  return "border-amber-500/15 bg-amber-500/10 text-amber-800 dark:text-amber-300";
}

type ProfileRow = {
  id: string;
  email?: string;
  role: string;
  provider_company_id?: string | null;
};

function toErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const anyErr = err as any;
    if (typeof anyErr.message === "string") return anyErr.message;
    if (typeof anyErr.error_description === "string") return anyErr.error_description;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

function normalizeEmail(v: string) {
  return v.trim().toLowerCase();
}

export function SuperAdminCompaniesPage() {
  const mode = useMemo(() => getAppMode(), []);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const [newCompany, setNewCompany] = useState({
    providerCompanyName: "",
    legalBusinessName: "",
    businessType: "WARRANTY_PROVIDER" as "WARRANTY_PROVIDER" | "DEALERSHIP",
    contactEmail: "",
    status: "PENDING" as ProviderCompanyStatus,
    phone: "",
    address: "",
    notes: "",
  });

  const [editById, setEditById] = useState<Record<string, Partial<ProviderCompany> & { dirty?: boolean }>>({});

  const companiesQuery = useQuery({
    queryKey: ["superadmin-provider-companies", mode],
    queryFn: async (): Promise<ProviderCompany[]> => {
      if (mode !== "supabase") return [];

      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const { data, error } = await supabase
        .from("provider_companies")
        .select(
          "id, provider_company_name, legal_business_name, business_type, contact_email, status, phone, address, notes, created_at, updated_at",
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data as any[]).map((r) => ({
        id: r.id,
        providerCompanyName: r.provider_company_name,
        legalBusinessName: r.legal_business_name,
        businessType: (r.business_type ?? "WARRANTY_PROVIDER") as "WARRANTY_PROVIDER",
        contactEmail: r.contact_email,
        status: (r.status ?? "PENDING") as ProviderCompanyStatus,
        phone: r.phone ?? undefined,
        address: r.address ?? undefined,
        notes: r.notes ?? undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    },
  });

  const profilesQuery = useQuery({
    queryKey: ["superadmin-profiles-for-companies", mode],
    queryFn: async (): Promise<ProfileRow[]> => {
      if (mode !== "supabase") return [];

      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const { data, error } = await supabase.from("profiles").select("id, email, role, provider_company_id");
      if (error) throw error;

      return (data as any[]).map((r) => ({
        id: r.id,
        email: r.email ?? undefined,
        role: r.role as string,
        provider_company_id: (r.provider_company_id ?? null) as string | null,
      }));
    },
  });

  const createCompanyMutation = useMutation({
    mutationFn: async () => {
      if (mode !== "supabase") throw new Error("Supabase mode required");

      const name = newCompany.providerCompanyName.trim();
      const legal = newCompany.legalBusinessName.trim();
      const email = normalizeEmail(newCompany.contactEmail);

      if (!name) throw new Error("Provider Company Name is required");
      if (!legal) throw new Error("Legal Business Name is required");
      if (!email) throw new Error("Contact Email is required");

      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const insertRow = {
        provider_company_name: name,
        legal_business_name: legal,
        business_type: newCompany.businessType,
        contact_email: email,
        status: newCompany.status,
        phone: newCompany.phone.trim() || null,
        address: newCompany.address.trim() || null,
        notes: newCompany.notes.trim() || null,
      };

      const { data, error } = await supabase.from("provider_companies").insert(insertRow).select("id").single();
      if (error) throw error;

      setNewCompany({
        providerCompanyName: "",
        legalBusinessName: "",
        businessType: "WARRANTY_PROVIDER",
        contactEmail: "",
        status: "PENDING",
        phone: "",
        address: "",
        notes: "",
      });

      setSelectedCompanyId((data as any).id as string);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["superadmin-provider-companies", mode] });
    },
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async (input: { id: string }) => {
      if (mode !== "supabase") throw new Error("Supabase mode required");

      const patch = editById[input.id] ?? {};
      if (!patch.dirty) return;

      const updateRow: Record<string, unknown> = { updated_at: new Date().toISOString() };

      if (typeof patch.providerCompanyName === "string") updateRow.provider_company_name = patch.providerCompanyName.trim();
      if (typeof patch.legalBusinessName === "string") updateRow.legal_business_name = patch.legalBusinessName.trim();
      if (typeof patch.contactEmail === "string") updateRow.contact_email = normalizeEmail(patch.contactEmail);
      if (typeof patch.status === "string") updateRow.status = patch.status;
      if (typeof patch.phone === "string") updateRow.phone = patch.phone.trim() || null;
      if (typeof patch.address === "string") updateRow.address = patch.address.trim() || null;
      if (typeof patch.notes === "string") updateRow.notes = patch.notes.trim() || null;

      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const { error } = await supabase.from("provider_companies").update(updateRow).eq("id", input.id);
      if (error) throw error;

      setEditById((prev) => {
        const next = { ...prev };
        delete next[input.id];
        return next;
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["superadmin-provider-companies", mode] });
    },
  });

  const setCompanyStatusMutation = useMutation({
    mutationFn: async (input: { id: string; nextStatus: ProviderCompanyStatus }) => {
      if (mode !== "supabase") throw new Error("Supabase mode required");

      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const { error } = await supabase
        .from("provider_companies")
        .update({ status: input.nextStatus, updated_at: new Date().toISOString() })
        .eq("id", input.id);

      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["superadmin-provider-companies", mode] });
    },
  });

  const assignUserMutation = useMutation({
    mutationFn: async (input: { userId: string; companyId: string | null; companyName?: string }) => {
      if (mode !== "supabase") throw new Error("Supabase mode required");

      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const updateRow: Record<string, unknown> = {
        provider_company_id: input.companyId,
      };

      if (typeof input.companyName === "string") updateRow.company_name = input.companyName.trim() || null;

      const { error } = await supabase.from("profiles").update(updateRow).eq("id", input.userId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["superadmin-profiles-for-companies", mode] });
    },
  });

  const companies = companiesQuery.data ?? [];
  const profiles = profilesQuery.data ?? [];

  const filteredCompanies = companies.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.providerCompanyName.toLowerCase().includes(q) ||
      c.legalBusinessName.toLowerCase().includes(q) ||
      c.contactEmail.toLowerCase().includes(q) ||
      c.status.toLowerCase().includes(q)
    );
  });

  const selectedCompany = selectedCompanyId ? companies.find((c) => c.id === selectedCompanyId) ?? null : null;

  const providerUsers = profiles.filter((p) => p.role === "PROVIDER");
  const assignedUsers = selectedCompany
    ? providerUsers.filter((p) => (p.provider_company_id ?? null) === selectedCompany.id)
    : [];
  const unassignedUsers = providerUsers.filter((p) => !p.provider_company_id);

  const busy =
    companiesQuery.isLoading ||
    profilesQuery.isLoading ||
    createCompanyMutation.isPending ||
    updateCompanyMutation.isPending ||
    setCompanyStatusMutation.isPending ||
    assignUserMutation.isPending;

  const activeCount = companies.filter((c) => c.status === "ACTIVE").length;
  const pendingCount = companies.filter((c) => c.status === "PENDING").length;
  const suspendedCount = companies.filter((c) => c.status === "SUSPENDED").length;

  return (
    <PageShell
      title="Company Management"
      subtitle="Create and manage provider companies"
      badge="Super Admin"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="gap-2">
            <Link to="/superadmin-platform">
              <ArrowRight className="w-4 h-4 rotate-180" />
              Platform Dashboard
            </Link>
          </Button>
        </div>
      }
    >
      {mode !== "supabase" ? (
        <div className="rounded-2xl border bg-amber-500/10 p-6 text-center">
          <div className="text-sm font-medium text-amber-800 dark:text-amber-200">Supabase mode required</div>
          <div className="text-sm text-amber-700 dark:text-amber-300 mt-1">This page requires a Supabase database connection.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-violet-600/5 via-transparent to-transparent">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-600">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">All Companies</div>
                      <div className="text-sm text-muted-foreground">Manage provider companies</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-700">
                      <span className="text-sm font-medium">{activeCount}</span>
                      <span className="text-xs text-muted-foreground ml-1">Active</span>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-700">
                      <span className="text-sm font-medium">{pendingCount}</span>
                      <span className="text-xs text-muted-foreground ml-1">Pending</span>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-500/10 text-red-700">
                      <span className="text-sm font-medium">{suspendedCount}</span>
                      <span className="text-xs text-muted-foreground ml-1">Suspended</span>
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
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search companies…"
                    className="pl-10 bg-background/70"
                  />
                </div>
              </div>

              <div className="divide-y">
                {filteredCompanies.map((c) => {
                  const isSelected = selectedCompanyId === c.id;
                  const assignedCount = providerUsers.filter((p) => (p.provider_company_id ?? null) === c.id).length;

                  return (
                    <div
                      key={c.id}
                      className={
                        "px-6 py-4 cursor-pointer transition-colors " +
                        (isSelected ? "bg-violet-500/5" : "hover:bg-muted/30")
                      }
                      onClick={() => setSelectedCompanyId(c.id)}
                    >
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="p-2 rounded-xl bg-muted/50 text-muted-foreground">
                            <Store className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-sm truncate">{c.providerCompanyName}</span>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-medium shrink-0 ${statusBadgeClass(c.status)}`}>
                                {c.status}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 truncate">{c.legalBusinessName}</div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {c.contactEmail}
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {assignedCount} users
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={c.status === "SUSPENDED" ? "default" : "outline"}
                          disabled={busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            void (async () => {
                              const nextStatus: ProviderCompanyStatus = c.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
                              const actionLabel = nextStatus === "SUSPENDED" ? "Suspend" : "Reactivate";
                              if (!(await confirmProceed(`${actionLabel} ${c.providerCompanyName}?`))) return;
                              setCompanyStatusMutation.mutate({ id: c.id, nextStatus });
                            })();
                          }}
                        >
                          {c.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {companiesQuery.isLoading && (
                  <div className="px-6 py-12 text-center">
                    <div className="text-sm text-muted-foreground">Loading companies…</div>
                  </div>
                )}
                {companiesQuery.isError && (
                  <div className="px-6 py-12 text-center">
                    <div className="text-sm text-destructive">Failed to load companies.</div>
                  </div>
                )}
                {!companiesQuery.isLoading && !companiesQuery.isError && filteredCompanies.length === 0 && (
                  <div className="px-6 py-12 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
                      <Building2 className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium">No companies found</div>
                    <div className="text-sm text-muted-foreground mt-1">Create a new company below</div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600/5 via-transparent to-transparent">
                <div className="flex items-center gap-3">
                  <Plus className="w-5 h-5 text-blue-600" />
                  <div>
                    <div className="text-sm font-semibold">Create Provider Company</div>
                    <div className="text-xs text-muted-foreground mt-1">Only Super Admin can create provider companies.</div>
                  </div>
                </div>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Provider Company Name</label>
                  <Input
                    value={newCompany.providerCompanyName}
                    onChange={(e) => setNewCompany((p) => ({ ...p, providerCompanyName: e.target.value }))}
                    disabled={busy}
                    placeholder="Enter company name"
                    className="bg-background/70"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Legal Business Name</label>
                  <Input
                    value={newCompany.legalBusinessName}
                    onChange={(e) => setNewCompany((p) => ({ ...p, legalBusinessName: e.target.value }))}
                    disabled={busy}
                    placeholder="Enter legal name"
                    className="bg-background/70"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Business Type</label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background/70 px-3 text-sm shadow-sm"
                    value={newCompany.businessType}
                    onChange={(e) => setNewCompany((p) => ({ ...p, businessType: e.target.value as "WARRANTY_PROVIDER" | "DEALERSHIP" }))}
                    disabled={busy}
                  >
                    <option value="WARRANTY_PROVIDER">Warranty Provider</option>
                    <option value="DEALERSHIP">Dealership</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Contact Email</label>
                  <Input
                    value={newCompany.contactEmail}
                    onChange={(e) => setNewCompany((p) => ({ ...p, contactEmail: e.target.value }))}
                    disabled={busy}
                    placeholder="contact@company.com"
                    className="bg-background/70"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background/70 px-3 text-sm shadow-sm"
                    value={newCompany.status}
                    onChange={(e) => setNewCompany((p) => ({ ...p, status: e.target.value as ProviderCompanyStatus }))}
                    disabled={busy}
                  >
                    <option value="PENDING">Pending</option>
                    <option value="ACTIVE">Active</option>
                    <option value="SUSPENDED">Suspended</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Phone</label>
                  <Input
                    value={newCompany.phone}
                    onChange={(e) => setNewCompany((p) => ({ ...p, phone: e.target.value }))}
                    disabled={busy}
                    placeholder="(555) 123-4567"
                    className="bg-background/70"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">Address</label>
                  <Input
                    value={newCompany.address}
                    onChange={(e) => setNewCompany((p) => ({ ...p, address: e.target.value }))}
                    disabled={busy}
                    placeholder="123 Main St, City, Province"
                    className="bg-background/70"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">Notes (internal)</label>
                  <textarea
                    className="min-h-[80px] w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm shadow-sm resize-none"
                    value={newCompany.notes}
                    onChange={(e) => setNewCompany((p) => ({ ...p, notes: e.target.value }))}
                    disabled={busy}
                    placeholder="Internal notes about this company…"
                  />
                </div>
              </div>

              <div className="px-6 pb-6">
                <Button
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      if (!(await confirmProceed("Create provider company?"))) return;
                      createCompanyMutation.mutate();
                    })();
                  }}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create Provider Company
                </Button>
              </div>

              {createCompanyMutation.isError && (
                <div className="px-6 pb-6 -mt-3 text-sm text-destructive">{toErrorMessage(createCompanyMutation.error)}</div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-violet-500/10 via-transparent to-transparent">
                <div className="flex items-center gap-3">
                  <Store className="w-5 h-5 text-violet-600" />
                  <div>
                    <div className="text-sm font-semibold">Company Details</div>
                    <div className="text-xs text-muted-foreground mt-1">Select a company to edit details</div>
                  </div>
                </div>
              </div>

              {!selectedCompany ? (
                <div className="p-6 text-center">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-muted mb-3">
                    <Store className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="text-sm text-muted-foreground">Select a company from the list</div>
                </div>
              ) : (
                <div className="p-6 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Provider Company Name</label>
                    <Input
                      value={(editById[selectedCompany.id]?.providerCompanyName ?? selectedCompany.providerCompanyName) as string}
                      disabled={busy}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditById((prev) => ({
                          ...prev,
                          [selectedCompany.id]: { ...prev[selectedCompany.id], providerCompanyName: v, dirty: true },
                        }));
                      }}
                      className="bg-background/70"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Legal Business Name</label>
                    <Input
                      value={(editById[selectedCompany.id]?.legalBusinessName ?? selectedCompany.legalBusinessName) as string}
                      disabled={busy}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditById((prev) => ({
                          ...prev,
                          [selectedCompany.id]: { ...prev[selectedCompany.id], legalBusinessName: v, dirty: true },
                        }));
                      }}
                      className="bg-background/70"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Contact Email</label>
                    <Input
                      value={(editById[selectedCompany.id]?.contactEmail ?? selectedCompany.contactEmail) as string}
                      disabled={busy}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditById((prev) => ({
                          ...prev,
                          [selectedCompany.id]: { ...prev[selectedCompany.id], contactEmail: v, dirty: true },
                        }));
                      }}
                      className="bg-background/70"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Status</label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background/70 px-3 text-sm shadow-sm"
                      value={(editById[selectedCompany.id]?.status ?? selectedCompany.status) as ProviderCompanyStatus}
                      disabled={busy}
                      onChange={(e) => {
                        const v = e.target.value as ProviderCompanyStatus;
                        setEditById((prev) => ({
                          ...prev,
                          [selectedCompany.id]: { ...prev[selectedCompany.id], status: v, dirty: true },
                        }));
                      }}
                    >
                      <option value="PENDING">Pending</option>
                      <option value="ACTIVE">Active</option>
                      <option value="SUSPENDED">Suspended</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Phone</label>
                    <Input
                      value={(editById[selectedCompany.id]?.phone ?? selectedCompany.phone ?? "") as string}
                      disabled={busy}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditById((prev) => ({
                          ...prev,
                          [selectedCompany.id]: { ...prev[selectedCompany.id], phone: v, dirty: true },
                        }));
                      }}
                      className="bg-background/70"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Address</label>
                    <Input
                      value={(editById[selectedCompany.id]?.address ?? selectedCompany.address ?? "") as string}
                      disabled={busy}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditById((prev) => ({
                          ...prev,
                          [selectedCompany.id]: { ...prev[selectedCompany.id], address: v, dirty: true },
                        }));
                      }}
                      className="bg-background/70"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notes (internal)</label>
                    <textarea
                      className="min-h-[80px] w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm shadow-sm resize-none"
                      value={(editById[selectedCompany.id]?.notes ?? selectedCompany.notes ?? "") as string}
                      disabled={busy}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditById((prev) => ({
                          ...prev,
                          [selectedCompany.id]: { ...prev[selectedCompany.id], notes: v, dirty: true },
                        }));
                      }}
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      disabled={busy || !editById[selectedCompany.id]?.dirty}
                      onClick={() => {
                        void (async () => {
                          if (!(await confirmProceed(`Save changes for ${selectedCompany.providerCompanyName}?`))) return;
                          updateCompanyMutation.mutate({ id: selectedCompany.id });
                        })();
                      }}
                      className="flex-1"
                    >
                      Save Changes
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setEditById((prev) => {
                          const next = { ...prev };
                          delete next[selectedCompany.id];
                          return next;
                        });
                      }}
                    >
                      Reset
                    </Button>
                  </div>

                  {updateCompanyMutation.isError && (
                    <div className="text-sm text-destructive">{toErrorMessage(updateCompanyMutation.error)}</div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-violet-500/10 via-transparent to-transparent">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-violet-600" />
                  <div>
                    <div className="text-sm font-semibold">Provider Users</div>
                    <div className="text-xs text-muted-foreground mt-1">Assign users to this company</div>
                  </div>
                </div>
              </div>

              {!selectedCompany ? (
                <div className="p-6 text-center">
                  <div className="text-sm text-muted-foreground">Select a company to manage users</div>
                </div>
              ) : (
                <>
                  <div className="p-6 pb-0">
                    <div className="text-xs font-medium text-muted-foreground mb-3">Assigned ({assignedUsers.length})</div>
                    <div className="space-y-2">
                      {assignedUsers.map((u) => (
                        <div key={u.id} className="flex items-center justify-between gap-3 rounded-xl border bg-muted/50 px-3 py-2">
                          <div className="text-sm truncate flex-1">{u.email ?? u.id}</div>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                              void (async () => {
                                if (!(await confirmProceed(`Unassign ${u.email ?? u.id}?`))) return;
                                assignUserMutation.mutate({ userId: u.id, companyId: null });
                              })();
                            }}
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                      {profilesQuery.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
                      {!profilesQuery.isLoading && assignedUsers.length === 0 && (
                        <div className="text-sm text-muted-foreground py-2">No users assigned yet.</div>
                      )}
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="text-xs font-medium text-muted-foreground mb-3">Assign User ({unassignedUsers.length} available)</div>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background/70 px-3 text-sm shadow-sm"
                      disabled={busy || unassignedUsers.length === 0}
                      onChange={(e) => {
                        const userId = e.target.value;
                        if (!userId) return;
                        e.currentTarget.value = "";
                        void (async () => {
                          if (!(await confirmProceed(`Assign provider user to ${selectedCompany.providerCompanyName}?`))) return;
                          assignUserMutation.mutate({
                            userId,
                            companyId: selectedCompany.id,
                            companyName: selectedCompany.providerCompanyName,
                          });
                        })();
                      }}
                      defaultValue=""
                    >
                      <option value="">Select a user to assign…</option>
                      {unassignedUsers
                        .slice()
                        .sort((a, b) => (a.email ?? a.id).localeCompare(b.email ?? b.id))
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.email ?? u.id}
                          </option>
                        ))}
                    </select>
                  </div>

                  {assignUserMutation.isError && (
                    <div className="px-6 pb-6 mt-3 text-sm text-destructive">{toErrorMessage(assignUserMutation.error)}</div>
                  )}
                </>
              )}
            </div>

            {companiesQuery.isError && (
              <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-destructive">
                {toErrorMessage(companiesQuery.error)}
              </div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
