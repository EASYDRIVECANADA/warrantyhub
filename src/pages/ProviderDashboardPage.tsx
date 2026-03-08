import { Link } from "react-router-dom";
import { FileText, Package, Users } from "lucide-react";
import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { PageShell } from "../components/PageShell";
import { getContractsApi } from "../lib/contracts/contracts";
import type { Contract } from "../lib/contracts/types";
import { getProductsApi } from "../lib/products/products";
import type { Product } from "../lib/products/types";
import { useAuth } from "../providers/AuthProvider";
import { getProductPricingApi } from "../lib/productPricing/productPricing";
import type { ProductPricing } from "../lib/productPricing/types";
import { defaultPricingRow } from "../lib/productPricing/defaultRow";

type SummaryCard = {
  title: string;
  value: string;
  subtitle?: string;
  icon: "products" | "contracts" | "dealers";
};

function iconForSummary(kind: SummaryCard["icon"]) {
  if (kind === "products") return Package;
  if (kind === "contracts") return FileText;
  return Users;
}

function accentForSummary(kind: SummaryCard["icon"]) {
  if (kind === "products") {
    return {
      ring: "ring-sky-500/15",
      iconWrap: "bg-gradient-to-br from-sky-500/20 to-indigo-500/15 border-sky-500/20 text-sky-700",
    };
  }
  if (kind === "contracts") {
    return {
      ring: "ring-amber-500/15",
      iconWrap: "bg-gradient-to-br from-amber-500/25 to-orange-500/15 border-amber-500/25 text-amber-700",
    };
  }
  return {
    ring: "ring-emerald-500/15",
    iconWrap: "bg-gradient-to-br from-emerald-500/20 to-cyan-500/15 border-emerald-500/20 text-emerald-700",
  };
}

function dealerLabelFromContract(c: Contract) {
  const created = (c.createdByEmail ?? "").trim();
  if (created) return created;
  const sold = (c.soldByEmail ?? "").trim();
  if (sold) return sold;
  return "";
}

function monthKey(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  const mm = Number(m);
  if (!y || !Number.isFinite(mm)) return key;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Math.max(0, Math.min(11, mm - 1))]} ${y}`;
}

function pricingUniqKey(r: {
  termMonths: number | null;
  termKm: number | null;
  vehicleMileageMinKm?: number;
  vehicleMileageMaxKm?: number | null;
  vehicleClass?: string;
  deductibleCents: number;
  claimLimitCents?: number;
}) {
  const termMonths = r.termMonths;
  const termKm = r.termKm;
  const mileageMin = typeof r.vehicleMileageMinKm === "number" ? r.vehicleMileageMinKm : null;
  const mileageMax = r.vehicleMileageMaxKm === null ? null : typeof r.vehicleMileageMaxKm === "number" ? r.vehicleMileageMaxKm : null;
  const vehicleClass = typeof r.vehicleClass === "string" && r.vehicleClass.trim() ? r.vehicleClass.trim() : null;
  const claimLimit = typeof r.claimLimitCents === "number" ? r.claimLimitCents : null;
  return JSON.stringify([termMonths, termKm, mileageMin, mileageMax, vehicleClass, r.deductibleCents, claimLimit]);
}

function validatePricingHealth(rows: ProductPricing[]) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, reason: "Missing pricing", primary: null as ProductPricing | null };
  }

  const defaults = rows.filter((r) => r.isDefault);
  if (defaults.length !== 1) {
    return { ok: false, reason: "Default row not set", primary: defaultPricingRow(rows) };
  }

  const seen = new Set<string>();
  for (const r of rows) {
    const key = pricingUniqKey(r);
    if (seen.has(key)) {
      return { ok: false, reason: "Duplicate rows", primary: defaultPricingRow(rows) };
    }
    seen.add(key);
  }

  return { ok: true, reason: null as string | null, primary: defaults[0] ?? defaultPricingRow(rows) };
}

export function ProviderDashboardPage() {
  const { user } = useAuth();
  const productsApi = useMemo(() => getProductsApi(), []);
  const contractsApi = useMemo(() => getContractsApi(), []);
  const pricingApi = useMemo(() => getProductPricingApi(), []);

  const productsQuery = useQuery({
    queryKey: ["provider-products"],
    queryFn: () => productsApi.list(),
  });

  const contractsQuery = useQuery({
    queryKey: ["provider-contracts"],
    queryFn: () => contractsApi.list(),
  });

  const products = (productsQuery.data ?? []) as Product[];
  const publishedCount = products.filter((p) => p.published).length;
  const draftCount = products.filter((p) => !p.published).length;

  const pricingHealthProductIds = useMemo(() => {
    return products
      .map((p) => (p.id ?? "").trim())
      .filter(Boolean);
  }, [products]);

  const pricingHealthQueries = useQueries({
    queries: pricingHealthProductIds.map((productId) => ({
      queryKey: ["provider-dashboard-pricing-health", productId],
      queryFn: () => pricingApi.list({ productId }),
      staleTime: 15_000,
    })),
  });

  const pricingHealthByProductId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof validatePricingHealth>>();
    for (let i = 0; i < pricingHealthQueries.length; i += 1) {
      const q = pricingHealthQueries[i]!;
      const productId = pricingHealthProductIds[i] ?? "";
      if (!productId) continue;
      const rows = (q.data ?? []) as ProductPricing[];
      map.set(productId, validatePricingHealth(rows));
    }
    return map;
  }, [pricingHealthProductIds, pricingHealthQueries]);

  const publishedPricingIssuesCount = useMemo(() => {
    let n = 0;
    for (const p of products) {
      if (!p.published) continue;
      const h = pricingHealthByProductId.get(p.id);
      if (!h || !h.ok) n += 1;
    }
    return n;
  }, [pricingHealthByProductId, products]);

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p] as const)), [products]);

  const allContracts = (contractsQuery.data ?? []) as Contract[];
  const providerContracts = allContracts.filter((c) => {
    const pid = (c.providerId ?? "").trim();
    return Boolean(user?.id) && pid === user?.id;
  });

  const contractsSoldCount = providerContracts.filter((c) => c.status !== "DRAFT").length;

  const activeDealersCount = useMemo(() => {
    const set = new Set<string>();
    for (const c of providerContracts) {
      const label = dealerLabelFromContract(c);
      if (label) set.add(label.toLowerCase());
    }
    return set.size;
  }, [providerContracts]);

  const productPopularity = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of providerContracts) {
      const pid = (c.productId ?? "").trim();
      if (!pid) continue;
      counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }

    const items = Array.from(counts.entries())
      .map(([productId, count]) => {
        return {
          productId,
          count,
          name: productsById.get(productId)?.name ?? "Unknown product",
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return items;
  }, [productsById, providerContracts]);

  const contractTrend = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const c of providerContracts) {
      if (c.status === "DRAFT") continue;
      const key = monthKey(c.createdAt);
      if (!key) continue;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    const now = new Date();
    const keys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = monthKey(d.toISOString());
      if (k) keys.push(k);
    }

    return keys.map((k) => ({ key: k, label: monthLabel(k), value: buckets.get(k) ?? 0 }));
  }, [providerContracts]);

  const summaryCards: SummaryCard[] = [
    {
      title: "Products",
      value: `${products.length}`,
      subtitle: `${publishedCount} published • ${draftCount} draft${publishedPricingIssuesCount > 0 ? ` • ${publishedPricingIssuesCount} published w/ pricing issues` : ""}`,
      icon: "products",
    },
    {
      title: "Contracts",
      value: `${contractsSoldCount}`,
      subtitle: "Sold (read-only support view)",
      icon: "contracts",
    },
    {
      title: "Active Dealerships",
      value: `${activeDealersCount}`,
      subtitle: "Unique dealerships/users with contract activity",
      icon: "dealers",
    },
  ];

  return (
    <PageShell
      title=""
    >
      <div className="relative">
        <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-blue-600/10 via-transparent to-yellow-400/10 blur-2xl" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-9 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-fr">
              {summaryCards.map((c) => {
                const Icon = iconForSummary(c.icon);
                const a = accentForSummary(c.icon);
                return (
                  <div
                    key={c.title}
                    className={
                      "group rounded-2xl border bg-card shadow-card p-4 ring-1 transition-all hover:-translate-y-0.5 hover:shadow-md h-full overflow-hidden flex flex-col " +
                      a.ring
                    }
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-[13px] text-muted-foreground">{c.title}</div>
                      <div
                        className={
                          "shrink-0 h-10 w-10 rounded-2xl border ring-1 ring-white/30 flex items-center justify-center " +
                          a.iconWrap
                        }
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-foreground mt-3 leading-none break-all">{c.value}</div>
                    {c.subtitle ? (
                      <div className="text-[11px] text-muted-foreground mt-2 leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity">
                        {c.subtitle}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-yellow-500/10">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-yellow-500/10 to-blue-600/10 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-semibold">Product Popularity</div>
                  <div className="text-sm text-muted-foreground mt-1">Based on sold contracts (count only).</div>
                </div>
                <div className="text-sm text-muted-foreground">Top {Math.max(0, productPopularity.length)}</div>
              </div>
              <div className="px-6 py-6 space-y-3">
                {productPopularity.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No sold contracts yet.</div>
                ) : (
                  productPopularity.map((row) => {
                    const max = productPopularity[0]?.count ?? 1;
                    const pct = max > 0 ? Math.round((row.count / max) * 100) : 0;
                    return (
                      <div key={row.productId}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-foreground truncate">{row.name}</div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">{row.count}</div>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-2 bg-accent" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-600/10">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600/10 to-transparent">
                <div className="font-semibold">Contract Volume Trend</div>
                <div className="text-sm text-muted-foreground mt-1">Last 6 months (sold + remitted + paid).</div>
              </div>
              <div className="px-6 py-6">
                <div className="grid grid-cols-6 gap-3 items-end">
                  {contractTrend.map((p) => {
                    const max = Math.max(1, ...contractTrend.map((x) => x.value));
                    const h = Math.round((p.value / max) * 100);
                    return (
                      <div key={p.key} className="flex flex-col items-center gap-2">
                        <div className="w-full h-24 rounded-lg bg-muted overflow-hidden flex items-end">
                          <div className="w-full bg-accent" style={{ height: `${h}%` }} />
                        </div>
                        <div className="text-[11px] text-muted-foreground text-center leading-tight">{p.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-yellow-500/10">
            <div className="px-6 py-4 border-b bg-gradient-to-r from-yellow-500/10 to-blue-600/10 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="font-semibold">Next Steps</div>
                <div className="text-sm text-muted-foreground mt-1">Build your marketplace presence.</div>
              </div>
              <Button size="sm" variant="outline" asChild>
                <Link to="/provider-terms">Edit warranty terms</Link>
              </Button>
            </div>
            <div className="px-6 py-6 space-y-3 text-sm text-muted-foreground">
              <div>1. Create at least one product (coverage, terms, pricing, eligibility) and publish it when ready.</div>
              <div>2. Upload your company logo so dealers can identify your organization.</div>
              <div>3. Set your warranty terms and provider name so dealers see the correct info.</div>
            </div>
          </div>
          </div>

          <div className="lg:col-span-3 space-y-6">
          <div className="rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-600/10">
            <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600/10 to-transparent">
              <div className="font-semibold">Empty States</div>
              <div className="text-sm text-muted-foreground mt-1">Guidance for first-time setup.</div>
            </div>
            <div className="px-6 py-6 space-y-4">
              {productsQuery.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
              {productsQuery.isError ? <div className="text-sm text-destructive">Failed to load products.</div> : null}
              {!productsQuery.isLoading && !productsQuery.isError && products.length === 0 ? (
                <div className="rounded-xl border bg-background/40 p-4">
                  <div className="font-semibold">No products yet</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Create your first product to appear in dealer search and comparison.
                  </div>
                  <div className="mt-3">
                    <Button size="sm" asChild>
                      <Link to="/provider-products">Create product</Link>
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border bg-background/40 p-4">
                <div className="font-semibold">Add your logo</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Upload a logo so dealers recognize your brand when browsing products.
                </div>
                <div className="mt-3">
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/provider-documents">Upload logo</Link>
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border bg-background/40 p-4">
                <div className="font-semibold">Set warranty terms</div>
                <div className="text-sm text-muted-foreground mt-1">Set your provider name and the terms shown on printable contracts.</div>
                <div className="mt-3">
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/provider-terms">Edit warranty terms</Link>
                  </Button>
                </div>
              </div>

            </div>
          </div>

        </div>
        </div>
      </div>
    </PageShell>
  );
}
