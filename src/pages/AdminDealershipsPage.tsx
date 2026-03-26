import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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

function parseMoneyToCents(raw: string) {
  const cleaned = (raw ?? "").toString().trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
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

  return (
    <PageShell
      badge="SUPER ADMIN"
      title="Dealerships"
      subtitle="Edit dealerships, manage employees, and manage user logins."
      actions={
        <Button
          variant="outline"
          onClick={() => {
            if (mode !== "supabase") return alertMissing("This page requires Supabase mode.");
            void qc.invalidateQueries({ queryKey: ["superadmin-dealers", mode] });
          }}
        >
          Refresh
        </Button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold">Dealership list</div>
            <div className="text-xs text-muted-foreground">{filteredDealers.length} dealers</div>
          </div>

          <div className="mt-3">
            <Input value={search} onChange={(e) => setSearch(sanitizeWordsOnly(e.target.value))} placeholder="Search name/id…" className="bg-background/70" />
          </div>

          <div className="mt-3 rounded-xl border overflow-hidden divide-y">
            {filteredDealers.map((d) => (
              <button
                key={d.id}
                className={
                  "w-full text-left px-4 py-3 hover:bg-white/30 dark:hover:bg-white/5 transition-colors " +
                  (selectedDealerId === d.id ? "bg-white/30 dark:bg-white/5" : "")
                }
                onClick={() => setSelectedDealerId(d.id)}
              >
                <div className="text-sm font-medium">{d.name}</div>
                <div className="text-xs text-muted-foreground break-all mt-1">{d.id}</div>
              </button>
            ))}

            {dealersQuery.isLoading ? <div className="px-4 py-4 text-sm text-muted-foreground">Loading…</div> : null}
            {dealersQuery.isError ? <div className="px-4 py-4 text-sm text-destructive">Failed to load dealers.</div> : null}
            {!dealersQuery.isLoading && !dealersQuery.isError && filteredDealers.length === 0 ? (
              <div className="px-4 py-4 text-sm text-muted-foreground">No dealerships found.</div>
            ) : null}
          </div>
        </div>

        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm p-4">
            <div className="font-semibold">Dealership details</div>

            {!selectedDealer ? (
              <div className="text-sm text-muted-foreground mt-3">Select a dealership to manage it.</div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Name</div>
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
                    <div className="text-xs text-muted-foreground">Markup %</div>
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Contract fee ($)</div>
                    <Input
                      defaultValue={moneyCentsToDollarsString(selectedDealer.contract_fee_cents)}
                      className="bg-background/70"
                      onBlur={(e) => {
                        const cents = parseMoneyToCents(e.target.value);
                        if (cents === selectedDealer.contract_fee_cents) return;
                        void (async () => {
                          if (!(await confirmProceed(`Update contract fee to $${(cents ?? 0) / 100}?`))) return;
                          dealerPatchMutation.mutate({ dealerId: selectedDealer.id, patch: { contractFeeCents: cents } });
                        })();
                      }}
                      disabled={busy}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Subscription status / plan</div>
                    <div className="text-sm text-muted-foreground mt-2">
                      {selectedDealer.subscription_status ?? "—"} / {selectedDealer.subscription_plan_key ?? "—"}
                    </div>
                  </div>
                </div>

                {dealerPatchMutation.isError ? (
                  <div className="text-sm text-destructive">{dealerPatchMutation.error instanceof Error ? dealerPatchMutation.error.message : "Failed to update dealership."}</div>
                ) : null}
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="font-semibold">Employees</div>
              {selectedDealer ? <div className="text-xs text-muted-foreground break-all">{selectedDealer.id}</div> : null}
            </div>

            {!selectedDealer ? (
              <div className="text-sm text-muted-foreground mt-3">Select a dealership to view employees.</div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                  <div className="md:col-span-6">
                    <div className="text-xs text-muted-foreground">Add employee email</div>
                    <Input value={newEmployeeEmail} onChange={(e) => setNewEmployeeEmail(e.target.value)} className="bg-background/70" disabled={busy} />
                  </div>
                  <div className="md:col-span-3">
                    <div className="text-xs text-muted-foreground">Role</div>
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
                  <div className="md:col-span-3 flex md:justify-end">
                    <Button
                      disabled={busy}
                      onClick={() => {
                        const email = newEmployeeEmail.trim();
                        if (!email) return;
                        void (async () => {
                          if (!(await confirmProceed(`Add ${email} to ${selectedDealer.name}?`))) return;
                          addMemberMutation.mutate({ dealerId: selectedDealer.id, email, role: newEmployeeRole });
                        })();
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border overflow-hidden divide-y">
                  {(membersQuery.data ?? []).map((m) => {
                    const email = (m.profiles?.email ?? "").toString();
                    const displayName = (m.profiles?.display_name ?? "").toString();
                    const userId = m.user_id;
                    const emailEdit = emailEditByUserId[userId] ?? email;

                    return (
                      <div key={m.id} className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                          <div className="md:col-span-5">
                            <div className="text-sm font-medium break-all">{email || "(no email)"}</div>
                            <div className="text-xs text-muted-foreground mt-1 break-all">User: {userId}</div>
                            {displayName ? <div className="text-xs text-muted-foreground mt-1">{displayName}</div> : null}
                          </div>

                          <div className="md:col-span-2">
                            <div className="text-xs text-muted-foreground">Role</div>
                            <select
                              value={m.role === "DEALER" ? "DEALER_EMPLOYEE" : (m.role as any)}
                              disabled={busy}
                              onChange={(e) => {
                                const nextRole = e.target.value;
                                void (async () => {
                                  if (!(await confirmProceed(`Change role for ${email || userId} to ${nextRole}?`))) return;
                                  updateMemberMutation.mutate({ dealerMemberId: m.id, patch: { role: nextRole } });
                                })();
                              }}
                              className="h-9 w-full rounded-md border border-input bg-background/70 px-2 text-sm shadow-sm"
                            >
                              <option value="DEALER_EMPLOYEE">Employee</option>
                              <option value="DEALER_ADMIN">Admin</option>
                            </select>
                          </div>

                          <div className="md:col-span-2">
                            <div className="text-xs text-muted-foreground">Status</div>
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
                              className="h-9 w-full rounded-md border border-input bg-background/70 px-2 text-sm shadow-sm"
                            >
                              <option value="ACTIVE">ACTIVE</option>
                              <option value="INVITED">INVITED</option>
                              <option value="DISABLED">DISABLED</option>
                            </select>
                          </div>

                          <div className="md:col-span-3 flex md:justify-end gap-2 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                void (async () => {
                                  if (
                                    !(await confirmProceed(
                                      `Delete employee ${email || userId}? This permanently deletes their login account and frees the email for reuse.`,
                                      "Delete",
                                    ))
                                  )
                                    return;
                                  removeMemberMutation.mutate(m.id);
                                })();
                              }}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                          <div className="md:col-span-6">
                            <div className="text-xs text-muted-foreground">Change email</div>
                            <Input
                              value={emailEdit}
                              disabled={busy}
                              onChange={(e) => setEmailEditByUserId((prev) => ({ ...prev, [userId]: e.target.value }))}
                              className="bg-background/70"
                            />
                          </div>
                          <div className="md:col-span-3">
                            <Button
                              size="sm"
                              disabled={busy || !emailEdit.trim()}
                              onClick={() => {
                                const nextEmail = emailEdit.trim();
                                if (!nextEmail) return;
                                void (async () => {
                                  if (!(await confirmProceed(`Change email to ${nextEmail}?`))) return;
                                  updateUserEmailMutation.mutate({ userId, email: nextEmail });
                                })();
                              }}
                            >
                              Update Email
                            </Button>
                          </div>
                          <div className="md:col-span-3 flex md:justify-end">
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

                  {membersQuery.isLoading ? <div className="px-4 py-4 text-sm text-muted-foreground">Loading…</div> : null}
                  {membersQuery.isError ? <div className="px-4 py-4 text-sm text-destructive">Failed to load employees.</div> : null}
                  {!membersQuery.isLoading && !membersQuery.isError && (membersQuery.data ?? []).length === 0 ? (
                    <div className="px-4 py-4 text-sm text-muted-foreground">No employees for this dealership.</div>
                  ) : null}
                </div>

                {addMemberMutation.isError ? (
                  <div className="mt-3 text-sm text-destructive">{addMemberMutation.error instanceof Error ? addMemberMutation.error.message : "Failed to add employee."}</div>
                ) : null}
                {updateMemberMutation.isError ? (
                  <div className="mt-3 text-sm text-destructive">{updateMemberMutation.error instanceof Error ? updateMemberMutation.error.message : "Failed to update member."}</div>
                ) : null}
                {removeMemberMutation.isError ? (
                  <div className="mt-3 text-sm text-destructive">{removeMemberMutation.error instanceof Error ? removeMemberMutation.error.message : "Failed to remove member."}</div>
                ) : null}
                {updateUserEmailMutation.isError ? (
                  <div className="mt-3 text-sm text-destructive">{updateUserEmailMutation.error instanceof Error ? updateUserEmailMutation.error.message : "Failed to update email."}</div>
                ) : null}
                {setUserDisabledMutation.isError ? (
                  <div className="mt-3 text-sm text-destructive">{setUserDisabledMutation.error instanceof Error ? setUserDisabledMutation.error.message : "Failed to update user status."}</div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
