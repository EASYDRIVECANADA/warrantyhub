import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageShell } from "../components/PageShell";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { getAppMode } from "../lib/runtime";
import { getSupabaseClient } from "../lib/supabase/client";
import type { Role } from "../lib/auth/types";
import { confirmProceed } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";

type AccessRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

type AccessRequest = {
  id: string;
  requestType: "DEALER" | "PROVIDER";
  company: string;
  name: string;
  email: string;
  message?: string;
  rejectionMessage?: string;
  status: AccessRequestStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedByEmail?: string;
  assignedRole?: Role;
  assignedCompany?: string;
};

const LOCAL_KEY = "warrantyhub.local.access_requests";
const LOCAL_USERS_KEY = "warrantyhub.local.users";

type LocalUserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  companyName?: string;
  isActive?: boolean;
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

function writeLocalUsers(items: LocalUserRecord[]) {
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(items));
}

function readLocal(): AccessRequest[] {
  const raw = localStorage.getItem(LOCAL_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as any[];
    return parsed.map((r) => ({
      id: r.id,
      requestType: r.requestType,
      company: r.company,
      name: r.name,
      email: r.email,
      message: r.message ?? undefined,
      rejectionMessage: r.rejectionMessage ?? undefined,
      status: (r.status ?? "PENDING") as AccessRequestStatus,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt,
      reviewedByEmail: r.reviewedByEmail,
      assignedRole: r.assignedRole,
      assignedCompany: r.assignedCompany,
    }));
  } catch {
    return [];
  }
}

function writeLocal(items: AccessRequest[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
}

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

export function AdminAccessRequestsPage() {
  const mode = useMemo(() => getAppMode(), []);
  const qc = useQueryClient();
  const { user } = useAuth();
  const [assignById, setAssignById] = useState<Record<string, { role: Role; company: string }>>({});
  const [rejectById, setRejectById] = useState<Record<string, string>>({});

  const listQuery = useQuery({
    queryKey: ["admin-access-requests", mode],
    queryFn: async (): Promise<AccessRequest[]> => {
      if (mode === "supabase") {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Supabase is not configured");

        const { data, error } = await supabase
          .from("access_requests")
          .select(
            "id, request_type, company, name, email, message, rejection_message, status, created_at, reviewed_at, reviewed_by_email, assigned_role, assigned_company",
          )
          .order("created_at", { ascending: false });

        if (error) throw error;
        return (data as any[]).map((r) => ({
          id: r.id,
          requestType: r.request_type,
          company: r.company,
          name: r.name,
          email: r.email,
          message: r.message ?? undefined,
          rejectionMessage: r.rejection_message ?? undefined,
          status: (r.status ?? "PENDING") as AccessRequestStatus,
          createdAt: r.created_at,
          reviewedAt: r.reviewed_at ?? undefined,
          reviewedByEmail: r.reviewed_by_email ?? undefined,
          assignedRole: (r.assigned_role ?? undefined) as Role | undefined,
          assignedCompany: r.assigned_company ?? undefined,
        }));
      }

      return readLocal().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (input: {
      id: string;
      status: AccessRequestStatus;
      assignedRole?: Role;
      assignedCompany?: string;
      rejectionMessage?: string;
    }) => {
      const now = new Date().toISOString();

      const actorId = user?.id;
      const actorEmail = user?.email;

      if (mode === "supabase") {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Supabase is not configured");

        const current = (listQuery.data ?? []).find((r) => r.id === input.id);
        const fromStatus = current?.status ?? "PENDING";

        const effectiveAssignedRole: Role | undefined =
          current?.requestType === "PROVIDER" && input.status === "APPROVED" ? "PROVIDER" : input.assignedRole;
        const effectiveAssignedCompany: string | undefined =
          current?.requestType === "PROVIDER" && input.status === "APPROVED" ? current?.company : input.assignedCompany;

        if (input.status === "APPROVED") {
          if (!effectiveAssignedRole) throw new Error("Assigned role is required for approval");
          if (!effectiveAssignedCompany?.trim()) throw new Error("Assigned company is required for approval");
          if (mode === "supabase" && effectiveAssignedRole === "DEALER_EMPLOYEE") {
            throw new Error("DEALER_EMPLOYEE approval is not enabled in Supabase mode yet");
          }
          if (current?.requestType === "PROVIDER" && user?.role !== "SUPER_ADMIN") {
            throw new Error("Only Super Admin can approve Provider access requests");
          }
          if (effectiveAssignedRole === "ADMIN" && user?.role !== "SUPER_ADMIN") {
            throw new Error("Only Super Admin can assign Admin role");
          }
          if (effectiveAssignedRole === "DEALER_ADMIN" && user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
            throw new Error("Only Admin or Super Admin can assign Dealer Admin role");
          }
        }

        const updateRow: Record<string, unknown> = {
          status: input.status,
          reviewed_at: now,
          reviewed_by: actorId ?? null,
          reviewed_by_email: actorEmail ?? null,
        };

        if (typeof effectiveAssignedRole === "string") updateRow.assigned_role = effectiveAssignedRole;
        if (typeof effectiveAssignedCompany === "string") updateRow.assigned_company = effectiveAssignedCompany;
        if (input.status === "REJECTED") updateRow.rejection_message = input.rejectionMessage?.trim() || null;
        if (input.status === "APPROVED") updateRow.rejection_message = null;

        const { error } = await supabase
          .from("access_requests")
          .update(updateRow)
          .eq("id", input.id);

        if (error) throw new Error(toErrorMessage(error));

        if (input.status === "APPROVED" && effectiveAssignedRole && effectiveAssignedCompany) {
          const email = (current?.email ?? "").trim().toLowerCase();
          if (email) {
            const profileLookup = await supabase.from("profiles").select("id, email").eq("email", email).maybeSingle();
            if (!profileLookup.error && profileLookup.data?.id) {
              const profileId = profileLookup.data.id as string;

              let providerCompanyId: string | null = null;
              if (current?.requestType === "PROVIDER") {
                const requestedName = effectiveAssignedCompany.trim();

                const existingCompany = await supabase
                  .from("provider_companies")
                  .select("id")
                  .eq("provider_company_name", requestedName)
                  .maybeSingle();

                if (existingCompany.error) throw new Error(toErrorMessage(existingCompany.error));

                if (existingCompany.data?.id) {
                  providerCompanyId = existingCompany.data.id as string;
                } else {
                  const insertCompany = await supabase
                    .from("provider_companies")
                    .insert({
                      provider_company_name: requestedName,
                      legal_business_name: requestedName,
                      contact_email: (current?.email ?? "").trim(),
                      status: "ACTIVE",
                    })
                    .select("id")
                    .single();

                  if (insertCompany.error) throw new Error(toErrorMessage(insertCompany.error));
                  providerCompanyId = (insertCompany.data as any).id as string;
                }
              }

              const profileUpdate = await supabase
                .from("profiles")
                .update({
                  role: effectiveAssignedRole,
                  company_name: effectiveAssignedCompany,
                  is_active: true,
                  provider_company_id: providerCompanyId,
                })
                .eq("id", profileId);

              if (profileUpdate.error) throw new Error(toErrorMessage(profileUpdate.error));

              if (current?.requestType === "DEALER" && (effectiveAssignedRole === "DEALER_ADMIN" || effectiveAssignedRole === "DEALER")) {
                const dealerName = effectiveAssignedCompany.trim();
                if (!dealerName) throw new Error("Assigned company is required for approval");

                const dealerInsert = await supabase
                  .from("dealers")
                  .insert({ name: dealerName, markup_pct: 0 })
                  .select("id")
                  .single();

                if (dealerInsert.error) throw new Error(toErrorMessage(dealerInsert.error));
                const dealerId = (dealerInsert.data as any)?.id as string | undefined;
                if (!dealerId) throw new Error("Failed to create dealership");

                const membershipInsert = await supabase
                  .from("dealer_members")
                  .insert({ dealer_id: dealerId, user_id: profileId, role: "DEALER_ADMIN", status: "ACTIVE" });

                if (membershipInsert.error) throw new Error(toErrorMessage(membershipInsert.error));
              }
            }
          }
        }

        const auditInsert = await supabase.from("access_request_audit").insert({
          access_request_id: input.id,
          action: input.status === "APPROVED" ? "APPROVED" : "REJECTED",
          from_status: fromStatus,
          to_status: input.status,
          assigned_role: effectiveAssignedRole ?? null,
          assigned_company: effectiveAssignedCompany ?? null,
          actor_user_id: actorId ?? null,
          actor_email: actorEmail ?? null,
        });

        if (auditInsert.error) throw new Error(toErrorMessage(auditInsert.error));
        return;
      }

      const items = readLocal();
      const idx = items.findIndex((r) => r.id === input.id);
      if (idx < 0) throw new Error("Request not found");
      const next = [...items];

      next[idx] = {
        ...next[idx],
        status: input.status,
        reviewedAt: now,
        reviewedByEmail: actorEmail,
        assignedRole: input.assignedRole ?? next[idx].assignedRole,
        assignedCompany: input.assignedCompany ?? next[idx].assignedCompany,
        rejectionMessage: input.status === "REJECTED" ? input.rejectionMessage?.trim() || undefined : undefined,
      };
      writeLocal(next);

      if (input.status === "APPROVED" && input.assignedRole && input.assignedCompany) {
        if (input.assignedRole === "ADMIN" && user?.role !== "SUPER_ADMIN") {
          throw new Error("Only Super Admin can assign Admin role");
        }
        if (input.assignedRole === "DEALER_ADMIN" && user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
          throw new Error("Only Admin or Super Admin can assign Dealer role");
        }
        const targetEmail = (next[idx].email ?? "").trim().toLowerCase();
        if (targetEmail) {
          const users = readLocalUsers();
          const uidx = users.findIndex((u) => (u.email ?? "").trim().toLowerCase() === targetEmail);
          if (uidx >= 0) {
            const updated = [...users];
            updated[uidx] = {
              ...updated[uidx],
              role: input.assignedRole,
              companyName: input.assignedCompany,
              isActive: true,
            };
            writeLocalUsers(updated);
          }
        }
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-access-requests", mode] });
    },
  });

  const busy = updateStatusMutation.isPending;

  const resolveAssign = (r: AccessRequest) => {
    const existing = assignById[r.id];
    if (existing) return existing;
    const defaultRole: Role = r.requestType === "PROVIDER" ? "PROVIDER" : "DEALER_ADMIN";
    return {
      role: (r.assignedRole ?? defaultRole) as Role,
      company: (r.assignedCompany ?? r.company ?? "").trim(),
    };
  };

  const resolveReject = (r: AccessRequest) => {
    const existing = rejectById[r.id];
    if (typeof existing === "string") return existing;
    return (r.rejectionMessage ?? "").toString();
  };

  return (
    <PageShell title="System Admin" subtitle="Review inbound access requests and mark them approved/rejected." badge="Access Requests">
      <div className="rounded-xl border bg-card shadow-card overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 border-b text-xs text-muted-foreground">
          <div className="col-span-2">Requested</div>
          <div className="col-span-2">Name</div>
          <div className="col-span-3">Email</div>
          <div className="col-span-3">Assign (company / role)</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        <div className="divide-y">
          {(listQuery.data ?? []).map((r) => {
            const assigned = resolveAssign(r);
            const canAct = r.status === "PENDING";
            return (
            <div key={r.id} className="px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <div className="md:col-span-2">
                  <div className="text-sm font-medium">{r.requestType}</div>
                  <div className="text-xs text-muted-foreground mt-1 break-words">{r.company}</div>
                  <div className="text-xs text-muted-foreground mt-1">{r.status}</div>
                </div>
                <div className="md:col-span-2 text-sm">{r.name}</div>
                <div className="md:col-span-3 text-sm text-muted-foreground break-all">{r.email}</div>
                <div className="md:col-span-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Input
                      value={assigned.company}
                      disabled={!canAct || busy || r.requestType === "PROVIDER"}
                      onChange={(e) => {
                        const company = e.target.value;
                        setAssignById((prev) => ({
                          ...prev,
                          [r.id]: { role: assigned.role, company },
                        }));
                      }}
                      placeholder="Company"
                    />
                    <select
                      value={assigned.role}
                      disabled={!canAct || busy || r.requestType === "PROVIDER"}
                      onChange={(e) => {
                        const role = e.target.value as Role;
                        setAssignById((prev) => ({
                          ...prev,
                          [r.id]: { role, company: assigned.company },
                        }));
                      }}
                      className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                    >
                      <option value="DEALER_ADMIN">Dealer</option>
                      {mode !== "supabase" ? <option value="DEALER_EMPLOYEE">Dealer Employee</option> : null}
                      <option value="PROVIDER">Provider</option>
                      {user?.role === "SUPER_ADMIN" ? <option value="ADMIN">Admin</option> : null}
                    </select>
                  </div>

                  <div className="mt-2">
                    <div className="text-xs text-muted-foreground">Rejection message (optional)</div>
                    <textarea
                      className="mt-1 min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                      value={resolveReject(r)}
                      disabled={!canAct || busy}
                      onChange={(e) => {
                        const rejectionMessage = e.target.value;
                        setRejectById((prev) => ({
                          ...prev,
                          [r.id]: rejectionMessage,
                        }));
                      }}
                      placeholder="Optional note shown to the requester…"
                    />
                  </div>
                  {r.reviewedByEmail ? (
                    <div className="text-xs text-muted-foreground mt-2">Reviewed by {r.reviewedByEmail}</div>
                  ) : null}
                </div>
                <div className="md:col-span-2 flex md:justify-end gap-2">
                  <Button
                    size="sm"
                    disabled={busy || r.status === "APPROVED"}
                    onClick={() => {
                      void (async () => {
                        const company = assigned.company.trim();
                        if (!company) return;
                        if (!(await confirmProceed(`Approve access request for ${r.email}?`))) return;
                        updateStatusMutation.mutate({
                          id: r.id,
                          status: "APPROVED",
                          assignedRole: assigned.role,
                          assignedCompany: company,
                        });
                      })();
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || r.status === "REJECTED"}
                    onClick={() => {
                      void (async () => {
                        if (!(await confirmProceed(`Reject access request for ${r.email}?`))) return;
                        const rejectionMessage = resolveReject(r).trim();
                        updateStatusMutation.mutate({
                          id: r.id,
                          status: "REJECTED",
                          assignedRole: assigned.role,
                          assignedCompany: assigned.company.trim() || r.company,
                          rejectionMessage: rejectionMessage || undefined,
                        });
                      })();
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </div>

              <div className="mt-2 text-xs text-muted-foreground">
                Submitted {new Date(r.createdAt).toLocaleString()}
                {r.reviewedAt ? ` • Reviewed ${new Date(r.reviewedAt).toLocaleString()}` : ""}
              </div>

              {r.message ? (
                <div className="mt-2 text-sm rounded-lg border bg-background p-3">
                  <div className="text-xs text-muted-foreground">Message</div>
                  <div className="mt-1 whitespace-pre-wrap break-words">{r.message}</div>
                </div>
              ) : null}

              {r.rejectionMessage && r.status === "REJECTED" ? (
                <div className="mt-2 text-sm rounded-lg border bg-background p-3">
                  <div className="text-xs text-muted-foreground">Rejection message</div>
                  <div className="mt-1 whitespace-pre-wrap break-words">{r.rejectionMessage}</div>
                </div>
              ) : null}
            </div>
          );
          })}

          {listQuery.isLoading ? <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div> : null}
          {listQuery.isError ? <div className="px-6 py-6 text-sm text-destructive">Failed to load access requests.</div> : null}
          {!listQuery.isLoading && !listQuery.isError && (listQuery.data ?? []).length === 0 ? (
            <div className="px-6 py-6 text-sm text-muted-foreground">No access requests yet.</div>
          ) : null}
        </div>
      </div>

      {updateStatusMutation.isError ? (
        <div className="mt-4 text-sm text-destructive">
          {toErrorMessage(updateStatusMutation.error)}
        </div>
      ) : null}
    </PageShell>
  );
}
