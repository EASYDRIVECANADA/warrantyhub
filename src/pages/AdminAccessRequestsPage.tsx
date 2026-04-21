import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ShieldCheck, CheckCircle, XCircle, Clock, ArrowRight, User, Building2 } from "lucide-react";

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
  requesterId?: string;
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
            "id, requester_id, request_type, company, name, email, message, rejection_message, status, created_at, reviewed_at, reviewed_by_email, assigned_role, assigned_company",
          )
          .order("created_at", { ascending: false });

        if (error) throw error;
        return (data as any[]).map((r) => ({
          id: r.id,
          requesterId: r.requester_id ?? undefined,
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

        const maybeEnsureDealerLink = async () => {
          if (input.status !== "APPROVED") return;
          if (current?.requestType !== "DEALER") return;
          if (effectiveAssignedRole !== "DEALER_ADMIN") return;

          const requesterId = (current?.requesterId ?? "").trim();
          const email = (current?.email ?? "").trim().toLowerCase();

          let profileId: string | undefined;
          if (requesterId) {
            profileId = requesterId;
          } else {
            if (!email) throw new Error("Requester email is missing");

            const profileLookup = await supabase.from("profiles").select("id, email").eq("email", email).maybeSingle();
            if (profileLookup.error) throw new Error(toErrorMessage(profileLookup.error));
            profileId = (profileLookup.data as any)?.id as string | undefined;
          }

          if (!profileId) throw new Error("Requester profile not found");

          const dealerName = (effectiveAssignedCompany ?? "").trim();
          if (!dealerName) throw new Error("Assigned company is required for approval");

          const dealerInsert = await supabase.from("dealers").insert({ name: dealerName, markup_pct: 0 }).select("id").single();
          if (dealerInsert.error) throw new Error(toErrorMessage(dealerInsert.error));
          const dealerId = (dealerInsert.data as any)?.id as string | undefined;
          if (!dealerId) throw new Error("Failed to create dealership");

          // Also create V2 dealerships row (or find existing one from migration)
          const dealershipUpsert = await supabase
            .from("dealerships")
            .upsert({ name: dealerName, legacy_dealer_id: dealerId, status: "approved" }, { onConflict: "legacy_dealer_id" })
            .select("id")
            .maybeSingle();
          const dealershipId = (dealershipUpsert.data as any)?.id;

          const membershipInsert = await supabase
            .from("dealer_members")
            .insert({ dealer_id: dealerId, user_id: profileId, role: "DEALER_ADMIN", status: "ACTIVE" });
          if (membershipInsert.error) throw new Error(toErrorMessage(membershipInsert.error));

          // Also create V2 dealership_members row
          if (dealershipId) {
            await supabase
              .from("dealership_members")
              .upsert({ user_id: profileId, dealership_id: dealershipId, role: "admin" }, { onConflict: "user_id,dealership_id" });
          }

          // Insert into V2 user_roles table
          await supabase
            .from("user_roles")
            .upsert({ user_id: profileId, role: "dealership_admin" }, { onConflict: "user_id,role" });
        };

        if (input.status === "APPROVED") {
          await maybeEnsureDealerLink();
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
          const requesterId = (current?.requesterId ?? "").trim();
          const email = (current?.email ?? "").trim().toLowerCase();

          let profileId: string | undefined;
          if (requesterId) {
            profileId = requesterId;
          } else if (email) {
            const profileLookup = await supabase.from("profiles").select("id, email").eq("email", email).maybeSingle();
            if (!profileLookup.error && profileLookup.data?.id) {
              profileId = profileLookup.data.id as string;
            }
          }

          if (profileId) {

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

              // V2: Insert into user_roles table
              const v2Role = effectiveAssignedRole === "SUPER_ADMIN" || effectiveAssignedRole === "ADMIN"
                ? "super_admin"
                : effectiveAssignedRole === "DEALER_ADMIN"
                  ? "dealership_admin"
                  : effectiveAssignedRole === "DEALER_EMPLOYEE"
                    ? "dealership_employee"
                    : effectiveAssignedRole === "PROVIDER"
                      ? "provider"
                      : null;

              if (v2Role) {
                await supabase
                  .from("user_roles")
                  .upsert({ user_id: profileId, role: v2Role }, { onConflict: "user_id,role" });
              }

              // V2: For providers, also create providers and provider_members rows
              if (current?.requestType === "PROVIDER" && effectiveAssignedCompany) {
                const providerName = effectiveAssignedCompany.trim();
                let v2ProviderId: string | null = null;

                // Try to find existing provider from backfill (matched by name or provider_company_id)
                if (providerCompanyId) {
                  const { data: existingProvider } = await supabase
                    .from("providers")
                    .select("id")
                    .eq("legacy_profile_id", profileId)
                    .maybeSingle();
                  if (existingProvider) {
                    v2ProviderId = (existingProvider as any).id;
                  }
                }

                if (!v2ProviderId) {
                  // Create provider entity
                  const { data: newProvider, error: providerErr } = await supabase
                    .from("providers")
                    .insert({
                      company_name: providerName,
                      contact_email: (current?.email ?? "").trim(),
                      status: "approved",
                    })
                    .select("id")
                    .maybeSingle();
                  if (!providerErr && newProvider) {
                    v2ProviderId = (newProvider as any).id;
                  }
                }

                if (v2ProviderId) {
                  // Create provider membership
                  await supabase
                    .from("provider_members")
                    .upsert({ user_id: profileId, provider_id: v2ProviderId, role: "admin" }, { onConflict: "user_id,provider_id" });
                }
              }

              // V2: For dealers, also ensure dealerships/roles are linked (handled above in maybeEnsureDealerLink)
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

  const statusBadgeClass = (status: AccessRequestStatus) => {
    if (status === "APPROVED") return "border-emerald-500/15 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    if (status === "REJECTED") return "border-red-500/15 bg-red-500/10 text-red-700 dark:text-red-300";
    return "border-amber-500/15 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  };

  const pendingCount = (listQuery.data ?? []).filter((r) => r.status === "PENDING").length;
  const approvedCount = (listQuery.data ?? []).filter((r) => r.status === "APPROVED").length;
  const rejectedCount = (listQuery.data ?? []).filter((r) => r.status === "REJECTED").length;

  return (
    <PageShell 
      title="Access Requests" 
      subtitle="Review and approve/reject dealer and provider access requests"
      badge="Admin"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="gap-2">
            <Link to="/admin-dashboard">
              <ArrowRight className="w-4 h-4 rotate-180" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
      }
    >
      <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600/5 via-transparent to-transparent">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-foreground">Access Requests</div>
                <div className="text-sm text-muted-foreground">Review and manage platform access</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-700">
                <Clock className="w-4 h-4" />
                <span className="text-sm font-medium">{pendingCount} Pending</span>
              </div>
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-700">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm font-medium">{approvedCount} Approved</span>
              </div>
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-500/10 text-red-700">
                <XCircle className="w-4 h-4" />
                <span className="text-sm font-medium">{rejectedCount} Rejected</span>
              </div>
            </div>
          </div>
        </div>

        <div className="divide-y">
          {(listQuery.data ?? []).map((r) => {
            const assigned = resolveAssign(r);
            const canAct = r.status === "PENDING";
            const isApproved = r.status === "APPROVED";
            const isRejected = r.status === "REJECTED";

            return (
              <div key={r.id} className={`px-6 py-5 ${canAct ? 'hover:bg-muted/30' : ''} transition-colors`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className={`mt-1 p-2 rounded-xl ${isApproved ? 'bg-emerald-500/10 text-emerald-600' : isRejected ? 'bg-red-500/10 text-red-600' : 'bg-amber-500/10 text-amber-600'}`}>
                      {isApproved ? <CheckCircle className="w-5 h-5" /> : isRejected ? <XCircle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-[11px] font-semibold uppercase">
                          {r.requestType}
                        </span>
                        <span className="text-sm font-semibold">{r.name}</span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${statusBadgeClass(r.status)}`}>
                          {r.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{r.company}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{r.email}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        Submitted {new Date(r.createdAt).toLocaleDateString()} at {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {r.reviewedAt && (
                          <span className="ml-2">• Reviewed {new Date(r.reviewedAt).toLocaleDateString()}</span>
                        )}
                        {r.reviewedByEmail && (
                          <span className="ml-1">by {r.reviewedByEmail}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    {canAct && (
                      <div className="space-y-3 min-w-[280px]">
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            value={assigned.company}
                            disabled={busy || r.requestType === "PROVIDER"}
                            onChange={(e) => {
                              const company = e.target.value;
                              setAssignById((prev) => ({
                                ...prev,
                                [r.id]: { role: assigned.role, company },
                              }));
                            }}
                            placeholder="Company name"
                            className="bg-background/70"
                          />
                          <select
                            value={assigned.role}
                            disabled={busy || r.requestType === "PROVIDER"}
                            onChange={(e) => {
                              const role = e.target.value as Role;
                              setAssignById((prev) => ({
                                ...prev,
                                [r.id]: { role, company: assigned.company },
                              }));
                            }}
                            className="h-10 w-full rounded-md border border-input bg-background/70 px-3 text-sm shadow-sm"
                          >
                            <option value="DEALER_ADMIN">Dealer Admin</option>
                            <option value="DEALER_EMPLOYEE">Dealer Employee</option>
                            <option value="PROVIDER">Provider</option>
                            {user?.role === "SUPER_ADMIN" ? <option value="ADMIN">Admin</option> : null}
                          </select>
                        </div>
                        <div>
                          <textarea
                            className="min-h-[60px] w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm resize-none"
                            value={resolveReject(r)}
                            disabled={busy}
                            onChange={(e) => {
                              const rejectionMessage = e.target.value;
                              setRejectById((prev) => ({
                                ...prev,
                                [r.id]: rejectionMessage,
                              }));
                            }}
                            placeholder="Rejection reason (optional)…"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                            disabled={busy}
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
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 border-red-200 text-red-700 hover:bg-red-50"
                            disabled={busy}
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
                            <XCircle className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {r.message && (
                  <div className="mt-4 ml-11 text-sm rounded-xl border bg-muted/50 p-4">
                    <div className="text-xs font-medium text-muted-foreground mb-1">Message from requester</div>
                    <div className="whitespace-pre-wrap break-words">{r.message}</div>
                  </div>
                )}

                {r.rejectionMessage && isRejected && (
                  <div className="mt-4 ml-11 text-sm rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4">
                    <div className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Rejection reason</div>
                    <div className="whitespace-pre-wrap break-words text-red-800 dark:text-red-300">{r.rejectionMessage}</div>
                  </div>
                )}
              </div>
            );
          })}

          {listQuery.isLoading && (
            <div className="px-6 py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
                <Clock className="w-6 h-6 text-muted-foreground animate-pulse" />
              </div>
              <div className="text-sm text-muted-foreground">Loading access requests…</div>
            </div>
          )}
          {listQuery.isError && (
            <div className="px-6 py-12 text-center">
              <div className="text-sm text-destructive">Failed to load access requests. Please try again.</div>
            </div>
          )}
          {!listQuery.isLoading && !listQuery.isError && (listQuery.data ?? []).length === 0 && (
            <div className="px-6 py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 mb-4">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div className="text-sm font-medium">No access requests</div>
              <div className="text-sm text-muted-foreground mt-1">All caught up! No pending requests at this time.</div>
            </div>
          )}
        </div>
      </div>

      {updateStatusMutation.isError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200">
          {toErrorMessage(updateStatusMutation.error)}
        </div>
      )}
    </PageShell>
  );
}
