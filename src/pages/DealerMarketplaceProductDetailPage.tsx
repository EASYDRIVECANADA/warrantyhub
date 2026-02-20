import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { Button } from "../components/ui/button";
import { PageShell } from "../components/PageShell";
import { getMarketplaceApi } from "../lib/marketplace/marketplace";
import { getProductPricingApi } from "../lib/productPricing/productPricing";
import { getProductAddonsApi } from "../lib/productAddons/productAddons";
import { defaultPricingRow } from "../lib/productPricing/defaultRow";
import { isPricingEligibleForVehicle } from "../lib/productPricing/eligibility";
import type { ProductPricing } from "../lib/productPricing/types";
import type { Product, ProductType } from "../lib/products/types";
import { getProvidersApi } from "../lib/providers/providers";
import type { ProviderPublic } from "../lib/providers/types";
import { costFromProductOrPricing, retailFromCost } from "../lib/dealerPricing";
import { useDealerMarkupPct } from "../lib/dealerMarkup";
import { getAppMode } from "../lib/runtime";
import { useAuth } from "../providers/AuthProvider";
import type { ProductAddon } from "../lib/productAddons/types";

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

function allowListLabel(items?: string[]) {
  const list = (items ?? []).map((x) => x.trim()).filter(Boolean);
  if (list.length === 0) return "All";
  return list.slice(0, 6).join(", ") + (list.length > 6 ? "…" : "");
}

export function DealerMarketplaceProductDetailPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const productId = id ?? "";

  const [searchParams] = useSearchParams();
  const vin = (searchParams.get("vin") ?? "").trim();
  const mileageRaw = (searchParams.get("mileageKm") ?? "").trim();
  const mileageNum = mileageRaw ? Number(mileageRaw) : NaN;
  const mileageKm = Number.isFinite(mileageNum) && mileageNum >= 0 ? mileageNum : null;
  const vehicleClass = (searchParams.get("vehicleClass") ?? "").trim();

  const mode = useMemo(() => getAppMode(), []);
  const dealerId = (mode === "local" ? (user?.dealerId ?? user?.id ?? "") : (user?.dealerId ?? "")).trim();
  const { markupPct } = useDealerMarkupPct(dealerId);

  const marketplaceApi = useMemo(() => getMarketplaceApi(), []);
  const productPricingApi = useMemo(() => getProductPricingApi(), []);
  const productAddonsApi = useMemo(() => getProductAddonsApi(), []);
  const providersApi = useMemo(() => getProvidersApi(), []);

  const productsQuery = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: () => marketplaceApi.listPublishedProducts(),
  });

  const product = ((productsQuery.data ?? []) as Product[]).find((p) => p.id === productId);

  const providersQuery = useQuery({
    queryKey: ["providers", product?.providerId ?? ""],
    enabled: Boolean(product?.providerId),
    queryFn: async () => {
      if (!product?.providerId) return [];
      return providersApi.listByIds([product.providerId]);
    },
  });

  const provider = ((providersQuery.data ?? []) as ProviderPublic[])[0];

  const pricingQuery = useQuery({
    queryKey: ["marketplace-product-pricing", productId],
    enabled: !!productId,
    queryFn: () => productPricingApi.list({ productId }),
  });

  const pricingRows = (pricingQuery.data ?? []) as ProductPricing[];

  const addonsQuery = useQuery({
    queryKey: ["product-addons-public", productId],
    enabled: !!productId,
    queryFn: () => productAddonsApi.list({ productId }),
  });

  const allAddons = ((addonsQuery.data ?? []) as ProductAddon[]).filter((a) => a.active);

  const defaultRow = useMemo(() => defaultPricingRow(pricingRows), [pricingRows]);

  const eligiblePrimaryRow = useMemo(() => {
    if (typeof mileageKm !== "number") return null;
    const eligible = pricingRows.filter((r) => isPricingEligibleForVehicle({ pricing: r, vehicleMileageKm: mileageKm, vehicleClass }));
    return defaultPricingRow(eligible);
  }, [mileageKm, pricingRows, vehicleClass]);

  const primaryRow = eligiblePrimaryRow ?? defaultRow;

  const [selectedPricingId, setSelectedPricingId] = useState<string>("");

  const [selectedAddonIds, setSelectedAddonIds] = useState<Record<string, boolean>>({});

  const activeAddons = useMemo(() => {
    const pricingId = selectedPricingId.trim();
    if (!pricingId) return allAddons;
    return allAddons.filter((a) => {
      const appliesToAll = typeof (a as any).appliesToAllPricingRows === "boolean" ? Boolean((a as any).appliesToAllPricingRows) : true;
      if (appliesToAll) return true;
      const ids = Array.isArray((a as any).applicablePricingRowIds)
        ? ((a as any).applicablePricingRowIds as unknown[]).filter((x) => typeof x === "string")
        : [];
      return ids.includes(pricingId);
    });
  }, [allAddons, selectedPricingId]);

  useEffect(() => {
    setSelectedAddonIds((current) => {
      if (Object.keys(current).length === 0) return current;
      const allowed = new Set(activeAddons.map((a) => a.id));
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(current)) {
        if (!v) continue;
        if (!allowed.has(k)) {
          changed = true;
          continue;
        }
        next[k] = true;
      }
      return changed ? next : current;
    });
  }, [activeAddons]);

  useEffect(() => {
    if (selectedPricingId) return;
    const next = (primaryRow?.id ?? "").trim();
    if (next) setSelectedPricingId(next);
  }, [primaryRow?.id, selectedPricingId]);

  const sortedPricingRows = pricingRows
    .slice()
    .sort((a, b) => {
      const am = a.termMonths ?? Number.MAX_SAFE_INTEGER;
      const bm = b.termMonths ?? Number.MAX_SAFE_INTEGER;
      const ak = a.termKm ?? Number.MAX_SAFE_INTEGER;
      const bk = b.termKm ?? Number.MAX_SAFE_INTEGER;
      return (am - bm) || (ak - bk) || (a.deductibleCents - b.deductibleCents);
    });

  return (
    <PageShell
      title={product ? product.name : "Product"}
      subtitle={product ? `${providerDisplayName(provider, product.providerId)} • ${productTypeLabel(product.productType)}` : ""}
      actions={
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              window.location.assign("/dealer-marketplace");
            }}
          >
            Back
          </Button>
          <Button
            type="button"
            className="bg-yellow-400 text-black hover:bg-yellow-300"
            onClick={() => {
              const params = new URLSearchParams();
              params.set("productId", productId);
              const pricingId = selectedPricingId.trim();
              if (pricingId) params.set("productPricingId", pricingId);

              if (vin) params.set("vin", vin);

              const addonIds = Object.keys(selectedAddonIds).filter((id) => selectedAddonIds[id]);
              if (addonIds.length > 0) params.set("addonIds", addonIds.join(","));
              window.location.assign(`/dealer-contracts?${params.toString()}`);
            }}
          >
            Select product
          </Button>
        </div>
      }
    >
      {!productsQuery.isLoading && !product ? <div className="text-sm text-muted-foreground">Product not found.</div> : null}

      {product ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b">
                <div className="font-semibold">Pricing Options</div>
                <div className="text-sm text-muted-foreground mt-1">Choose a term and mileage limit when creating the contract.</div>
              </div>

              <div className="px-6 py-6">
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-4 py-3 pr-3 text-xs font-medium text-muted-foreground">Term</th>
                        <th className="text-left px-4 py-3 pr-3 text-xs font-medium text-muted-foreground">Class</th>
                        <th className="text-left px-4 py-3 pr-3 text-xs font-medium text-muted-foreground">Mileage band</th>
                        <th className="text-left px-4 py-3 pr-3 text-xs font-medium text-muted-foreground">Claim limit</th>
                        <th className="text-left px-4 py-3 pr-3 text-xs font-medium text-muted-foreground">Deductible</th>
                        <th className="text-left px-4 py-3 pr-3 text-xs font-medium text-muted-foreground">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {pricingQuery.isLoading ? (
                        <tr>
                          <td className="px-4 py-4 text-sm text-muted-foreground" colSpan={6}>
                            Loading pricing…
                          </td>
                        </tr>
                      ) : pricingQuery.isError ? (
                        <tr>
                          <td className="px-4 py-4 text-sm text-destructive" colSpan={6}>
                            Failed to load pricing.
                          </td>
                        </tr>
                      ) : sortedPricingRows.length > 0 ? (
                        sortedPricingRows.map((r) => {
                          const isPrimary = primaryRow?.id && r.id === primaryRow.id;
                          const isSelected = r.id === selectedPricingId;
                          return (
                            <tr
                              key={r.id}
                              className={
                                (isSelected
                                  ? "bg-blue-600/10"
                                  : isPrimary
                                    ? "bg-yellow-400/10"
                                    : "") + " hover:bg-blue-600/5 cursor-pointer"
                              }
                              onClick={() => setSelectedPricingId(r.id)}
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSelectedPricingId(r.id);
                                }
                              }}
                              aria-selected={isSelected}
                            >
                              <td className="px-4 py-3 pr-3 text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={
                                      "inline-flex h-4 w-4 items-center justify-center rounded border transition-colors " +
                                      (isSelected ? "bg-primary border-primary" : "bg-background border-border")
                                    }
                                    aria-hidden="true"
                                  >
                                    {isSelected ? <Check className="h-3 w-3 text-primary-foreground" /> : null}
                                  </span>
                                  <span>
                                    {(r.termMonths === null ? "Unlimited" : `${r.termMonths} months`)} / {(r.termKm === null ? "Unlimited" : `${r.termKm.toLocaleString()} km`)}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 pr-3 text-muted-foreground">{(r.vehicleClass ?? "").trim() || "—"}</td>
                              <td className="px-4 py-3 pr-3 text-muted-foreground">
                                {typeof r.vehicleMileageMinKm === "number" ? r.vehicleMileageMinKm.toLocaleString() : "—"}–
                                {r.vehicleMileageMaxKm === null
                                  ? "Unlimited"
                                  : typeof r.vehicleMileageMaxKm === "number"
                                    ? r.vehicleMileageMaxKm.toLocaleString()
                                    : "—"}
                              </td>
                              <td className="px-4 py-3 pr-3 text-muted-foreground">{money(r.claimLimitCents)}</td>
                              <td className="px-4 py-3 pr-3 text-muted-foreground">{money(r.deductibleCents)}</td>
                              <td className="px-4 py-3 pr-3 font-medium text-foreground">
                                {(() => {
                                  const cost = costFromProductOrPricing({ dealerCostCents: r.dealerCostCents, basePriceCents: r.basePriceCents });
                                  const retail = retailFromCost(cost, markupPct) ?? cost;
                                  return <div>{money(retail)}</div>;
                                })()}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr className="hover:bg-muted/20">
                          <td className="px-4 py-3 pr-3 text-muted-foreground">
                            {typeof product.termMonths === "number" ? `${product.termMonths} months` : "—"} / {typeof product.termKm === "number" ? `${product.termKm} km` : "—"}
                          </td>
                          <td className="px-4 py-3 pr-3 text-muted-foreground">—</td>
                          <td className="px-4 py-3 pr-3 text-muted-foreground">—</td>
                          <td className="px-4 py-3 pr-3 text-muted-foreground">—</td>
                          <td className="px-4 py-3 pr-3 text-muted-foreground">{money(product.deductibleCents)}</td>
                          <td className="px-4 py-3 pr-3 font-medium text-foreground">
                            {(() => {
                              const cost = costFromProductOrPricing({ dealerCostCents: product.dealerCostCents, basePriceCents: product.basePriceCents });
                              const retail = retailFromCost(cost, markupPct) ?? cost;
                              return <div>{money(retail)}</div>;
                            })()}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b">
                <div className="font-semibold">Coverage</div>
              </div>
              <div className="px-6 py-6 text-sm whitespace-pre-wrap text-muted-foreground">
                {(product.coverageDetails ?? "").trim() || "—"}
                {(product.exclusions ?? "").trim() ? (
                  <div className="mt-4 pt-4 border-t">
                    <div className="text-xs font-medium text-foreground">Exclusions</div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{(product.exclusions ?? "").trim()}</div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b">
                <div className="font-semibold">Eligibility</div>
              </div>
              <div className="px-6 py-6 text-sm text-muted-foreground space-y-3">
                <div>
                  <div className="text-xs text-muted-foreground">Max Age</div>
                  <div className="font-medium text-foreground">
                    {typeof product.eligibilityMaxVehicleAgeYears === "number" ? `${product.eligibilityMaxVehicleAgeYears} years` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Max Mileage</div>
                  <div className="font-medium text-foreground">
                    {typeof product.eligibilityMaxMileageKm === "number" ? `${product.eligibilityMaxMileageKm.toLocaleString()} km` : "—"}
                  </div>
                </div>
                <div className="pt-2 border-t" />
                <div>
                  <div className="text-xs text-muted-foreground">Make</div>
                  <div className="font-medium text-foreground">{allowListLabel(product.eligibilityMakeAllowlist)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Model</div>
                  <div className="font-medium text-foreground">{allowListLabel(product.eligibilityModelAllowlist)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Trim</div>
                  <div className="font-medium text-foreground">{allowListLabel(product.eligibilityTrimAllowlist)}</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b">
                <div className="font-semibold">Add-ons</div>
              </div>
              <div className="px-6 py-6 text-sm">
                {addonsQuery.isLoading ? <div className="text-muted-foreground">Loading add-ons…</div> : null}
                {addonsQuery.isError ? <div className="text-destructive">Failed to load add-ons.</div> : null}

                {!addonsQuery.isLoading && !addonsQuery.isError && activeAddons.length === 0 ? (
                  <div className="text-muted-foreground">No add-ons available.</div>
                ) : null}

                <div className="space-y-3">
                  {activeAddons.map((a) => {
                    const checked = Boolean(selectedAddonIds[a.id]);
                    const cost = costFromProductOrPricing({ dealerCostCents: a.dealerCostCents, basePriceCents: a.basePriceCents });
                    const retail = retailFromCost(cost, markupPct) ?? cost;
                    return (
                      <label key={a.id} className="flex items-start justify-between gap-3 cursor-pointer select-none">
                        <span className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked;
                              setSelectedAddonIds((s) => ({ ...s, [a.id]: next }));
                            }}
                          />
                          <span>
                            <div className="text-sm font-medium text-foreground">{a.name}</div>
                            {(a.description ?? "").trim() ? <div className="text-xs text-muted-foreground mt-1">{(a.description ?? "").trim()}</div> : null}
                          </span>
                        </span>
                        <span className="text-sm font-semibold text-foreground whitespace-nowrap">{money(retail)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
