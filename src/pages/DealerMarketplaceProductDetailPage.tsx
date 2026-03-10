import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { Button } from "../components/ui/button";
import { PageShell } from "../components/PageShell";
import { getMarketplaceApi } from "../lib/marketplace/marketplace";
import { getProductPricingApi } from "../lib/productPricing/productPricing";
import { getProductAddonsApi } from "../lib/productAddons/productAddons";
import { bestPricingRowForVehicleMileage } from "../lib/productPricing/defaultRow";
import { isPricingEligibleForVehicle } from "../lib/productPricing/eligibility";
import { resolveFinanceMatrixPricingRow } from "../lib/productPricing/financeMatrix";
import type { ProductPricing } from "../lib/productPricing/types";
import type { Product } from "../lib/products/types";
import { getProvidersApi } from "../lib/providers/providers";
import type { ProviderPublic } from "../lib/providers/types";
import { costFromProductOrPricing, retailFromCost } from "../lib/dealerPricing";
import { useDealerMarkupPct } from "../lib/dealerMarkup";
import { decodeVin } from "../lib/vin/decodeVin";
import {
  getDealerProductAddonRetailCents,
  getDealerProductPricingRetailCents,
  getDealerProductRetailCents,
  subscribeDealerProductRetail,
} from "../lib/dealerProductRetail";
import { getAppMode } from "../lib/runtime";
import { useAuth } from "../providers/AuthProvider";
import type { ProductAddon } from "../lib/productAddons/types";

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

function bulletLinesFromText(text: string, max: number) {
  const raw = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!raw) return [] as string[];

  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^[-•*]+\s*/, ""))
    .filter(Boolean);

  return lines.slice(0, max);
}

function firstSentenceOrLine(text?: string) {
  const raw = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";
  const firstLine = raw.split("\n")[0] ?? "";
  const idx = firstLine.indexOf(".");
  if (idx >= 30 && idx <= 120) return firstLine.slice(0, idx + 1);
  return firstLine;
}

function money(cents?: number) {
  if (typeof cents !== "number") return "—";
  const dollars = cents / 100;
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function claimLimitLabel(row: ProductPricing) {
  const type = typeof (row as any).claimLimitType === "string" ? String((row as any).claimLimitType).trim() : "";
  if (type === "FMV") return "FMV";
  if (type === "MAX_RETAIL") return "Max retail";
  if (type === "TOTAL_COVERAGE") return money(row.claimLimitCents);
  if (type === "PER_CLAIM") return money(row.claimLimitCents);
  return money(row.claimLimitCents);
}

function classTypesFor(product: Product, vehicleClass: string | null | undefined) {
  const c = (vehicleClass ?? "").trim().toUpperCase();
  const map = product.classVehicleTypes ?? undefined;
  if (map && typeof map === "object") {
    const direct = (map[c] ?? "").toString().trim();
    if (direct) return direct;
  }
  if (c === "CLASS_1") return (product.class1VehicleTypes ?? "").trim();
  if (c === "CLASS_2") return (product.class2VehicleTypes ?? "").trim();
  if (c === "CLASS_3") return (product.class3VehicleTypes ?? "").trim();
  return "";
}

function allowListLabel(items?: string[]) {
  const list = (items ?? []).map((x) => x.trim()).filter(Boolean);
  if (list.length === 0) return "All";
  return list.slice(0, 6).join(", ") + (list.length > 6 ? "…" : "");
}

function norm(v: string) {
  return (v ?? "").toString().trim().toLowerCase();
}

function normToken(v: string) {
  return norm(v).replace(/\s+/g, " ").trim();
}

function resolveVehicleClassForProduct(product: Product, decoded: Awaited<ReturnType<typeof decodeVin>> | null) {
  if (!decoded) return null as string | null;
  if (product.pricingStructure !== "MILEAGE_CLASS") return null as string | null;

  const vMake = normToken(decoded.vehicleMake ?? "");
  const vModel = normToken(decoded.vehicleModel ?? "");
  if (!vMake) return null as string | null;

  const map = (product as any).classVehicleTypes as Record<string, string> | undefined;
  if (!map || typeof map !== "object") return null as string | null;

  type Candidate = { classCode: string; score: number };
  const candidates: Candidate[] = [];

  const entryMatches = (raw: string) => {
    const t = String(raw ?? "").trim();
    if (!t) return { ok: false, score: 0 } as const;

    const exMatch = t.match(/^(.+?)\s*\(\s*excluding\s+(.+?)\s*\)$/i);
    const base = normToken(exMatch ? exMatch[1] : t);
    const exclusion = normToken(exMatch ? exMatch[2] : "");

    const parts = base.split(" ").filter(Boolean);
    const make = parts[0] ?? "";
    const modelPrefix = parts.slice(1).join(" ").trim();

    if (!make || make !== vMake) return { ok: false, score: 0 } as const;
    if (exclusion && vModel && vModel.includes(exclusion)) return { ok: false, score: 0 } as const;

    if (modelPrefix) {
      if (!vModel) return { ok: false, score: 0 } as const;
      const ok = vModel.includes(modelPrefix) || modelPrefix.includes(vModel);
      return { ok, score: ok ? 2 : 0 } as const;
    }

    return { ok: true, score: 1 } as const;
  };

  for (const [classCodeRaw, rulesRaw] of Object.entries(map)) {
    const classCode = String(classCodeRaw ?? "").trim().toUpperCase();
    if (!classCode) continue;

    const ruleText = String(rulesRaw ?? "");
    const tokens = ruleText
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    for (const token of tokens) {
      const res = entryMatches(token);
      if (res.ok) {
        candidates.push({ classCode, score: res.score });
        break;
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score || a.classCode.localeCompare(b.classCode));
  return candidates[0]!.classCode;
}

export function DealerMarketplaceProductDetailPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const productId = id ?? "";

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [productId]);

  const [searchParams] = useSearchParams();
  const vin = (searchParams.get("vin") ?? "").trim();
  const mileageRaw = (searchParams.get("mileageKm") ?? "").trim();
  const mileageNum = mileageRaw ? Number(mileageRaw) : NaN;
  const mileageKm = Number.isFinite(mileageNum) && mileageNum >= 0 ? mileageNum : null;
  const vehicleClass = (searchParams.get("vehicleClass") ?? "").trim();

  const loanAmountRaw = (searchParams.get("loanAmount") ?? "").trim();
  const loanAmountNum = loanAmountRaw ? Number(loanAmountRaw) : NaN;
  const loanAmountCents = Number.isFinite(loanAmountNum) && loanAmountNum > 0 ? Math.round(loanAmountNum * 100) : null;

  const financeTermRaw = (searchParams.get("financeTermMonths") ?? "").trim();
  const financeTermNum = financeTermRaw ? Number(financeTermRaw) : NaN;
  const financeTermMonths = Number.isFinite(financeTermNum) && financeTermNum > 0 ? Math.round(financeTermNum) : null;

  const ALLOWED_FINANCE_TERMS = useMemo(() => [24, 36, 48, 60, 72, 84, 96] as const, []);
  const financeTermMonthsValid =
    typeof financeTermMonths === "number" && (ALLOWED_FINANCE_TERMS as readonly number[]).includes(financeTermMonths) ? financeTermMonths : null;

  const [selectedFinanceTermMonths, setSelectedFinanceTermMonths] = useState<number | null>(financeTermMonthsValid);

  const mode = useMemo(() => getAppMode(), []);
  const dealerId = (mode === "local" ? (user?.dealerId ?? user?.id ?? "") : (user?.dealerId ?? "")).trim();
  const { markupPct } = useDealerMarkupPct(dealerId);

  const [retailOverridesVersion, setRetailOverridesVersion] = useState(0);
  useEffect(() => {
    const unsub = subscribeDealerProductRetail(() => {
      setRetailOverridesVersion((v) => v + 1);
    });
    return () => {
      unsub();
    };
  }, []);

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

  const providerName = product ? providerDisplayName(provider, product.providerId) : "";

  const isGap = product?.productType === "GAP";
  const gapLtvPct = useMemo(() => {
    if (!isGap) return null;
    if (typeof product?.coverageMaxLtvPercent === "number") return product.coverageMaxLtvPercent;
    const n = (product?.name ?? "").toLowerCase();
    return n.includes("160") ? 160 : 130;
  }, [isGap, product?.coverageMaxLtvPercent, product?.name]);

  const gapDescription = useMemo(() => {
    if (!isGap) return "";
    const fromProduct = firstSentenceOrLine(product?.coverageDetails ?? "");
    return fromProduct || "Protect your loan if your vehicle is written off.";
  }, [isGap, product?.coverageDetails]);

  const gapBullets = useMemo(() => {
    if (!isGap) return [] as string[];

    const fromKeyBenefits = bulletLinesFromText(product?.keyBenefits ?? "", 5);
    if (fromKeyBenefits.length) return fromKeyBenefits;

    const fromCoverage = bulletLinesFromText(product?.coverageDetails ?? "", 5);
    if (fromCoverage.length) return fromCoverage;

    return [
      "Covers loan balance after a total loss",
      "Up to $50,000 deficit coverage (coverage cap)",
      "Reimburses insurance deductible up to $1,000",
      "$500 loyalty benefit when returning to the same dealer for replacement vehicle",
      `Covers up to ${(gapLtvPct ?? 130).toString()}% of vehicle value`,
    ];
  }, [gapLtvPct, isGap, product?.coverageDetails]);

  const pricingQuery = useQuery({
    queryKey: ["marketplace-product-pricing", productId],
    enabled: !!productId,
    queryFn: () => productPricingApi.list({ productId }),
  });

  const vinDecodedQuery = useQuery({
    queryKey: ["vin-decode", vin],
    enabled: Boolean(vin),
    queryFn: () => decodeVin(vin),
    staleTime: 1000 * 60 * 60,
  });

  const inferredVehicleClass = useMemo(() => {
    if (!product) return null as string | null;
    if (vehicleClass.trim()) return null as string | null;
    if (!vinDecodedQuery.data) return null as string | null;
    return resolveVehicleClassForProduct(product, vinDecodedQuery.data);
  }, [product, vehicleClass, vinDecodedQuery.data]);

  const effectiveVehicleClass = (vehicleClass.trim() || (inferredVehicleClass ?? "")).trim();

  const pricingRows = (pricingQuery.data ?? []) as ProductPricing[];

  const eligibleFinanceTerms = useMemo(() => {
    if (!product || product.pricingStructure !== "FINANCE_MATRIX") return [] as number[];
    if (!loanAmountCents) return [] as number[];

    const terms = new Set<number>();
    for (const r of pricingRows) {
      if (typeof r.financeTermMonths !== "number") continue;
      if (!(ALLOWED_FINANCE_TERMS as readonly number[]).includes(r.financeTermMonths)) continue;
      const min = typeof r.loanAmountMinCents === "number" ? r.loanAmountMinCents : null;
      const max = typeof r.loanAmountMaxCents === "number" ? r.loanAmountMaxCents : null;
      if (min === null || max === null) continue;
      if (loanAmountCents < min || loanAmountCents > max) continue;
      terms.add(r.financeTermMonths);
    }

    return Array.from(terms.values()).sort((a, b) => a - b);
  }, [ALLOWED_FINANCE_TERMS, loanAmountCents, pricingRows, product]);

  useEffect(() => {
    if (!product || product.pricingStructure !== "FINANCE_MATRIX") return;
    if (eligibleFinanceTerms.length === 0) {
      setSelectedFinanceTermMonths(null);
      return;
    }
    setSelectedFinanceTermMonths((current) => {
      if (typeof current === "number" && eligibleFinanceTerms.includes(current)) return current;
      return eligibleFinanceTerms[0] ?? null;
    });
  }, [eligibleFinanceTerms, product]);

  const addonsQuery = useQuery({
    queryKey: ["product-addons-public", productId],
    enabled: !!productId,
    queryFn: () => productAddonsApi.list({ productId }),
  });

  const allAddons = ((addonsQuery.data ?? []) as ProductAddon[]).filter((a) => a.active);

  const primaryRow = useMemo(() => {
    if (product?.pricingStructure === "FINANCE_MATRIX") {
      if (!loanAmountCents) return null;
      const resolved = resolveFinanceMatrixPricingRow({
        rows: pricingRows,
        loanAmountCents,
        financeTermMonths: selectedFinanceTermMonths,
      });
      return resolved.ok ? resolved.row : null;
    }
    if (typeof mileageKm !== "number") return null;
    const eligible = pricingRows.filter((r) =>
      isPricingEligibleForVehicle({ pricing: r, vehicleMileageKm: mileageKm, vehicleClass: effectiveVehicleClass }),
    );

    if ((product?.pricingStructure ?? "") === "MILEAGE_CLASS" && effectiveVehicleClass.trim()) {
      const code = effectiveVehicleClass.trim();
      const classSpecific = eligible.filter((r) => (r.vehicleClass ?? "").toString().trim() === code);
      if (classSpecific.length > 0) return bestPricingRowForVehicleMileage(classSpecific);
    }
    return bestPricingRowForVehicleMileage(eligible);
  }, [effectiveVehicleClass, loanAmountCents, mileageKm, pricingRows, product?.pricingStructure, selectedFinanceTermMonths]);

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

  const selectedAddonsTotalCents = useMemo(() => {
    if (activeAddons.length === 0) return 0;
    let total = 0;
    void retailOverridesVersion;
    const pid = (product?.id ?? "").trim();
    for (const a of activeAddons) {
      if (!selectedAddonIds[a.id]) continue;
      const aid = (a.id ?? "").trim();
      const addonOverride = dealerId && pid && aid ? getDealerProductAddonRetailCents(dealerId, pid, aid) : null;
      const cost = costFromProductOrPricing({ dealerCostCents: a.dealerCostCents, basePriceCents: a.basePriceCents });
      const retail = typeof addonOverride === "number" ? addonOverride : retailFromCost(cost, markupPct) ?? cost;
      if (typeof retail === "number" && Number.isFinite(retail) && retail > 0) total += retail;
    }
    return total;
  }, [activeAddons, dealerId, markupPct, product?.id, retailOverridesVersion, selectedAddonIds]);

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

  const eligiblePricingRows = useMemo(() => {
    if (!product) return [] as ProductPricing[];

    if (product.pricingStructure === "FINANCE_MATRIX") {
      if (!loanAmountCents) return pricingRows;
      return pricingRows
        .filter((r) => (selectedFinanceTermMonths ? r.financeTermMonths === selectedFinanceTermMonths : true))
        .filter((r) => {
          const min = typeof r.loanAmountMinCents === "number" ? r.loanAmountMinCents : null;
          const max = typeof r.loanAmountMaxCents === "number" ? r.loanAmountMaxCents : null;
          if (min === null || max === null) return false;
          return loanAmountCents >= min && loanAmountCents <= max;
        });
    }

    if (typeof mileageKm !== "number") return pricingRows;
    const eligible = pricingRows.filter((r) =>
      isPricingEligibleForVehicle({ pricing: r, vehicleMileageKm: mileageKm, vehicleClass: effectiveVehicleClass }),
    );

    if (product.pricingStructure === "MILEAGE_CLASS" && effectiveVehicleClass.trim()) {
      const code = effectiveVehicleClass.trim();
      const classSpecific = eligible.filter((r) => (r.vehicleClass ?? "").toString().trim() === code);
      if (classSpecific.length > 0) return classSpecific;
    }

    return eligible;
  }, [effectiveVehicleClass, loanAmountCents, mileageKm, pricingRows, product, selectedFinanceTermMonths]);

  const sortedPricingRows = eligiblePricingRows
    .slice()
    .sort((a, b) => {
      if (product?.pricingStructure === "FINANCE_MATRIX") {
        const at = typeof a.financeTermMonths === "number" ? a.financeTermMonths : Number.MAX_SAFE_INTEGER;
        const bt = typeof b.financeTermMonths === "number" ? b.financeTermMonths : Number.MAX_SAFE_INTEGER;
        const amin = typeof a.loanAmountMinCents === "number" ? a.loanAmountMinCents : Number.MAX_SAFE_INTEGER;
        const bmin = typeof b.loanAmountMinCents === "number" ? b.loanAmountMinCents : Number.MAX_SAFE_INTEGER;
        const amax = typeof a.loanAmountMaxCents === "number" ? a.loanAmountMaxCents : Number.MAX_SAFE_INTEGER;
        const bmax = typeof b.loanAmountMaxCents === "number" ? b.loanAmountMaxCents : Number.MAX_SAFE_INTEGER;
        return (at - bt) || (amin - bmin) || (amax - bmax) || (a.deductibleCents - b.deductibleCents);
      }

      const am = a.termMonths ?? Number.MAX_SAFE_INTEGER;
      const bm = b.termMonths ?? Number.MAX_SAFE_INTEGER;
      const ak = a.termKm ?? Number.MAX_SAFE_INTEGER;
      const bk = b.termKm ?? Number.MAX_SAFE_INTEGER;
      return (am - bm) || (ak - bk) || (a.deductibleCents - b.deductibleCents);
    });

  useEffect(() => {
    if (!selectedPricingId) {
      const next = (primaryRow?.id ?? sortedPricingRows[0]?.id ?? "").trim();
      if (next) setSelectedPricingId(next);
      return;
    }
    const stillVisible = sortedPricingRows.some((r) => r.id === selectedPricingId);
    if (!stillVisible) {
      const next = (primaryRow?.id ?? sortedPricingRows[0]?.id ?? "").trim();
      setSelectedPricingId(next);
    }
  }, [primaryRow?.id, selectedPricingId, sortedPricingRows]);

  const onSelectProduct = () => {
    const params = new URLSearchParams();
    params.set("productId", productId);
    const pricingId = selectedPricingId.trim();
    if (pricingId) params.set("productPricingId", pricingId);

    if (vin) params.set("vin", vin);
    if (typeof mileageKm === "number" && Number.isFinite(mileageKm)) params.set("mileageKm", String(mileageKm));

    const addonIds = Object.keys(selectedAddonIds).filter((id) => selectedAddonIds[id]);
    if (addonIds.length > 0) params.set("addonIds", addonIds.join(","));
    window.location.assign(`/dealer-contracts?${params.toString()}`);
  };

  return (
    <PageShell
      title={""}
      subtitleAsChild
      subtitle={
        product ? (
          <div className="flex items-center gap-4 flex-wrap">
            <div className="h-16 w-16 md:h-20 md:w-20 rounded-2xl border bg-white/70 overflow-hidden flex items-center justify-center">
              {provider?.logoUrl ? <img src={provider.logoUrl} alt="" className="h-full w-full object-contain" /> : null}
            </div>
            <div className="text-base md:text-lg font-semibold text-foreground">
              {providerName} • {product.name}
            </div>
          </div>
        ) : null
      }
    >
      {!productsQuery.isLoading && !product ? <div className="text-sm text-muted-foreground">Product not found.</div> : null}

      {product ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b">
                <div className="font-semibold">Pricing Options</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {product.pricingStructure === "FINANCE_MATRIX"
                    ? "Choose the loan band and finance term when creating the contract."
                    : "Choose a term and mileage limit when creating the contract."}
                </div>
              </div>

              <div className="px-6 py-6">
                {product.pricingStructure === "FINANCE_MATRIX" && !loanAmountCents ? (
                  <div className="mb-4 rounded-xl border bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
                    Enter a valid loan amount (&gt; 0) on the Marketplace search page to see GAP pricing.
                  </div>
                ) : null}

                {isGap ? (
                  <div className="rounded-xl border bg-muted/10 p-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="text-sm text-muted-foreground">{gapDescription}</div>
                      <div className="inline-flex items-center rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                        GAP {gapLtvPct ? `${gapLtvPct}%` : ""}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4">
                      <div className="md:col-span-7 rounded-lg border bg-background/70 p-3">
                        <div className="text-xs font-medium text-foreground">Deal details</div>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                          <div>
                            <div className="text-[11px] text-muted-foreground">Loan amount</div>
                            <div className="font-medium text-foreground">{loanAmountCents ? money(loanAmountCents) : "—"}</div>
                          </div>
                          <div>
                            <div className="text-[11px] text-muted-foreground">Finance term</div>
                            <div className="font-medium text-foreground">
                              <select
                                value={selectedFinanceTermMonths ? String(selectedFinanceTermMonths) : ""}
                                onChange={(e) => setSelectedFinanceTermMonths(e.target.value ? Number(e.target.value) : null)}
                                disabled={!loanAmountCents || eligibleFinanceTerms.length === 0}
                                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-sm disabled:opacity-60"
                              >
                                {eligibleFinanceTerms.length === 0 ? <option value="">No eligible terms</option> : null}
                                {eligibleFinanceTerms.map((t) => (
                                  <option key={t} value={String(t)}>
                                    {t} months
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-5 rounded-lg border bg-background/70 p-3">
                        <div className="text-xs font-medium text-foreground">Total price</div>
                        <div className="mt-2">
                          {(() => {
                            const r = sortedPricingRows.find((x) => x.id === selectedPricingId) ?? primaryRow;
                            if (!r) return <div className="text-sm text-muted-foreground">—</div>;
                            void retailOverridesVersion;
                            const pid = (product?.id ?? "").trim();
                            const rid = (r.id ?? "").trim();
                            const termOverride = dealerId && pid && rid ? getDealerProductPricingRetailCents(dealerId, pid, rid) : null;
                            const override = dealerId && pid ? getDealerProductRetailCents(dealerId, pid) : null;
                            const cost = costFromProductOrPricing({ dealerCostCents: r.dealerCostCents, basePriceCents: r.basePriceCents });
                            const retail =
                              typeof termOverride === "number"
                                ? termOverride
                                : typeof override === "number"
                                  ? override
                                  : retailFromCost(cost, markupPct) ?? cost;
                            const baseRetailCents = typeof retail === "number" && Number.isFinite(retail) ? retail : 0;
                            const totalRetail = baseRetailCents + selectedAddonsTotalCents;
                            return (
                              <>
                                <div className="text-3xl font-bold text-foreground leading-none">{money(totalRetail)}</div>
                                <div className="mt-1 text-[11px] text-muted-foreground">One-time cost</div>
                                <div className="mt-3 text-[11px] text-muted-foreground">Deductible {money(0)}</div>
                                <div className="mt-4">
                                  <Button type="button" className="h-11 w-full bg-yellow-400 text-black hover:bg-yellow-300" onClick={onSelectProduct}>
                                    Select product
                                  </Button>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {!pricingQuery.isLoading && !pricingQuery.isError && pricingRows.length > 0 && sortedPricingRows.length === 0 ? (
                      <div className="mt-4 rounded-lg border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
                        No pricing options are eligible for the values you entered on Find Products.
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <>
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

                              const baseRetail = (() => {
                                void retailOverridesVersion;
                                const pid = (product?.id ?? "").trim();
                                const rid = (r.id ?? "").trim();
                                const termOverride = dealerId && pid && rid ? getDealerProductPricingRetailCents(dealerId, pid, rid) : null;
                                const override = dealerId && pid ? getDealerProductRetailCents(dealerId, pid) : null;
                                const cost = costFromProductOrPricing({ dealerCostCents: r.dealerCostCents, basePriceCents: r.basePriceCents });
                                return typeof termOverride === "number"
                                  ? termOverride
                                  : typeof override === "number"
                                    ? override
                                    : retailFromCost(cost, markupPct) ?? cost;
                              })();

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
                                        {r.termMonths === null ? "Unlimited" : `${r.termMonths} months`} / {r.termKm === null ? "Unlimited" : `${r.termKm.toLocaleString()} km`}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 pr-3 text-muted-foreground">{(r.vehicleClass ?? "").trim() || "All classes"}</td>
                                  <td className="px-4 py-3 pr-3 text-muted-foreground">
                                    {typeof r.vehicleMileageMinKm === "number" ? r.vehicleMileageMinKm.toLocaleString() : "—"}–
                                    {r.vehicleMileageMaxKm === null
                                      ? "Unlimited"
                                      : typeof r.vehicleMileageMaxKm === "number"
                                        ? r.vehicleMileageMaxKm.toLocaleString()
                                        : "—"}
                                  </td>
                                  <td className="px-4 py-3 pr-3 text-muted-foreground">{claimLimitLabel(r)}</td>
                                  <td className="px-4 py-3 pr-3 text-muted-foreground">{money(r.deductibleCents)}</td>
                                  <td className="px-4 py-3 pr-3 font-medium text-foreground">
                                    <div>{money(baseRetail)}</div>
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
                                  void retailOverridesVersion;
                                  const pid = (product?.id ?? "").trim();
                                  const override = dealerId && pid ? getDealerProductRetailCents(dealerId, pid) : null;
                                  const cost = costFromProductOrPricing({ dealerCostCents: product.dealerCostCents, basePriceCents: product.basePriceCents });
                                  const retail =
                                    typeof override === "number" ? override : retailFromCost(cost, markupPct) ?? cost;
                                  return <div>{money(retail)}</div>;
                                })()}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4 rounded-lg border bg-muted/10 p-3">
                      {(() => {
                        const r = sortedPricingRows.find((x) => x.id === selectedPricingId) ?? primaryRow;
                        if (!r) {
                          return <div className="text-sm text-muted-foreground">Select a pricing option to continue.</div>;
                        }
                        void retailOverridesVersion;
                        const pid = (product?.id ?? "").trim();
                        const rid = (r.id ?? "").trim();
                        const termOverride = dealerId && pid && rid ? getDealerProductPricingRetailCents(dealerId, pid, rid) : null;
                        const override = dealerId && pid ? getDealerProductRetailCents(dealerId, pid) : null;
                        const cost = costFromProductOrPricing({ dealerCostCents: r.dealerCostCents, basePriceCents: r.basePriceCents });
                        const retail =
                          typeof termOverride === "number"
                            ? termOverride
                            : typeof override === "number"
                              ? override
                              : retailFromCost(cost, markupPct) ?? cost;
                        const baseRetailCents = typeof retail === "number" && Number.isFinite(retail) ? retail : 0;
                        const totalRetail = baseRetailCents + selectedAddonsTotalCents;
                        return (
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                              <div className="text-xs font-medium text-foreground">Total price</div>
                              <div className="mt-1 text-2xl font-bold text-foreground leading-none">{money(totalRetail)}</div>
                            </div>
                            <Button type="button" className="h-11 bg-yellow-400 text-black hover:bg-yellow-300" onClick={onSelectProduct}>
                              Select product
                            </Button>
                          </div>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>
            </div>

            {isGap ? (
              <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
                <div className="px-6 py-4 border-b">
                  <div className="font-semibold">What this protects</div>
                </div>
                <div className="px-6 py-6 text-sm text-muted-foreground">
                  <div className="space-y-2">
                    {gapBullets.map((b) => (
                      <div key={b} className="flex items-start gap-2">
                        <span className="mt-0.5">•</span>
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
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
            )}
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
                    {typeof product.eligibilityMaxVehicleAgeYears === "number"
                      ? `${product.eligibilityMaxVehicleAgeYears} years`
                      : product.productType === "GAP"
                        ? "10 years"
                        : "—"}
                  </div>
                </div>
                {isGap ? (
                  <>
                    <div>
                      <div className="text-xs text-muted-foreground">Max LTV</div>
                      <div className="font-medium text-foreground">{gapLtvPct ? `${gapLtvPct}%` : "—"}</div>
                    </div>
                    <div className="pt-2 border-t" />
                    <div className="text-xs text-muted-foreground">Must be financed</div>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="text-xs text-muted-foreground">Max Mileage</div>
                      <div className="font-medium text-foreground">
                        {typeof product.eligibilityMaxMileageKm === "number" ? `${product.eligibilityMaxMileageKm.toLocaleString()} km` : "—"}
                      </div>
                    </div>
                    <div className="pt-2 border-t" />
                    {product.pricingStructure === "MILEAGE_CLASS" ? (
                      (() => {
                        const code = (effectiveVehicleClass ?? "").toString().trim();
                        const types = code ? classTypesFor(product, code) : "";
                        const labelMatch = code.toUpperCase().match(/^CLASS_(\d+)$/);
                        const label = labelMatch ? `Class ${labelMatch[1]}` : code || "Class";
                        return (
                          <>
                            <div>
                              <div className="text-xs text-muted-foreground">{label}</div>
                              <div className="font-medium text-foreground">{types.trim() ? types : "—"}</div>
                            </div>
                          </>
                        );
                      })()
                    ) : (
                      <>
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
                      </>
                    )}
                  </>
                )}
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
                    void retailOverridesVersion;
                    const pid = (product?.id ?? "").trim();
                    const aid = (a.id ?? "").trim();
                    const addonOverride = dealerId && pid && aid ? getDealerProductAddonRetailCents(dealerId, pid, aid) : null;
                    const cost = costFromProductOrPricing({ dealerCostCents: a.dealerCostCents, basePriceCents: a.basePriceCents });
                    const retail = typeof addonOverride === "number" ? addonOverride : retailFromCost(cost, markupPct) ?? cost;
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
