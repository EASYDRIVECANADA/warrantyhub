import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Calendar, DollarSign, FileText, Search, Store, Users } from "lucide-react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { getBatchesApi } from "../lib/batches/batches";
import type { Batch } from "../lib/batches/types";
import { getContractsApi } from "../lib/contracts/contracts";
import type { Contract } from "../lib/contracts/types";
import { getAppMode } from "../lib/runtime";
import { getMarketplaceApi } from "../lib/marketplace/marketplace";
import type { Product } from "../lib/products/types";
import { getProvidersApi } from "../lib/providers/providers";
import type { ProviderPublic } from "../lib/providers/types";
import { useAuth } from "../providers/AuthProvider";

const LOCAL_DEALER_MEMBERSHIPS_KEY = "warrantyhub.local.dealer_memberships";

function readLocalDealerMemberships(): Array<{ dealerId?: string; userId?: string }> {
  const raw = localStorage.getItem(LOCAL_DEALER_MEMBERSHIPS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as any[]) : [];
  } catch {
    return [];
  }
}

function dealershipUserIds(dealerId: string) {
  const memberships = readLocalDealerMemberships();
  const ids = new Set<string>();
  ids.add(dealerId);
  for (const m of memberships) {
    const did = (m?.dealerId ?? "").toString();
    const uid = (m?.userId ?? "").toString();
    if (did && uid && did === dealerId) ids.add(uid);
  }
  return ids;
}

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function asText(v: unknown) {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return "[object]";
    }
  }
  return "";
}

type ActivityItem =
  | { kind: "contract"; id: string; createdAt: string; label: string }
  | { kind: "remittance"; id: string; createdAt: string; label: string };

type SummaryCard = {
  title: string;
  value: string;
  subtitle?: string;
  icon: "contracts" | "money" | "calendar" | "marketplace" | "team";
  href?: string;
};

type TrendPoint = { label: string; value: number };

function iconForSummary(kind: SummaryCard["icon"]) {
  if (kind === "contracts") return FileText;
  if (kind === "calendar") return Calendar;
  if (kind === "marketplace") return Store;
  if (kind === "team") return Users;
  return DollarSign;
}

function accentForSummary(kind: SummaryCard["icon"]) {
  if (kind === "contracts") {
    return {
      ring: "ring-sky-500/15",
      iconWrap: "bg-gradient-to-br from-sky-500/20 to-indigo-500/15 border-sky-500/20 text-sky-700",
    };
  }
  if (kind === "money") {
    return {
      ring: "ring-amber-500/15",
      iconWrap: "bg-gradient-to-br from-amber-500/25 to-orange-500/15 border-amber-500/25 text-amber-700",
    };
  }
  if (kind === "calendar") {
    return {
      ring: "ring-emerald-500/15",
      iconWrap: "bg-gradient-to-br from-emerald-500/20 to-cyan-500/15 border-emerald-500/20 text-emerald-700",
    };
  }
  if (kind === "marketplace") {
    return {
      ring: "ring-violet-500/15",
      iconWrap: "bg-gradient-to-br from-violet-500/20 to-fuchsia-500/15 border-violet-500/20 text-violet-700",
    };
  }
  return {
    ring: "ring-indigo-500/15",
    iconWrap: "bg-gradient-to-br from-indigo-500/20 to-blue-500/15 border-indigo-500/20 text-indigo-700",
  };
}

function monthKey(d: Date) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function monthLabel(d: Date) {
  return d.toLocaleString(undefined, { month: "short" });
}

function safeDate(input?: string) {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function SmallBarChart({ points }: { points: TrendPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div className="mt-4">
      <div className="grid grid-cols-12 gap-2 items-end h-28">
        {points.map((p, idx) => {
          const h = Math.round((p.value / max) * 100);
          return (
            <div key={`${p.label}-${idx}`} className="col-span-2 flex flex-col items-center justify-end h-full">
              <div className="w-full rounded-md bg-muted border overflow-hidden h-full flex items-end">
                <div className="w-full bg-primary" style={{ height: `${h}%` }} />
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">{p.label}</div>
              <div className="text-[11px] text-muted-foreground">{p.value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DealerDashboardPage() {
  const contractsApi = useMemo(() => getContractsApi(), []);
  const batchesApi = useMemo(() => getBatchesApi(), []);
  const marketplaceApi = useMemo(() => getMarketplaceApi(), []);
  const providersApi = useMemo(() => getProvidersApi(), []);
  const { user } = useAuth();

  const mode = useMemo(() => getAppMode(), []);
  const isEmployee = user?.role === "DEALER_EMPLOYEE";
  const isDealerAdmin = user?.role === "DEALER_ADMIN";

  const [query, setQuery] = useState("");

  const contractsQuery = useQuery({
    queryKey: ["contracts"],
    queryFn: () => contractsApi.list(),
  });

  const batchesQuery = useQuery({
    queryKey: ["batches"],
    queryFn: () => batchesApi.list(),
  });

  const productsQuery = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: () => marketplaceApi.listPublishedProducts(),
  });

  const contracts = (contractsQuery.data ?? []) as Contract[];
  const batches = (batchesQuery.data ?? []) as Batch[];
  const products = (productsQuery.data ?? []) as Product[];
  const productById = new Map(products.map((p) => [p.id, p] as const));

  const uid = (user?.id ?? "").trim();
  const uem = (user?.email ?? "").trim().toLowerCase();
  const isMine = (c: Contract) => {
    const byId = (c.createdByUserId ?? "").trim();
    const byEmail = (c.createdByEmail ?? "").trim().toLowerCase();
    if (uid && byId) return byId === uid;
    if (uem && byEmail) return byEmail === uem;
    return false;
  };

  const myContracts = contracts.filter(isMine);
  const myContractIds = new Set(myContracts.map((c) => c.id));
  const myRemittances = batches
    .filter((b) => Array.isArray(b.contractIds) && (b.contractIds as string[]).length > 0)
    .filter((b) => (b.contractIds as string[]).every((id) => myContractIds.has(id)));

  const providerIds = Array.from(
    new Set(
      myContracts
        .flatMap((c) => {
          const pid = (c.productId ?? "").trim();
          const p = pid ? productById.get(pid) : undefined;
          return [c.providerId, p?.providerId];
        })
        .map((x) => (x ?? "").trim())
        .filter(Boolean),
    ),
  );

  const providersQuery = useQuery({
    queryKey: ["providers", { ids: providerIds }],
    queryFn: () => providersApi.listByIds(providerIds),
    enabled: providerIds.length > 0,
  });

  const providers = (providersQuery.data ?? []) as ProviderPublic[];
  const providerById = new Map(providers.map((p) => [p.id, p] as const));
  const providerLabel = (id?: string) => {
    const pid = (id ?? "").trim();
    if (!pid) return "—";
    const p = providerById.get(pid);
    return p?.displayName ?? p?.companyName ?? "Provider";
  };

  const counts = {
    draft: myContracts.filter((c) => c.status === "DRAFT").length,
    sold: myContracts.filter((c) => c.status === "SOLD").length,
    remitted: myContracts.filter((c) => c.status === "REMITTED").length,
    paid: myContracts.filter((c) => c.status === "PAID").length,
    remittancesPending: myRemittances.filter((r) => r.status === "OPEN").length,
    remittancesSubmitted: myRemittances.filter((r) => r.status === "CLOSED").length,
  };

  const contractsSold = myContracts.filter((c) => c.status !== "DRAFT");
  const activeWarranties = myContracts.filter((c) => c.status === "SOLD" || c.status === "REMITTED" || c.status === "PAID");

  const submittedCents = myRemittances
    .filter((r) => r.status === "CLOSED")
    .reduce((sum, r) => sum + (r.totalCents ?? 0), 0);

  const pendingCents = myRemittances
    .filter((r) => r.status === "OPEN")
    .reduce((sum, r) => sum + (r.totalCents ?? 0), 0);

  const now = new Date();
  const monthStarts = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return d;
  });
  const salesTrend: TrendPoint[] = monthStarts.map((d) => {
    const k = monthKey(d);
    const count = contractsSold.filter((c) => {
      const sold = safeDate(c.soldAt) ?? safeDate(c.updatedAt) ?? safeDate(c.createdAt);
      if (!sold) return false;
      return monthKey(sold) === k;
    }).length;
    return { label: monthLabel(d), value: count };
  });

  const soldByProduct = (() => {
    const map = new Map<string, number>();
    for (const c of contractsSold) {
      const pid = (c.productId ?? "").trim();
      const key = pid || "__unknown_product__";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    const rows = Array.from(map.entries())
      .map(([id, count]) => {
        const p = id && id !== "__unknown_product__" ? productById.get(id) : undefined;
        const provider = p?.providerId ?? (contractsSold.find((c) => (c.productId ?? "").trim() === id)?.providerId ?? "");
        return {
          id,
          label: p?.name ?? (id === "__unknown_product__" ? "Unknown product" : "Selected product"),
          providerId: provider,
          count,
        };
      })
      .sort((a, b) => b.count - a.count);
    return rows;
  })();

  const soldByProvider = (() => {
    const map = new Map<string, number>();
    for (const c of contractsSold) {
      const pid = (c.productId ?? "").trim();
      const p = pid ? productById.get(pid) : undefined;
      const prov = ((c.providerId ?? p?.providerId) ?? "").trim();
      const key = prov || "__unknown_provider__";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([id, count]) => ({
        id,
        label: id === "__unknown_provider__" ? "Unknown provider" : providerLabel(id),
        count,
      }))
      .sort((a, b) => b.count - a.count);
  })();

  const activity: ActivityItem[] = [
    ...myContracts.map((c) => ({
      kind: "contract" as const,
      id: c.id,
      createdAt: c.updatedAt ?? c.createdAt,
      label: `Contract ${asText(c.contractNumber)} • ${asText(c.customerName)}`,
    })),
    ...(isEmployee
      ? []
      : myRemittances.map((r) => ({
          kind: "remittance" as const,
          id: r.id,
          createdAt: r.createdAt,
          label: `Remittance ${r.batchNumber} • ${formatMoney(r.totalCents)}`,
        }))),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const visibleContracts = useMemo(() => {
    if (!user) return [] as Contract[];
    if (isEmployee) return contracts.filter(isMine);
    if (!isDealerAdmin) return contracts.filter(isMine);
    if (mode !== "local") return contracts.filter(isMine);

    const did = (user.dealerId ?? "").trim();
    if (!did) return contracts.filter(isMine);
    const ids = dealershipUserIds(did);
    return contracts.filter((c) => {
      const cdid = (c.dealerId ?? "").trim();
      if (cdid && cdid === did) return true;
      const byId = (c.createdByUserId ?? "").trim();
      return byId && ids.has(byId);
    });
  }, [contracts, isDealerAdmin, isEmployee, mode, user, uid, uem]);

  const visibleContractIds = useMemo(() => new Set(visibleContracts.map((c) => c.id)), [visibleContracts]);
  const visibleRemittances = useMemo(() => {
    if (isEmployee) return [] as Batch[];
    return batches
      .filter((b) => Array.isArray(b.contractIds) && (b.contractIds as string[]).length > 0)
      .filter((b) => (b.contractIds as string[]).some((id) => visibleContractIds.has(id)));
  }, [batches, isEmployee, visibleContractIds]);

  const q = query.trim().toLowerCase();
  const filteredContracts = q
    ? visibleContracts.filter(
        (c) =>
          asText(c.contractNumber).toLowerCase().includes(q) ||
          asText(c.customerName).toLowerCase().includes(q) ||
          asText(c.status).toLowerCase().includes(q),
      )
    : [];
  const filteredRemittances = q
    ? visibleRemittances.filter(
        (r) => asText(r.batchNumber).toLowerCase().includes(q) || asText(r.status).toLowerCase().includes(q),
      )
    : [];

  const kpiCards: SummaryCard[] = [
    {
      title: "Contracts sold",
      value: `${contractsSold.length}`,
      subtitle: "All time",
      icon: "contracts",
      href: "/dealer-contracts?tab=sold",
    },
    {
      title: "Active warranties",
      value: `${activeWarranties.length}`,
      subtitle: "Sold / Remitted / Paid",
      icon: "calendar",
      href: "/dealer-contracts",
    },
    ...(isEmployee
      ? []
      : [
          {
            title: "Pending remittances",
            value: `${counts.remittancesPending}`,
            subtitle: formatMoney(pendingCents),
            icon: "money" as const,
            href: "/dealer-remittances",
          },
          {
            title: "Submitted remittances",
            value: `${counts.remittancesSubmitted}`,
            subtitle: formatMoney(submittedCents),
            icon: "money" as const,
            href: "/dealer-remittances",
          },
        ]),
  ];

  const quickActions: SummaryCard[] = [
    {
      title: "Find Products",
      value: "Browse",
      subtitle: "Published products",
      icon: "marketplace",
      href: "/dealer-marketplace",
    },
    {
      title: "Contracts",
      value: "View",
      subtitle: "Draft, sold, remitted",
      icon: "contracts",
      href: "/dealer-contracts",
    },
    ...(isEmployee
      ? []
      : [
          {
            title: "Remittances",
            value: "Manage",
            subtitle: "Pending / submitted",
            icon: "money" as const,
            href: "/dealer-remittances",
          },
        ]),
  ];

  const recentContracts = myContracts.slice(0, 6);

  return (
    <PageShell
      badge="Dealer Portal"
      title="Dealer Dashboard"
      subtitle="Business metrics and insights for your dealership."
      actions={
        <div className="w-full sm:w-[380px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Quick Search…" className="pl-9" />
          </div>
        </div>
      }
    >
      <div className="relative">
        <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-blue-600/10 via-transparent to-yellow-400/10 blur-2xl" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8">
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${isEmployee ? "lg:grid-cols-2" : "xl:grid-cols-4"} gap-6`}>
              {kpiCards.map((c) => {
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

            {!isEmployee ? (
            <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-yellow-500/10">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-yellow-500/10 to-blue-600/10">
                <div className="font-semibold text-lg">Insights</div>
                <div className="text-sm text-muted-foreground mt-1">Dealer-only analytics based on your contracts and remittances.</div>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-xl border p-4 bg-gradient-to-br from-blue-600/5 via-transparent to-yellow-400/10">
                  <div className="font-semibold">Sales trends</div>
                  <div className="text-sm text-muted-foreground mt-1">Contracts sold per month (last 6 months).</div>
                  <SmallBarChart points={salesTrend} />
                </div>

                <div className="rounded-xl border p-4 bg-gradient-to-br from-blue-600/5 via-transparent to-yellow-400/10">
                  <div className="font-semibold">Provider mix</div>
                  <div className="text-sm text-muted-foreground mt-1">Share of contracts sold by provider.</div>
                  <div className="mt-4 space-y-3">
                    {soldByProvider.slice(0, 6).map((p) => {
                      const denom = Math.max(1, contractsSold.length);
                      const pct = Math.round((p.count / denom) * 100);
                      return (
                        <div key={p.id}>
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <div className="font-medium truncate">{p.label}</div>
                            <div className="text-xs text-muted-foreground">{p.count} ({pct}%)</div>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-muted border overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {contractsSold.length === 0 ? <div className="text-sm text-muted-foreground">No sold contracts yet.</div> : null}
                  </div>
                </div>

                <div className="rounded-xl border p-4 md:col-span-2 bg-gradient-to-br from-blue-600/5 via-transparent to-yellow-400/10">
                  <div className="font-semibold">Product performance</div>
                  <div className="text-sm text-muted-foreground mt-1">Top products by contracts sold.</div>
                  <div className="mt-4 rounded-lg border overflow-hidden">
                    <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b text-xs text-muted-foreground">
                      <div className="col-span-6">Product</div>
                      <div className="col-span-4">Provider</div>
                      <div className="col-span-2 text-right">Sold</div>
                    </div>
                    <div className="divide-y">
                      {soldByProduct.slice(0, 6).map((r) => (
                        <div key={r.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm items-center">
                          <div className="col-span-6 font-medium truncate">{r.label}</div>
                          <div className="col-span-4 text-muted-foreground truncate">{providerLabel(r.providerId)}</div>
                          <div className="col-span-2 text-right text-muted-foreground">{r.count}</div>
                        </div>
                      ))}
                      {contractsSold.length === 0 ? <div className="px-4 py-6 text-sm text-muted-foreground">No sales yet.</div> : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            ) : null}

            <div className={`mt-8 grid grid-cols-1 sm:grid-cols-2 ${isEmployee ? "lg:grid-cols-2" : "lg:grid-cols-3"} gap-6`}>
              {quickActions.map((c) => {
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

            <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
              <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap bg-gradient-to-r from-blue-600/10 via-transparent to-yellow-500/10">
                <div>
                  <div className="font-semibold text-lg">Contracts Overview</div>
                  <div className="text-sm text-muted-foreground mt-1">Draft → Sold → Remitted → Paid</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/dealer-contracts">View all</Link>
                  </Button>
                  <Button size="sm" asChild className="bg-yellow-400 text-black hover:bg-yellow-300">
                    <Link to="/dealer-contracts">New Contract</Link>
                  </Button>
                </div>
              </div>

              <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 border-b text-xs text-muted-foreground">
                <div className="col-span-3">Warranty ID</div>
                <div className="col-span-3">Contract #</div>
                <div className="col-span-4">Customer</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>

              <div className="divide-y">
                {recentContracts.map((c) => (
                  <div key={c.id} className="px-6 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <div className="md:col-span-3">
                        <div className="text-sm font-medium">{asText(c.warrantyId)}</div>
                        <div className="text-xs text-muted-foreground mt-1">{asText(c.status)}</div>
                      </div>
                      <div className="md:col-span-3 text-sm">{asText(c.contractNumber)}</div>
                      <div className="md:col-span-4 text-sm">{asText(c.customerName)}</div>
                      <div className="md:col-span-2 flex md:justify-end gap-2">
                        <Button size="sm" asChild>
                          <Link to={`/dealer-contracts/${c.id}`}>View</Link>
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <Link to={`/dealer-contracts/${c.id}/print/dealer`}>Print</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
  
                  {contractsQuery.isLoading ? (
                    <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div>
                  ) : null}
                  {!contractsQuery.isLoading && recentContracts.length === 0 ? (
                    <div className="px-6 py-10 text-sm text-muted-foreground">
                      No contracts yet.
                      <div className="mt-2">
                        <Button size="sm" asChild className="bg-yellow-400 text-black hover:bg-yellow-300">
                          <Link to="/dealer-marketplace">Find Products</Link>
                        </Button>
                      </div>
                    </div>
                  ) : null}
              </div>
            </div>

            {q ? (
              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
                  <div className="px-6 py-4 border-b">
                    <div className="font-semibold">Search results: Contracts</div>
                    <div className="text-sm text-muted-foreground mt-1">Matches by contract #, customer, or status.</div>
                  </div>
                  <div className="divide-y">
                    {filteredContracts.map((c) => (
                      <Link key={c.id} to={`/dealer-contracts/${c.id}`} className="block px-6 py-4 hover:bg-muted/40">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium">{asText(c.contractNumber)}</div>
                          <div className="text-xs text-muted-foreground">{asText(c.status)}</div>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">{asText(c.customerName)}</div>
                      </Link>
                    ))}
                    {filteredContracts.length === 0 ? (
                      <div className="px-6 py-6 text-sm text-muted-foreground">No contract matches.</div>
                    ) : null}
                  </div>
                </div>

                {!isEmployee ? (
                <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
                  <div className="px-6 py-4 border-b">
                    <div className="font-semibold">Search results: Remittances</div>
                    <div className="text-sm text-muted-foreground mt-1">Matches by remittance # or status.</div>
                  </div>
                  <div className="divide-y">
                    {filteredRemittances.map((r) => (
                      <div key={r.id} className="px-6 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium">{r.batchNumber}</div>
                          <div className="text-xs text-muted-foreground">{r.status === "CLOSED" ? "Submitted" : "Pending"}</div>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">{formatMoney(r.totalCents)}</div>
                      </div>
                    ))}
                    {filteredRemittances.length === 0 ? (
                      <div className="px-6 py-6 text-sm text-muted-foreground">No remittance matches.</div>
                    ) : null}
                  </div>
                </div>
                ) : null}
              </div>
            ) : null}

            {contractsQuery.isError || batchesQuery.isError || productsQuery.isError || providersQuery.isError ? (
              <div className="mt-6 text-sm text-destructive">Failed to load dashboard data.</div>
            ) : null}
          </div>

          <div className="lg:col-span-4">
            <div className="rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-yellow-500/10">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-yellow-500/10 to-blue-600/10">
                <div className="font-semibold">Recent Activity</div>
                <div className="text-sm text-muted-foreground mt-1">Latest updates for transparency.</div>
              </div>
              <div className="divide-y">
                {activity.slice(0, 8).map((a) => (
                  <div key={`${a.kind}-${a.id}`} className="px-6 py-4">
                    <div className="text-sm font-medium">{a.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{new Date(a.createdAt).toLocaleString()}</div>
                  </div>
                ))}

                {activity.length === 0 ? <div className="px-6 py-10 text-sm text-muted-foreground">No activity yet.</div> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
