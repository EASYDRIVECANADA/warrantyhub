import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { getProviderTeamApi } from "../lib/team/team";
import type { ProviderTeamMember, TeamMemberRole, TeamMemberStatus } from "../lib/team/types";
import { alertMissing, confirmProceed } from "../lib/utils";

function roleLabel(r: TeamMemberRole) {
  if (r === "ADMIN") return "Admin";
  if (r === "PRODUCT_MANAGER") return "Product Manager";
  return "Support";
}

function statusLabel(s: TeamMemberStatus) {
  if (s === "ACTIVE") return "Active";
  if (s === "DISABLED") return "Inactive";
  return "Invited";
}

function statusBadgeClass(s: TeamMemberStatus) {
  if (s === "ACTIVE") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "INVITED") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-muted text-muted-foreground border-border";
}

export function ProviderTeamPage() {
  const api = useMemo(() => getProviderTeamApi(), []);
  const qc = useQueryClient();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamMemberRole>("SUPPORT");
  const [error, setError] = useState<string | null>(null);

  const teamQuery = useQuery({
    queryKey: ["provider-team"],
    queryFn: () => api.list(),
  });

  const inviteMutation = useMutation({
    mutationFn: (input: { email: string; role: TeamMemberRole }) => api.invite({ email: input.email, role: input.role }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["provider-team"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.update>[1] }) => api.update(id, patch),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["provider-team"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["provider-team"] });
    },
  });

  const members = (teamQuery.data ?? []) as ProviderTeamMember[];
  const busy = inviteMutation.isPending || updateMutation.isPending || removeMutation.isPending;

  const onInvite = async () => {
    setError(null);
    const e = email.trim().toLowerCase();
    if (!e) return alertMissing("Email is required.");
    if (!(await confirmProceed("Invite this staff member?"))) return;

    try {
      await inviteMutation.mutateAsync({ email: e, role });
      setEmail("");
      setRole("SUPPORT");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite");
    }
  };

  const onChangeRole = async (m: ProviderTeamMember, nextRole: TeamMemberRole) => {
    setError(null);
    if (!(await confirmProceed(`Change role for ${m.email} to ${roleLabel(nextRole)}?`))) return;
    try {
      await updateMutation.mutateAsync({ id: m.id, patch: { role: nextRole } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    }
  };

  return (
    <PageShell
      badge="Provider Portal"
      title="Team"
      subtitle="Manage staff access, roles, and permissions."
      actions={
        <Button variant="outline" asChild>
          <Link to="/provider-dashboard">Back to dashboard</Link>
        </Button>
      }
    >
      {error ? <div className="text-sm text-destructive">{error}</div> : null}

      <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold">Invite Staff</div>
            <div className="text-sm text-muted-foreground mt-1">Invite staff by email and assign a role.</div>
          </div>
          <Button onClick={() => void onInvite()} disabled={busy}>
            Invite
          </Button>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 space-y-3">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Staff email (e.g. ops@provider.com)"
                disabled={busy}
              />

              <select
                value={role}
                onChange={(e) => setRole(e.target.value as TeamMemberRole)}
                className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                disabled={busy}
              >
                <option value="ADMIN">Admin</option>
                <option value="PRODUCT_MANAGER">Product Manager</option>
                <option value="SUPPORT">Support</option>
              </select>
            </div>

            <div className="lg:col-span-6 rounded-xl border p-4">
              <div className="font-semibold">Role Definitions</div>
              <div className="text-sm text-muted-foreground mt-2">Use roles to control what staff can do inside the Provider Portal.</div>
              <div className="mt-3 text-sm text-muted-foreground">
                Admin: full provider access (products, documents, team, read-only contracts & remittances).
                <br />
                Product Manager: products + documents.
                <br />
                Support: read-only contracts.
              </div>
            </div>
          </div>
        </div>

      <div className="mt-10 rounded-2xl border bg-card shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold">Your Team</div>
              <div className="text-sm text-muted-foreground mt-1">Staff members associated with your provider account.</div>
            </div>
            <div className="text-sm text-muted-foreground">{members.length} total</div>
          </div>

          <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 border-b text-xs text-muted-foreground">
            <div className="col-span-4">Email</div>
            <div className="col-span-3">Role</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-3 text-right">Actions</div>
          </div>

          <div className="divide-y">
            {members.map((m) => (
              <div key={m.id} className="px-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  <div className="md:col-span-4">
                    <div className="text-sm font-medium text-foreground truncate">{m.email}</div>
                    <div className="text-xs text-muted-foreground mt-1">Added {new Date(m.createdAt).toLocaleDateString()}</div>
                  </div>

                  <div className="md:col-span-3 text-sm text-muted-foreground">
                    <select
                      value={m.role}
                      onChange={(e) => void onChangeRole(m, e.target.value as TeamMemberRole)}
                      className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
                      disabled={busy}
                    >
                      <option value="ADMIN">{roleLabel("ADMIN")}</option>
                      <option value="PRODUCT_MANAGER">{roleLabel("PRODUCT_MANAGER")}</option>
                      <option value="SUPPORT">{roleLabel("SUPPORT")}</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <span className={"inline-flex items-center text-xs px-2 py-1 rounded-md border " + statusBadgeClass(m.status)}>
                      {statusLabel(m.status)}
                    </span>
                  </div>

                  <div className="md:col-span-3 flex md:justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void (async () => {
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

            {teamQuery.isLoading ? <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div> : null}
            {teamQuery.isError ? <div className="px-6 py-6 text-sm text-destructive">Failed to load team.</div> : null}
            {!teamQuery.isLoading && !teamQuery.isError && members.length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted-foreground">No team members yet. Invite your first staff member above.</div>
            ) : null}
          </div>
        </div>
    </PageShell>
  );
}
