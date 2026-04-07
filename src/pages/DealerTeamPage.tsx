import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, UserPlus, Shield, UserCheck, UserX, Mail, Phone, Lock, User, Plus, Pencil, Loader2 } from "lucide-react";

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
  if (r === "DEALER_ADMIN") return "Admin";
  return "Employee";
}

function roleBadgeClass(r: DealerTeamRole) {
  if (r === "DEALER_ADMIN") return "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20";
  return "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20";
}

function statusBadgeClass(s: DealerTeamStatus) {
  if (s === "ACTIVE") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20";
  if (s === "DISABLED") return "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20";
  return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20";
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

  const [editingDealerMemberId, setEditingDealerMemberId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
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

      if (mode !== "local" && dealerIdQuery.isLoading) throw new Error("Loading dealership...");

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
      setShowAddForm(false);
      
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
      if (mode !== "local" && dealerIdQuery.isLoading) throw new Error("Loading dealership...");

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
      setShowAddForm(false);
      
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

  const isEditing = editingDealerMemberId !== null;
  const activeCount = members.filter((m) => m.status === "ACTIVE").length;
  const adminCount = members.filter((m) => m.role === "DEALER_ADMIN").length;

  const handleCancel = () => {
    setEditingDealerMemberId(null);
    setShowAddForm(false);
    setDraft({ firstName: "", lastName: "", phone: "", email: "", password: "", password2: "", role: "DEALER_EMPLOYEE" });
    setError(null);
    
  };

  const handleEdit = (m: DealerTeamMember) => {
    setEditingDealerMemberId(m.id);
    setShowAddForm(true);
    setDraft({
      firstName: m.firstName ?? "",
      lastName: m.lastName ?? "",
      phone: m.phone ?? "",
      email: m.email,
      password: "",
      password2: "",
      role: m.role,
    });
    setError(null);
    
  };

  const handleSubmit = () => {
    void (async () => {
      setError(null);
      if (editingDealerMemberId) {
        updateEmployeeMutation.mutate(editingDealerMemberId);
        return;
      }
      createEmployeeMutation.mutate();
    })();
  };

  return (
    <PageShell
      title="Team Management"
      subtitle="Manage your dealership employees and their access"
      badge="DEALER ADMIN"
    >
      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/50">
              <UserX className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-red-800 dark:text-red-200">{error}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {!error && mode !== "local" && supabaseSessionQuery.isLoading && (
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Checking session...</span>
        </div>
      )}
      {!error && mode !== "local" && supabaseSessionQuery.isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200">
          Failed to check session.
        </div>
      )}
      {!error && mode !== "local" && dealerIdQuery.isLoading && (
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading dealership...</span>
        </div>
      )}
      {!error && mode !== "local" && dealerIdQuery.isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200">
          Failed to load dealership{dealerIdQuery.error instanceof Error && dealerIdQuery.error.message ? `: ${dealerIdQuery.error.message}` : "."}
        </div>
      )}

      <div className="space-y-6">
        <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b bg-gradient-to-r from-violet-500/5 via-transparent to-transparent">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-violet-500/10 text-violet-600">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">Team Members</div>
                  <div className="text-sm text-muted-foreground">Manage employee accounts and permissions</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-700">
                  <UserCheck className="w-4 h-4" />
                  <span className="text-sm font-medium">{activeCount}</span>
                  <span className="text-xs text-muted-foreground ml-1">Active</span>
                </div>
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-violet-500/10 text-violet-700">
                  <Shield className="w-4 h-4" />
                  <span className="text-sm font-medium">{adminCount}</span>
                  <span className="text-xs text-muted-foreground ml-1">Admins</span>
                </div>
                {!showAddForm && (
                  <Button size="sm" onClick={() => setShowAddForm(true)} className="gap-2">
                    <UserPlus className="w-4 h-4" />
                    Add Member
                  </Button>
                )}
              </div>
            </div>
          </div>

          {showAddForm && (
            <div className="p-6 border-b bg-gradient-to-br from-violet-500/5 via-transparent to-transparent">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-violet-500/10 text-violet-600">
                  {isEditing ? <Pencil className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                </div>
                <div>
                  <div className="font-semibold">{isEditing ? "Edit Team Member" : "Add New Team Member"}</div>
                  <div className="text-xs text-muted-foreground">{isEditing ? "Update member details below" : "Fill in the details to add a new team member"}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    First Name
                  </div>
                  <Input
                    value={draft.firstName}
                    onChange={(e) => setDraft((p) => ({ ...p, firstName: e.target.value }))}
                    placeholder="John"
                    className="bg-background/70"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    Last Name
                  </div>
                  <Input
                    value={draft.lastName}
                    onChange={(e) => setDraft((p) => ({ ...p, lastName: e.target.value }))}
                    placeholder="Doe"
                    className="bg-background/70"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" />
                    Phone
                  </div>
                  <Input
                    value={draft.phone}
                    onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="(555) 123-4567"
                    className="bg-background/70"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    Role
                  </div>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background/70 px-3 text-sm shadow-sm"
                    value={draft.role}
                    onChange={(e) => setDraft((p) => ({ ...p, role: (e.target.value as DealerTeamRole) || "DEALER_EMPLOYEE" }))}
                  >
                    <option value="DEALER_EMPLOYEE">Employee</option>
                    <option value="DEALER_ADMIN">Admin</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    Email
                  </div>
                  <Input
                    type="email"
                    value={draft.email}
                    onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
                    placeholder="john.doe@company.com"
                    className="bg-background/70"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    Password
                  </div>
                  <Input
                    type="password"
                    value={draft.password}
                    onChange={(e) => setDraft((p) => ({ ...p, password: e.target.value }))}
                    placeholder="Enter password"
                    className="bg-background/70"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    Confirm
                  </div>
                  <Input
                    type="password"
                    value={draft.password2}
                    onChange={(e) => setDraft((p) => ({ ...p, password2: e.target.value }))}
                    placeholder="Confirm password"
                    className="bg-background/70"
                  />
                </div>
              </div>

              {draft.password && (
                <div className="mt-3 p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground font-medium mb-2">Password Requirements:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {[
                      { label: "8+ characters", valid: draft.password.length >= 8 },
                      { label: "Uppercase letter", valid: /[A-Z]/.test(draft.password) },
                      { label: "Lowercase letter", valid: /[a-z]/.test(draft.password) },
                      { label: "Number", valid: /[0-9]/.test(draft.password) },
                      { label: "Special character", valid: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(draft.password) },
                      { label: "Passwords match", valid: draft.password === draft.password2 && draft.password2 !== "" },
                    ].map((req) => (
                      <div key={req.label} className={`flex items-center gap-2 text-xs ${req.valid ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                        {req.valid ? (
                          <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                          </div>
                        )}
                        {req.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 mt-4">
                <Button variant="outline" onClick={handleCancel} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={
                    busy ||
                    (mode !== "local" && (supabaseSessionQuery.isLoading || !supabaseSessionQuery.data?.user?.id)) ||
                    (mode !== "local" && (dealerIdQuery.isLoading || !dealerId))
                  }
                  className="gap-2"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isEditing ? "Save Changes" : "Add Member"}
                </Button>
              </div>
            </div>
          )}

          <div className="divide-y">
            {listQuery.isLoading && (
              <div className="p-6">
                <div className="animate-pulse space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-muted rounded-xl" />
                  ))}
                </div>
              </div>
            )}

            {listQuery.isError && (
              <div className="p-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/50 mb-3">
                  <UserX className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="text-sm font-medium text-destructive">Failed to load team</div>
              </div>
            )}

            {!listQuery.isLoading && !listQuery.isError && members.length === 0 && (
              <div className="p-12 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/50 mb-4">
                  <Users className="w-8 h-8 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="text-lg font-semibold text-foreground">No team members yet</div>
                <div className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                  Add your first team member to get started. Employees can be given different permission levels based on their role.
                </div>
                {!showAddForm && (
                  <Button className="mt-4 gap-2" onClick={() => setShowAddForm(true)}>
                    <Plus className="w-4 h-4" />
                    Add First Member
                  </Button>
                )}
              </div>
            )}

            {!listQuery.isLoading && !listQuery.isError && members.map((m) => (
              <div key={m.id} className="px-6 py-5 hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-muted/50 to-transparent">
                      {m.role === "DEALER_ADMIN" ? (
                        <Shield className="w-5 h-5 text-violet-600" />
                      ) : (
                        <UserCheck className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-medium text-sm">{m.email}</span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${roleBadgeClass(m.role)}`}>
                          {roleLabel(m.role)}
                        </span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${statusBadgeClass(m.status)}`}>
                          {statusLabel(m.status)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
                        {(m.firstName || m.lastName) && (
                          <span>
                            {[m.firstName, m.lastName].filter(Boolean).join(" ")}
                          </span>
                        )}
                        {m.phone && <span>{m.phone}</span>}
                        <span>Added {new Date(m.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(m)}
                      disabled={busy}
                      className="gap-1.5"
                    >
                      <Pencil className="w-4 h-4" />
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
                          if (!(await confirmProceed(`Disable ${m.email}? This will prevent them from logging in.`))) return;
                          disableMutation.mutate(m.id);
                        })();
                      }}
                      disabled={busy}
                      className={`gap-1.5 ${m.status === "DISABLED" ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" : "text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"}`}
                    >
                      {m.status === "DISABLED" ? (
                        <>
                          <UserCheck className="w-4 h-4" />
                          Enable
                        </>
                      ) : (
                        <>
                          <UserX className="w-4 h-4" />
                          Disable
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="px-6 py-3 border-t bg-muted/30">
            <div className="text-xs text-muted-foreground">
              Showing {members.length} team member{members.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
