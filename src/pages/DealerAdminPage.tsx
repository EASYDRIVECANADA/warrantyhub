import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import {
  BarChart3,
  CheckCircle2,
  DollarSign,
  FileText,
  Hourglass,
  Package,
  Store,
  TrendingUp,
  Users,
} from "lucide-react";
import { PageShell } from "../components/PageShell";
import { getAppMode } from "../lib/runtime";
import { useAuth } from "../providers/AuthProvider";
import { getBatchesApi } from "../lib/batches/batches";
import type { Batch } from "../lib/batches/types";
import { getContractsApi } from "../lib/contracts/contracts";
import type { Contract } from "../lib/contracts/types";
import { getEmployeesApi } from "../lib/employees/employees";
import { getMarketplaceApi } from "../lib/marketplace/marketplace";
import type { MarketplaceProduct } from "../lib/marketplace/api";

function money(cents: number) {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function DealerAdminPage() {
  const contractsApi = useMemo(() => getContractsApi(), []);
  const batchesApi = useMemo(() => getBatchesApi(), []);
  const employeesApi = useMemo(() => getEmployeesApi(), []);
  const marketplaceApi = useMemo(() => getMarketplaceApi(), []);
  const { user } = useAuth();

  const mode = useMemo(() => getAppMode(), []);

  if (!user) return <Navigate to="/sign-in" replace />;
  if (user.role !== "DEALER_ADMIN") return <Navigate to="/dealer-dashboard" replace />;

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

  const productsQuery = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: () => marketplaceApi.listPublishedProducts(),
  });

  const contracts = (contractsQuery.data ?? []) as Contract[];
  const batches = (batchesQuery.data ?? []) as Batch[];
  const products = (productsQuery.data ?? []) as MarketplaceProduct[];

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p] as const)), [products]);

  const contractCounts = {
    draft: contracts.filter((c) => c.status === "DRAFT").length,
    sold: contracts.filter((c) => c.status === "SOLD").length,
    remitted: contracts.filter((c) => c.status === "REMITTED").length,
    paid: contracts.filter((c) => c.status === "PAID").length,
    total: contracts.length,
  };

  const soldLike = useMemo(() => {
    return contracts.filter((c) => c.status === "SOLD" || c.status === "REMITTED" || c.status === "PAID");
  }, [contracts]);

  const revenueCentsFor = (c: Contract) => {
    const base = typeof c.pricingBasePriceCents === "number" ? c.pricingBasePriceCents : 0;
    const addons = typeof c.addonTotalRetailCents === "number" ? c.addonTotalRetailCents : 0;
    return base + addons;
  };

  const totalSalesCents = useMemo(() => soldLike.reduce((sum, c) => sum + revenueCentsFor(c), 0), [soldLike]);

  const avgContractCents = useMemo(() => {
    if (soldLike.length === 0) return 0;
    return Math.round(totalSalesCents / soldLike.length);
  }, [soldLike.length, totalSalesCents]);

  const outstandingCents = batches
    .filter((b) => b.status === "CLOSED" && b.paymentStatus === "UNPAID")
    .reduce((sum, b) => sum + (b.totalCents ?? 0), 0);

  const productPerformance = useMemo(() => {
    const byProduct = new Map<string, { productId: string; sold: number; revenueCents: number }>();
    for (const c of soldLike) {
      const pid = (c.productId ?? "").trim();
      if (!pid) continue;
      const curr = byProduct.get(pid) ?? { productId: pid, sold: 0, revenueCents: 0 };
      curr.sold += 1;
      curr.revenueCents += revenueCentsFor(c);
      byProduct.set(pid, curr);
    }
    return Array.from(byProduct.values())
      .map((row) => ({
        ...row,
        name: (productById.get(row.productId)?.name ?? "—").toString(),
      }))
      .sort((a, b) => b.revenueCents - a.revenueCents);
  }, [productById, soldLike]);

  const topProduct = productPerformance[0] ?? null;

  const employeePerformance = useMemo(() => {
    const byActor = new Map<string, { email: string; sold: number; revenueCents: number }>();
    for (const c of soldLike) {
      const email = (c.soldByEmail ?? c.createdByEmail ?? "").toString().trim().toLowerCase();
      if (!email) continue;
      const curr = byActor.get(email) ?? { email, sold: 0, revenueCents: 0 };
      curr.sold += 1;
      curr.revenueCents += revenueCentsFor(c);
      byActor.set(email, curr);
    }
    return Array.from(byActor.values()).sort((a, b) => b.revenueCents - a.revenueCents);
  }, [soldLike]);

  const monthKey = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  };

  const monthLabel = (key: string) => {
    const parts = key.split("-");
    const m = Number(parts[1] ?? "0");
    const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return names[m - 1] ?? key;
  };

  const salesByMonth = useMemo(() => {
    const now = new Date();
    const months: string[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(monthKey(d));
    }
    const counts = new Map<string, number>(months.map((k) => [k, 0] as const));
    for (const c of soldLike) {
      const raw = (c.soldAt ?? c.updatedAt ?? c.createdAt ?? "").toString().trim();
      if (!raw) continue;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) continue;
      const k = monthKey(d);
      if (!counts.has(k)) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const points = months.map((k) => ({ key: k, label: monthLabel(k), value: counts.get(k) ?? 0 }));
    const max = Math.max(1, ...points.map((p) => p.value));
    return { points, max };
  }, [soldLike]);

  const kpis = useMemo(() => {
    return [
      {
        title: "Contracts Created",
        value: `${contractCounts.total}`,
        icon: FileText,
        iconWrap: "bg-gradient-to-br from-sky-500/20 to-indigo-500/10 border-sky-500/20 text-sky-700",
      },
      {
        title: "Contracts Sold",
        value: `${contractCounts.sold}`,
        icon: CheckCircle2,
        iconWrap: "bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border-emerald-500/20 text-emerald-700",
      },
      {
        title: "Pending Contracts",
        value: `${contractCounts.draft}`,
        icon: Hourglass,
        iconWrap: "bg-gradient-to-br from-amber-500/25 to-orange-500/10 border-amber-500/25 text-amber-800",
      },
      {
        title: "Remitted",
        value: `${contractCounts.remitted}`,
        icon: BarChart3,
        iconWrap: "bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 border-violet-500/20 text-violet-700",
      },
      {
        title: "Total Sales Volume",
        value: money(totalSalesCents),
        icon: DollarSign,
        iconWrap: "bg-gradient-to-br from-blue-600/15 to-yellow-400/10 border-blue-600/20 text-blue-700",
      },
      {
        title: "Outstanding Balance",
        value: money(outstandingCents),
        icon: TrendingUp,
        iconWrap: "bg-gradient-to-br from-amber-500/20 to-rose-500/10 border-amber-500/20 text-amber-800",
      },
      {
        title: "Avg Contract",
        value: money(avgContractCents),
        icon: DollarSign,
        iconWrap: "bg-gradient-to-br from-slate-500/15 to-slate-500/5 border-slate-500/15 text-slate-700",
      },
      {
        title: "Top Selling Product",
        value: topProduct?.name ?? "—",
        icon: Package,
        iconWrap: "bg-gradient-to-br from-yellow-400/25 to-amber-500/10 border-yellow-500/20 text-amber-900",
      },
    ] as const;
  }, [avgContractCents, contractCounts.draft, contractCounts.remitted, contractCounts.sold, contractCounts.total, outstandingCents, topProduct?.name, totalSalesCents]);

  const isError =
    contractsQuery.isError ||
    batchesQuery.isError ||
    productsQuery.isError ||
    (mode !== "local" && employeesQuery.isError);
  const isLoading =
    contractsQuery.isLoading ||
    batchesQuery.isLoading ||
    productsQuery.isLoading ||
    (mode !== "local" && employeesQuery.isLoading);

  return (
    <PageShell
      title=""
    >
      <div className="relative">
        <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-blue-600/10 via-transparent to-yellow-400/10 blur-2xl" />

        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 auto-rows-fr">
            {kpis.map((k) => (
              <div key={k.title} className="rounded-2xl border bg-card shadow-card p-4 ring-1 ring-blue-500/10">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-[13px] text-muted-foreground">{k.title}</div>
                  <div className={"shrink-0 h-10 w-10 rounded-2xl border flex items-center justify-center " + k.iconWrap}>
                    <k.icon className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-foreground mt-3 leading-none break-words">{k.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10 flex flex-col min-h-[340px]">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600/10 via-transparent to-yellow-500/10">
                <div className="font-semibold">Sales Overview</div>
                <div className="text-sm text-muted-foreground mt-1">Contracts sold per month</div>
              </div>

              <div className="p-6 flex-1 min-h-0">
                {(() => {
                  const w = 720;
                  const h = 220;
                  const padX = 24;
                  const padY = 24;
                  const innerW = w - padX * 2;
                  const innerH = h - padY * 2;
                  const pts = salesByMonth.points;
                  const max = salesByMonth.max;
                  const toX = (i: number) => (pts.length <= 1 ? padX : padX + (innerW * i) / (pts.length - 1));
                  const toY = (v: number) => padY + innerH - (innerH * v) / max;
                  const d = pts
                    .map((p, i) => `${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`)
                    .join(" ");
                  const last = pts[pts.length - 1];
                  return (
                    <div className="w-full overflow-x-auto">
                      <div className="min-w-[720px]">
                        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[240px]">
                          <defs>
                            <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="rgb(37 99 235 / 0.20)" />
                              <stop offset="100%" stopColor="rgb(37 99 235 / 0)" />
                            </linearGradient>
                          </defs>
                          <rect x="0" y="0" width={w} height={h} fill="transparent" />
                          {[0.25, 0.5, 0.75, 1].map((t) => (
                            <line key={t} x1={padX} x2={w - padX} y1={padY + innerH * t} y2={padY + innerH * t} stroke="rgb(148 163 184 / 0.35)" strokeWidth="1" />
                          ))}

                          {pts.length > 1 ? <polygon points={`${padX},${h - padY} ${d} ${w - padX},${h - padY}`} fill="url(#salesFill)" /> : null}

                          <polyline points={d} fill="none" stroke="rgb(37 99 235)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                          {pts.map((p, i) => (
                            <g key={p.key}>
                              <circle cx={toX(i)} cy={toY(p.value)} r={5} fill="white" stroke="rgb(37 99 235)" strokeWidth={2} />
                              <text x={toX(i)} y={h - 6} textAnchor="middle" fontSize="12" fill="rgb(100 116 139)">
                                {p.label}
                              </text>
                            </g>
                          ))}

                          {last ? (
                            <text x={w - padX} y={padY - 6} textAnchor="end" fontSize="12" fill="rgb(100 116 139)">
                              Last 6 months
                            </text>
                          ) : null}
                        </svg>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="lg:col-span-4 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10 flex flex-col min-h-[340px]">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600/10 via-transparent to-yellow-500/10">
                <div className="font-semibold">Quick Actions</div>
              </div>
              <div className="p-6 grid grid-cols-2 gap-3 flex-1 content-start">
                <Link to="/dealer-contracts" className="rounded-xl border bg-background/40 p-4 hover:bg-background/60 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl border bg-gradient-to-br from-sky-500/20 to-indigo-500/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-sky-700" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">View Contracts</div>
                      <div className="text-xs text-muted-foreground">Create & manage</div>
                    </div>
                  </div>
                </Link>

                <Link to="/dealer-marketplace" className="rounded-xl border bg-background/40 p-4 hover:bg-background/60 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl border bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 flex items-center justify-center">
                      <Store className="h-5 w-5 text-emerald-700" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">Find Products</div>
                      <div className="text-xs text-muted-foreground">Marketplace</div>
                    </div>
                  </div>
                </Link>

                <Link to="/dealer-team" className="rounded-xl border bg-background/40 p-4 hover:bg-background/60 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl border bg-gradient-to-br from-amber-500/20 to-orange-500/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-amber-800" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">Team</div>
                      <div className="text-xs text-muted-foreground">Employees</div>
                    </div>
                  </div>
                </Link>

                <Link to="/dealer-remittances" className="rounded-xl border bg-background/40 p-4 hover:bg-background/60 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl border bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-violet-700" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">Remittances</div>
                      <div className="text-xs text-muted-foreground">Batches</div>
                    </div>
                  </div>
                </Link>
              </div>
            </div>

            <div className="lg:col-span-6 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600/10 via-transparent to-yellow-500/10">
                <div className="font-semibold">Product Performance</div>
                <div className="text-sm text-muted-foreground mt-1">Top products by revenue</div>
              </div>
              <div className="px-6 py-4">
                <div className="grid grid-cols-12 gap-3 text-[11px] text-muted-foreground pb-2">
                  <div className="col-span-7">Product</div>
                  <div className="col-span-2 text-right">Sold</div>
                  <div className="col-span-3 text-right">Revenue</div>
                </div>
                <div className="max-h-[240px] overflow-y-auto divide-y rounded-lg border bg-background/40">
                  {productPerformance.slice(0, 50).map((row) => (
                    <div key={row.productId} className="grid grid-cols-12 gap-3 px-3 py-2 items-center">
                      <div className="col-span-7 text-[13px] font-medium text-foreground truncate">{row.name}</div>
                      <div className="col-span-2 text-[13px] text-right text-muted-foreground">{row.sold}</div>
                      <div className="col-span-3 text-[13px] text-right text-muted-foreground">{money(row.revenueCents)}</div>
                    </div>
                  ))}
                  {!isLoading && productPerformance.length === 0 ? <div className="px-3 py-6 text-sm text-muted-foreground">No sales yet.</div> : null}
                  {isLoading ? <div className="px-3 py-6 text-sm text-muted-foreground">Loading…</div> : null}
                  {isError ? <div className="px-3 py-6 text-sm text-destructive">Failed to load dashboard data.</div> : null}
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600/10 via-transparent to-yellow-500/10">
                <div className="font-semibold">Employee Performance</div>
                <div className="text-sm text-muted-foreground mt-1">Top employees by revenue</div>
              </div>
              <div className="px-6 py-4">
                <div className="grid grid-cols-12 gap-3 text-[11px] text-muted-foreground pb-2">
                  <div className="col-span-7">Employee</div>
                  <div className="col-span-2 text-right">Sold</div>
                  <div className="col-span-3 text-right">Revenue</div>
                </div>
                <div className="max-h-[240px] overflow-y-auto divide-y rounded-lg border bg-background/40">
                  {employeePerformance.slice(0, 50).map((row) => (
                    <div key={row.email} className="grid grid-cols-12 gap-3 px-3 py-2 items-center">
                      <div className="col-span-7 text-[13px] font-medium text-foreground truncate">{row.email}</div>
                      <div className="col-span-2 text-[13px] text-right text-muted-foreground">{row.sold}</div>
                      <div className="col-span-3 text-[13px] text-right text-muted-foreground">{money(row.revenueCents)}</div>
                    </div>
                  ))}
                  {!isLoading && employeePerformance.length === 0 ? <div className="px-3 py-6 text-sm text-muted-foreground">No sales yet.</div> : null}
                  {isLoading ? <div className="px-3 py-6 text-sm text-muted-foreground">Loading…</div> : null}
                  {isError ? <div className="px-3 py-6 text-sm text-destructive">Failed to load dashboard data.</div> : null}
                </div>
              </div>
            </div>

            <div className="lg:col-span-12 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600/10 via-transparent to-yellow-500/10">
                <div className="font-semibold">Contract Status Breakdown</div>
              </div>
              <div className="p-6 space-y-3">
                {(() => {
                  const total = Math.max(1, contractCounts.total);
                  const rows = [
                    { label: "Draft", value: contractCounts.draft, color: "bg-slate-300" },
                    { label: "Sold", value: contractCounts.sold, color: "bg-blue-500" },
                    { label: "Remitted", value: contractCounts.remitted, color: "bg-emerald-500" },
                    { label: "Paid", value: contractCounts.paid, color: "bg-amber-500" },
                  ] as const;
                  return rows.map((r) => (
                    <div key={r.label} className="grid grid-cols-12 gap-3 items-center">
                      <div className="col-span-3 text-sm text-muted-foreground">{r.label}</div>
                      <div className="col-span-7">
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className={"h-full rounded-full " + r.color} style={{ width: `${(r.value / total) * 100}%` }} />
                        </div>
                      </div>
                      <div className="col-span-2 text-sm font-semibold text-foreground text-right">{r.value}</div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
