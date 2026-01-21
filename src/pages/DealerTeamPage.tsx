import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { alertMissing, confirmProceed } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";

type DealerTeamRole = "DEALER_ADMIN" | "SALES" | "ACCOUNTING" | "READ_ONLY";
type DealerTeamStatus = "INVITED" | "ACTIVE";

type DealerTeamMember = {
  id: string;
  dealerId: string;
  email: string;
  role: DealerTeamRole;
  status: DealerTeamStatus;
  createdAt: string;
};

const STORAGE_KEY = "warrantyhub.local.dealer_team_members";

function read(): DealerTeamMember[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<DealerTeamMember>[];
    return parsed
      .map((m): DealerTeamMember => {
        const createdAt = m.createdAt ?? new Date().toISOString();
        return {
          id: m.id ?? crypto.randomUUID(),
          dealerId: m.dealerId ?? "",
          email: m.email ?? "",
          role: (m.role ?? "SALES") as DealerTeamRole,
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
  if (r === "ACCOUNTING") return "Accounting";
  if (r === "READ_ONLY") return "Read-only";
  return "Sales";
}

function statusBadgeClass(s: DealerTeamStatus) {
  if (s === "ACTIVE") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-amber-50 text-amber-800 border-amber-200";
}

function statusLabel(s: DealerTeamStatus) {
  if (s === "ACTIVE") return "Active";
  return "Invited";
}

export function DealerTeamPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const dealerId = user?.id ?? "";

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DealerTeamRole>("SALES");
  const [error, setError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["dealer-team"],
    queryFn: async () => {
      if (!dealerId) return [];
      return read()
        .filter((m) => m.dealerId === dealerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const em = normalizeEmail(email);
      if (!em) throw new Error("Email is required");
      if (!dealerId) throw new Error("Not authenticated");

      const items = read();
      const exists = items.find((m) => m.dealerId === dealerId && normalizeEmail(m.email) === em);
      if (exists) throw new Error("That email is already in your team list");

      const now = new Date().toISOString();
      const item: DealerTeamMember = {
        id: crypto.randomUUID(),
        dealerId,
        email: em,
        role,
        status: "INVITED",
        createdAt: now,
      };

      write([item, ...items]);
      return item;
    },
    onSuccess: async () => {
      setEmail("");
      setRole("SALES");
      await qc.invalidateQueries({ queryKey: ["dealer-team"] });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (input: { id: string; role: DealerTeamRole }) => {
      const items = read();
      const idx = items.findIndex((m) => m.id === input.id);
      if (idx < 0) throw new Error("Team member not found");
      const current = items[idx]!;
      if (current.dealerId !== dealerId) throw new Error("Not authorized");
      const next: DealerTeamMember = { ...current, role: input.role };
      const updated = [...items];
      updated[idx] = next;
      write(updated);
      return next;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["dealer-team"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const items = read();
      const current = items.find((m) => m.id === id);
      if (!current) return;
      if (current.dealerId !== dealerId) throw new Error("Not authorized");
      write(items.filter((m) => m.id !== id));
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["dealer-team"] });
    },
  });

  const members = (listQuery.data ?? []) as DealerTeamMember[];
  const busy = inviteMutation.isPending || updateRoleMutation.isPending || removeMutation.isPending;

  return (
    <PageShell
      badge="Dealer Portal"
      title="Team"
      subtitle="Manage dealer staff access."
      actions={
        <Button variant="outline" asChild>
          <Link to="/dealer-admin">Back to dashboard</Link>
        </Button>
      }
    >
      {error ? <div className="text-sm text-destructive">{error}</div> : null}

      <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold">Invite Staff</div>
            <div className="text-sm text-muted-foreground mt-1">Invite by email and assign a role.</div>
          </div>
          <Button
            onClick={() => {
              void (async () => {
                setError(null);
                const em = email.trim();
                if (!em) return alertMissing("Email is required.");
                if (!(await confirmProceed(`Invite ${em}?`))) return;
                inviteMutation.mutate();
              })();
            }}
            disabled={busy}
          >
            Invite
          </Button>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 space-y-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Email</div>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@dealer.com" disabled={busy} />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Role</div>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as DealerTeamRole)}
                className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                disabled={busy}
              >
                <option value="DEALER_ADMIN">Dealer Admin</option>
                <option value="SALES">Sales</option>
                <option value="ACCOUNTING">Accounting</option>
                <option value="READ_ONLY">Read-only</option>
              </select>
            </div>
          </div>

          <div className="lg:col-span-6 rounded-xl border p-4">
            <div className="font-semibold">Role Definitions</div>
            <div className="text-sm text-muted-foreground mt-2">Use roles to safely control access inside the Dealer Portal.</div>
            <div className="mt-3 text-sm text-muted-foreground">
              Dealer Admin: full dealer access (team, contracts, remittances).
              <br />
              Sales: create contracts.
              <br />
              Accounting: create remittances.
              <br />
              Read-only: view contracts and remittances.
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold">Your Team</div>
            <div className="text-sm text-muted-foreground mt-1">Staff members associated with your dealer account.</div>
          </div>
          <div className="text-sm text-muted-foreground">{members.length} member(s)</div>
        </div>

        <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 border-b text-xs text-muted-foreground">
          <div className="col-span-5">Email</div>
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
                  <select
                    value={m.role}
                    onChange={(e) => {
                      void (async () => {
                        setError(null);
                        const nextRole = e.target.value as DealerTeamRole;
                        if (!(await confirmProceed(`Change role for ${m.email} to ${roleLabel(nextRole)}?`))) return;
                        updateRoleMutation.mutate({ id: m.id, role: nextRole });
                      })();
                    }}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
                    disabled={busy}
                  >
                    <option value="DEALER_ADMIN">{roleLabel("DEALER_ADMIN")}</option>
                    <option value="SALES">{roleLabel("SALES")}</option>
                    <option value="ACCOUNTING">{roleLabel("ACCOUNTING")}</option>
                    <option value="READ_ONLY">{roleLabel("READ_ONLY")}</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <span className={"inline-flex items-center text-xs px-2 py-1 rounded-md border " + statusBadgeClass(m.status)}>
                    {statusLabel(m.status)}
                  </span>
                </div>
                <div className="md:col-span-2 flex md:justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void (async () => {
                        setError(null);
                        if (!(await confirmProceed(`Remove ${m.email} from your team?`))) return;
                        removeMutation.mutate(m.id);
                      })();
                    }}
                    disabled={busy}
                  >
                    Remove
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
