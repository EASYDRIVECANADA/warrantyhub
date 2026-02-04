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
import { getAppMode } from "../lib/runtime";
import type { Product, ProductType } from "../lib/products/types";
import { getProvidersApi } from "../lib/providers/providers";
import type { ProviderPublic } from "../lib/providers/types";
import { useAuth } from "../providers/AuthProvider";
import { decodeVin } from "../lib/vin/decodeVin";

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
  const { user } = useAuth();
  const mode = useMemo(() => getAppMode(), []);

  const [vin, setVin] = useState("");
  const [mileageKm, setMileageKm] = useState("");
  const [decoded, setDecoded] = useState<Awaited<ReturnType<typeof decodeVin>> | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [providerId, setProviderId] = useState("");
  const [productType, setProductType] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState("");
  const [maxYears, setMaxYears] = useState("");
  const [maxKm, setMaxKm] = useState("");
  const [minTermMonths, setMinTermMonths] = useState("");
  const [minTermKm, setMinTermKm] = useState("");
  const [maxDeductible, setMaxDeductible] = useState("");

  const dealerId = (mode === "local" ? (user?.dealerId ?? user?.id ?? "") : (user?.dealerId ?? "")).trim();
  const { markupPct } = useDealerMarkupPct(dealerId);
  const canSeeCost = user?.role === "DEALER_ADMIN";

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

  const productsQuery = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: () => marketplaceApi.listPublishedProducts(),
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
    })
    .filter((p) => {
      const v = parseNum(minTermMonths);
      if (typeof v !== "number") return true;
      if (typeof p.termMonths !== "number") return false;
      return p.termMonths >= v;
    })
    .filter((p) => {
      const v = parseNum(minTermKm);
      if (typeof v !== "number") return true;
      if (typeof p.termKm !== "number") return false;
      return p.termKm >= v;
    })
    .filter((p) => {
      const v = parseNum(maxDeductible);
      if (typeof v !== "number") return true;
      if (typeof p.deductibleCents !== "number") return false;
      return p.deductibleCents <= Math.round(v * 100);
    })
    .filter((p) => {
      if (typeof priceMaxCents !== "number") return true;
      const cost = costFromProductOrPricing({ dealerCostCents: p.dealerCostCents, basePriceCents: p.basePriceCents });
      const retail = retailFromCost(cost, markupPct) ?? cost;
      const shown = canSeeCost ? cost : retail;
      if (typeof shown !== "number") return false;
      return shown <= priceMaxCents;
    });

  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of filtered) {
      const key = providerKey(p);
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return Array.from(map.entries())
      .map(([pid, rows]) => ({
        providerId: pid,
        providerName: providerDisplayName(providerById.get(pid), pid),
        products: rows,
      }))
      .sort((a, b) => a.providerName.localeCompare(b.providerName));
  }, [filtered, providerById]);

  return (
    <PageShell
      badge="Dealer Portal"
      title="Find Products"
      subtitle="Decode a VIN to browse eligible provider products."
      actions={
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <Link to="/dealer-dashboard">Back to dashboard</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/dealer-marketplace/compare">Compare plans</Link>
          </Button>
          <Button asChild className="bg-yellow-400 text-black hover:bg-yellow-300">
            <Link to="/dealer-contracts">Start a contract</Link>
          </Button>
        </div>
      }
    >
      <div className="relative">
        <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-blue-600/10 via-transparent to-yellow-400/10 blur-2xl" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
            <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600/10 to-yellow-500/10">
              <div className="font-semibold">VIN Decode</div>
              <div className="text-sm text-muted-foreground mt-1">Enter a VIN to view eligible products.</div>
            </div>

            <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-8">
                <div className="text-xs text-muted-foreground mb-1">VIN</div>
                <Input value={vin} onChange={(e) => setVin(e.target.value)} placeholder="Enter VIN" />
              </div>
              <div className="md:col-span-4">
                <Button
                  className="w-full"
                  disabled={!vin.trim() || decodeMutation.isPending}
                  onClick={() => {
                    setDecodeError(null);
                    void decodeMutation.mutateAsync(vin);
                  }}
                >
                  Decode
                </Button>
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-1">Current mileage (km)</div>
              <Input value={mileageKm} onChange={(e) => setMileageKm(e.target.value)} placeholder="e.g. 85000" inputMode="numeric" />
              <div className="text-xs text-muted-foreground mt-2">Mileage is required for eligibility checks.</div>
            </div>

            {decodeError ? <div className="text-sm text-destructive">{decodeError}</div> : null}

            {decoded ? (
              <div className="rounded-xl border p-4 text-sm bg-gradient-to-br from-blue-600/5 via-transparent to-yellow-400/10">
                <div className="font-medium">Decoded vehicle</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {decoded.vehicleYear ?? "—"} {decoded.vehicleMake ?? ""} {decoded.vehicleModel ?? ""} {decoded.vehicleTrim ?? ""}
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <div>
                    <div className="font-medium text-foreground">Body</div>
                    <div>{decoded.vehicleBodyClass ?? "—"}</div>
                  </div>
                  <div>
                    <div className="font-medium text-foreground">Engine</div>
                    <div>{decoded.vehicleEngine ?? "—"}</div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          </div>

          <div className="lg:col-span-7 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-yellow-500/10">
            <div className="px-6 py-4 border-b bg-gradient-to-r from-yellow-500/10 to-blue-600/10">
              <div className="font-semibold">Filters</div>
              <div className="text-sm text-muted-foreground mt-1">Narrow down eligible products.</div>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-12">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" />
            </div>

            <div className="md:col-span-6">
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="">All providers</option>
                {providerOptions.map((pid) => (
                  <option key={pid} value={pid}>
                    {providerDisplayName(providerById.get(pid), pid)}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-6">
              <select
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="">All product types</option>
                {productTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    {productTypeLabel(t)}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-4">
              <Input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Max price ($)" inputMode="decimal" />
            </div>
            <div className="md:col-span-4">
              <Input value={maxYears} onChange={(e) => setMaxYears(e.target.value)} placeholder="Max years eligible" inputMode="numeric" />
            </div>
            <div className="md:col-span-4">
              <Input value={maxKm} onChange={(e) => setMaxKm(e.target.value)} placeholder="Max km eligible" inputMode="numeric" />
            </div>

            <div className="md:col-span-4">
              <Input value={minTermMonths} onChange={(e) => setMinTermMonths(e.target.value)} placeholder="Min term (months)" inputMode="numeric" />
            </div>
            <div className="md:col-span-4">
              <Input value={minTermKm} onChange={(e) => setMinTermKm(e.target.value)} placeholder="Min term (km)" inputMode="numeric" />
            </div>
            <div className="md:col-span-4">
              <Input value={maxDeductible} onChange={(e) => setMaxDeductible(e.target.value)} placeholder="Max deductible ($)" inputMode="decimal" />
            </div>

            <div className="md:col-span-12 flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setProviderId("");
                  setProductType("");
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
              <div className="text-xs text-muted-foreground flex items-center">
                {decoded ? (
                  <span className="inline-flex items-center rounded-full border bg-background px-2.5 py-1">
                    {filtered.length} eligible product{filtered.length === 1 ? "" : "s"}
                  </span>
                ) : (
                  "Decode VIN to see products"
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      <div className="mt-10 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600/10 via-transparent to-yellow-500/10">
          <div className="font-semibold">Eligible Products</div>
          <div className="text-sm text-muted-foreground mt-1">Grouped by provider.</div>
        </div>

        {!decoded ? (
          <div className="px-6 py-10 text-sm text-muted-foreground">Enter a VIN and decode it to see products.</div>
        ) : !parsedMileage ? (
          <div className="px-6 py-10 text-sm text-muted-foreground">Enter current mileage to see eligible products.</div>
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
                      <div className="font-semibold truncate">{g.providerName}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {g.products.length} product{g.products.length === 1 ? "" : "s"}
                      </div>
                    </div>

                    <div className="p-4 space-y-3 overflow-y-auto min-h-0 flex-1">
                      {g.products.map((p) => (
                        <div
                          key={p.id}
                          className="rounded-xl border bg-background/60 p-4 shadow-sm ring-1 ring-blue-500/5 transition-colors hover:bg-muted/30"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="font-medium text-foreground truncate">
                                <Link to={`/dealer-marketplace/products/${p.id}`} className="hover:underline">
                                  {p.name}
                                </Link>
                              </div>

                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                <span className="inline-flex items-center rounded-full border bg-background px-2 py-0.5">
                                  {productTypeLabel(p.productType)}
                                </span>
                                <span className="inline-flex items-center rounded-full border bg-background px-2 py-0.5">
                                  {typeof p.termMonths === "number" ? `${p.termMonths} mo` : "—"} / {typeof p.termKm === "number" ? `${p.termKm} km` : "—"}
                                </span>
                                {typeof p.deductibleCents === "number" ? (
                                  <span className="inline-flex items-center rounded-full border bg-background px-2 py-0.5">
                                    Deductible {money(p.deductibleCents)}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="shrink-0 text-right">
                              {(() => {
                                const cost = costFromProductOrPricing({ dealerCostCents: p.dealerCostCents, basePriceCents: p.basePriceCents });
                                const primary = canSeeCost ? cost : (retailFromCost(cost, markupPct) ?? cost);
                                return (
                                  <div className="flex flex-col items-end">
                                    <div className="text-sm font-semibold whitespace-nowrap">{money(primary)}</div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          <div className="mt-4 flex items-center justify-end gap-2">
                            <Button size="sm" variant="outline" asChild className="whitespace-nowrap">
                              <Link to={`/dealer-marketplace/products/${p.id}`}>View</Link>
                            </Button>
                            <Button size="sm" asChild className="bg-yellow-400 text-black hover:bg-yellow-300 whitespace-nowrap">
                              <Link to={`/dealer-contracts?productId=${encodeURIComponent(p.id)}&vin=${encodeURIComponent(decoded.vin)}`}>Select</Link>
                            </Button>
                          </div>
                        </div>
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
                <div className="px-2 py-10 text-sm text-muted-foreground">No eligible products found.</div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
