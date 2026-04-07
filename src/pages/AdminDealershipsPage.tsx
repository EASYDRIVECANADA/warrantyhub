import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Building2, Users, ChevronRight, ArrowLeft, Mail, Shield, UserCog, UserX, Search, DollarSign, Percent, Calendar, Plus } from "lucide-react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { getAppMode } from "../lib/runtime";
import { getSupabaseClient } from "../lib/supabase/client";
import { invokeEdgeFunction } from "../lib/supabase/functions";
import { alertMissing, confirmProceed, sanitizeWordsOnly } from "../lib/utils";

type DealerRow = {
  id: string;
  name: string;
  markup_pct: number;
  contract_fee_cents: number | null;
  subscription_status: string | null;
  subscription_plan_key: string | null;
};

type DealerMemberRow = {
  id: string;
  dealer_id: string;
  user_id: string;
  role: "DEALER_ADMIN" | "DEALER_EMPLOYEE" | "DEALER";
  status: "INVITED" | "ACTIVE" | "DISABLED";
  profiles?: {
    email?: string | null;
    display_name?: string | null;
    is_active?: boolean | null;
  } | null;
};

function moneyCentsToDollarsString(cents: number | null) {
  const v = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  const dollars = v / 100;
  return dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusBadgeClass(status: string) {
  if (status === "ACTIVE") return "border-emerald-500/15 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "DISABLED") return "border-red-500/15 bg-red-500/10 text-red-700 dark:text-red-300";
  return "border-amber-500/15 bg-amber-500/10 text-amber-800 dark:text-amber-300";
}

function roleBadgeClass(role: string) {
  if (role === "DEALER_ADMIN") return "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20";
  return "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20";
}

export function AdminDealershipsPage() {
  const mode = useMemo(() => getAppMode(), []);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedDealerId, setSelectedDealerId] = useState<string | null>(null);

  const [newEmployeeEmail, setNewEmployeeEmail] = useState("");
  const [newEmployeeRole, setNewEmployeeRole] = useState<"DEALER_ADMIN" | "DEALER_EMPLOYEE">("DEALER_EMPLOYEE");

  const [emailEditByUserId, setEmailEditByUserId] = useState<Record<string, string>>({});

  const dealersQuery = useQuery({
    queryKey: ["superadmin-dealers", mode],
    queryFn: async (): Promise<DealerRow[]> => {
      if (mode !== "supabase") return [];
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("dealers")
        .select("id, name, markup_pct, contract_fee_cents, subscription_status, subscription_plan_key")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) as DealerRow[];
    },
  });

  const filteredDealers = (dealersQuery.data ?? []).filter((d) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q);
  });

  const selectedDealer = filteredDealers.find((d) => d.id === selectedDealerId) ?? (dealersQuery.data ?? []).find((d) => d.id === selectedDealerId) ?? null;

  const membersQuery = useQuery({
    queryKey: ["superadmin-dealer-members", mode, selectedDealerId],
    enabled: mode === "supabase" && Boolean(selectedDealerId),
    queryFn: async (): Promise<DealerMemberRow[]> => {
      if (mode !== "supabase") return [];
      const dealerId = selectedDealerId;
      if (!dealerId) return [];
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const { data, error } = await supabase
        .from("dealer_members")
        .select("id, dealer_id, user_id, role, status, profiles:profiles(email, display_name, is_active)")
        .eq("dealer_id", dealerId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data as any[]) as DealerMemberRow[];
    },
  });

  const dealerPatchMutation = useMutation({
    mutationFn: async (input: { dealerId: string; patch: any }) => {
      if (mode !== "supabase") throw new Error("Supabase mode required");
      await invokeEdgeFunction("admin-dealer-tools", {
        action: "update_dealer",
        dealerId: input.dealerId,
        patch: input.patch,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["superadmin-dealers", mode] });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async (input: { dealerId: string; email: string; role: "DEALER_ADMIN" | "DEALER_EMPLOYEE" }) => {
      if (mode !== "supabase") throw new Error("Supabase mode required");
      await invokeEdgeFunction("admin-dealer-tools", {
        action: "add_dealer_member",
        dealerId: input.dealerId,
        email: input.email,
        role: input.role,
        status: "ACTIVE",
        redirectTo: `${window.location.origin}/reset-password`,
      });
    },
    onSuccess: async () => {
      setNewEmployeeEmail("");
      await qc.invalidateQueries({ queryKey: ["superadmin-dealer-members", mode, selectedDealerId] });
      await qc.invalidateQueries({ queryKey: ["admin-profiles", mode] });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (dealerMemberId: string) => {
      if (mode !== "supabase") throw new Error("Supabase mode required");
      await invokeEdgeFunction("admin-dealer-tools", {
        action: "remove_dealer_member",
        dealerMemberId,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["superadmin-dealer-members", mode, selectedDealerId] });
    },
  });

  const updateMemberMutation = useMutation({
    mutationFn: async (input: { dealerMemberId: string; patch: any }) => {
      if (mode !== "supabase") throw new Error("Supabase mode required");
      await invokeEdgeFunction("admin-dealer-tools", {
        action: "update_dealer_member",
        dealerMemberId: input.dealerMemberId,
        patch: input.patch,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["superadmin-dealer-members", mode, selectedDealerId] });
      await qc.invalidateQueries({ queryKey: ["admin-profiles", mode] });
    },
  });

  const updateUserEmailMutation = useMutation({
    mutationFn: async (input: { userId: string; email: string }) => {
      if (mode !== "supabase") throw new Error("Supabase mode required");
      await invokeEdgeFunction("admin-dealer-tools", {
        action: "update_user_email",
        userId: input.userId,
        email: input.email,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["superadmin-dealer-members", mode, selectedDealerId] });
      await qc.invalidateQueries({ queryKey: ["admin-profiles", mode] });
    },
  });

  const setUserDisabledMutation = useMutation({
    mutationFn: async (input: { userId: string; disabled: boolean }) => {
      if (mode !== "supabase") throw new Error("Supabase mode required");
      await invokeEdgeFunction("admin-dealer-tools", {
        action: "set_user_disabled",
        userId: input.userId,
        disabled: input.disabled,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["superadmin-dealer-members", mode, selectedDealerId] });
      await qc.invalidateQueries({ queryKey: ["admin-profiles", mode] });
    },
  });

  const busy =
    dealerPatchMutation.isPending ||
    addMemberMutation.isPending ||
    removeMemberMutation.isPending ||
    updateMemberMutation.isPending ||
    updateUserEmailMutation.isPending ||
    setUserDisabledMutation.isPending;

  const members = membersQuery.data ?? [];
  const adminCount = members.filter((m) => m.role === "DEALER_ADMIN").length;
  const employeeCount = members.filter((m) => m.role === "DEALER_EMPLOYEE").length;
  const activeCount = members.filter((m) => m.status === "ACTIVE").length;

  return (
    <PageShell
      badge="SUPER ADMIN"
      title="Dealerships"
      subtitle="Manage dealership companies and their team members"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="gap-2">
            <Link to="/admin-users">
              <Users className="w-4 h-4" />
              Users
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (mode !== "supabase") return alertMissing("This page requires Supabase mode.");
              void qc.invalidateQueries({ queryKey: ["superadmin-dealers", mode] });
            }}
          >
            Refresh
          </Button>
        </div>
      }
    >
      {selectedDealer ? (
        <div className="space-y-6">
          <Button variant="ghost" size="sm" onClick={() => setSelectedDealerId(null)} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to dealerships
          </Button>

          <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b bg-gradient-to-r from-violet-500/5 via-transparent to-transparent">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-violet-500/10 text-violet-600">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{selectedDealer.name}</h2>
                    <p className="text-sm text-muted-foreground">Dealership ID: {selectedDealer.id}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border bg-gradient-to-br from-violet-500/5 to-transparent p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Shield className="w-4 h-4" />
                    Admins
                  </div>
                  <div className="text-3xl font-bold mt-2">{adminCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">Dealer administrators</div>
                </div>
                <div className="rounded-xl border bg-gradient-to-br from-blue-500/5 to-transparent p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="w-4 h-4" />
                    Employees
                  </div>
                  <div className="text-3xl font-bold mt-2">{employeeCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">Team members</div>
                </div>
                <div className="rounded-xl border bg-gradient-to-br from-emerald-500/5 to-transparent p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <UserCog className="w-4 h-4" />
                    Active
                  </div>
                  <div className="text-3xl font-bold mt-2">{activeCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">Active users</div>
                </div>
                <div className="rounded-xl border bg-gradient-to-br from-amber-500/5 to-transparent p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Percent className="w-4 h-4" />
                    Markup
                  </div>
                  <div className="text-3xl font-bold mt-2">{selectedDealer.markup_pct ?? 0}%</div>
                  <div className="text-xs text-muted-foreground mt-1">Contract fee: ${moneyCentsToDollarsString(selectedDealer.contract_fee_cents)}</div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Dealership Settings</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Dealership Name</div>
                      <Input
                        defaultValue={selectedDealer.name}
                        className="bg-background/70"
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (!next || next === selectedDealer.name) return;
                          void (async () => {
                            if (!(await confirmProceed(`Update dealership name to "${next}"?`))) return;
                            dealerPatchMutation.mutate({ dealerId: selectedDealer.id, patch: { name: next } });
                          })();
                        }}
                        disabled={busy}
                      />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Markup Percentage</div>
                      <Input
                        defaultValue={String(selectedDealer.markup_pct ?? 0)}
                        className="bg-background/70"
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          if (!raw) return;
                          const n = Number(raw);
                          if (!Number.isFinite(n)) return;
                          if (n === selectedDealer.markup_pct) return;
                          void (async () => {
                            if (!(await confirmProceed(`Update markup to ${n}%?`))) return;
                            dealerPatchMutation.mutate({ dealerId: selectedDealer.id, patch: { markupPct: n } });
                          })();
                        }}
                        disabled={busy}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Subscription Details</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Contract Fee</div>
                        <div className="text-sm font-medium">${moneyCentsToDollarsString(selectedDealer.contract_fee_cents)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Plan</div>
                        <div className="text-sm font-medium">{selectedDealer.subscription_plan_key ?? "—"}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {dealerPatchMutation.isError ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200">
                  {dealerPatchMutation.error instanceof Error ? dealerPatchMutation.error.message : "Failed to update dealership."}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b bg-gradient-to-r from-blue-500/5 via-transparent to-transparent">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Team Members</h2>
                    <p className="text-sm text-muted-foreground">Manage employees and administrators for this dealership</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-6 p-4 rounded-xl border bg-gradient-to-r from-violet-500/5 via-transparent to-transparent">
                <h3 className="text-sm font-semibold mb-3">Add Team Member</h3>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-5">
                    <div className="text-xs text-muted-foreground mb-1">Email Address</div>
                    <Input
                      value={newEmployeeEmail}
                      onChange={(e) => setNewEmployeeEmail(e.target.value)}
                      className="bg-background/70"
                      placeholder="employee@company.com"
                      disabled={busy}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <div className="text-xs text-muted-foreground mb-1">Role</div>
                    <select
                      value={newEmployeeRole}
                      disabled={busy}
                      onChange={(e) => setNewEmployeeRole(e.target.value as any)}
                      className="h-10 w-full rounded-md border border-input bg-background/70 px-3 text-sm shadow-sm"
                    >
                      <option value="DEALER_EMPLOYEE">Employee</option>
                      <option value="DEALER_ADMIN">Admin</option>
                    </select>
                  </div>
                  <div className="sm:col-span-4">
                    <Button
                      className="w-full gap-2"
                      disabled={busy || !newEmployeeEmail.trim()}
                      onClick={() => {
                        const email = newEmployeeEmail.trim();
                        if (!email) return;
                        void (async () => {
                          if (!(await confirmProceed(`Add ${email} to ${selectedDealer.name}?`))) return;
                          addMemberMutation.mutate({ dealerId: selectedDealer.id, email, role: newEmployeeRole });
                        })();
                      }}
                    >
                      <Plus className="w-4 h-4" />
                      Add Member
                    </Button>
                  </div>
                </div>
                {addMemberMutation.isError ? (
                  <div className="mt-3 text-sm text-destructive">{addMemberMutation.error instanceof Error ? addMemberMutation.error.message : "Failed to add employee."}</div>
                ) : null}
              </div>

              <div className="rounded-xl border overflow-hidden divide-y">
                {members.map((m) => {
                  const email = (m.profiles?.email ?? "").toString();
                  const displayName = (m.profiles?.display_name ?? "").toString();
                  const userId = m.user_id;
                  const emailEdit = emailEditByUserId[userId] ?? email;

                  return (
                    <div key={m.id} className="p-4 sm:p-5 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="p-2.5 rounded-xl bg-muted/50 text-muted-foreground">
                            <Mail className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="font-medium text-sm break-all">{email || "(no email)"}</span>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${roleBadgeClass(m.role)}`}>
                                {m.role === "DEALER_ADMIN" ? "Admin" : "Employee"}
                              </span>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${statusBadgeClass(m.status)}`}>
                                {m.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                              {displayName && <span>Display: {displayName}</span>}
                              <span>User ID: {userId.slice(0, 8)}...</span>
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                          disabled={busy}
                          onClick={() => {
                            void (async () => {
                              if (
                                !(await confirmProceed(
                                  `Remove ${email || userId} from this dealership? This permanently deletes their login account.`,
                                  "Remove",
                                ))
                              )
                                return;
                              removeMemberMutation.mutate(m.id);
                            })();
                          }}
                        >
                          <UserX className="w-4 h-4" />
                          Remove
                        </Button>
                      </div>

                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                        <div className="sm:col-span-5">
                          <div className="text-xs text-muted-foreground mb-1">Change Email</div>
                          <Input
                            value={emailEdit}
                            disabled={busy}
                            onChange={(e) => setEmailEditByUserId((prev) => ({ ...prev, [userId]: e.target.value }))}
                            className="bg-background/70"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <div className="text-xs text-muted-foreground mb-1">Role</div>
                          <select
                            value={m.role === "DEALER" ? "DEALER_EMPLOYEE" : m.role}
                            disabled={busy}
                            onChange={(e) => {
                              const nextRole = e.target.value;
                              void (async () => {
                                if (!(await confirmProceed(`Change role for ${email || userId} to ${nextRole}?`))) return;
                                updateMemberMutation.mutate({ dealerMemberId: m.id, patch: { role: nextRole } });
                              })();
                            }}
                            className="h-10 w-full rounded-md border border-input bg-background/70 px-3 text-sm shadow-sm"
                          >
                            <option value="DEALER_EMPLOYEE">Employee</option>
                            <option value="DEALER_ADMIN">Admin</option>
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <div className="text-xs text-muted-foreground mb-1">Status</div>
                          <select
                            value={m.status}
                            disabled={busy}
                            onChange={(e) => {
                              const nextStatus = e.target.value;
                              void (async () => {
                                if (!(await confirmProceed(`Change status for ${email || userId} to ${nextStatus}?`))) return;
                                updateMemberMutation.mutate({ dealerMemberId: m.id, patch: { status: nextStatus } });
                              })();
                            }}
                            className="h-10 w-full rounded-md border border-input bg-background/70 px-3 text-sm shadow-sm"
                          >
                            <option value="ACTIVE">Active</option>
                            <option value="INVITED">Invited</option>
                            <option value="DISABLED">Disabled</option>
                          </select>
                        </div>
                        <div className="sm:col-span-3 flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || !emailEdit.trim() || emailEdit === email}
                            onClick={() => {
                              const nextEmail = emailEdit.trim();
                              if (!nextEmail) return;
                              void (async () => {
                                if (!(await confirmProceed(`Change email to ${nextEmail}?`))) return;
                                updateUserEmailMutation.mutate({ userId, email: nextEmail });
                              })();
                            }}
                            className="flex-1"
                          >
                            Update Email
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              void (async () => {
                                const currentlyActive = m.profiles?.is_active ?? true;
                                const nextDisabled = currentlyActive;
                                const label = nextDisabled ? "Disable" : "Enable";
                                if (!(await confirmProceed(`${label} user ${email || userId}?`))) return;
                                setUserDisabledMutation.mutate({ userId, disabled: nextDisabled });
                              })();
                            }}
                          >
                            {m.profiles?.is_active === false ? "Enable" : "Disable"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {membersQuery.isLoading && <div className="px-6 py-12 text-center text-sm text-muted-foreground">Loading members…</div>}
                {membersQuery.isError && <div className="px-6 py-12 text-center text-sm text-destructive">Failed to load members.</div>}
                {!membersQuery.isLoading && !membersQuery.isError && members.length === 0 && (
                  <div className="px-6 py-12 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
                      <Users className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium">No team members</div>
                    <div className="text-sm text-muted-foreground mt-1">Add employees above to get started</div>
                  </div>
                )}
              </div>

              {updateMemberMutation.isError && (
                <div className="mt-3 text-sm text-destructive">{updateMemberMutation.error instanceof Error ? updateMemberMutation.error.message : "Failed to update member."}</div>
              )}
              {updateUserEmailMutation.isError && (
                <div className="mt-3 text-sm text-destructive">{updateUserEmailMutation.error instanceof Error ? updateUserEmailMutation.error.message : "Failed to update email."}</div>
              )}
              {setUserDisabledMutation.isError && (
                <div className="mt-3 text-sm text-destructive">{setUserDisabledMutation.error instanceof Error ? setUserDisabledMutation.error.message : "Failed to update user status."}</div>
              )}
              {removeMemberMutation.isError && (
                <div className="mt-3 text-sm text-destructive">{removeMemberMutation.error instanceof Error ? removeMemberMutation.error.message : "Failed to remove member."}</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b bg-gradient-to-r from-violet-600/5 via-transparent to-transparent">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-violet-500/10 text-violet-600">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">Dealerships</div>
                    <div className="text-sm text-muted-foreground">Manage dealership companies and their teams</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-violet-500/10 text-violet-700">
                    <span className="text-sm font-medium">{(dealersQuery.data ?? []).length}</span>
                    <span className="text-xs text-muted-foreground ml-1">Total</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-b">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(sanitizeWordsOnly(e.target.value))}
                  placeholder="Search by name or ID…"
                  className="pl-10 bg-background/70"
                />
              </div>
            </div>

            {dealersQuery.isLoading && (
              <div className="p-6">
                <div className="animate-pulse space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 bg-muted rounded-xl" />
                  ))}
                </div>
              </div>
            )}

            {dealersQuery.isError && (
              <div className="p-6 text-center">
                <div className="text-sm text-destructive">Failed to load dealerships. Please try again.</div>
              </div>
            )}

            {!dealersQuery.isLoading && !dealersQuery.isError && filteredDealers.length === 0 && (
              <div className="p-12 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
                  <Building2 className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="text-sm font-medium">
                  {search ? "No dealerships match your search" : "No dealerships"}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {search ? "Try a different search term" : "Dealerships will appear here once created"}
                </div>
              </div>
            )}

            {!dealersQuery.isLoading && !dealersQuery.isError && filteredDealers.length > 0 && (
              <div className="divide-y">
                {filteredDealers.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedDealerId(d.id)}
                    className="w-full px-6 py-5 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors text-left"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="p-3 rounded-xl bg-violet-500/10 text-violet-600">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm">{d.name}</div>
                        <div className="text-xs text-muted-foreground mt-1 truncate">ID: {d.id}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-center min-w-[70px]">
                        <div className="font-bold text-lg">{d.markup_pct ?? 0}%</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Markup</div>
                      </div>
                      <div className="text-center min-w-[80px]">
                        <div className="font-bold text-lg">${moneyCentsToDollarsString(d.contract_fee_cents)}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Fee</div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="px-6 py-3 border-t bg-muted/30">
              <div className="text-xs text-muted-foreground">
                Showing {filteredDealers.length} of {(dealersQuery.data ?? []).length} dealerships
              </div>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
