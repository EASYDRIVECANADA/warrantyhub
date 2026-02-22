import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { costFromProductOrPricing, retailFromCost } from "../lib/dealerPricing";
import { useDealerMarkupPct } from "../lib/dealerMarkup";
import { getProductPricingApi } from "../lib/productPricing/productPricing";
import { isPricingEligibleForVehicle } from "../lib/productPricing/eligibility";
import type { ProductPricing } from "../lib/productPricing/types";
import { getAppMode } from "../lib/runtime";
import { getMarketplaceApi } from "../lib/marketplace/marketplace";
import type { Product, ProductType } from "../lib/products/types";
import { getProvidersApi } from "../lib/providers/providers";
import type { ProviderPublic } from "../lib/providers/types";
import { decodeVin, type VinDecoded } from "../lib/vin/decodeVin";
import { alertMissing, confirmProceed, sanitizeDigitsOnly } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";

function productTypeLabel(t: string) {
  if (t === "EXTENDED_WARRANTY") return "Extended Warranty";
  if (t === "TIRE_RIM") return "Tire & Rim";
  if (t === "APPEARANCE") return "Appearance";
  if (t === "GAP") return "GAP";
  return "Other";
}

function providerLabel(id: string) {
  const trimmed = id.trim();
  if (!trimmed) return "—";
  return `Provider ${trimmed.slice(0, 8)}`;
}

function providerDisplayName(p: ProviderPublic | undefined, id: string) {
  const company = (p?.companyName ?? "").trim();
  if (company) return company;
  const display = (p?.displayName ?? "").trim();
  if (display) return display;
  return providerLabel(id);
}

function money(cents?: number) {
  if (typeof cents !== "number") return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function termLabel(p: Product) {
  const months = typeof p.termMonths === "number" ? `${p.termMonths} mo` : "—";
  const km = typeof p.termKm === "number" ? `${p.termKm} km` : "—";
  return `${months} / ${km}`;
}

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function clampSelection(ids: string[], max: number) {
  if (ids.length <= max) return ids;
  return ids.slice(0, max);
}

function pricingOptionLabel(r: ProductPricing) {
  const limit = typeof r.claimLimitCents === "number" ? `$${(r.claimLimitCents / 100).toFixed(2)}` : "—";
  const deductible = typeof r.deductibleCents === "number" ? `$${(r.deductibleCents / 100).toFixed(2)}` : "—";
  const months = r.termMonths === null ? "Unlimited" : `${r.termMonths} mo`;
  const km = r.termKm === null ? "Unlimited" : `${r.termKm.toLocaleString()} km`;
  return `${months} / ${km} • Ded ${deductible} • Limit ${limit}`;
}

export function DealerComparisonPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const api = useMemo(() => getMarketplaceApi(), []);
  const providersApi = useMemo(() => getProvidersApi(), []);
  const productPricingApi = useMemo(() => getProductPricingApi(), []);
  const { user } = useAuth();
  const mode = useMemo(() => getAppMode(), []);

  const dealerId = (mode === "local" ? (user?.dealerId ?? user?.id ?? "") : user?.dealerId ?? "").trim();
  const { markupPct } = useDealerMarkupPct(dealerId);
  const [vin, setVin] = useState(() => (searchParams.get("vin") ?? ""));
  const [decoded, setDecoded] = useState<VinDecoded | null>(null);
  const [mileageKm, setMileageKm] = useState(() => (searchParams.get("mileageKm") ?? ""));
  const [vehicleClass] = useState("");
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [providerId, setProviderId] = useState("");
  const [productType, setProductType] = useState("");
  const [priceSort, setPriceSort] = useState<string>("");

  const productsQuery = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: () => api.listPublishedProducts(),
  });

  const products = (productsQuery.data ?? []) as Product[];

  const providerOptions = Array.from(new Set(products.map((p) => p.providerId).filter(Boolean))).sort();
  const productTypeOptions = Array.from(new Set(products.map((p) => p.productType))).sort();

  const providersQuery = useQuery({
    queryKey: ["providers", providerOptions.join(",")],
    queryFn: () => providersApi.listByIds(providerOptions),
    enabled: providerOptions.length > 0,
  });

  const providerById = new Map(((providersQuery.data ?? []) as ProviderPublic[]).map((p) => [p.id, p] as const));

  const decodeMutation = useMutation({
    mutationFn: (v: string) => decodeVin(v),
    onSuccess: (d) => {
      setDecoded(d);
      setVin(d.vin);
      setDecodeError(null);
      setSelectedIds([]);

      const next = new URLSearchParams(searchParams);
      next.set("vin", d.vin);
      setSearchParams(next, { replace: true });
    },
    onError: (err) => {
      setDecodeError(err instanceof Error ? err.message : "VIN decode failed");
    },
  });

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const v = vin.trim();
    const m = mileageKm.trim();

    if (v) next.set("vin", v);
    else next.delete("vin");

    if (m) next.set("mileageKm", m);
    else next.delete("mileageKm");

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [mileageKm, searchParams, setSearchParams, vin]);

  useEffect(() => {
    if (decoded) return;
    if (!vin.trim()) return;
    if (decodeMutation.isPending) return;
    void decodeMutation.mutateAsync(vin.trim());
  }, [decoded, decodeMutation, vin]);

  const parsedVehicleYear = Number(decoded?.vehicleYear);
  const vehicleAgeYears = Number.isFinite(parsedVehicleYear) ? new Date().getFullYear() - parsedVehicleYear : undefined;
  const parsedMileage = (() => {
    const raw = mileageKm.trim();
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  })();

  const eligible = (p: Product) => {
    if (!decoded) return false;

    const eligibleByAge =
      typeof p.eligibilityMaxVehicleAgeYears !== "number"
        ? true
        : typeof vehicleAgeYears === "number"
          ? vehicleAgeYears <= p.eligibilityMaxVehicleAgeYears
          : false;

    const eligibleByMileage =
      typeof p.eligibilityMaxMileageKm !== "number"
        ? true
        : typeof parsedMileage === "number"
          ? parsedMileage <= p.eligibilityMaxMileageKm
          : false;

    const eligibleByVehicle = (() => {
      const makeAllow = (p.eligibilityMakeAllowlist ?? []).map((x) => norm(x)).filter(Boolean);
      const modelAllow = (p.eligibilityModelAllowlist ?? []).map((x) => norm(x)).filter(Boolean);
      const trimAllow = (p.eligibilityTrimAllowlist ?? []).map((x) => norm(x)).filter(Boolean);

      const vMake = norm(decoded.vehicleMake ?? "");
      const vModel = norm(decoded.vehicleModel ?? "");
      const vTrim = norm(decoded.vehicleTrim ?? "");

      if (makeAllow.length > 0 && (!vMake || !makeAllow.includes(vMake))) return false;
      if (modelAllow.length > 0 && (!vModel || !modelAllow.includes(vModel))) return false;

      if (trimAllow.length > 0) {
        if (!vTrim) return false;
        const ok = trimAllow.some((t) => vTrim.includes(t) || t.includes(vTrim));
        if (!ok) return false;
      }

      return true;
    })();

    return eligibleByAge && eligibleByMileage && eligibleByVehicle;
  };

  const filteredProducts = products
    .filter((p) => (!providerId.trim() ? true : p.providerId === providerId.trim()))
    .filter((p) => (!productType.trim() ? true : p.productType === (productType.trim() as ProductType)))
    .filter((p) => eligible(p));

  const shownRetailFor = (p: Product) => {
    const cost = costFromProductOrPricing({ dealerCostCents: p.dealerCostCents, basePriceCents: p.basePriceCents });
    return retailFromCost(cost, markupPct) ?? cost;
  };

  const sortedFilteredProducts = useMemo(() => {
    const sortDir = priceSort === "PRICE_ASC" ? 1 : priceSort === "PRICE_DESC" ? -1 : 0;
    if (!sortDir) return filteredProducts;
    return filteredProducts.slice().sort((a, b) => {
      const ap = shownRetailFor(a);
      const bp = shownRetailFor(b);
      const an = typeof ap === "number" ? ap : Number.MAX_SAFE_INTEGER;
      const bn = typeof bp === "number" ? bp : Number.MAX_SAFE_INTEGER;
      const diff = (an - bn) * sortDir;
      if (diff) return diff;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
  }, [filteredProducts, markupPct, priceSort]);

  const eligibleVariantByProductIdQuery = useQuery({
    queryKey: ["compare-eligible-variant-by-product", filteredProducts.map((p) => p.id).join(","), parsedMileage ?? "", vehicleClass],
    enabled: Boolean(decoded) && typeof parsedMileage === "number" && filteredProducts.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        filteredProducts.map(async (p) => {
          const rows = (await productPricingApi.list({ productId: p.id })) as ProductPricing[];
          const ok = rows.some((r) => isPricingEligibleForVehicle({ pricing: r, vehicleMileageKm: parsedMileage as number, vehicleClass }));
          return [p.id, ok] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, boolean>;
    },
  });

  const eligibleVariantByProductId = (eligibleVariantByProductIdQuery.data ?? {}) as Record<string, boolean>;

  const filteredProductsWithVariants = useMemo(() => {
    if (!decoded) return filteredProducts;
    if (typeof parsedMileage !== "number") return filteredProducts;
    return filteredProducts.filter((p) => eligibleVariantByProductId[p.id] === true);
  }, [decoded, eligibleVariantByProductId, filteredProducts, parsedMileage]);

  const shownProducts = useMemo(() => {
    if (!decoded) return sortedFilteredProducts;
    if (typeof parsedMileage !== "number") return sortedFilteredProducts;
    const sortDir = priceSort === "PRICE_ASC" ? 1 : priceSort === "PRICE_DESC" ? -1 : 0;
    if (!sortDir) return filteredProductsWithVariants;
    return filteredProductsWithVariants.slice().sort((a, b) => {
      const ap = shownRetailFor(a);
      const bp = shownRetailFor(b);
      const an = typeof ap === "number" ? ap : Number.MAX_SAFE_INTEGER;
      const bn = typeof bp === "number" ? bp : Number.MAX_SAFE_INTEGER;
      const diff = (an - bn) * sortDir;
      if (diff) return diff;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
  }, [decoded, filteredProductsWithVariants, priceSort, sortedFilteredProducts]);

  const selectedProducts = selectedIds
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean) as Product[];

  const pricingByProductIdQuery = useQuery({
    queryKey: ["compare-pricing", selectedProducts.map((p) => p.id).join(","), parsedMileage ?? "", vehicleClass],
    enabled: selectedProducts.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        selectedProducts.map(async (p) => {
          const rows = (await productPricingApi.list({ productId: p.id })) as ProductPricing[];
          const eligible = typeof parsedMileage === "number"
            ? rows.filter((r) => isPricingEligibleForVehicle({ pricing: r, vehicleMileageKm: parsedMileage, vehicleClass }))
            : rows;

          const sorted = eligible
            .slice()
            .sort((a, b) => {
              const am = a.termMonths ?? Number.MAX_SAFE_INTEGER;
              const bm = b.termMonths ?? Number.MAX_SAFE_INTEGER;
              const ak = a.termKm ?? Number.MAX_SAFE_INTEGER;
              const bk = b.termKm ?? Number.MAX_SAFE_INTEGER;
              return (am - bm) || (ak - bk) || (a.deductibleCents - b.deductibleCents);
            });
          return [p.id, sorted] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, ProductPricing[]>;
    },
  });

  const pricingByProductId = (pricingByProductIdQuery.data ?? {}) as Record<string, ProductPricing[]>;

  const [selectedPricingIdByProductId, setSelectedPricingIdByProductId] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelectedPricingIdByProductId((prev) => {
      const next: Record<string, string> = {};
      for (const p of selectedProducts) {
        const rows = pricingByProductId[p.id] ?? [];
        const prevSelected = prev[p.id];
        const exists = prevSelected ? rows.some((r) => r.id === prevSelected) : false;
        next[p.id] = exists ? prevSelected : (rows[0]?.id ?? "");
      }
      return next;
    });
  }, [pricingByProductId, selectedProducts]);

  const selectedPricingRowFor = (p: Product): ProductPricing | undefined => {
    const rows = pricingByProductId[p.id] ?? [];
    const selectedId = selectedPricingIdByProductId[p.id];
    return rows.find((r) => r.id === selectedId) ?? rows[0];
  };

  const selectedRetailByProductId = useMemo(() => {
    const map: Record<string, number | undefined> = {};
    for (const p of selectedProducts) {
      const rows = pricingByProductId[p.id] ?? [];
      const selectedId = selectedPricingIdByProductId[p.id];
      const selectedPricing = rows.find((r) => r.id === selectedId) ?? rows[0];
      const cost = costFromProductOrPricing({
        dealerCostCents: selectedPricing?.dealerCostCents ?? p.dealerCostCents,
        basePriceCents: selectedPricing?.basePriceCents ?? p.basePriceCents,
      });
      map[p.id] = retailFromCost(cost, markupPct) ?? cost;
    }
    return map;
  }, [markupPct, pricingByProductId, selectedPricingIdByProductId, selectedProducts]);

  const minSelectedRetail = useMemo(() => {
    const values = selectedProducts
      .map((p) => selectedRetailByProductId[p.id])
      .filter((n): n is number => typeof n === "number");
    return values.length > 0 ? Math.min(...values) : undefined;
  }, [selectedProducts, selectedRetailByProductId]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((x) => x !== id) : [...prev, id];
      return clampSelection(next, 4);
    });
  };

  return (
    <PageShell
      title="Compare Plans"
      actions={
        <Link
          className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          to={(() => {
            const params = new URLSearchParams();
            if (vin.trim()) params.set("vin", vin.trim());
            if (mileageKm.trim()) params.set("mileageKm", mileageKm.trim());
            const qs = params.toString();
            return `/dealer-marketplace${qs ? `?${qs}` : ""}`;
          })()}
        >
          Back to Find Products
        </Link>
      }
    >
      <div className="relative">
        <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-blue-600/10 via-transparent to-yellow-400/10 blur-2xl" />

        <div className="rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
          <div className="px-6 py-4 border-b flex items-start justify-between gap-4 flex-wrap bg-gradient-to-r from-blue-600/10 to-yellow-500/10">
            <div>
              <div className="font-semibold">Step 1: Enter VIN</div>
            </div>
            <Button
              className="bg-yellow-400 text-black hover:bg-yellow-300"
              onClick={() => {
                void (async () => {
                  setDecodeError(null);
                  const v = vin.trim();
                  if (!v) return alertMissing("VIN is required.");
                  if (!(await confirmProceed("Decode VIN?"))) return;
                  decodeMutation.mutate(v);
                })();
              }}
              disabled={decodeMutation.isPending}
            >
              Decode VIN
            </Button>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-5">
              <div className="text-xs text-muted-foreground mb-1">VIN</div>
              <Input value={vin} onChange={(e) => setVin(e.target.value)} placeholder="VIN (17 characters)" />
              <div className="text-[11px] text-muted-foreground mt-2">Enter a VIN to view eligible plans.</div>
            </div>
            <div className="md:col-span-2">
              <div className="text-xs text-muted-foreground mb-1">Mileage</div>
              <Input
                value={mileageKm}
                onChange={(e) => setMileageKm(sanitizeDigitsOnly(e.target.value))}
                placeholder="e.g. 85000"
                inputMode="numeric"
                disabled={!decoded}
              />
            </div>

            <div className="md:col-span-2">
              <div className="text-xs text-muted-foreground mb-1">Provider</div>
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-sm"
                disabled={!decoded}
              >
                <option value="">All providers</option>
                {providerOptions.map((pid) => (
                  <option key={pid} value={pid}>
                    {providerDisplayName(providerById.get(pid), pid)}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <div className="text-xs text-muted-foreground mb-1">Product type</div>
              <select
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-sm"
                disabled={!decoded}
              >
                <option value="">All product types</option>
                {productTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    {productTypeLabel(t)}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-1">
              <div className="text-xs text-muted-foreground mb-1">Sort</div>
              <select
                value={priceSort}
                onChange={(e) => setPriceSort(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-sm"
                disabled={!decoded}
              >
                <option value="">Price</option>
                <option value="PRICE_ASC">Low</option>
                <option value="PRICE_DESC">High</option>
              </select>
            </div>
          </div>

          {decodeError ? <div className="px-6 pb-6 text-sm text-destructive">{decodeError}</div> : null}
        </div>

        <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-yellow-500/10">
          <div className="px-6 py-4 border-b flex items-start justify-between gap-4 flex-wrap bg-gradient-to-r from-yellow-500/10 to-blue-600/10">
            <div>
              <div className="font-semibold">Eligible Plans</div>
              <div className="text-sm text-muted-foreground mt-1">Select up to 4 plans to compare.</div>
            </div>
            <div className="inline-flex items-center rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground">
              {selectedProducts.length} selected
            </div>
          </div>

          <div className="p-6">
            {!decoded ? <div className="text-sm text-muted-foreground">Decode VIN to show eligible plans.</div> : null}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {shownProducts.map((p) => {
                const selected = selectedIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      toggleSelect(p.id);
                    }}
                    className={
                      "group text-left rounded-xl border p-3 shadow-sm transition-colors hover:bg-muted/40 " +
                      (selected
                        ? "border-blue-500/40 ring-2 ring-blue-500/20 bg-gradient-to-br from-blue-600/5 via-transparent to-yellow-400/10"
                        : "bg-background")
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-[13px] leading-tight text-foreground">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          {providerDisplayName(providerById.get(p.providerId), p.providerId)} • {productTypeLabel(p.productType)}
                        </div>
                      </div>
                      {(() => {
                        const cost = costFromProductOrPricing({ dealerCostCents: p.dealerCostCents, basePriceCents: p.basePriceCents });
                        const retail = retailFromCost(cost, markupPct) ?? cost;
                        return (
                          <div className="text-right">
                            <div className="inline-flex items-center justify-end gap-2">
                              <div className="text-sm font-semibold">{money(retail)}</div>
                              {selected ? (
                                <span className="inline-flex items-center rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                                  Selected
                                </span>
                              ) : null}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-2">{termLabel(p)}</div>
                  </button>
                );
              })}

              {productsQuery.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
              {productsQuery.isError ? <div className="text-sm text-destructive">Failed to load products.</div> : null}
              {!productsQuery.isLoading && !productsQuery.isError && products.length === 0 ? (
                <div className="text-sm text-muted-foreground">No published products yet.</div>
              ) : null}
              {!productsQuery.isLoading && !productsQuery.isError && decoded && filteredProductsWithVariants.length === 0 ? (
                <div className="text-sm text-muted-foreground">No eligible plans for this vehicle.</div>
              ) : null}
            </div>

            {selectedProducts.length > 0 ? (
              <div className="mt-6 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
                <div className="px-6 py-4 border-b flex items-start justify-between gap-4 flex-wrap bg-gradient-to-r from-blue-600/10 via-transparent to-yellow-500/10">
                  <div>
                    <div className="font-semibold">Selected plans & options</div>
                    <div className="text-sm text-muted-foreground mt-1">Pick the exact pricing option (term/km/deductible/claim limit) to compare.</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{selectedProducts.length} selected</div>
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {selectedProducts.map((p) => {
                    const rows = pricingByProductId[p.id] ?? [];
                    const selectedPricing = selectedPricingRowFor(p);
                    const retail = selectedRetailByProductId[p.id];
                    return (
                      <div
                        key={p.id}
                        className="rounded-2xl border bg-background p-4 shadow-sm ring-1 ring-blue-500/5 transition-shadow hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground truncate leading-tight">{p.name}</div>
                            <div className="text-[11px] text-muted-foreground mt-1 truncate">
                              {providerDisplayName(providerById.get(p.providerId), p.providerId)} • {productTypeLabel(p.productType)}
                            </div>
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-2">
                            <div className="inline-flex items-center rounded-full border bg-muted/30 px-2.5 py-1 text-xs font-semibold text-foreground whitespace-nowrap">
                              {money(retail)}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleSelect(p.id)}
                              className="h-8 px-2 text-xs"
                            >
                              Remove
                            </Button>
                          </div>
                        </div>

                        {rows.length > 0 ? (
                          <div className="mt-3">
                            <div className="text-[11px] text-muted-foreground mb-1">Pricing option</div>
                            <select
                              value={selectedPricingIdByProductId[p.id] ?? ""}
                              onChange={(e) => setSelectedPricingIdByProductId((s) => ({ ...s, [p.id]: e.target.value }))}
                              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-sm"
                            >
                              {rows.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {pricingOptionLabel(r)}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div className="mt-3 text-xs text-muted-foreground">No eligible pricing rows found for this plan.</div>
                        )}

                        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-xl border bg-muted/10 p-3">
                            <div className="text-[11px] text-muted-foreground">Term</div>
                            <div className="font-semibold text-foreground mt-1">
                              {selectedPricing
                                ? `${selectedPricing.termMonths === null ? "Unlimited" : `${selectedPricing.termMonths} mo`} / ${selectedPricing.termKm === null ? "Unlimited" : `${selectedPricing.termKm.toLocaleString()} km`}`
                                : termLabel(p)}
                            </div>
                          </div>
                          <div className="rounded-xl border bg-muted/10 p-3">
                            <div className="text-[11px] text-muted-foreground">Deductible</div>
                            <div className="font-semibold text-foreground mt-1">{money(selectedPricing?.deductibleCents ?? p.deductibleCents)}</div>
                          </div>
                          <div className="rounded-xl border bg-muted/10 p-3 col-span-2">
                            <div className="text-[11px] text-muted-foreground">Claim limit</div>
                            <div className="font-semibold text-foreground mt-1">{money(selectedPricing?.claimLimitCents)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-10 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
          <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap bg-gradient-to-r from-blue-600/10 via-transparent to-yellow-500/10">
            <div>
              <div className="font-semibold">Decision Table</div>
              <div className="text-sm text-muted-foreground mt-1">Clear, persuasive, and easy to walk through.</div>
            </div>
            <div className="text-sm text-muted-foreground">{selectedProducts.length} selected</div>
          </div>

          {selectedProducts.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">Select at least 1 plan above to compare.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-6 py-3 text-xs text-muted-foreground w-[220px] sticky left-0 bg-muted/30">Criteria</th>
                    {selectedProducts.map((p) => (
                      <th key={p.id} className="text-left px-6 py-3">
                        <div className="font-medium text-foreground">{p.name}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {providerDisplayName(providerById.get(p.providerId), p.providerId)} • {productTypeLabel(p.productType)}
                        </div>
                        {(() => {
                          const selectedPricing = selectedPricingRowFor(p);
                          if (!selectedPricing) return null;
                          return (
                            <div className="text-[11px] text-muted-foreground mt-2 truncate">
                              Option: {pricingOptionLabel(selectedPricing)}
                            </div>
                          );
                        })()}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y">
                  <tr className="odd:bg-muted/20">
                    <td className="px-6 py-4 font-medium sticky left-0 bg-background">Price</td>
                    {selectedProducts.map((p) => (
                      <td
                        key={p.id}
                        className={
                          "px-6 py-4 font-medium " +
                          (typeof minSelectedRetail === "number" && selectedRetailByProductId[p.id] === minSelectedRetail
                            ? "text-foreground"
                            : "text-foreground")
                        }
                      >
                        {(() => {
                          const retail = selectedRetailByProductId[p.id];
                          return (
                            <div className="inline-flex items-center gap-2">
                              <span>{money(retail)}</span>
                              {typeof minSelectedRetail === "number" && retail === minSelectedRetail ? (
                                <span className="inline-flex items-center rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                                  Best price
                                </span>
                              ) : null}
                            </div>
                          );
                        })()}
                      </td>
                    ))}
                  </tr>

                  <tr className="odd:bg-muted/20">
                    <td className="px-6 py-4 font-medium sticky left-0 bg-background">Deductible</td>
                    {selectedProducts.map((p) => (
                      <td key={p.id} className="px-6 py-4">{(() => {
                        const selectedPricing = selectedPricingRowFor(p);
                        return money(selectedPricing?.deductibleCents ?? p.deductibleCents);
                      })()}</td>
                    ))}
                  </tr>

                  <tr className="odd:bg-muted/20">
                    <td className="px-6 py-4 font-medium sticky left-0 bg-background">Term</td>
                    {selectedProducts.map((p) => (
                      <td key={p.id} className="px-6 py-4">{(() => {
                        const selectedPricing = selectedPricingRowFor(p);
                        if (!selectedPricing) return termLabel(p);
                        return `${selectedPricing.termMonths} mo / ${selectedPricing.termKm} km`;
                      })()}</td>
                    ))}
                  </tr>

                  <tr className="odd:bg-muted/20">
                    <td className="px-6 py-4 font-medium sticky left-0 bg-background">Claim limit</td>
                    {selectedProducts.map((p) => (
                      <td key={p.id} className="px-6 py-4">{(() => {
                        const selectedPricing = selectedPricingRowFor(p);
                        return money(selectedPricing?.claimLimitCents);
                      })()}</td>
                    ))}
                  </tr>

                  <tr className="odd:bg-muted/20">
                    <td className="px-6 py-4 font-medium sticky left-0 bg-background">Coverage</td>
                    {selectedProducts.map((p) => (
                      <td key={p.id} className="px-6 py-4 text-muted-foreground whitespace-pre-wrap">
                        {p.coverageDetails?.trim() ? p.coverageDetails : "—"}
                      </td>
                    ))}
                  </tr>

                  <tr className="odd:bg-muted/20">
                    <td className="px-6 py-4 font-medium sticky left-0 bg-background">Exclusions</td>
                    {selectedProducts.map((p) => (
                      <td key={p.id} className="px-6 py-4 text-muted-foreground whitespace-pre-wrap">
                        {p.exclusions?.trim() ? p.exclusions : "—"}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
