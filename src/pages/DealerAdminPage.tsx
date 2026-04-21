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
  ArrowRight,
  TrendingDown,
  Receipt,
  PieChart,
  Activity,
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

function formatCompact(num: number) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
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

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const displayName = user.email?.split("@")[0] ?? "Admin";

  return (
    <PageShell
      title=""
      subtitle=""
    >
      <div className="space-y-6">
        {/* Welcome Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">{today}</p>
            <h1 className="text-2xl font-bold text-slate-900">
              Welcome back, <span className="capitalize">{displayName}</span>
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Here's an overview of your dealership performance.</p>
          </div>
          <Link
            to="/dealer-marketplace"
            className="inline-flex items-center gap-2 rounded-full bg-yellow-400 px-5 py-2.5 text-sm font-semibold text-black hover:bg-yellow-300 transition-colors self-start sm:self-auto"
          >
            <Store className="w-4 h-4" />
            Find Products
          </Link>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-2xl border bg-white shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between gap-3">
                <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-600">
                  <FileText className="w-5 h-5" />
                </div>
                <span className="text-xs text-muted-foreground font-medium">Total</span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold">{contractCounts.total}</div>
                <div className="text-xs text-muted-foreground mt-1">Contracts Created</div>
              </div>
            </div>

            <div className="rounded-2xl border bg-white shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <span className="text-xs text-muted-foreground font-medium">Sold</span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold">{contractCounts.sold}</div>
                <div className="text-xs text-muted-foreground mt-1">Active Contracts</div>
              </div>
            </div>

            <div className="rounded-2xl border bg-white shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600">
                  <Hourglass className="w-5 h-5" />
                </div>
                <span className="text-xs text-muted-foreground font-medium">Pending</span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold">{contractCounts.draft}</div>
                <div className="text-xs text-muted-foreground mt-1">Draft Contracts</div>
              </div>
            </div>

            <div className="rounded-2xl border bg-white shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between gap-3">
                <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-600">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <span className="text-xs text-muted-foreground font-medium">Revenue</span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold">{formatCompact(totalSalesCents / 100)}</div>
                <div className="text-xs text-muted-foreground mt-1">Total Sales</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-2xl border bg-white shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600">
                  <TrendingDown className="w-5 h-5" />
                </div>
                <span className="text-xs text-muted-foreground font-medium">Outstanding</span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold">{money(outstandingCents)}</div>
                <div className="text-xs text-muted-foreground mt-1">Pending Payment</div>
              </div>
            </div>

            <div className="rounded-2xl border bg-white shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600">
                  <Receipt className="w-5 h-5" />
                </div>
                <span className="text-xs text-muted-foreground font-medium">Remitted</span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold">{contractCounts.remitted}</div>
                <div className="text-xs text-muted-foreground mt-1">Submitted Batches</div>
              </div>
            </div>

            <div className="rounded-2xl border bg-white shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between gap-3">
                <div className="p-2.5 rounded-xl bg-slate-500/10 text-slate-600">
                  <DollarSign className="w-5 h-5" />
                </div>
                <span className="text-xs text-muted-foreground font-medium">Average</span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold">{money(avgContractCents)}</div>
                <div className="text-xs text-muted-foreground mt-1">Per Contract</div>
              </div>
            </div>

            <div className="rounded-2xl border bg-white shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600">
                  <Package className="w-5 h-5" />
                </div>
                <span className="text-xs text-muted-foreground font-medium">Top Product</span>
              </div>
              <div className="mt-3">
                <div className="text-lg font-bold truncate" title={topProduct?.name ?? "—"}>
                  {topProduct?.name ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {topProduct ? `${topProduct.sold} sold` : "No sales yet"}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 rounded-2xl border bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-500/5 via-transparent to-transparent">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold">Sales Trend</div>
                    <div className="text-xs text-muted-foreground">Contracts sold over the last 6 months</div>
                  </div>
                </div>
              </div>

              <div className="p-6">
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

            <div className="lg:col-span-4 rounded-2xl border bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-violet-500/5 via-transparent to-transparent">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-violet-500/10 text-violet-600">
                    <PieChart className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold">Quick Actions</div>
                    <div className="text-xs text-muted-foreground">Common tasks</div>
                  </div>
                </div>
              </div>
              <div className="p-4 space-y-2">
                <Link
                  to="/dealer-contracts"
                  className="flex items-center gap-4 p-4 rounded-xl border bg-slate-50 hover:bg-slate-100 transition-colors group"
                >
                  <div className="p-2 rounded-lg bg-sky-500/10 text-sky-600 group-hover:bg-sky-500/20 transition-colors">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">Contracts</div>
                    <div className="text-xs text-muted-foreground">View and manage</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </Link>

                <Link
                  to="/dealer-marketplace"
                  className="flex items-center gap-4 p-4 rounded-xl border bg-slate-50 hover:bg-slate-100 transition-colors group"
                >
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-500/20 transition-colors">
                    <Store className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">Find Products</div>
                    <div className="text-xs text-muted-foreground">Browse products</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </Link>

                <Link
                  to="/dealer-team"
                  className="flex items-center gap-4 p-4 rounded-xl border bg-slate-50 hover:bg-slate-100 transition-colors group"
                >
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 group-hover:bg-amber-500/20 transition-colors">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">Team</div>
                    <div className="text-xs text-muted-foreground">Manage employees</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </Link>

                <Link
                  to="/dealer-remittances"
                  className="flex items-center gap-4 p-4 rounded-xl border bg-slate-50 hover:bg-slate-100 transition-colors group"
                >
                  <div className="p-2 rounded-lg bg-violet-500/10 text-violet-600 group-hover:bg-violet-500/20 transition-colors">
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">Remittances</div>
                    <div className="text-xs text-muted-foreground">View batches</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>

            <div className="lg:col-span-6 rounded-2xl border bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold">Top Products</div>
                    <div className="text-xs text-muted-foreground">By revenue generated</div>
                  </div>
                </div>
              </div>
              <div className="divide-y">
                {productPerformance.slice(0, 5).map((row, index) => (
                  <div key={row.productId} className="px-6 py-4 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-bold text-muted-foreground">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{row.name}</div>
                      <div className="text-xs text-muted-foreground">{row.sold} sold</div>
                    </div>
                    <div className="text-sm font-semibold">{money(row.revenueCents)}</div>
                  </div>
                ))}
                {!isLoading && productPerformance.length === 0 && (
                  <div className="px-6 py-12 text-center">
                    <div className="text-sm text-muted-foreground">No product sales yet</div>
                  </div>
                )}
                {isLoading && (
                  <div className="px-6 py-6 space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />
                    ))}
                  </div>
                )}
                {isError && (
                  <div className="px-6 py-6 text-center text-sm text-destructive">Failed to load data</div>
                )}
              </div>
            </div>

            <div className="lg:col-span-6 rounded-2xl border bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-500/5 via-transparent to-transparent">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold">Top Performers</div>
                    <div className="text-xs text-muted-foreground">By revenue generated</div>
                  </div>
                </div>
              </div>
              <div className="divide-y">
                {employeePerformance.slice(0, 5).map((row, index) => (
                  <div key={row.email} className="px-6 py-4 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-bold text-muted-foreground">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{row.email}</div>
                      <div className="text-xs text-muted-foreground">{row.sold} contracts sold</div>
                    </div>
                    <div className="text-sm font-semibold">{money(row.revenueCents)}</div>
                  </div>
                ))}
                {!isLoading && employeePerformance.length === 0 && (
                  <div className="px-6 py-12 text-center">
                    <div className="text-sm text-muted-foreground">No employee sales yet</div>
                  </div>
                )}
                {isLoading && (
                  <div className="px-6 py-6 space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />
                    ))}
                  </div>
                )}
                {isError && (
                  <div className="px-6 py-6 text-center text-sm text-destructive">Failed to load data</div>
                )}
              </div>
            </div>

            <div className="lg:col-span-12 rounded-2xl border bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-violet-500/5 via-transparent to-transparent">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-violet-500/10 text-violet-600">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold">Contract Pipeline</div>
                    <div className="text-xs text-muted-foreground">Distribution across all stages</div>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {(() => {
                    const total = Math.max(1, contractCounts.total);
                    const rows = [
                      { label: "Draft", value: contractCounts.draft, color: "bg-slate-400" },
                      { label: "Sold", value: contractCounts.sold, color: "bg-blue-500" },
                      { label: "Remitted", value: contractCounts.remitted, color: "bg-emerald-500" },
                      { label: "Paid", value: contractCounts.paid, color: "bg-amber-500" },
                    ] as const;
                    return (
                      <>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-muted-foreground w-20">Total</span>
                          <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden flex">
                            {rows.map((r) => (
                              <div
                                key={r.label}
                                className={`${r.color} transition-all`}
                                style={{ width: `${(r.value / total) * 100}%` }}
                              />
                            ))}
                          </div>
                          <span className="font-semibold w-12 text-right">{contractCounts.total}</span>
                        </div>
                        {rows.map((r) => (
                          <div key={r.label} className="flex items-center gap-4">
                            <div className="flex items-center gap-2 w-20">
                              <div className={`w-3 h-3 rounded-full ${r.color}`} />
                              <span className="text-sm text-muted-foreground">{r.label}</span>
                            </div>
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div className={`${r.color} h-full rounded-full transition-all`} style={{ width: `${(r.value / total) * 100}%` }} />
                            </div>
                            <span className="text-sm font-medium w-12 text-right">{r.value}</span>
                            <span className="text-xs text-muted-foreground w-12">{((r.value / total) * 100).toFixed(0)}%</span>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

