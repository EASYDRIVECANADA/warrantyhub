import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { costFromProductOrPricing, retailFromCost } from "../lib/dealerPricing";
import { useDealerMarkupPct } from "../lib/dealerMarkup";
import { getMarketplaceApi } from "../lib/marketplace/marketplace";
import type { MarketplaceProduct } from "../lib/marketplace/api";
import { getProductPricingApi } from "../lib/productPricing/productPricing";
import type { ProductPricing } from "../lib/productPricing/types";
import { isPricingEligibleForVehicleWithConstraints } from "../lib/productPricing/eligibility";
import { defaultPricingRow } from "../lib/productPricing/defaultRow";
import type { Product, ProductType } from "../lib/products/types";
import { getProvidersApi } from "../lib/providers/providers";
import type { ProviderPublic } from "../lib/providers/types";
import { useAuth } from "../providers/AuthProvider";
import { decodeVin } from "../lib/vin/decodeVin";
import { getAppMode } from "../lib/runtime";

function productTypeLabel(t: ProductType) {
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

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseNum(v: string) {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function providerKey(p: Product) {
  return (p.providerId ?? "").trim() || "__unknown_provider__";
}

function accentForIndex(i: number) {
  const accents = [
    { header: "from-sky-500/15 to-indigo-500/15", ring: "ring-sky-500/10", border: "border-sky-500/20" },
    { header: "from-indigo-500/15 to-fuchsia-500/15", ring: "ring-indigo-500/10", border: "border-indigo-500/20" },
    { header: "from-emerald-500/15 to-cyan-500/15", ring: "ring-emerald-500/10", border: "border-emerald-500/20" },
    { header: "from-amber-500/15 to-orange-500/15", ring: "ring-amber-500/10", border: "border-amber-500/20" },
  ];
  return accents[i % accents.length];
}

export function DealerMarketplacePage() {
  const marketplaceApi = useMemo(() => getMarketplaceApi(), []);
  const providersApi = useMemo(() => getProvidersApi(), []);
  const productPricingApi = useMemo(() => getProductPricingApi(), []);
  const { user } = useAuth();
  const mode = useMemo(() => getAppMode(), []);

  const [vin, setVin] = useState("");
  const [mileageKm, setMileageKm] = useState("");
  const [vehicleClass, setVehicleClass] = useState("");
  const [decoded, setDecoded] = useState<Awaited<ReturnType<typeof decodeVin>> | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [providerId, setProviderId] = useState("");
  const [productType, setProductType] = useState<string>("");
  const [priceSort, setPriceSort] = useState<string>("");
  const [showVehicleDetails, setShowVehicleDetails] = useState(false);
  const [maxPrice, setMaxPrice] = useState("");
  const [maxYears, setMaxYears] = useState("");
  const [maxKm, setMaxKm] = useState("");
  const [minTermMonths, setMinTermMonths] = useState("");
  const [minTermKm, setMinTermKm] = useState("");
  const [maxDeductible, setMaxDeductible] = useState("");

  const dealerId = (mode === "local" ? (user?.dealerId ?? user?.id ?? "") : (user?.dealerId ?? "")).trim();
  const { markupPct } = useDealerMarkupPct(dealerId);

  const shownPriceFor = (p: MarketplaceProduct, primaryPricing?: ProductPricing | null) => {
    const cost = costFromProductOrPricing({
      dealerCostCents:
        primaryPricing && typeof primaryPricing.dealerCostCents === "number"
          ? primaryPricing.dealerCostCents
          : p.pricingDefault?.dealerCostCents ?? p.dealerCostCents,
      basePriceCents: primaryPricing ? primaryPricing.basePriceCents : p.pricingDefault?.basePriceCents ?? p.basePriceCents,
    });
    const retail = retailFromCost(cost, markupPct) ?? cost;
    return retail;
  };

  const decodeMutation = useMutation({
    mutationFn: (v: string) => decodeVin(v),
    onSuccess: (d) => {
      setDecoded(d);
      setVin(d.vin);
      setDecodeError(null);
    },
    onError: (err) => {
      setDecoded(null);
      setDecodeError(err instanceof Error ? err.message : "VIN decode failed");
    },
  });

  const resetVinSearch = () => {
    setVin("");
    setMileageKm("");
    setVehicleClass("");
    setDecoded(null);
    setDecodeError(null);
    setSearch("");
    setProviderId("");
    setProductType("");
    setPriceSort("");
    setMaxPrice("");
    setMaxYears("");
    setMaxKm("");
    setMinTermMonths("");
    setMinTermKm("");
    setMaxDeductible("");
  };

  const productsQuery = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: () => marketplaceApi.listPublishedProducts(),
  });

  const products = (productsQuery.data ?? []) as MarketplaceProduct[];

  const providerOptions = Array.from(new Set(products.map((p) => p.providerId).filter(Boolean))).sort();

  const providersQuery = useQuery({
    queryKey: ["providers", providerOptions.join(",")],
    queryFn: () => providersApi.listByIds(providerOptions),
    enabled: providerOptions.length > 0,
  });

  const providerById = new Map(((providersQuery.data ?? []) as ProviderPublic[]).map((p) => [p.id, p] as const));

  const q = norm(search);

  const parsedMileage = parseNum(mileageKm);
  const vehicleYear = parseNum(decoded?.vehicleYear ?? "");
  const vehicleAgeYears = typeof vehicleYear === "number" ? new Date().getFullYear() - vehicleYear : undefined;

  const eligibleByVehicle = (p: Product) => {
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

    const eligibleByAllowlists = (() => {
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

    return eligibleByAge && eligibleByMileage && eligibleByAllowlists;
  };

  const priceMaxCents = (() => {
    const n = parseNum(maxPrice);
    return typeof n === "number" ? Math.round(n * 100) : undefined;
  })();

  const minTermMonthsNum = parseNum(minTermMonths);
  const minTermKmNum = parseNum(minTermKm);
  const maxDeductibleCents = (() => {
    const n = parseNum(maxDeductible);
    return typeof n === "number" ? Math.round(n * 100) : undefined;
  })();

  const filtered = (decoded ? products.filter((p) => eligibleByVehicle(p)) : [])
    .filter((p) => (!providerId.trim() ? true : p.providerId === providerId.trim()))
    .filter((p) => (!productType.trim() ? true : p.productType === (productType.trim() as ProductType)))
    .filter((p) => {
      if (!q) return true;
      const hay = norm(`${p.name} ${p.coverageDetails ?? ""} ${p.exclusions ?? ""}`);
      return hay.includes(q);
    })
    .filter((p) => {
      const v = parseNum(maxYears);
      if (typeof v !== "number") return true;
      if (typeof p.eligibilityMaxVehicleAgeYears !== "number") return true;
      return p.eligibilityMaxVehicleAgeYears <= v;
    })
    .filter((p) => {
      const v = parseNum(maxKm);
      if (typeof v !== "number") return true;
      if (typeof p.eligibilityMaxMileageKm !== "number") return true;
      return p.eligibilityMaxMileageKm <= v;
    });

  const candidateProductIds = useMemo(() => filtered.map((p) => p.id).filter(Boolean).sort(), [filtered]);

  const eligibleVariantPricingByProductIdQuery = useQuery({
    queryKey: [
      "marketplace-eligible-variant-pricing-by-product-id",
      candidateProductIds.join(","),
      parsedMileage ?? "",
      vehicleClass,
      minTermMonthsNum ?? "",
      minTermKmNum ?? "",
      maxDeductibleCents ?? "",
    ],
    enabled: Boolean(decoded) && typeof parsedMileage === "number" && candidateProductIds.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        candidateProductIds.map(async (pid) => {
          const rows = (await productPricingApi.list({ productId: pid })) as ProductPricing[];
          const eligibleRows = rows.filter((r) =>
            isPricingEligibleForVehicleWithConstraints({
              pricing: r,
              vehicleMileageKm: parsedMileage as number,
              vehicleClass,
              minTermMonths: minTermMonthsNum ?? null,
              minTermKm: minTermKmNum ?? null,
              maxDeductibleCents: maxDeductibleCents ?? null,
            }),
          );
          const primary = defaultPricingRow(eligibleRows);
          return [pid, primary] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, ProductPricing | null>;
    },
  });

  const eligibleVariantPricingByProductId = (eligibleVariantPricingByProductIdQuery.data ?? {}) as Record<string, ProductPricing | null>;

  const canUseFilters = Boolean(decoded);

  const filteredByVariant = useMemo(() => {
    if (!decoded) return [] as Product[];
    if (typeof parsedMileage !== "number") return [] as Product[];
    if (candidateProductIds.length === 0) return [] as Product[];
    return filtered.filter((p) => Boolean(eligibleVariantPricingByProductId[p.id]));
  }, [candidateProductIds.length, decoded, eligibleVariantPricingByProductId, filtered, parsedMileage]);

  const filteredByVariantAndPrice = useMemo(() => {
    if (typeof priceMaxCents !== "number") return filteredByVariant;
    return filteredByVariant.filter((p) => {
      const primary = eligibleVariantPricingByProductId[p.id] ?? null;
      const shown = shownPriceFor(p as MarketplaceProduct, primary);
      if (typeof shown !== "number") return false;
      return shown <= priceMaxCents;
    });
  }, [eligibleVariantPricingByProductId, filteredByVariant, priceMaxCents]);

  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of filteredByVariantAndPrice) {
      const key = providerKey(p);
      map.set(key, [...(map.get(key) ?? []), p]);
    }

    const sortDir = priceSort === "PRICE_ASC" ? 1 : priceSort === "PRICE_DESC" ? -1 : 0;
    const sortProducts = (rows: Product[]) => {
      if (!sortDir) return rows;
      return rows.slice().sort((a, b) => {
        const ap = shownPriceFor(a as MarketplaceProduct, eligibleVariantPricingByProductId[a.id] ?? null);
        const bp = shownPriceFor(b as MarketplaceProduct, eligibleVariantPricingByProductId[b.id] ?? null);
        const an = typeof ap === "number" ? ap : Number.MAX_SAFE_INTEGER;
        const bn = typeof bp === "number" ? bp : Number.MAX_SAFE_INTEGER;
        const diff = (an - bn) * sortDir;
        if (diff) return diff;
        return (a.name ?? "").localeCompare(b.name ?? "");
      });
    };

    return Array.from(map.entries())
      .map(([pid, rows]) => ({
        providerId: pid,
        providerName: providerDisplayName(providerById.get(pid), pid),
        providerLogoUrl: providerById.get(pid)?.logoUrl,
        products: sortProducts(rows),
      }))
      .sort((a, b) => a.providerName.localeCompare(b.providerName));
  }, [eligibleVariantPricingByProductId, filteredByVariantAndPrice, priceSort, providerById]);

  const detailHrefFor = (productId: string) => {
    const params = new URLSearchParams();
    if (decoded?.vin) params.set("vin", decoded.vin);
    if (mileageKm.trim()) params.set("mileageKm", mileageKm.trim());
    if (vehicleClass.trim()) params.set("vehicleClass", vehicleClass.trim());
    const qs = params.toString();
    return `/dealer-marketplace/products/${productId}${qs ? `?${qs}` : ""}`;
  };

  return (
    <PageShell
      title="Find Products"
      actions={
        <Button variant="outline" asChild>
          <Link to="/dealer-marketplace/compare">Compare Plans</Link>
        </Button>
      }
    >
      <div className="relative">
        <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-blue-600/10 via-transparent to-yellow-400/10 blur-2xl" />

        <div className="rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
          <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600/10 via-transparent to-yellow-500/10">
            <div className="font-semibold">Search</div>
          </div>

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-4">
                <div className="text-xs text-muted-foreground mb-1">VIN</div>
                <Input value={vin} onChange={(e) => setVin(e.target.value)} placeholder="Enter VIN" className="h-9 text-sm" />
                <div className="mt-3 flex gap-2">
                  <Button
                    className="h-9 flex-1"
                    disabled={!vin.trim() || decodeMutation.isPending}
                    onClick={() => {
                      setDecodeError(null);
                      void decodeMutation.mutateAsync(vin);
                    }}
                  >
                    Decode
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9 whitespace-nowrap bg-red-500/10 hover:bg-red-500/15 border-red-500/20"
                    disabled={decodeMutation.isPending && !decoded}
                    onClick={() => resetVinSearch()}
                  >
                    Reset
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9 whitespace-nowrap"
                    disabled={!canUseFilters}
                    onClick={() => {
                      setSearch("");
                      setProviderId("");
                      setPriceSort("");
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="text-xs text-muted-foreground mb-1">Mileage (km)</div>
                <Input
                  value={mileageKm}
                  onChange={(e) => setMileageKm(e.target.value)}
                  placeholder="e.g. 85000"
                  inputMode="numeric"
                  className={"h-9 text-sm " + (decoded && !mileageKm.trim() ? "border-yellow-500" : "")}
                  disabled={!canUseFilters}
                />
              </div>

              <div className="lg:col-span-2">
                <div className="text-xs text-muted-foreground mb-1">Sort by price</div>
                <select
                  value={priceSort}
                  onChange={(e) => setPriceSort(e.target.value)}
                  disabled={!canUseFilters}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-sm disabled:opacity-60"
                >
                  <option value="">Sort by price</option>
                  <option value="PRICE_ASC">Low to High</option>
                  <option value="PRICE_DESC">High to Low</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <div className="text-xs text-muted-foreground mb-1">Search products</div>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Product name"
                  className={"h-9 text-sm " + (!canUseFilters ? "opacity-60 pointer-events-none" : "")}
                />
              </div>

              <div className="lg:col-span-2">
                <div className="text-xs text-muted-foreground mb-1">Provider</div>
                <select
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                  disabled={!canUseFilters}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-sm disabled:opacity-60"
                >
                  <option value="">All providers</option>
                  {providerOptions.map((pid) => (
                    <option key={pid} value={pid}>
                      {providerDisplayName(providerById.get(pid), pid)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-muted-foreground">
                {decoded ? (
                  <span className="inline-flex items-center rounded-full border bg-background px-2.5 py-1">
                    {filteredByVariant.length} eligible product{filteredByVariant.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
            </div>

            {decodeError ? <div className="text-sm text-destructive">{decodeError}</div> : null}
            {decoded && !mileageKm.trim() ? (
              <div className="text-xs text-muted-foreground">Mileage is required to calculate eligibility.</div>
            ) : null}

            {decoded ? (
              <div className="rounded-xl border p-3 bg-gradient-to-br from-blue-600/5 via-transparent to-yellow-400/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-foreground">Vehicle</div>
                    <div className="text-[11px] text-muted-foreground mt-1 truncate">
                      {decoded.vehicleYear ?? "—"} {decoded.vehicleMake ?? ""} {decoded.vehicleModel ?? ""} {decoded.vehicleTrim ?? ""}
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground whitespace-nowrap">VIN: {decoded.vin}</div>
                </div>

                {(() => {
                  const rows = [
                    { label: "Year", value: decoded.vehicleYear },
                    { label: "Make, Model", value: [decoded.vehicleMake, decoded.vehicleModel].filter(Boolean).join(" ") },
                    { label: "Trim", value: decoded.vehicleTrim },
                    { label: "Engine", value: decoded.vehicleEngine },
                    { label: "Drive Type", value: decoded.vehicleDriveType },
                    { label: "Transmission", value: decoded.vehicleTransmission },
                    { label: "Body Style", value: decoded.vehicleBodyStyle },
                    { label: "Manufactured In", value: decoded.manufacturedIn },
                    { label: "Brake System", value: decoded.vehicleBrakeSystem },
                    { label: "Tires", value: decoded.tires },
                    { label: "Warranty", value: decoded.warranty },
                    { label: "MSRP", value: decoded.msrp },
                  ] as const;

                  const primary = rows.slice(0, 4);
                  const secondary = rows.slice(4);

                  return (
                    <>
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {primary.map((row) => (
                          <div key={row.label} className="rounded-lg border bg-background/60 px-2.5 py-2">
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80">{row.label}</div>
                            <div className="text-[11px] font-semibold text-foreground mt-0.5 truncate">
                              {row.value?.toString().trim() ? row.value : "NOT ON FILE"}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-2">
                        <button
                          type="button"
                          className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-4"
                          onClick={() => setShowVehicleDetails((v: boolean) => !v)}
                        >
                          {showVehicleDetails ? "Hide details" : "More details"}
                        </button>
                      </div>

                      {showVehicleDetails ? (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {secondary.map((row) => (
                            <div key={row.label} className="rounded-lg border bg-background/60 px-2.5 py-2">
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80">{row.label}</div>
                              <div className="text-[11px] font-semibold text-foreground mt-0.5 truncate">
                                {row.value?.toString().trim() ? row.value : "NOT ON FILE"}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-10 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600/10 via-transparent to-yellow-500/10">
          <div className="font-semibold">Eligible Products</div>
        </div>

        {!decoded ? (
          <div className="px-6 py-10 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">Enter VIN + mileage to view plans.</div>
          </div>
        ) : !parsedMileage ? (
          <div className="px-6 py-10 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">Mileage is required</div>
          </div>
        ) : eligibleVariantPricingByProductIdQuery.isLoading ? (
          <div className="px-6 py-10 text-sm text-muted-foreground">Checking eligible plans…</div>
        ) : eligibleVariantPricingByProductIdQuery.isError ? (
          <div className="px-6 py-10 text-sm text-destructive">Failed to load eligible plans.</div>
        ) : (
          <div className="p-6 overflow-x-auto">
            <div className="grid grid-flow-col auto-cols-[360px] gap-6 pb-2">
              {grouped.map((g, idx) => {
                const a = accentForIndex(idx);
                return (
                  <div
                    key={g.providerId}
                    className={
                      "rounded-2xl border bg-background overflow-hidden ring-1 shadow-sm transition-shadow hover:shadow-md flex flex-col max-h-[640px] " +
                      a.ring +
                      " " +
                      a.border
                    }
                  >
                    <div className={"px-5 py-4 border-b bg-gradient-to-r sticky top-0 z-10 " + a.header}>
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-8 w-8 rounded-lg border bg-white/70 overflow-hidden flex items-center justify-center shrink-0">
                          {g.providerLogoUrl ? (
                            <img src={g.providerLogoUrl} alt="" className="h-full w-full object-contain" />
                          ) : null}
                        </div>
                        <div className="font-semibold truncate">{g.providerName}</div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {g.products.length} product{g.products.length === 1 ? "" : "s"}
                      </div>
                    </div>

                    <div className="p-4 space-y-3 overflow-y-auto min-h-0 flex-1">
                      {g.products.map((p) => (
                        (() => {
                          const mp = p as MarketplaceProduct;
                          const primaryPricing = eligibleVariantPricingByProductId[p.id] ?? null;
                          const shownMonths =
                            primaryPricing
                              ? primaryPricing.termMonths === null
                                ? "Unlimited"
                                : typeof primaryPricing.termMonths === "number"
                                  ? `${primaryPricing.termMonths} mo`
                                  : "—"
                              : typeof mp.pricingDefault?.termMonths === "number"
                                ? `${mp.pricingDefault.termMonths} mo`
                                : "—";

                          const shownKm =
                            primaryPricing
                              ? primaryPricing.termKm === null
                                ? "Unlimited"
                                : typeof primaryPricing.termKm === "number"
                                  ? `${primaryPricing.termKm.toLocaleString()} km`
                                  : "—"
                              : typeof mp.pricingDefault?.termKm === "number"
                                ? `${mp.pricingDefault.termKm.toLocaleString()} km`
                                : "—";

                          const shownDeductibleCents =
                            typeof primaryPricing?.deductibleCents === "number"
                              ? primaryPricing.deductibleCents
                              : typeof mp.pricingDefault?.deductibleCents === "number"
                                ? mp.pricingDefault.deductibleCents
                                : undefined;

                          const shownPrice = shownPriceFor(mp, primaryPricing);

                          return (
                        <div
                          key={p.id}
                          className="rounded-xl border bg-background/60 p-4 shadow-sm ring-1 ring-blue-500/5 transition-colors hover:bg-muted/30"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="font-medium text-foreground truncate">
                                <Link to={detailHrefFor(p.id)} className="hover:underline">
                                  {p.name}
                                </Link>
                              </div>

                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                <span className="inline-flex items-center rounded-full border bg-background px-2 py-0.5">
                                  {productTypeLabel(mp.productType)}
                                </span>
                                <span className="inline-flex items-center rounded-full border bg-background px-2 py-0.5">
                                  {shownMonths} / {shownKm}
                                </span>
                                {typeof shownDeductibleCents === "number" ? (
                                  <span className="inline-flex items-center rounded-full border bg-background px-2 py-0.5">
                                    Deductible {money(shownDeductibleCents)}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="shrink-0 text-right">
                              {(() => {
                                const primary = shownPrice;
                                return (
                                  <div className="flex flex-col items-end">
                                    <div className="text-[11px] text-muted-foreground whitespace-nowrap">Price</div>
                                    <div className="text-2xl font-bold whitespace-nowrap leading-none mt-1">{money(primary)}</div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          <div className="mt-4 flex items-center justify-end gap-2">
                            <Button size="sm" variant="outline" asChild className="whitespace-nowrap">
                              <Link to={detailHrefFor(mp.id)}>View</Link>
                            </Button>
                            <Button size="sm" asChild className="bg-yellow-400 text-black hover:bg-yellow-300 whitespace-nowrap">
                              <Link to={`/dealer-contracts?productId=${encodeURIComponent(mp.id)}&vin=${encodeURIComponent(decoded.vin)}`}>Select</Link>
                            </Button>
                          </div>
                        </div>
                          );
                        })()
                      ))}

                      {productsQuery.isLoading ? <div className="px-1 py-2 text-sm text-muted-foreground">Loading…</div> : null}
                      {productsQuery.isError ? <div className="px-1 py-2 text-sm text-destructive">Failed to load products.</div> : null}
                      {!productsQuery.isLoading && !productsQuery.isError && g.products.length === 0 ? (
                        <div className="px-1 py-10 text-sm text-muted-foreground">No eligible products.</div>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {!productsQuery.isLoading && !productsQuery.isError && grouped.length === 0 ? (
                <div className="px-2 py-10 text-sm text-muted-foreground">
                  <div className="font-medium text-foreground">No eligible products found</div>
                  <div className="mt-2">Try clearing filters or adjusting your search.</div>
                  <div className="mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSearch("");
                        setProviderId("");
                        setProductType("");
                        setPriceSort("");
                        setMaxPrice("");
                        setMaxYears("");
                        setMaxKm("");
                        setMinTermMonths("");
                        setMinTermKm("");
                        setMaxDeductible("");
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
