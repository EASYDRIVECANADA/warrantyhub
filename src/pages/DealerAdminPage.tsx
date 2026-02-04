import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { BarChart3, DollarSign, FileText, Users } from "lucide-react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { getAppMode } from "../lib/runtime";
import { useDealerMarkupPct } from "../lib/dealerMarkup";
import { listAuditEvents, logAuditEvent } from "../lib/auditLog";
import { useAuth } from "../providers/AuthProvider";
import { getBatchesApi } from "../lib/batches/batches";
import type { Batch } from "../lib/batches/types";
import { getContractsApi } from "../lib/contracts/contracts";
import type { Contract } from "../lib/contracts/types";
import { getEmployeesApi } from "../lib/employees/employees";
import type { Employee } from "../lib/employees/types";

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

type SummaryCard = {
  title: string;
  value: string;
  subtitle?: string;
  icon: "contracts" | "outstanding" | "employees" | "reporting";
  href?: string;
};

function iconForSummary(kind: SummaryCard["icon"]) {
  if (kind === "contracts") return FileText;
  if (kind === "outstanding") return DollarSign;
  if (kind === "employees") return Users;
  return BarChart3;
}

function accentForSummary(kind: SummaryCard["icon"]) {
  if (kind === "contracts") {
    return {
      ring: "ring-sky-500/15",
      iconWrap: "bg-gradient-to-br from-sky-500/20 to-indigo-500/15 border-sky-500/20 text-sky-700",
    };
  }
  if (kind === "outstanding") {
    return {
      ring: "ring-amber-500/15",
      iconWrap: "bg-gradient-to-br from-amber-500/25 to-orange-500/15 border-amber-500/25 text-amber-700",
    };
  }
  if (kind === "employees") {
    return {
      ring: "ring-emerald-500/15",
      iconWrap: "bg-gradient-to-br from-emerald-500/20 to-cyan-500/15 border-emerald-500/20 text-emerald-700",
    };
  }
  return {
    ring: "ring-violet-500/15",
    iconWrap: "bg-gradient-to-br from-violet-500/20 to-fuchsia-500/15 border-violet-500/20 text-violet-700",
  };
}

const DEALER_INVITE_CODES_KEY = "warrantyhub.local.dealer_invite_codes";
const DEALER_INVITES_KEY = "warrantyhub.local.dealer_employee_invites";
const DEALER_TEAM_MEMBERS_KEY = "warrantyhub.local.dealer_team_members";

function readLocalUsers(): Array<{ id?: string; companyName?: string }> {
  const raw = localStorage.getItem("warrantyhub.local.users");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as any[]) : [];
  } catch {
    return [];
  }
}

type DealerInvite = {
  code: string;
  dealerName?: string;
  createdAt: string;
};

function readDealerTeamMembersRaw(): any[] {
  const raw = localStorage.getItem(DEALER_TEAM_MEMBERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as any[]) : [];
  } catch {
    return [];
  }
}

function readLegacyInviteCodes(): Record<string, { code?: string; updatedAt?: string }> {
  const raw = localStorage.getItem(DEALER_INVITE_CODES_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as any) : {};
  } catch {
    return {};
  }
}

function writeLegacyInviteCodes(next: Record<string, { code?: string; updatedAt?: string }>) {
  localStorage.setItem(DEALER_INVITE_CODES_KEY, JSON.stringify(next));
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

export function DealerAdminPage() {
  const contractsApi = useMemo(() => getContractsApi(), []);
  const batchesApi = useMemo(() => getBatchesApi(), []);
  const employeesApi = useMemo(() => getEmployeesApi(), []);
  const { user } = useAuth();

  const mode = useMemo(() => getAppMode(), []);

  if (!user) return <Navigate to="/sign-in" replace />;
  if (user.role !== "DEALER_ADMIN") return <Navigate to="/dealer-dashboard" replace />;

  const dealerId = (mode === "local" ? (user.dealerId ?? user.id) : (user.dealerId ?? "")).trim();
  const { markupPct: persistedMarkupPct, saveMarkupPct, isSaving: isSavingMarkup } = useDealerMarkupPct(dealerId);
  const [markupPct, setMarkupPct] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const recentAudit = useMemo(() => listAuditEvents({ dealerId, limit: 25 }), [dealerId]);

  const dealerKey = dealerId;

  useEffect(() => {
    setMarkupPct(String(persistedMarkupPct));
  }, [dealerId, persistedMarkupPct]);

  useEffect(() => {
    if (!dealerKey) return;
    const current = readInvites();
    if (current[dealerKey]?.code) return;
    const legacy = readLegacyInviteCodes();
    const legacyForUser = legacy[(user?.id ?? "").trim()];
    const code = (legacyForUser?.code ?? "").toString().trim();
    if (!code) return;

    const dealerName = (readLocalUsers().find((u) => (u.id ?? "").toString() === dealerKey)?.companyName ?? "").toString().trim() || undefined;
    const createdAt = (legacyForUser?.updatedAt ?? new Date().toISOString()).toString();
    writeInvites({ ...current, [dealerKey]: { code, dealerName, createdAt } });

    const cleaned = { ...legacy };
    delete cleaned[(user?.id ?? "").trim()];
    writeLegacyInviteCodes(cleaned);
  }, [dealerKey, user?.id]);

  const invites = readInvites();
  const invite = dealerKey ? invites[dealerKey] : undefined;
  const inviteCode = (invite?.code ?? "").trim();

  const contractsQuery = useQuery({
    queryKey: ["contracts"],
    queryFn: () => contractsApi.list(),
  });

  const batchesQuery = useQuery({
    queryKey: ["batches"],
    queryFn: () => batchesApi.list(),
  });

  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: () => employeesApi.list(),
  });

  const contracts = (contractsQuery.data ?? []) as Contract[];
  const batches = (batchesQuery.data ?? []) as Batch[];
  const employees = (employeesQuery.data ?? []) as Employee[];

  const activeEmployeeCount = useMemo(() => {
    if (mode !== "local") return employees.length;
    const team = readDealerTeamMembersRaw();
    return team.filter((m) => (m?.dealerId ?? "").toString() === dealerId && m?.status === "ACTIVE" && m?.role === "DEALER_EMPLOYEE").length;
  }, [dealerId, employees.length, mode]);

  const contractCounts = {
    draft: contracts.filter((c) => c.status === "DRAFT").length,
    sold: contracts.filter((c) => c.status === "SOLD").length,
    remitted: contracts.filter((c) => c.status === "REMITTED").length,
    paid: contracts.filter((c) => c.status === "PAID").length,
    total: contracts.length,
  };

  const outstandingCents = batches
    .filter((b) => b.status === "CLOSED" && b.paymentStatus === "UNPAID")
    .reduce((sum, b) => sum + (b.totalCents ?? 0), 0);

  const paidCents = batches
    .filter((b) => b.status === "CLOSED" && b.paymentStatus === "PAID")
    .reduce((sum, b) => sum + (b.totalCents ?? 0), 0);

  const attribution = {
    createdBy: new Map<string, number>(),
    soldBy: new Map<string, number>(),
    remittedBy: new Map<string, number>(),
    paidBy: new Map<string, number>(),
  };

  for (const c of contracts) {
    const created = (c.createdByEmail ?? "").trim().toLowerCase();
    if (created) attribution.createdBy.set(created, (attribution.createdBy.get(created) ?? 0) + 1);

    const sold = (c.soldByEmail ?? "").trim().toLowerCase();
    if (sold) attribution.soldBy.set(sold, (attribution.soldBy.get(sold) ?? 0) + 1);

    const remitted = (c.remittedByEmail ?? "").trim().toLowerCase();
    if (remitted) attribution.remittedBy.set(remitted, (attribution.remittedBy.get(remitted) ?? 0) + 1);

    const paid = (c.paidByEmail ?? "").trim().toLowerCase();
    if (paid) attribution.paidBy.set(paid, (attribution.paidBy.get(paid) ?? 0) + 1);
  }

  const actors = Array.from(
    new Set([
      ...Array.from(attribution.createdBy.keys()),
      ...Array.from(attribution.soldBy.keys()),
      ...Array.from(attribution.remittedBy.keys()),
      ...Array.from(attribution.paidBy.keys()),
    ]),
  ).sort();

  const summaryCards: SummaryCard[] = [
    {
      title: "Contracts",
      value: `${contractCounts.total}`,
      subtitle: `${contractCounts.draft} Draft • ${contractCounts.sold} Sold • ${contractCounts.remitted} Remitted • ${contractCounts.paid} Paid`,
      icon: "contracts",
      href: "/dealer-contracts",
    },
    {
      title: "Outstanding",
      value: money(outstandingCents),
      subtitle: `Paid ${money(paidCents)} • Unpaid ${money(outstandingCents)}`,
      icon: "outstanding",
      href: "/dealer-remittances",
    },
    {
      title: "Employees",
      value: `${activeEmployeeCount}`,
      subtitle: "Manage dealership staff",
      icon: "employees",
      href: "/dealer-team",
    },
    {
      title: "Reporting",
      value: `${actors.length}`,
      subtitle: "Active user emails with logged actions",
      icon: "reporting",
      href: "/dealer-reporting",
    },
  ];

  const isError = contractsQuery.isError || batchesQuery.isError || (mode !== "local" && employeesQuery.isError);
  const isLoading = contractsQuery.isLoading || batchesQuery.isLoading || (mode !== "local" && employeesQuery.isLoading);

  return (
    <PageShell
      badge="Dealer Admin"
      title="Dealer Admin Dashboard"
      subtitle="Reporting, remittance oversight, and staff management."
      actions={
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <Link to="/dealer-admin">Dashboard</Link>
          </Button>
          <Button asChild className="bg-yellow-400 text-black hover:bg-yellow-300">
            <Link to="/dealer-remittances">Remittances</Link>
          </Button>
        </div>
      }
    >
      <div className="relative">
        <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-blue-600/10 via-transparent to-yellow-400/10 blur-2xl" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {summaryCards.map((c) => {
                const Icon = iconForSummary(c.icon);
                const a = accentForSummary(c.icon);
                const body = (
                  <div
                    className={
                      "rounded-2xl border bg-card shadow-card p-6 ring-1 transition-all hover:-translate-y-0.5 hover:shadow-md h-full overflow-hidden flex flex-col " +
                      a.ring
                    }
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-sm text-muted-foreground">{c.title}</div>
                      <div
                        className={
                          "shrink-0 h-12 w-12 rounded-2xl border ring-1 ring-white/30 flex items-center justify-center " +
                          a.iconWrap
                        }
                      >
                        <Icon className="w-6 h-6" />
                      </div>
                    </div>
                    <div className="text-3xl font-bold text-foreground mt-3 leading-none break-all">{c.value}</div>
                    {c.subtitle ? <div className="text-xs text-muted-foreground mt-3 leading-relaxed">{c.subtitle}</div> : null}
                  </div>
                );

                return c.href ? (
                  <Link key={c.title} to={c.href} className="block">
                    {body}
                  </Link>
                ) : (
                  <div key={c.title}>{body}</div>
                );
              })}
            </div>

            <div className="rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-yellow-500/10">
              <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap bg-gradient-to-r from-yellow-500/10 to-blue-600/10">
                <div>
                  <div className="font-semibold">Employee Invite Code</div>
                  <div className="text-sm text-muted-foreground mt-1">Share this with dealership staff to join your dealership.</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!dealerKey}
                    onClick={() => {
                      if (!dealerKey) return;
                      const users = readLocalUsers();
                      const dealerName = (users.find((u) => (u.id ?? "").toString() === dealerId)?.companyName ?? "").toString().trim() || undefined;
                      const now = new Date().toISOString();
                      const code = generateInviteCode();
                      const next = { ...invites, [dealerKey]: { code, dealerName, createdAt: now } };
                      writeInvites(next);

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

                      window.location.reload();
                    }}
                  >
                    {inviteCode ? "Regenerate" : "Generate"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!inviteCode}
                    onClick={() => {
                      void (async () => {
                        if (!inviteCode) return;
                        try {
                          await navigator.clipboard.writeText(inviteCode);
                        } catch {
                        }
                      })();
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>

              <div className="p-6">
                <div className="text-xs text-muted-foreground">Invite Code</div>
                <div className="mt-2 font-mono text-lg tracking-wider rounded-lg border bg-background px-4 py-3">
                  {inviteCode || "Not generated yet"}
                </div>
                {invite?.createdAt ? <div className="mt-2 text-xs text-muted-foreground">Updated {new Date(invite.createdAt).toLocaleString()}</div> : null}
              </div>
            </div>

            <div className="rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-yellow-500/10">
              <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap bg-gradient-to-r from-yellow-500/10 to-blue-600/10">
                <div>
                  <div className="font-semibold">Employee / User Activity</div>
                  <div className="text-sm text-muted-foreground mt-1">Who created/sold/remitted/paid contracts.</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/dealer-contracts">View contracts</Link>
                  </Button>
                  <Button size="sm" asChild className="bg-yellow-400 text-black hover:bg-yellow-300">
                    <Link to="/dealer-team">Manage team</Link>
                  </Button>
                </div>
              </div>

              <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 border-b text-xs text-muted-foreground">
                <div className="col-span-4">Email</div>
                <div className="col-span-2 text-right">Created</div>
                <div className="col-span-2 text-right">Sold</div>
                <div className="col-span-2 text-right">Remitted</div>
                <div className="col-span-2 text-right">Paid</div>
              </div>

              <div className="divide-y">
                {actors.map((email) => (
                  <div key={email} className="px-6 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <div className="md:col-span-4">
                        <div className="text-sm font-medium text-foreground break-all">{email}</div>
                      </div>
                      <div className="md:col-span-2 text-sm text-right text-muted-foreground">{attribution.createdBy.get(email) ?? 0}</div>
                      <div className="md:col-span-2 text-sm text-right text-muted-foreground">{attribution.soldBy.get(email) ?? 0}</div>
                      <div className="md:col-span-2 text-sm text-right text-muted-foreground">{attribution.remittedBy.get(email) ?? 0}</div>
                      <div className="md:col-span-2 text-sm text-right text-muted-foreground">{attribution.paidBy.get(email) ?? 0}</div>
                    </div>
                  </div>
                ))}

                {isLoading ? <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div> : null}
                {!isLoading && actors.length === 0 ? (
                  <div className="px-6 py-6 text-sm text-muted-foreground">No activity recorded yet.</div>
                ) : null}
                {isError ? <div className="px-6 py-6 text-sm text-destructive">Failed to load reporting data.</div> : null}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4">
            <div className="rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10 flex flex-col h-[380px]">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600/10 via-transparent to-yellow-500/10">
                <div className="font-semibold">Recent Activity</div>
                <div className="text-sm text-muted-foreground mt-1">Key dealership events (invites, joins, sales, remittances).</div>
              </div>

              <div className="divide-y overflow-y-auto flex-1 min-h-0">
                {recentAudit.map((e) => (
                  <div key={e.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-foreground">{e.kind}</div>
                        <div className="text-xs text-muted-foreground mt-1 break-all">{e.message ?? "—"}</div>
                        <div className="text-[11px] text-muted-foreground mt-1 break-all">{e.actorEmail ?? ""}</div>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
                {recentAudit.length === 0 ? <div className="px-6 py-6 text-sm text-muted-foreground">No activity yet.</div> : null}
              </div>
            </div>

            <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
              <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap bg-gradient-to-r from-blue-600/10 via-transparent to-yellow-500/10">
                <div>
                  <div className="font-semibold">Pricing Settings</div>
                  <div className="text-sm text-muted-foreground mt-1">Markup is applied to provider cost to compute dealer retail pricing.</div>
                </div>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Dealership markup %</div>
                  <Input
                    value={markupPct}
                    onChange={(e) => setMarkupPct(e.target.value)}
                    placeholder="e.g. 25"
                    inputMode="decimal"
                    disabled={!dealerId || isSavingMarkup}
                  />
                  {savedAt ? <div className="mt-2 text-xs text-muted-foreground">Saved {savedAt}</div> : null}
                  {saveError ? <div className="mt-2 text-xs text-destructive">{saveError}</div> : null}
                </div>

                <div className="hidden md:block" />

                <Button
                  onClick={() => {
                    void (async () => {
                      try {
                        const n = Number(markupPct);
                        await saveMarkupPct(n);
                        setSavedAt(new Date().toLocaleString());
                        setSaveError(null);
                      } catch (err) {
                        setSavedAt(null);
                        setSaveError(err instanceof Error ? err.message : "Failed to save markup");
                      }
                    })();
                  }}
                  disabled={!dealerId || isSavingMarkup}
                  className="bg-yellow-400 text-black hover:bg-yellow-300"
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
