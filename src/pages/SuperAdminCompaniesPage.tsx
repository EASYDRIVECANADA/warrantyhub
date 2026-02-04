import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
        business_type: "WARRANTY_PROVIDER",
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

  return (
    <PageShell
      title="Companies"
      subtitle="Create and manage provider companies."
      badge="Super Admin"
      actions={
        mode === "supabase" ? (
          <div className="text-xs text-muted-foreground">{companies.length} companies</div>
        ) : (
          <div className="text-xs text-destructive">Supabase mode required</div>
        )
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border bg-card shadow-card p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search companies…" />
              <div className="text-sm text-muted-foreground flex items-center justify-end">
                {filteredCompanies.length} shown
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card shadow-card overflow-hidden">
            <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 border-b text-xs text-muted-foreground">
              <div className="col-span-4">Provider Company</div>
              <div className="col-span-3">Contact Email</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-3 text-right">Actions</div>
            </div>

            <div className="divide-y">
              {filteredCompanies.map((c) => {
                const isSelected = selectedCompanyId === c.id;
                const assignedCount = providerUsers.filter((p) => (p.provider_company_id ?? null) === c.id).length;

                return (
                  <div
                    key={c.id}
                    className={
                      "px-6 py-4 cursor-pointer " +
                      (isSelected ? "bg-muted/40" : "hover:bg-muted/20")
                    }
                    onClick={() => setSelectedCompanyId(c.id)}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <div className="md:col-span-4">
                        <div className="text-sm font-medium break-words">{c.providerCompanyName}</div>
                        <div className="text-xs text-muted-foreground mt-1 break-words">{c.legalBusinessName}</div>
                        <div className="text-xs text-muted-foreground mt-1">{assignedCount} provider users</div>
                      </div>
                      <div className="md:col-span-3 text-sm text-muted-foreground break-all">{c.contactEmail}</div>
                      <div className="md:col-span-2 text-sm">{c.status}</div>
                      <div className="md:col-span-3 flex md:justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
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
                  </div>
                );
              })}

              {companiesQuery.isLoading ? <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div> : null}
              {companiesQuery.isError ? (
                <div className="px-6 py-6 text-sm text-destructive">Failed to load companies.</div>
              ) : null}
              {!companiesQuery.isLoading && !companiesQuery.isError && filteredCompanies.length === 0 ? (
                <div className="px-6 py-6 text-sm text-muted-foreground">No companies found.</div>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border bg-card shadow-card p-6">
            <div className="text-sm font-medium">Create Provider Company</div>
            <div className="text-xs text-muted-foreground mt-1">
              Only Super Admin can create provider companies.
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Provider Company Name</label>
                <Input
                  value={newCompany.providerCompanyName}
                  onChange={(e) => setNewCompany((p) => ({ ...p, providerCompanyName: e.target.value }))}
                  disabled={busy}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Legal Business Name</label>
                <Input
                  value={newCompany.legalBusinessName}
                  onChange={(e) => setNewCompany((p) => ({ ...p, legalBusinessName: e.target.value }))}
                  disabled={busy}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Business Type</label>
                <Input value="Warranty Provider" disabled />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Contact Email</label>
                <Input
                  value={newCompany.contactEmail}
                  onChange={(e) => setNewCompany((p) => ({ ...p, contactEmail: e.target.value }))}
                  disabled={busy}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Address</label>
                <Input
                  value={newCompany.address}
                  onChange={(e) => setNewCompany((p) => ({ ...p, address: e.target.value }))}
                  disabled={busy}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Notes (internal)</label>
                <textarea
                  className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newCompany.notes}
                  onChange={(e) => setNewCompany((p) => ({ ...p, notes: e.target.value }))}
                  disabled={busy}
                />
              </div>
            </div>

            <div className="mt-4">
              <Button
                disabled={busy || mode !== "supabase"}
                onClick={() => {
                  void (async () => {
                    if (!(await confirmProceed("Create provider company?"))) return;
                    createCompanyMutation.mutate();
                  })();
                }}
              >
                Create Provider Company
              </Button>
            </div>

            {createCompanyMutation.isError ? (
              <div className="mt-3 text-sm text-destructive">{toErrorMessage(createCompanyMutation.error)}</div>
            ) : null}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border bg-card shadow-card p-6">
            <div className="text-sm font-medium">Company Details</div>
            <div className="text-xs text-muted-foreground mt-1">
              Select a company to edit details and manage provider users.
            </div>

            {!selectedCompany ? (
              <div className="mt-4 text-sm text-muted-foreground">No company selected.</div>
            ) : (
              <div className="mt-4 space-y-4">
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
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Notes (internal)</label>
                  <textarea
                    className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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

                <div className="flex items-center gap-2">
                  <Button
                    disabled={busy || !editById[selectedCompany.id]?.dirty}
                    onClick={() => {
                      void (async () => {
                        if (!(await confirmProceed(`Save changes for ${selectedCompany.providerCompanyName}?`))) return;
                        updateCompanyMutation.mutate({ id: selectedCompany.id });
                      })();
                    }}
                  >
                    Save
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

                {updateCompanyMutation.isError ? (
                  <div className="text-sm text-destructive">{toErrorMessage(updateCompanyMutation.error)}</div>
                ) : null}
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card shadow-card p-6">
            <div className="text-sm font-medium">Provider Users</div>
            <div className="text-xs text-muted-foreground mt-1">
              Provider users can only be assigned by Super Admin.
            </div>

            {!selectedCompany ? (
              <div className="mt-4 text-sm text-muted-foreground">Select a company to view provider users.</div>
            ) : (
              <>
                <div className="mt-4">
                  <div className="text-xs text-muted-foreground">Assigned ({assignedUsers.length})</div>
                  <div className="mt-2 space-y-2">
                    {assignedUsers.map((u) => (
                      <div key={u.id} className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
                        <div className="text-sm break-all">{u.email ?? u.id}</div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            void (async () => {
                              if (!(await confirmProceed(`Unassign ${u.email ?? u.id}?`))) return;
                              assignUserMutation.mutate({ userId: u.id, companyId: null });
                            })();
                          }}
                        >
                          Unassign
                        </Button>
                      </div>
                    ))}
                    {profilesQuery.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
                    {!profilesQuery.isLoading && assignedUsers.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No provider users assigned.</div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-6">
                  <div className="text-xs text-muted-foreground">Unassigned ({unassignedUsers.length})</div>
                  <div className="mt-2">
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
                      <option value="">Assign provider user…</option>
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
                </div>

                {assignUserMutation.isError ? (
                  <div className="mt-3 text-sm text-destructive">{toErrorMessage(assignUserMutation.error)}</div>
                ) : null}
              </>
            )}
          </div>

          {companiesQuery.isError ? (
            <div className="text-sm text-destructive">{toErrorMessage(companiesQuery.error)}</div>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
