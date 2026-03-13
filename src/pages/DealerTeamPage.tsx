import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { logAuditEvent } from "../lib/auditLog";
import { getAppMode } from "../lib/runtime";
import { getSupabaseClient } from "../lib/supabase/client";
import { confirmProceed } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";

type DealerTeamRole = "DEALER_ADMIN" | "DEALER_EMPLOYEE";
type DealerTeamStatus = "INVITED" | "ACTIVE" | "DISABLED";

type DealerTeamMember = {
  id: string;
  dealerId: string;
  email: string;
  role: DealerTeamRole;
  status: DealerTeamStatus;
  createdAt: string;
};

const STORAGE_KEY = "warrantyhub.local.dealer_team_members";
const DEALER_INVITES_KEY = "warrantyhub.local.dealer_employee_invites";
const LOCAL_USERS_KEY = "warrantyhub.local.users";
const LOCAL_DEALER_MEMBERSHIPS_KEY = "warrantyhub.local.dealer_memberships";

type DealerInvite = {
  code: string;
  dealerName?: string;
  createdAt: string;
};

function readLocalUsers(): Array<{ id?: string; companyName?: string }> {
  const raw = localStorage.getItem(LOCAL_USERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as any[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readLocalUsersRaw(): any[] {
  const raw = localStorage.getItem(LOCAL_USERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as any[]) : [];
  } catch {
    return [];
  }
}

function writeLocalUsersRaw(items: any[]) {
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(items));
}

function readLocalDealerMemberships(): any[] {
  const raw = localStorage.getItem(LOCAL_DEALER_MEMBERSHIPS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as any[]) : [];
  } catch {
    return [];
  }
}

function writeLocalDealerMemberships(items: any[]) {
  localStorage.setItem(LOCAL_DEALER_MEMBERSHIPS_KEY, JSON.stringify(items));
}

function readInvites(): Record<string, DealerInvite> {
  const raw = localStorage.getItem(DEALER_INVITES_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<DealerInvite>>;
    const out: Record<string, DealerInvite> = {};
    for (const [dealerId, v] of Object.entries(parsed ?? {})) {
      const code = (v?.code ?? "").toString().trim();
      if (!code) continue;
      out[dealerId] = {
        code,
        dealerName: (v?.dealerName ?? "").toString() || undefined,
        createdAt: (v?.createdAt ?? new Date().toISOString()).toString(),
      };
    }
    return out;
  } catch {
    return {};
  }
}

function writeInvites(next: Record<string, DealerInvite>) {
  localStorage.setItem(DEALER_INVITES_KEY, JSON.stringify(next));
}

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)]!;
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

function read(): DealerTeamMember[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<DealerTeamMember>[];
    return parsed
      .map((m): DealerTeamMember => {
        const createdAt = m.createdAt ?? new Date().toISOString();
        const rawRole = (m.role ?? "DEALER_EMPLOYEE") as unknown;
        const normalizedRole: DealerTeamRole =
          rawRole === "DEALER_ADMIN" ? "DEALER_ADMIN" : rawRole === "DEALER_EMPLOYEE" ? "DEALER_EMPLOYEE" : "DEALER_EMPLOYEE";
        return {
          id: m.id ?? crypto.randomUUID(),
          dealerId: m.dealerId ?? "",
          email: m.email ?? "",
          role: normalizedRole,
          status: (m.status ?? "INVITED") as DealerTeamStatus,
          createdAt,
        };
      })
      .filter((m) => m.dealerId.trim() && m.email.trim());
  } catch {
    return [];
  }
}

function write(items: DealerTeamMember[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function roleLabel(r: DealerTeamRole) {
  if (r === "DEALER_ADMIN") return "Dealer Admin";
  return "Dealer Employee";
}

function statusBadgeClass(s: DealerTeamStatus) {
  if (s === "ACTIVE") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "DISABLED") return "bg-red-50 text-red-700 border-red-200";
  return "bg-amber-50 text-amber-800 border-amber-200";
}

function statusLabel(s: DealerTeamStatus) {
  if (s === "ACTIVE") return "Active";
  if (s === "DISABLED") return "Disabled";
  return "Invited";
}

export function DealerTeamPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const mode = useMemo(() => getAppMode(), []);

  if (!user) return <Navigate to="/sign-in" replace />;
  if (user.role !== "DEALER_ADMIN") return <Navigate to="/dealer-dashboard" replace />;

  const dealerId = (mode === "local" ? (user.dealerId ?? user.id) : (user.dealerId ?? "")).trim();

  const inviteQuery = useQuery({
    queryKey: ["dealer-employee-invite", mode, dealerId],
    enabled: Boolean(dealerId),
    queryFn: async () => {
      if (!dealerId) return null;
      if (mode === "local") {
        const inv = readInvites()[dealerId];
        const code = (inv?.code ?? "").toString().trim();
        if (!code) return null;
        return {
          code,
          dealerName: (inv?.dealerName ?? "").toString() || undefined,
          createdAt: (inv?.createdAt ?? new Date().toISOString()).toString(),
        };
      }

      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const { data, error } = await supabase
        .from("dealer_employee_invites")
        .select("code, created_at, updated_at")
        .eq("dealer_id", dealerId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return null;

      const code = (data as any)?.code;
      if (!code) return null;

      return {
        code: code.toString(),
        createdAt: ((data as any)?.updated_at ?? (data as any)?.created_at ?? new Date().toISOString()).toString(),
      };
    },
  });

  const inviteCode = (inviteQuery.data?.code ?? "").trim();
  const inviteLink = inviteCode ? `${window.location.origin}/dealer-employee-signup?code=${encodeURIComponent(inviteCode)}` : "";
  const [error, setError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["dealer-team"],
    queryFn: async () => {
      if (!dealerId) return [];
      if (mode === "local") {
        return read()
          .filter((m) => m.dealerId === dealerId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }

      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const { data, error } = await supabase
        .from("dealer_members")
        .select("id, dealer_id, user_id, role, status, created_at, profiles:profiles(email)")
        .eq("dealer_id", dealerId)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      return ((data ?? []) as any[]).map(
        (r): DealerTeamMember => ({
          id: (r?.id ?? "").toString(),
          dealerId: (r?.dealer_id ?? "").toString(),
          email: ((r?.profiles?.email ?? "") as string).toString(),
          role: (r?.role === "DEALER_ADMIN" ? "DEALER_ADMIN" : "DEALER_EMPLOYEE") as DealerTeamRole,
          status:
            r?.status === "ACTIVE" ? "ACTIVE" : r?.status === "DISABLED" ? "DISABLED" : ("INVITED" as DealerTeamStatus),
          createdAt: (r?.created_at ?? new Date().toISOString()).toString(),
        }),
      );
    },
  });

  const disableMutation = useMutation({
    mutationFn: async (id: string) => {
      if (mode !== "local") throw new Error("Disabling staff is not enabled in Supabase mode yet");
      const items = read();
      const current = items.find((m) => m.id === id);
      if (!current) return;
      if (current.dealerId !== dealerId) throw new Error("Not authorized");

      const idx = items.findIndex((m) => m.id === id);
      if (idx >= 0) {
        const updated = [...items];
        updated[idx] = { ...updated[idx]!, status: "DISABLED" };
        write(updated);
      }

      const users = readLocalUsersRaw();
      const uidx = users.findIndex((u) => normalizeEmail((u?.email ?? "").toString()) === normalizeEmail(current.email));
      if (uidx >= 0) {
        const nextUsers = [...users];
        nextUsers[uidx] = {
          ...nextUsers[uidx],
          isActive: false,
        };
        writeLocalUsersRaw(nextUsers);

        const userId = (nextUsers[uidx]?.id ?? "").toString();
        if (userId) {
          const memberships = readLocalDealerMemberships();
          const midx = memberships.findIndex((m) => (m?.dealerId ?? "") === dealerId && (m?.userId ?? "") === userId);
          if (midx >= 0) {
            const nextM = [...memberships];
            nextM[midx] = { ...nextM[midx], status: "DISABLED" };
            writeLocalDealerMemberships(nextM);
          } else {
            writeLocalDealerMemberships([
              { id: crypto.randomUUID(), dealerId, userId, role: current.role, status: "DISABLED", createdAt: new Date().toISOString() },
              ...memberships,
            ]);
          }
        }
      }

      logAuditEvent({
        kind: "DEALER_STAFF_DISABLED",
        actorUserId: user?.id,
        actorEmail: user?.email,
        actorRole: user?.role,
        dealerId,
        entityType: "dealer_team_member",
        entityId: id,
        message: `Disabled ${current.email}`,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["dealer-team"] });
    },
  });

  const enableMutation = useMutation({
    mutationFn: async (id: string) => {
      if (mode !== "local") throw new Error("Enabling staff is not enabled in Supabase mode yet");
      const items = read();
      const idx = items.findIndex((m) => m.id === id);
      if (idx < 0) throw new Error("Team member not found");
      const current = items[idx]!;
      if (current.dealerId !== dealerId) throw new Error("Not authorized");

      const next: DealerTeamMember = { ...current, status: "ACTIVE" };
      const updated = [...items];
      updated[idx] = next;
      write(updated);

      const users = readLocalUsersRaw();
      const uidx = users.findIndex((u) => normalizeEmail((u?.email ?? "").toString()) === normalizeEmail(current.email));
      if (uidx >= 0) {
        const nextUsers = [...users];
        nextUsers[uidx] = {
          ...nextUsers[uidx],
          isActive: true,
          role: current.role,
          dealerId,
        };
        writeLocalUsersRaw(nextUsers);

        const userId = (nextUsers[uidx]?.id ?? "").toString();
        if (userId) {
          const memberships = readLocalDealerMemberships();
          const midx = memberships.findIndex((m) => (m?.dealerId ?? "") === dealerId && (m?.userId ?? "") === userId);
          if (midx >= 0) {
            const nextM = [...memberships];
            nextM[midx] = { ...nextM[midx], role: current.role, status: "ACTIVE" };
            writeLocalDealerMemberships(nextM);
          } else {
            writeLocalDealerMemberships([
              { id: crypto.randomUUID(), dealerId, userId, role: current.role, status: "ACTIVE", createdAt: new Date().toISOString() },
              ...memberships,
            ]);
          }
        }
      }

      logAuditEvent({
        kind: "DEALER_STAFF_ENABLED",
        actorUserId: user?.id,
        actorEmail: user?.email,
        actorRole: user?.role,
        dealerId,
        entityType: "dealer_team_member",
        entityId: id,
        message: `Enabled ${current.email}`,
      });

      return next;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["dealer-team"] });
    },
  });

  const members = (listQuery.data ?? []) as DealerTeamMember[];
  const busy = disableMutation.isPending || enableMutation.isPending;

  return (
    <PageShell
      title=""
    >
      {error ? <div className="text-sm text-destructive">{error}</div> : null}

      <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
          <div className="font-semibold">Invite Employee</div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              disabled={!dealerId}
              onClick={() => {
                void (async () => {
                  if (!dealerId) return;
                  if (!(await confirmProceed(inviteCode ? "Regenerate invite code?" : "Generate invite code?"))) return;

                  const nextCode = generateInviteCode();
                  const now = new Date().toISOString();

                  if (mode === "local") {
                    const invites = readInvites();
                    const users = readLocalUsers();
                    const dealerName = (users.find((u) => u.id === dealerId)?.companyName ?? "").toString().trim() || undefined;
                    writeInvites({ ...invites, [dealerId]: { code: nextCode, dealerName, createdAt: now } });
                  } else {
                    const supabase = getSupabaseClient();
                    if (!supabase) throw new Error("Supabase is not configured");

                    const { error } = await supabase
                      .from("dealer_employee_invites")
                      .upsert(
                        {
                          dealer_id: dealerId,
                          code: nextCode,
                          created_by: user?.id ?? null,
                          updated_at: now,
                        },
                        { onConflict: "dealer_id" },
                      );

                    if (error) throw new Error(error.message);
                  }

                  logAuditEvent({
                    kind: "DEALER_INVITE_CODE_GENERATED",
                    actorUserId: user?.id,
                    actorEmail: user?.email,
                    actorRole: user?.role,
                    dealerId,
                    entityType: "dealer_invite",
                    entityId: dealerId,
                    message: inviteCode ? "Regenerated invite code" : "Generated invite code",
                  });

                  await qc.invalidateQueries({ queryKey: ["dealer-employee-invite"] });
                })();
              }}
            >
              {inviteCode ? "Regenerate" : "Generate"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!inviteLink}
              onClick={() => {
                void (async () => {
                  if (!inviteLink) return;
                  try {
                    await navigator.clipboard.writeText(inviteLink);
                  } catch {
                  }
                })();
              }}
            >
              Copy link
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
            <div className="lg:col-span-12">
              <div className="text-xs text-muted-foreground mb-1">Invite Link</div>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Input value={inviteLink || "Generate an invite code to create a link"} readOnly />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!inviteLink}
                  onClick={() => {
                    void (async () => {
                      if (!inviteLink) return;
                      try {
                        await navigator.clipboard.writeText(inviteLink);
                      } catch {
                      }
                    })();
                  }}
                >
                  Copy Link
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold">Your Team</div>
          </div>
          <div className="text-sm text-muted-foreground">{members.length} member(s)</div>
        </div>

        <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 border-b text-xs text-muted-foreground">
          <div className="col-span-5">Member</div>
          <div className="col-span-3">Role</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2 text-right">Action</div>
        </div>

        <div className="divide-y">
          {members.map((m) => (
            <div key={m.id} className="px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <div className="md:col-span-5 text-sm text-foreground">{m.email}</div>
                <div className="md:col-span-3">
                  <div className="h-9 w-full rounded-md border border-input bg-white/80 px-2 text-sm shadow-sm flex items-center">
                    {roleLabel(m.role)}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div
                    className={
                      "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold " +
                      statusBadgeClass(m.status)
                    }
                  >
                    {statusLabel(m.status)}
                  </div>
                </div>
                <div className="md:col-span-2 md:text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void (async () => {
                        setError(null);
                        if (m.status === "DISABLED") {
                          if (!(await confirmProceed(`Enable ${m.email}?`))) return;
                          enableMutation.mutate(m.id);
                          return;
                        }
                        if (!(await confirmProceed(`Disable ${m.email}?`))) return;
                        disableMutation.mutate(m.id);
                      })();
                    }}
                    disabled={busy}
                  >
                    {m.status === "DISABLED" ? "Enable" : "Disable"}
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {listQuery.isLoading ? <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div> : null}
          {listQuery.isError ? <div className="px-6 py-6 text-sm text-destructive">Failed to load team.</div> : null}
          {!listQuery.isLoading && !listQuery.isError && members.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">No staff yet. Invite your first team member.</div>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
