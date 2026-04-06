import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Input } from "../components/ui/input";
import { useToast } from "../providers/ToastProvider";
import { PageShell } from "../components/PageShell";
import { Button } from "../components/ui/button";
import { costFromProductOrPricing, retailFromCost } from "../lib/dealerPricing";
import { useDealerMarkupPct } from "../lib/dealerMarkup";
import { getAppMode } from "../lib/runtime";
import { useAuth } from "../providers/AuthProvider";
import { getMarketplaceApi } from "../lib/marketplace/marketplace";
import type { MarketplaceProduct } from "../lib/marketplace/api";
import { getProvidersApi } from "../lib/providers/providers";
import type { ProviderPublic } from "../lib/providers/types";
import { getProductPricingApi } from "../lib/productPricing/productPricing";
import type { ProductPricing } from "../lib/productPricing/types";
import { getProductAddonsApi } from "../lib/productAddons/productAddons";
import type { ProductAddon } from "../lib/productAddons/types";
import {
  getDealerProductAddonRetailCents,
  getDealerProductPricingRetailCents,
  setDealerProductAddonRetailCents,
  setDealerProductPricingRetailCents,
  subscribeDealerProductRetail,
} from "../lib/dealerProductRetail";

function money(cents: number | null | undefined) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "";
  const dollars = cents / 100;
  return dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function moneyLabel(cents: number | null | undefined) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "—";
  const dollars = cents / 100;
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMoneyInput(raw: string) {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return "";

  const parts = cleaned.split(".");
  const intRaw = (parts[0] ?? "").replace(/^0+(?=\d)/, "");
  const intFormatted = intRaw ? intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "0";

  const hasDot = cleaned.includes(".");
  if (!hasDot) return intFormatted;

  const dec = (parts[1] ?? "").slice(0, 2);
  return `${intFormatted}.${dec}`;
}

function parseMoneyToCents(raw: string) {
  const cleaned = raw.replace(/[^0-9.]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function norm(s: string) {
  return s.trim().toLowerCase();
}

function providerDisplayName(p: ProviderPublic | undefined, fallbackId: string) {
  const name = (p?.companyName ?? p?.displayName ?? "").toString().trim();
  if (name) return name;
  const fid = (fallbackId ?? "").toString().trim();
  return fid || "Unknown provider";
}

const CONFIGURE_STATE_KEY = "warrantyhub.session.dealer_configure_state";

function readConfigureState(): { search?: string; providerId?: string; selectedProductId?: string } {
  const raw = sessionStorage.getItem(CONFIGURE_STATE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as { search?: unknown; providerId?: unknown; selectedProductId?: unknown };
    return {
      search: typeof parsed.search === "string" ? parsed.search : undefined,
      providerId: typeof parsed.providerId === "string" ? parsed.providerId : undefined,
      selectedProductId: typeof parsed.selectedProductId === "string" ? parsed.selectedProductId : undefined,
    };
  } catch {
    return {};
  }
}

function writeConfigureState(next: { search: string; providerId: string; selectedProductId: string }, toast?: (opts: { title?: string; message: string; variant?: "success" | "error" | "info" }) => void) {
  try {
    sessionStorage.setItem(CONFIGURE_STATE_KEY, JSON.stringify(next));
  } catch {
    toast?.({
      title: "Warning",
      message: "Configuration may not persist. Your browser storage may be full or disabled.",
      variant: "error",
    });
  }
}

export function DealerConfigurePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const mode = useMemo(() => getAppMode(), []);

  if (!user) return <Navigate to="/sign-in" replace />;
  if (user.role !== "DEALER_ADMIN") return <Navigate to="/dealer-dashboard" replace />;

  const dealerId = (mode === "local" ? (user.dealerId ?? user.id) : (user.dealerId ?? "")).trim();

  const { markupPct } = useDealerMarkupPct(dealerId);

  const marketplaceApi = useMemo(() => getMarketplaceApi(), []);

  const productsQuery = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: () => marketplaceApi.listPublishedProducts(),
  });

  const products = (productsQuery.data ?? []) as MarketplaceProduct[];

  const providersApi = useMemo(() => getProvidersApi(), []);
  const providerIdsKey = useMemo(() => {
    const ids = Array.from(new Set(products.map((p) => (p.providerId ?? "").toString().trim()).filter(Boolean)));
    ids.sort((a, b) => a.localeCompare(b));
    return ids.join(",");
  }, [products]);

  const providersQuery = useQuery({
    queryKey: ["providers-by-ids", providerIdsKey],
    enabled: Boolean(providerIdsKey),
    queryFn: async () => {
      const ids = providerIdsKey.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) return [];
      return await providersApi.listByIds(ids);
    },
  });

  const providerById = useMemo(() => {
    const rows = (providersQuery.data ?? []) as ProviderPublic[];
    return new Map(rows.map((p) => [p.id, p] as const));
  }, [providersQuery.data]);

  const initialConfigureState = useMemo(() => readConfigureState(), []);

  const [search, setSearch] = useState(() => initialConfigureState.search ?? "");

  const providerOptions = useMemo(() => {
    const ids = Array.from(new Set(products.map((p) => (p.providerId ?? "").toString().trim()).filter(Boolean)));
    const opts = ids.map((id) => ({ id, name: providerDisplayName(providerById.get(id), id) }));
    const normName = (s: string) => s.toLowerCase().replace(/\s+/g, "");
    const isAdv = (name: string) => {
      const n = normName(name);
      return n.includes("advantageplus") || n.includes("avantageplus");
    };
    return opts.sort((a, b) => {
      const aa = isAdv(a.name);
      const bb = isAdv(b.name);
      if (aa && !bb) return -1;
      if (!aa && bb) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [products, providerById]);

  const [providerId, setProviderId] = useState(() => initialConfigureState.providerId ?? "");

  const didSetDefaultProviderRef = useRef(false);
  useEffect(() => {
    if (didSetDefaultProviderRef.current) return;
    if ((providerId ?? "").trim()) return;
    if (providerOptions.length === 0) return;

    const normName = (s: string) => s.toLowerCase().replace(/\s+/g, "");
    const adv = providerOptions.find((p) => {
      const n = normName(p.name);
      return n.includes("advantageplus") || n.includes("avantageplus");
    });

    const next = adv ?? providerOptions[0];
    if (!next) return;
    didSetDefaultProviderRef.current = true;
    setProviderId(next.id);
  }, [providerId, providerOptions]);

  const [selectedProductId, setSelectedProductId] = useState<string>(() => initialConfigureState.selectedProductId ?? "");

  const [retailOverridesVersion, setRetailOverridesVersion] = useState(0);

  useEffect(() => {
    if (!dealerId) return;
    const unsub = subscribeDealerProductRetail(() => {
      setRetailOverridesVersion((v) => v + 1);
    });
    return () => {
      unsub();
    };
  }, [dealerId]);

  const filtered = useMemo(() => {
    const q = norm(search);
    const byProvider = providerId.trim() ? products.filter((p) => (p.providerId ?? "").toString().trim() === providerId.trim()) : products;
    if (!q) return byProvider;
    return byProvider.filter((p) => {
      const hay = [p.name, p.productType, p.providerId, p.id]
        .map((x) => (x ?? "").toString().toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [products, providerId, search]);

  useEffect(() => {
    if (!selectedProductId) return;
    const ok = filtered.some((p) => (p.id ?? "").toString() === selectedProductId);
    if (!ok) setSelectedProductId("");
  }, [filtered, selectedProductId]);

  useEffect(() => {
    writeConfigureState({ search, providerId, selectedProductId }, toast);
  }, [providerId, search, selectedProductId, toast]);

  const selectedProduct = useMemo(() => {
    const id = selectedProductId.trim();
    if (!id) return null;
    return filtered.find((p) => (p.id ?? "").toString() === id) ?? null;
  }, [filtered, selectedProductId]);

  const productPricingApi = useMemo(() => getProductPricingApi(), []);
  const pricingQuery = useQuery({
    queryKey: ["product-pricing-public", selectedProductId],
    enabled: Boolean(selectedProductId),
    queryFn: () => productPricingApi.list({ productId: selectedProductId }),
  });

  const productAddonsApi = useMemo(() => getProductAddonsApi(), []);
  const addonsQuery = useQuery({
    queryKey: ["product-addons-public", selectedProductId],
    enabled: Boolean(selectedProductId),
    queryFn: () => productAddonsApi.list({ productId: selectedProductId }),
  });

  const pricingRows = useMemo(() => (pricingQuery.data ?? []) as ProductPricing[], [pricingQuery.data]);
  const pricingRowIdsKey = useMemo(() => pricingRows.map((r) => (r.id ?? "").trim()).filter(Boolean).join(","), [pricingRows]);

  const addons = useMemo(() => {
    const rows = (addonsQuery.data ?? []) as ProductAddon[];
    return rows.filter((a) => a.active);
  }, [addonsQuery.data]);

  const addonIdsKey = useMemo(() => addons.map((a) => (a.id ?? "").trim()).filter(Boolean).join(","), [addons]);

  const baseRetailForRow = (row: ProductPricing) => {
    const cost = costFromProductOrPricing({ dealerCostCents: row.dealerCostCents, basePriceCents: row.basePriceCents });
    const retail = retailFromCost(cost, markupPct) ?? cost;
    return typeof retail === "number" ? retail : null;
  };

  const baseRetailForAddon = (a: ProductAddon) => {
    const cost = costFromProductOrPricing({ dealerCostCents: a.dealerCostCents, basePriceCents: a.basePriceCents });
    const retail = retailFromCost(cost, markupPct) ?? cost;
    return typeof retail === "number" ? retail : null;
  };

  const [draftByPricingId, setDraftByPricingId] = useState<Record<string, string>>({});
  const [draftByAddonId, setDraftByAddonId] = useState<Record<string, string>>({});

  useEffect(() => {
    setDraftByPricingId((prev) => {
      if (!selectedProduct) {
        return Object.keys(prev).length ? {} : prev;
      }

      void retailOverridesVersion;
      const pid = (selectedProduct.id ?? "").trim();
      const next: Record<string, string> = {};
      for (const r of pricingRows) {
        const rid = (r.id ?? "").trim();
        if (!rid) continue;
        const saved = dealerId && pid ? getDealerProductPricingRetailCents(dealerId, pid, rid) : null;
        next[rid] = saved === null ? "" : money(saved);
      }

      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) return next;
      for (const k of nextKeys) {
        if (prev[k] !== next[k]) return next;
      }
      return prev;
    });
  }, [dealerId, pricingRowIdsKey, pricingRows, retailOverridesVersion, selectedProduct]);

  useEffect(() => {
    setDraftByAddonId((prev) => {
      if (!selectedProduct) {
        return Object.keys(prev).length ? {} : prev;
      }

      void retailOverridesVersion;
      const pid = (selectedProduct.id ?? "").trim();
      const next: Record<string, string> = {};
      for (const a of addons) {
        const aid = (a.id ?? "").trim();
        if (!aid) continue;
        const saved = dealerId && pid ? getDealerProductAddonRetailCents(dealerId, pid, aid) : null;
        next[aid] = saved === null ? "" : money(saved);
      }

      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) return next;
      for (const k of nextKeys) {
        if (prev[k] !== next[k]) return next;
      }
      return prev;
    });
  }, [addonIdsKey, addons, dealerId, retailOverridesVersion, selectedProduct]);

  return (
    <PageShell title="">
      <div className="space-y-4">
        <div className="rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
          <div className="px-5 py-4 border-b bg-gradient-to-r from-blue-600/10 via-transparent to-yellow-500/10">
            <div className="text-sm font-semibold">Retail pricing</div>
            <div className="text-xs text-muted-foreground mt-1">
              Select a product to configure its pricing terms. Marketplace pricing will use your configured retail when set.
            </div>
          </div>

          <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-end gap-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Search</div>
              <Input
                className="h-9 w-full sm:w-[280px]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product"
              />
            </div>

            <div className="sm:w-[240px]">
              <div className="text-xs text-muted-foreground mb-1">Provider</div>
              <select
                className="h-9 w-full rounded-md border border-input bg-background/40 px-2 text-sm shadow-sm"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
              >
                <option value="">All providers</option>
                {providerOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
            <div className="grid grid-cols-12 gap-3 px-4 py-3 border-b bg-muted/20 text-[11px] text-muted-foreground">
              <div className="col-span-8">Product</div>
              <div className="col-span-4">Provider</div>
            </div>

            <div className="divide-y">
              {filtered.map((p) => {
                const pid = (p.id ?? "").toString();
                const isSelected = pid === selectedProductId;
                const providerIdLabel = (p.providerId ?? "").toString();
                const providerName = providerDisplayName(providerById.get(providerIdLabel), providerIdLabel);
                return (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => setSelectedProductId(pid)}
                    className={
                      "w-full text-left grid grid-cols-12 gap-3 px-4 py-3 items-center transition-colors relative " +
                      (isSelected
                        ? "bg-blue-600/10"
                        : "hover:bg-muted/25")
                    }
                  >
                    {isSelected ? <span className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600" /> : null}
                    <div className="col-span-8 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{(p.name ?? "").trim() || "Untitled"}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{(p.productType ?? "").toString()}</div>
                    </div>
                    <div className="col-span-4 text-sm text-muted-foreground truncate">{providerName}</div>
                  </button>
                );
              })}

              {filtered.length === 0 ? <div className="px-4 py-6 text-sm text-muted-foreground">No products found.</div> : null}
            </div>
          </div>

          <div className="lg:col-span-7 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
            <div className="px-5 py-4 border-b bg-gradient-to-r from-blue-600/10 via-transparent to-yellow-500/10">
              <div className="text-sm font-semibold">Details</div>
              <div className="text-xs text-muted-foreground mt-1">Select a product to edit term pricing.</div>
            </div>

            {!selectedProduct ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">No product selected.</div>
            ) : (
              <div className="p-5 space-y-4">
                <div>
                  <div className="text-base font-semibold text-foreground">{(selectedProduct.name ?? "").trim() || "Untitled"}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Provider: {providerDisplayName(providerById.get((selectedProduct.providerId ?? "").toString()), (selectedProduct.providerId ?? "").toString())} • Type: {(selectedProduct.productType ?? "").toString()}
                  </div>
                </div>

                <div className="rounded-xl border overflow-hidden bg-background/40">
                  <div className="grid grid-cols-12 gap-1.5 px-3 py-2 border-b bg-muted/20 text-[11px] text-muted-foreground">
                    <div className="col-span-4">Term</div>
                    <div className="col-span-2">Deductible</div>
                    <div className="col-span-2 pl-2">Base Price</div>
                    <div className="col-span-4 text-right">Retail Price</div>
                  </div>

                  <div className="divide-y">
                    {pricingQuery.isLoading ? <div className="px-3 py-4 text-sm text-muted-foreground">Loading terms…</div> : null}
                    {pricingQuery.isError ? <div className="px-3 py-4 text-sm text-destructive">Failed to load terms.</div> : null}

                    {!pricingQuery.isLoading && !pricingQuery.isError && pricingRows.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-muted-foreground">No pricing terms found for this product.</div>
                    ) : null}

                    {pricingRows.map((r, idx) => {
                      void retailOverridesVersion;
                      const pid = (selectedProduct.id ?? "").trim();
                      const rid = (r.id ?? "").trim();
                      const currentOverride = dealerId && pid && rid ? getDealerProductPricingRetailCents(dealerId, pid, rid) : null;
                      const baseRetail = baseRetailForRow(r);
                      const effectiveRetail = typeof currentOverride === "number" ? currentOverride : baseRetail;
                      const termLabel =
                        selectedProduct.productType === "GAP"
                          ? `${typeof r.financeTermMonths === "number" ? `${r.financeTermMonths} mo` : "—"}`
                          : `${r.termMonths === null ? "Unlimited" : `${r.termMonths} mo`} / ${r.termKm === null ? "Unlimited" : `${r.termKm.toLocaleString()} km`}`;

                      const rowBg = idx % 2 === 0 ? "bg-transparent" : "bg-muted/10";
                      return (
                        <div
                          key={rid}
                          className={
                            "grid grid-cols-12 gap-1.5 px-3 py-2.5 items-center border-l-2 border-transparent hover:bg-muted/15 transition-colors " +
                            rowBg
                          }
                        >
                          <div className="col-span-4 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">{termLabel}</div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {typeof r.vehicleMileageMinKm === "number" || typeof r.vehicleMileageMaxKm === "number" || r.vehicleMileageMaxKm === null
                                ? `${typeof r.vehicleMileageMinKm === "number" ? r.vehicleMileageMinKm.toLocaleString() : "—"}–${
                                    r.vehicleMileageMaxKm === null
                                      ? "Unlimited"
                                      : typeof r.vehicleMileageMaxKm === "number"
                                        ? r.vehicleMileageMaxKm.toLocaleString()
                                        : "—"
                                  } km`
                                : ""}
                            </div>
                          </div>

                          <div className="col-span-2 text-sm text-muted-foreground whitespace-nowrap tabular-nums">{moneyLabel(r.deductibleCents)}</div>
                          <div className="col-span-2 pl-2 text-sm text-muted-foreground whitespace-nowrap tabular-nums">{moneyLabel(baseRetail)}</div>

                          <div className="col-span-4 flex flex-col items-end gap-1 pr-1">
                            <div className="flex items-center justify-end gap-2 w-full min-w-0">
                              <Input
                                className="h-8 w-[120px] text-right"
                                inputMode="decimal"
                                value={draftByPricingId[rid] ?? ""}
                                onChange={(e) => {
                                  const formatted = formatMoneyInput(e.target.value);
                                  setDraftByPricingId((prev) => ({ ...prev, [rid]: formatted }));
                                }}
                                placeholder="0.00"
                              />

                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2 shrink-0"
                                onClick={() => {
                                  const cents = parseMoneyToCents(draftByPricingId[rid] ?? "");
                                  setDealerProductPricingRetailCents(dealerId, pid, rid, cents);
                                }}
                              >
                                Save
                              </Button>
                            </div>

                            <div className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap text-right">
                              {typeof effectiveRetail === "number" ? moneyLabel(effectiveRetail) : "—"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border overflow-hidden bg-background/40">
                  <div className="px-4 py-3 border-b bg-muted/20">
                    <div className="text-sm font-semibold">Add-ons</div>
                    <div className="text-xs text-muted-foreground mt-1">Optional coverages for this product.</div>
                  </div>

                  <div className="divide-y">
                    {addonsQuery.isLoading ? <div className="px-4 py-4 text-sm text-muted-foreground">Loading add-ons…</div> : null}
                    {addonsQuery.isError ? <div className="px-4 py-4 text-sm text-destructive">Failed to load add-ons.</div> : null}

                    {!addonsQuery.isLoading && !addonsQuery.isError && addons.length === 0 ? (
                      <div className="px-4 py-4 text-sm text-muted-foreground">No add-ons for this product.</div>
                    ) : null}

                    {addons.length > 0 ? (
                      <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b bg-muted/10 text-[11px] text-muted-foreground">
                        <div className="col-span-6">Add-on</div>
                        <div className="col-span-2 text-right">Base Price</div>
                        <div className="col-span-4 text-right">Retail Price</div>
                      </div>
                    ) : null}

                    {addons.map((a, idx) => {
                      void retailOverridesVersion;
                      const pid = (selectedProduct.id ?? "").trim();
                      const aid = (a.id ?? "").trim();
                      const currentOverride = dealerId && pid && aid ? getDealerProductAddonRetailCents(dealerId, pid, aid) : null;
                      const baseRetail = baseRetailForAddon(a);
                      const effectiveRetail = typeof currentOverride === "number" ? currentOverride : baseRetail;
                      const rowBg = idx % 2 === 0 ? "bg-transparent" : "bg-muted/10";

                      return (
                        <div
                          key={aid}
                          className={
                            "grid grid-cols-12 gap-2 px-4 py-2.5 items-center hover:bg-muted/15 transition-colors " + rowBg
                          }
                        >
                          <div className="col-span-6 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">{(a.name ?? "").trim() || "Untitled add-on"}</div>
                            {a.description ? <div className="text-[11px] text-muted-foreground truncate">{a.description}</div> : null}
                          </div>

                          <div className="col-span-2 text-sm text-muted-foreground text-right whitespace-nowrap tabular-nums">{moneyLabel(baseRetail)}</div>

                          <div className="col-span-4 flex flex-col items-end gap-1">
                            <div className="flex items-center justify-end gap-2 w-full min-w-0">
                              <Input
                                className="h-8 w-[120px] text-right"
                                inputMode="decimal"
                                value={draftByAddonId[aid] ?? ""}
                                onChange={(e) => {
                                  const formatted = formatMoneyInput(e.target.value);
                                  setDraftByAddonId((prev) => ({ ...prev, [aid]: formatted }));
                                }}
                                placeholder="0.00"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2 shrink-0"
                                onClick={() => {
                                  const cents = parseMoneyToCents(draftByAddonId[aid] ?? "");
                                  setDealerProductAddonRetailCents(dealerId, pid, aid, cents);
                                }}
                              >
                                Save
                              </Button>
                            </div>
                            <div className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap text-right">
                              {typeof effectiveRetail === "number" ? moneyLabel(effectiveRetail) : "—"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
