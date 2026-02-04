import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { costFromProductOrPricing, marginFromCostAndRetail, retailFromCost } from "../lib/dealerPricing";
import { useDealerMarkupPct } from "../lib/dealerMarkup";
import { getAppMode } from "../lib/runtime";
import { getMarketplaceApi } from "../lib/marketplace/marketplace";
import type { Product, ProductType } from "../lib/products/types";
import { getProvidersApi } from "../lib/providers/providers";
import type { ProviderPublic } from "../lib/providers/types";
import { decodeVin, type VinDecoded } from "../lib/vin/decodeVin";
import { alertMissing, confirmProceed, sanitizeDigitsOnly } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";

type CompareMetric = "PRICE" | "COVERAGE" | "DEDUCTIBLE" | "TERM" | "EXCLUSIONS";

function metricLabel(m: CompareMetric) {
  if (m === "PRICE") return "Price";
  if (m === "COVERAGE") return "Coverage";
  if (m === "DEDUCTIBLE") return "Deductible";
  if (m === "TERM") return "Term";
  return "Exclusions";
}

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

function retailCentsFor(p: Product, markupPct: number) {
  const cost = costFromProductOrPricing({ dealerCostCents: p.dealerCostCents, basePriceCents: p.basePriceCents });
  return retailFromCost(cost, markupPct) ?? cost;
}

export function DealerComparisonPage() {
  const api = useMemo(() => getMarketplaceApi(), []);
  const providersApi = useMemo(() => getProvidersApi(), []);
  const { user } = useAuth();
  const mode = useMemo(() => getAppMode(), []);

  const dealerId = (mode === "local" ? (user?.dealerId ?? user?.id ?? "") : user?.dealerId ?? "").trim();
  const { markupPct } = useDealerMarkupPct(dealerId);
  const canSeeCost = user?.role === "DEALER_ADMIN";
  const [vin, setVin] = useState("");
  const [decoded, setDecoded] = useState<VinDecoded | null>(null);
  const [mileageKm, setMileageKm] = useState("");
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [providerId, setProviderId] = useState("");
  const [productType, setProductType] = useState("");
  const [metrics, setMetrics] = useState<Record<CompareMetric, boolean>>({
    PRICE: true,
    COVERAGE: true,
    DEDUCTIBLE: true,
    TERM: true,
    EXCLUSIONS: true,
  });

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
    },
    onError: (err) => {
      setDecodeError(err instanceof Error ? err.message : "VIN decode failed");
    },
  });

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

  const selectedProducts = selectedIds
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean) as Product[];

  const selectedRetailValues = selectedProducts.map((p) => retailCentsFor(p, markupPct)).filter((n) => typeof n === "number") as number[];
  const minSelectedRetail = selectedRetailValues.length > 0 ? Math.min(...selectedRetailValues) : undefined;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((x) => x !== id) : [...prev, id];
      return clampSelection(next, 4);
    });
  };

  const activeMetrics = (Object.keys(metrics) as CompareMetric[]).filter((m) => metrics[m]);

  return (
    <PageShell
      badge="Dealer Portal"
      title="Compare Plans"
      subtitle="Decode the VIN first to show only eligible coverages across providers."
      actions={
        <Button variant="outline" asChild>
          <Link to="/dealer-marketplace">Back to Find Products</Link>
        </Button>
      }
    >
      <div className="relative">
        <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-blue-600/10 via-transparent to-yellow-400/10 blur-2xl" />

        <div className="rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
          <div className="px-6 py-4 border-b flex items-start justify-between gap-4 flex-wrap bg-gradient-to-r from-blue-600/10 to-yellow-500/10">
            <div>
              <div className="font-semibold">Step 1: VIN decode</div>
              <div className="text-sm text-muted-foreground mt-1">Enter a VIN to filter plans by vehicle eligibility.</div>
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
            </div>
            <div className="md:col-span-3">
              <div className="text-xs text-muted-foreground mb-1">Mileage (km)</div>
              <Input
                value={mileageKm}
                onChange={(e) => setMileageKm(sanitizeDigitsOnly(e.target.value))}
                placeholder="e.g. 85000"
                inputMode="numeric"
                disabled={!decoded}
              />
            </div>
            <div className="md:col-span-4 rounded-xl border p-3 text-sm text-muted-foreground bg-gradient-to-br from-blue-600/5 via-transparent to-yellow-400/10">
              {decoded ? (
                <div>
                  <div className="font-medium text-foreground">Vehicle</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {decoded.vehicleYear ?? "—"} {decoded.vehicleMake ?? ""} {decoded.vehicleModel ?? ""} {decoded.vehicleTrim ?? ""}
                  </div>
                </div>
              ) : (
                <div>Decode VIN to see the vehicle and eligible plans.</div>
              )}
            </div>
          </div>

          {decodeError ? <div className="px-6 pb-6 text-sm text-destructive">{decodeError}</div> : null}
        </div>

        <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-yellow-500/10">
          <div className="px-6 py-4 border-b flex items-start justify-between gap-4 flex-wrap bg-gradient-to-r from-yellow-500/10 to-blue-600/10">
            <div>
              <div className="font-semibold">Pick options to compare (up to 4)</div>
              <div className="text-sm text-muted-foreground mt-1">Select eligible plans to present to the customer.</div>
            </div>
            <div className="inline-flex items-center rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground">
              {selectedProducts.length} selected
            </div>
          </div>

          <div className="p-6">
            {!decoded ? <div className="text-sm text-muted-foreground">Decode a VIN above to show eligible plans.</div> : null}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map((p) => {
                const selected = selectedIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleSelect(p.id)}
                    className={
                      "group text-left rounded-2xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md " +
                      (selected
                        ? "border-blue-500/40 ring-2 ring-blue-500/20 bg-gradient-to-br from-blue-600/5 via-transparent to-yellow-400/10"
                        : "bg-background hover:bg-muted/50")
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-foreground">{p.name}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {providerDisplayName(providerById.get(p.providerId), p.providerId)} • {productTypeLabel(p.productType)}
                        </div>
                      </div>
                      {(() => {
                        const cost = costFromProductOrPricing({ dealerCostCents: p.dealerCostCents, basePriceCents: p.basePriceCents });
                        const retail = retailFromCost(cost, markupPct) ?? cost;
                        const margin = marginFromCostAndRetail(cost, retail);
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
                            {canSeeCost ? (
                              <div className="text-[11px] text-muted-foreground">
                                Cost {money(cost)}{typeof margin === "number" ? ` • Margin ${money(margin)}` : ""}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">Term: {termLabel(p)}</div>
                  </button>
                );
              })}

              {productsQuery.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
              {productsQuery.isError ? <div className="text-sm text-destructive">Failed to load products.</div> : null}
              {!productsQuery.isLoading && !productsQuery.isError && products.length === 0 ? (
                <div className="text-sm text-muted-foreground">No published products yet.</div>
              ) : null}
              {!productsQuery.isLoading && !productsQuery.isError && decoded && filteredProducts.length === 0 ? (
                <div className="text-sm text-muted-foreground">No eligible plans for this vehicle.</div>
              ) : null}
            </div>

            <div className="mt-6 rounded-2xl border p-5 ring-1 ring-blue-500/10 bg-gradient-to-br from-blue-600/5 via-transparent to-yellow-400/10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

              <div className="font-semibold mt-4">Comparison criteria</div>
              <div className="text-sm text-muted-foreground mt-1">Show/hide rows to keep the conversation focused.</div>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3">
                {(Object.keys(metrics) as CompareMetric[]).map((m) => (
                  <label key={m} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={metrics[m]}
                      onChange={(e) => setMetrics((s) => ({ ...s, [m]: e.target.checked }))}
                    />
                    {metricLabel(m)}
                  </label>
                ))}
              </div>
            </div>
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
                    <th className="text-left px-6 py-3 text-xs text-muted-foreground w-[220px]">Criteria</th>
                    {selectedProducts.map((p) => (
                      <th key={p.id} className="text-left px-6 py-3">
                        <div className="font-medium text-foreground">{p.name}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {providerDisplayName(providerById.get(p.providerId), p.providerId)} • {productTypeLabel(p.productType)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {activeMetrics.includes("PRICE") ? (
                    <tr className="odd:bg-muted/20">
                      <td className="px-6 py-4 font-medium">Price</td>
                      {selectedProducts.map((p) => (
                        <td
                          key={p.id}
                          className={
                            "px-6 py-4 font-medium " +
                            (typeof minSelectedRetail === "number" && retailCentsFor(p, markupPct) === minSelectedRetail
                              ? "text-foreground"
                              : "text-foreground")
                          }
                        >
                          <div className="inline-flex items-center gap-2">
                            <span>{money(retailCentsFor(p, markupPct))}</span>
                            {typeof minSelectedRetail === "number" && retailCentsFor(p, markupPct) === minSelectedRetail ? (
                              <span className="inline-flex items-center rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                                Best price
                              </span>
                            ) : null}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ) : null}

                  {activeMetrics.includes("DEDUCTIBLE") ? (
                    <tr className="odd:bg-muted/20">
                      <td className="px-6 py-4 font-medium">Deductible</td>
                      {selectedProducts.map((p) => (
                        <td key={p.id} className="px-6 py-4">{money(p.deductibleCents)}</td>
                      ))}
                    </tr>
                  ) : null}

                  {activeMetrics.includes("TERM") ? (
                    <tr className="odd:bg-muted/20">
                      <td className="px-6 py-4 font-medium">Term</td>
                      {selectedProducts.map((p) => (
                        <td key={p.id} className="px-6 py-4">{termLabel(p)}</td>
                      ))}
                    </tr>
                  ) : null}

                  {activeMetrics.includes("COVERAGE") ? (
                    <tr className="odd:bg-muted/20">
                      <td className="px-6 py-4 font-medium">Coverage</td>
                      {selectedProducts.map((p) => (
                        <td key={p.id} className="px-6 py-4 text-muted-foreground whitespace-pre-wrap">
                          {p.coverageDetails?.trim() ? p.coverageDetails : "—"}
                        </td>
                      ))}
                    </tr>
                  ) : null}

                  {activeMetrics.includes("EXCLUSIONS") ? (
                    <tr className="odd:bg-muted/20">
                      <td className="px-6 py-4 font-medium">Exclusions</td>
                      {selectedProducts.map((p) => (
                        <td key={p.id} className="px-6 py-4 text-muted-foreground whitespace-pre-wrap">
                          {p.exclusions?.trim() ? p.exclusions : "—"}
                        </td>
                      ))}
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
