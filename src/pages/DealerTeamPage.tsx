import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { logAuditEvent } from "../lib/auditLog";
import { getAppMode } from "../lib/runtime";
import { getSupabaseClient } from "../lib/supabase/client";
import { invokeEdgeFunction } from "../lib/supabase/functions";
import { confirmProceed } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";

type DealerTeamRole = "DEALER_ADMIN" | "DEALER_EMPLOYEE";
type DealerTeamStatus = "INVITED" | "ACTIVE" | "DISABLED";

type DealerTeamMember = {
  id: string;
  dealerId: string;
  userId?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: DealerTeamRole;
  status: DealerTeamStatus;
  createdAt: string;
};

const STORAGE_KEY = "warrantyhub.local.dealer_team_members";
const LOCAL_USERS_KEY = "warrantyhub.local.users";
const LOCAL_DEALER_MEMBERSHIPS_KEY = "warrantyhub.local.dealer_memberships";

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


type DealerTeamEmployeeDraft = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  password: string;
  password2: string;
  role: DealerTeamRole;
};

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

function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < 8) errors.push("At least 8 characters");
  if (!/[A-Z]/.test(password)) errors.push("At least 1 uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("At least 1 lowercase letter");
  if (!/[0-9]/.test(password)) errors.push("At least 1 number");
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) errors.push("At least 1 special character");
  return { valid: errors.length === 0, errors };
}

export function DealerTeamPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const mode = useMemo(() => getAppMode(), []);

  if (!user) return <Navigate to="/sign-in" replace />;
  if (user.role !== "DEALER_ADMIN") return <Navigate to="/dealer-dashboard" replace />;

  const localDealerId = (user.dealerId ?? user.id).trim();

  const supabaseSessionQuery = useQuery({
    queryKey: ["dealer-team-supabase-session", mode],
    enabled: mode !== "local",
    queryFn: async () => {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");
      const res = await supabase.auth.getSession();
      return res.data.session ?? null;
    },
  });

  if (mode !== "local" && supabaseSessionQuery.isSuccess && !supabaseSessionQuery.data) {
    return <Navigate to="/sign-in" replace />;
  }

  const dealerIdQuery = useQuery({
    queryKey: ["dealer-team-dealer-id", mode, user.id],
    enabled: mode !== "local" && supabaseSessionQuery.isSuccess && Boolean(supabaseSessionQuery.data?.user?.id),
    queryFn: async () => {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const sessionRes = await supabase.auth.getSession();
      const authedUserId = (sessionRes.data.session?.user?.id ?? "").toString().trim();
      if (!authedUserId) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("dealer_members")
        .select("dealer_id, role, status")
        .eq("user_id", authedUserId)
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return "";

      return ((data as any)?.dealer_id ?? "").toString().trim();
    },
  });

  const dealerId = (mode === "local" ? localDealerId : (dealerIdQuery.data ?? "")).trim();

  const [error, setError] = useState<string | null>(null);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);

  const [editingDealerMemberId, setEditingDealerMemberId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DealerTeamEmployeeDraft>({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    password: "",
    password2: "",
    role: "DEALER_EMPLOYEE",
  });

  const listQuery = useQuery({
    queryKey: ["dealer-team", mode, dealerId],
    enabled: Boolean(dealerId) && (mode === "local" || dealerIdQuery.isSuccess),
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
        .select("id, dealer_id, user_id, role, status, created_at, profiles:profiles(email, first_name, last_name, phone)")
        .eq("dealer_id", dealerId)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      return ((data ?? []) as any[]).map(
        (r): DealerTeamMember => ({
          id: (r?.id ?? "").toString(),
          dealerId: (r?.dealer_id ?? "").toString(),
          userId: (r?.user_id ?? "").toString() || undefined,
          email: ((r?.profiles?.email ?? "") as string).toString(),
          firstName: ((r?.profiles?.first_name ?? "") as string).toString() || undefined,
          lastName: ((r?.profiles?.last_name ?? "") as string).toString() || undefined,
          phone: ((r?.profiles?.phone ?? "") as string).toString() || undefined,
          role: (r?.role === "DEALER_ADMIN" ? "DEALER_ADMIN" : "DEALER_EMPLOYEE") as DealerTeamRole,
          status:
            r?.status === "ACTIVE" ? "ACTIVE" : r?.status === "DISABLED" ? "DISABLED" : ("INVITED" as DealerTeamStatus),
          createdAt: (r?.created_at ?? new Date().toISOString()).toString(),
        }),
      );
    },
  });

  const createEmployeeMutation = useMutation({
    mutationFn: async () => {
      if (mode !== "local" && (!supabaseSessionQuery.data || !supabaseSessionQuery.data.user?.id)) {
        throw new Error("Not authenticated");
      }
      if (!dealerId) throw new Error("Missing dealerId");

      if (mode !== "local" && dealerIdQuery.isLoading) throw new Error("Loading dealership…");

      const firstName = draft.firstName.trim();
      const lastName = draft.lastName.trim();
      const phone = draft.phone.trim();
      const email = normalizeEmail(draft.email);
      const password = draft.password;

      if (!firstName) throw new Error("First Name is required");
      if (!lastName) throw new Error("Last Name is required");
      if (!email) throw new Error("Email is required");
      if (!password) throw new Error("Password is required");
      const pwValidation = validatePassword(password);
      if (!pwValidation.valid) throw new Error(`Password requirements not met: ${pwValidation.errors.join(", ")}`);
      if (password !== draft.password2) throw new Error("Passwords do not match");

      if (mode === "local") {
        const items = read();
        const next: DealerTeamMember = {
          id: crypto.randomUUID(),
          dealerId,
          email,
          role: draft.role,
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
        };
        write([next, ...items]);

        const users = readLocalUsersRaw();
        writeLocalUsersRaw([
          {
            id: crypto.randomUUID(),
            email,
            password,
            role: draft.role,
            dealerId,
            companyName: "",
            isActive: true,
          },
          ...users,
        ]);

        logAuditEvent({
          kind: "DEALER_STAFF_ADDED",
          actorUserId: user?.id,
          actorEmail: user?.email,
          actorRole: user?.role,
          dealerId,
          entityType: "dealer_team_member",
          entityId: next.id,
          message: `Added ${email}`,
        });

        return;
      }

      await invokeEdgeFunction<{ dealerMemberId: string | null; userId: string }>("dealer-team-tools", {
        action: "create_employee",
        employee: {
          firstName,
          lastName,
          phone: phone || undefined,
          email,
          password,
          role: draft.role,
        },
      });

      logAuditEvent({
        kind: "DEALER_STAFF_ADDED",
        actorUserId: user?.id,
        actorEmail: user?.email,
        actorRole: user?.role,
        dealerId,
        entityType: "dealer_team_member",
        entityId: "",
        message: `Added ${email}`,
      });
    },
    onSuccess: async () => {
      setEditingDealerMemberId(null);
      setPasswordErrors([]);
      setDraft({ firstName: "", lastName: "", phone: "", email: "", password: "", password2: "", role: "DEALER_EMPLOYEE" });
      await qc.invalidateQueries({ queryKey: ["dealer-team"] });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    },
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: async (dealerMemberId: string) => {
      if (!dealerMemberId) throw new Error("Missing dealer member id");

      if (mode !== "local" && (!supabaseSessionQuery.data || !supabaseSessionQuery.data.user?.id)) {
        throw new Error("Not authenticated");
      }

      if (!dealerId) throw new Error("Missing dealerId");
      if (mode !== "local" && dealerIdQuery.isLoading) throw new Error("Loading dealership…");

      const firstName = draft.firstName.trim();
      const lastName = draft.lastName.trim();
      const phone = draft.phone.trim();
      const email = normalizeEmail(draft.email);
      const password = draft.password;

      if (!firstName) throw new Error("First Name is required");
      if (!lastName) throw new Error("Last Name is required");
      if (!email) throw new Error("Email is required");
      if (!password) throw new Error("Password is required");
      const pwValidation = validatePassword(password);
      if (!pwValidation.valid) throw new Error(`Password requirements not met: ${pwValidation.errors.join(", ")}`);
      if (password !== draft.password2) throw new Error("Passwords do not match");

      if (mode === "local") {
        const items = read();
        const idx = items.findIndex((m) => m.id === dealerMemberId);
        if (idx < 0) throw new Error("Team member not found");
        if (items[idx]!.dealerId !== dealerId) throw new Error("Not authorized");
        const updated = [...items];
        updated[idx] = { ...updated[idx]!, email, role: draft.role };
        write(updated);
        return;
      }

      await invokeEdgeFunction<{ ok: true }>("dealer-team-tools", {
        action: "update_employee",
        dealerMemberId,
        employee: {
          firstName,
          lastName,
          phone: phone || undefined,
          email,
          password,
          role: draft.role,
        },
      });
    },
    onSuccess: async () => {
      setEditingDealerMemberId(null);
      setPasswordErrors([]);
      setDraft({ firstName: "", lastName: "", phone: "", email: "", password: "", password2: "", role: "DEALER_EMPLOYEE" });
      await qc.invalidateQueries({ queryKey: ["dealer-team"] });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    },
  });

  const disableMutation = useMutation({
    mutationFn: async (id: string) => {
      if (mode !== "local") {
        await invokeEdgeFunction<{ ok: true }>("dealer-team-tools", { action: "set_employee_status", dealerMemberId: id, status: "DISABLED" });
        return;
      }
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
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    },
  });

  const enableMutation = useMutation({
    mutationFn: async (id: string) => {
      if (mode !== "local") {
        await invokeEdgeFunction<{ ok: true }>("dealer-team-tools", { action: "set_employee_status", dealerMemberId: id, status: "ACTIVE" });
        return;
      }
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
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    },
  });

  const members = (listQuery.data ?? []) as DealerTeamMember[];
  const busy =
    disableMutation.isPending ||
    enableMutation.isPending ||
    createEmployeeMutation.isPending ||
    updateEmployeeMutation.isPending;

  return (
    <PageShell
      title=""
    >
      {error ? <div className="text-sm text-destructive">{error}</div> : null}
      {!error && mode !== "local" && supabaseSessionQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">Checking session…</div>
      ) : null}
      {!error && mode !== "local" && supabaseSessionQuery.isError ? (
        <div className="text-sm text-destructive">Failed to check session.</div>
      ) : null}
      {!error && mode !== "local" && dealerIdQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading dealership…</div>
      ) : null}
      {!error && mode !== "local" && dealerIdQuery.isError ? (
        <div className="text-sm text-destructive">
          Failed to load dealership{dealerIdQuery.error instanceof Error && dealerIdQuery.error.message ? `: ${dealerIdQuery.error.message}` : "."}
        </div>
      ) : null}

      <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
          <div className="font-semibold">{editingDealerMemberId ? "Edit Employee" : "Add Employee"}</div>
          <div className="flex items-center gap-2 flex-wrap">
            {editingDealerMemberId ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setEditingDealerMemberId(null);
                  setDraft({ firstName: "", lastName: "", phone: "", email: "", password: "", password2: "", role: "DEALER_EMPLOYEE" });
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-3">
              <div className="text-xs text-muted-foreground mb-1">First Name</div>
              <Input value={draft.firstName} onChange={(e) => setDraft((p) => ({ ...p, firstName: e.target.value }))} />
            </div>
            <div className="md:col-span-3">
              <div className="text-xs text-muted-foreground mb-1">Last Name</div>
              <Input value={draft.lastName} onChange={(e) => setDraft((p) => ({ ...p, lastName: e.target.value }))} />
            </div>
            <div className="md:col-span-3">
              <div className="text-xs text-muted-foreground mb-1">Phone Number</div>
              <Input value={draft.phone} onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="md:col-span-3">
              <div className="text-xs text-muted-foreground mb-1">Role</div>
              <select
                className="h-10 w-full rounded-md border border-input bg-white/80 px-3 text-sm shadow-sm"
                value={draft.role}
                onChange={(e) => setDraft((p) => ({ ...p, role: (e.target.value as DealerTeamRole) || "DEALER_EMPLOYEE" }))}
              >
                <option value="DEALER_EMPLOYEE">Dealer Employee</option>
                <option value="DEALER_ADMIN">Dealer Admin</option>
              </select>
            </div>

            <div className="md:col-span-6">
              <div className="text-xs text-muted-foreground mb-1">Email</div>
              <Input value={draft.email} onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="md:col-span-3">
              <div className="text-xs text-muted-foreground mb-1">Password</div>
              <Input type="password" value={draft.password} onChange={(e) => {
                const val = e.target.value;
                setDraft((p) => ({ ...p, password: val }));
                setPasswordErrors(val ? validatePassword(val).errors : []);
              }} />
              {draft.password && (
                <div className="mt-1 space-y-0.5">
                  {passwordErrors.length === 0 ? (
                    <div className="text-xs text-emerald-600">Password meets all requirements</div>
                  ) : (
                    passwordErrors.map((err) => (
                      <div key={err} className="text-xs text-muted-foreground">✗ {err}</div>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="md:col-span-3">
              <div className="text-xs text-muted-foreground mb-1">Re-Type Password</div>
              <Input type="password" value={draft.password2} onChange={(e) => setDraft((p) => ({ ...p, password2: e.target.value }))} />
            </div>

            <div className="md:col-span-12 flex justify-end gap-2">
              <Button
                disabled={
                  busy ||
                  (mode !== "local" && (supabaseSessionQuery.isLoading || !supabaseSessionQuery.data?.user?.id)) ||
                  (mode !== "local" && (dealerIdQuery.isLoading || !dealerId))
                }
                onClick={() => {
                  void (async () => {
                    setError(null);
                    if (editingDealerMemberId) {
                      updateEmployeeMutation.mutate(editingDealerMemberId);
                      return;
                    }
                    createEmployeeMutation.mutate();
                  })();
                }}
              >
                {editingDealerMemberId ? "Save Changes" : "Add Employee"}
              </Button>
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
                <div className="md:col-span-5">
                  <div className="text-sm text-foreground">{m.email}</div>
                  {m.firstName || m.lastName || m.phone ? (
                    <div className="text-xs text-muted-foreground">
                      {[`${m.firstName ?? ""} ${m.lastName ?? ""}`.trim(), (m.phone ?? "").trim()].filter(Boolean).join(" • ")}
                    </div>
                  ) : null}
                </div>
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
                <div className="md:col-span-2 md:text-right flex md:justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setEditingDealerMemberId(m.id);
                      setDraft({
                        firstName: m.firstName ?? "",
                        lastName: m.lastName ?? "",
                        phone: m.phone ?? "",
                        email: m.email,
                        password: "",
                        password2: "",
                        role: m.role,
                      });
                    }}
                  >
                    Edit
                  </Button>
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
            <div className="px-6 py-10 text-sm text-muted-foreground">No staff yet. Add your first employee above.</div>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
