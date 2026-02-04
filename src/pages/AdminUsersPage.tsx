import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageShell } from "../components/PageShell";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { getAppMode } from "../lib/runtime";
import { getSupabaseClient } from "../lib/supabase/client";
import { alertMissing, confirmProceed, sanitizeWordsOnly } from "../lib/utils";
import type { Role } from "../lib/auth/types";
import { useAuth } from "../providers/AuthProvider";

type AdminProfile = {
  id: string;
  email?: string;
  role: Role;
  displayName?: string;
  companyName?: string;
  createdAt?: string;
};

const LOCAL_USERS_KEY = "warrantyhub.local.users";

type LocalUserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role | "DEALER";
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

function writeLocalUsers(users: LocalUserRecord[]) {
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

function roleLabel(r: Role) {
  if (r === "ADMIN") return "Admin";
  if (r === "PROVIDER") return "Provider";
  if (r === "DEALER_ADMIN") return "Dealer Admin";
  if (r === "DEALER_EMPLOYEE") return "Dealer Employee";
  return "Unassigned";
}

export function AdminUsersPage() {
  const mode = useMemo(() => getAppMode(), []);
  const qc = useQueryClient();
  const { user } = useAuth();

  const [search, setSearch] = useState("");

  const profilesQuery = useQuery({
    queryKey: ["admin-profiles", mode],
    queryFn: async (): Promise<AdminProfile[]> => {
      if (mode === "supabase") {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Supabase is not configured");

        const { data, error } = await supabase
          .from("profiles")
          .select("id, email, role, display_name, company_name, created_at")
          .order("created_at", { ascending: false });

        if (error) throw error;
        return (data as any[]).map((r) => ({
          id: r.id,
          email: r.email ?? undefined,
          role: ((r.role ?? "UNASSIGNED") === "DEALER" ? "DEALER_ADMIN" : r.role) as Role,
          displayName: r.display_name ?? undefined,
          companyName: r.company_name ?? undefined,
          createdAt: r.created_at ?? undefined,
        }));
      }

      return readLocalUsers()
        .map((u) => ({
          id: u.id,
          email: u.email,
          role: (u.role === "DEALER" ? "DEALER_ADMIN" : u.role) as Role,
        }))
        .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (input: { id: string; nextRole: Role }) => {
      if (input.nextRole === "SUPER_ADMIN") throw new Error("Super Admin cannot be assigned");
      if (input.nextRole === "ADMIN" && user?.role !== "SUPER_ADMIN") {
        throw new Error("Only Super Admin can assign Admin role");
      }
      if (input.nextRole === "DEALER_ADMIN" && user?.role !== "ADMIN") {
        throw new Error("Only Admin can assign Dealer Admin role");
      }

      if (mode === "supabase") {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Supabase is not configured");

        const { error } = await supabase.from("profiles").update({ role: input.nextRole }).eq("id", input.id);
        if (error) throw error;
        return;
      }

      const users = readLocalUsers();
      const idx = users.findIndex((u) => u.id === input.id);
      if (idx < 0) throw new Error("User not found");
      const next = [...users];
      next[idx] = { ...next[idx], role: input.nextRole };
      writeLocalUsers(next);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-profiles", mode] });
    },
  });

  const filtered = (profilesQuery.data ?? []).filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (p.email ?? "").toLowerCase().includes(q) ||
      (p.companyName ?? "").toLowerCase().includes(q) ||
      (p.displayName ?? "").toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    );
  });

  const busy = updateRoleMutation.isPending;

  return (
    <PageShell
      title="System Admin"
      subtitle="Manage dealer/provider/admin role assignments."
      badge="Users"
      actions={
        <Button
          variant="outline"
          onClick={() => {
            if (mode !== "supabase") return alertMissing("Local mode has no access_requests admin table.");
            void (async () => {
              if (!(await confirmProceed("Open Access Requests page?"))) return;
              window.location.href = "/admin-access-requests";
            })();
          }}
        >
          Access Requests
        </Button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input value={search} onChange={(e) => setSearch(sanitizeWordsOnly(e.target.value))} placeholder="Search email/company/id…" />
        <div className="text-sm text-muted-foreground flex items-center justify-end">{filtered.length} users</div>
      </div>

      <div className="mt-6 rounded-xl border bg-card shadow-card overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 border-b text-xs text-muted-foreground">
          <div className="col-span-4">Email</div>
          <div className="col-span-3">Company / Display</div>
          <div className="col-span-3">User ID</div>
          <div className="col-span-2 text-right">Role</div>
        </div>

        <div className="divide-y">
          {filtered.map((p) => (
            <div key={p.id} className="px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <div className="md:col-span-4">
                  <div className="text-sm font-medium break-all">{p.email ?? "(email unknown)"}</div>
                  <div className="text-xs text-muted-foreground mt-1">Created {p.createdAt ? new Date(p.createdAt).toLocaleString() : "—"}</div>
                </div>
                <div className="md:col-span-3 text-sm text-muted-foreground">
                  {(p.companyName ?? "").trim() || (p.displayName ?? "").trim() || "—"}
                </div>
                <div className="md:col-span-3 text-xs text-muted-foreground break-all">{p.id}</div>
                <div className="md:col-span-2 flex md:justify-end">
                  <select
                    value={p.role}
                    disabled={busy}
                    onChange={(e) => {
                      const nextRole = e.target.value as Role;
                      void (async () => {
                        if (!nextRole) return;
                        if (!(await confirmProceed(`Change role for ${p.email ?? p.id} to ${roleLabel(nextRole)}?`))) return;
                        updateRoleMutation.mutate({ id: p.id, nextRole });
                      })();
                    }}
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  >
                    <option value="DEALER_ADMIN">Dealer</option>
                    <option value="PROVIDER">Provider</option>
                    {user?.role === "SUPER_ADMIN" ? <option value="ADMIN">Admin</option> : null}
                  </select>
                </div>
              </div>
            </div>
          ))}

          {profilesQuery.isLoading ? <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div> : null}
          {profilesQuery.isError ? (
            <div className="px-6 py-6 text-sm text-destructive">Failed to load users.</div>
          ) : null}
          {!profilesQuery.isLoading && !profilesQuery.isError && filtered.length === 0 ? (
            <div className="px-6 py-6 text-sm text-muted-foreground">No users found.</div>
          ) : null}
        </div>
      </div>

      {mode === "supabase" ? (
        <div className="mt-4 text-xs text-muted-foreground">
          Note: emails are displayed from `profiles.email`. If older users don’t have it populated, it may show “(email unknown)”.
        </div>
      ) : null}

      {updateRoleMutation.isError ? (
        <div className="mt-4 text-sm text-destructive">
          {updateRoleMutation.error instanceof Error ? updateRoleMutation.error.message : "Failed to update role."}
        </div>
      ) : null}

    </PageShell>
  );
}
