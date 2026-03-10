import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";

import {
  BadgeDollarSign,
  Building2,
  Car,
  ChevronDown,
  CircleCheck,
  DollarSign,
  Gauge,
  SlidersHorizontal,
  Shapes,
  X,
} from "lucide-react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { costFromProductOrPricing, retailFromCost } from "../lib/dealerPricing";
import { useDealerMarkupPct } from "../lib/dealerMarkup";
import { getDealerProductPricingRetailCents, getDealerProductRetailCents, subscribeDealerProductRetail } from "../lib/dealerProductRetail";
import { getMarketplaceApi } from "../lib/marketplace/marketplace";
import type { MarketplaceProduct } from "../lib/marketplace/api";
import { getProductPricingApi } from "../lib/productPricing/productPricing";
import type { ProductPricing } from "../lib/productPricing/types";
import { isPricingEligibleForVehicleWithConstraints } from "../lib/productPricing/eligibility";
import { bestPricingRowForVehicleMileage } from "../lib/productPricing/defaultRow";
import type { Product, ProductType } from "../lib/products/types";
import { getProvidersApi } from "../lib/providers/providers";
import type { ProviderPublic } from "../lib/providers/types";
import { useAuth } from "../providers/AuthProvider";
import { decodeVin } from "../lib/vin/decodeVin";
import { getAppMode, hasSupabaseEnv } from "../lib/runtime";

function productTypeLabel(t: ProductType) {
  if (t === "EXTENDED_WARRANTY") return "Extended Warranty";
  if (t === "TIRE_RIM") return "Tire & Rim";
  if (t === "APPEARANCE") return "Appearance";
  if (t === "GAP") return "GAP Insurance";
  return "Other";
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

function firstSentenceOrLine(text: string) {
  const raw = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";
  const firstLine = raw.split("\n")[0] ?? "";
  const idx = firstLine.indexOf(".");
  if (idx >= 30 && idx <= 120) return firstLine.slice(0, idx + 1);
  return firstLine;
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
  const dollars = cents / 100;
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

type PersistedMarketplaceState = {
  vin?: string;
  mileageKm?: string;
  vehicleClass?: string;
  loanAmount?: string;
  decoded?: Awaited<ReturnType<typeof decodeVin>> | null;
  providerId?: string;
  productType?: string;
  priceSort?: string;
  showVehicleDetails?: boolean;
  maxPrice?: string;
  maxYears?: string;
  maxKm?: string;
  minTermMonths?: string;
  minTermKm?: string;
  maxDeductible?: string;
  eligiblePage?: number;
};

const DEALER_MARKETPLACE_STATE_KEY = "warrantyhub.dealerMarketplace.state";

function readPersistedDealerMarketplaceState(): PersistedMarketplaceState | null {
  try {
    const raw = sessionStorage.getItem(DEALER_MARKETPLACE_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedMarketplaceState;
  } catch {
    return null;
  }
}

export function DealerMarketplacePage() {
  const marketplaceApi = useMemo(() => getMarketplaceApi(), []);
  const providersApi = useMemo(() => getProvidersApi(), []);
  const productPricingApi = useMemo(() => getProductPricingApi(), []);
  const { user } = useAuth();
  const mode = useMemo(() => getAppMode(), []);
  const supabaseConfigured = useMemo(() => hasSupabaseEnv(), []);

  const [searchParams] = useSearchParams();

  const persisted = readPersistedDealerMarketplaceState();

  const [vin, setVin] = useState(() => (searchParams.get("vin") ?? persisted?.vin ?? ""));
  const [mileageKm, setMileageKm] = useState(() => (searchParams.get("mileageKm") ?? persisted?.mileageKm ?? ""));
  const [vehicleClass, setVehicleClass] = useState(() => {
    const hasVin = Boolean((searchParams.get("vin") ?? "").trim());
    if (hasVin) return "";
    return searchParams.get("vehicleClass") ?? persisted?.vehicleClass ?? "";
  });
  const [decoded, setDecoded] = useState<Awaited<ReturnType<typeof decodeVin>> | null>(() => persisted?.decoded ?? null);
  const [decodeError, setDecodeError] = useState<string | null>(null);

  const [providerId, setProviderId] = useState(() => persisted?.providerId ?? "");
  const [productType, setProductType] = useState<string>(() => persisted?.productType ?? "");
  const [priceSort, setPriceSort] = useState<string>(() => persisted?.priceSort ?? "");
  const [showVehicleDetails, setShowVehicleDetails] = useState(() => persisted?.showVehicleDetails ?? false);
  const [maxPrice] = useState(() => persisted?.maxPrice ?? "");
  const [maxYears] = useState(() => persisted?.maxYears ?? "");
  const [maxKm] = useState(() => persisted?.maxKm ?? "");
  const [minTermMonths] = useState(() => persisted?.minTermMonths ?? "");
  const [minTermKm] = useState(() => persisted?.minTermKm ?? "");
  const [maxDeductible] = useState(() => persisted?.maxDeductible ?? "");
  const [loanAmount, setLoanAmount] = useState(() => (searchParams.get("loanAmount") ?? persisted?.loanAmount ?? ""));

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

  const shownPriceFor = (p: MarketplaceProduct, primaryPricing?: ProductPricing | null) => {
    void retailOverridesVersion;

    const pid = (p.id ?? "").trim();
    const primaryId = (primaryPricing?.id ?? "").trim();
    const termOverride = dealerId && pid && primaryId ? getDealerProductPricingRetailCents(dealerId, pid, primaryId) : null;
    if (typeof termOverride === "number" && Number.isFinite(termOverride) && termOverride > 0) return termOverride;

    const override = dealerId ? getDealerProductRetailCents(dealerId, (p.id ?? "").trim()) : null;
    if (typeof override === "number" && Number.isFinite(override) && override > 0) return override;

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
      setVehicleClass("");
      setDecodeError(null);
    },
    onError: (err) => {
      setDecoded(null);
      setDecodeError(err instanceof Error ? err.message : "VIN decode failed");
    },
  });

  useEffect(() => {
    if (decoded) return;
    if (!vin.trim()) return;
    if (decodeMutation.isPending) return;
    void decodeMutation.mutateAsync(vin.trim());
  }, [decoded, decodeMutation, vin]);

  useEffect(() => {
    if (!decoded) return;
    setVehicleClass("");
  }, [decoded]);

  useEffect(() => {
    try {
      const next: PersistedMarketplaceState = {
        vin,
        mileageKm,
        vehicleClass: decoded ? "" : vehicleClass,
        loanAmount,
        decoded,
        providerId,
        productType,
        priceSort,
        showVehicleDetails,
        maxPrice,
        maxYears,
        maxKm,
        minTermMonths,
        minTermKm,
        maxDeductible,
      };
      sessionStorage.setItem(DEALER_MARKETPLACE_STATE_KEY, JSON.stringify(next));
    } catch {
      return;
    }
  }, [
    decoded,
    loanAmount,
    maxDeductible,
    maxKm,
    maxPrice,
    maxYears,
    mileageKm,
    minTermKm,
    minTermMonths,
    priceSort,
    productType,
    providerId,
    showVehicleDetails,
    vehicleClass,
    vin,
  ]);

  const productsQuery = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: () => marketplaceApi.listPublishedProducts(),
  });

  const products = (productsQuery.data ?? []) as MarketplaceProduct[];
  const isProviderSignedIn = (user?.role ?? "") === "PROVIDER";
  const roleMayBlockPublishedProducts = mode === "supabase" && isProviderSignedIn;

  const isGapProduct = (p: { productType?: unknown }) => String(p.productType ?? "") === "GAP";
  const anyGapProductsExist = products.some((p) => isGapProduct(p));

  const providerOptions = Array.from(new Set(products.map((p) => p.providerId).filter(Boolean))).sort();
  const productTypeOptions = Array.from(new Set(products.map((p) => String(p.productType ?? "")).filter(Boolean))).sort();

  const providersQuery = useQuery({
    queryKey: ["providers", providerOptions.join(",")],
    queryFn: () => providersApi.listByIds(providerOptions),
    enabled: providerOptions.length > 0,
  });

  const providerById = new Map(((providersQuery.data ?? []) as ProviderPublic[]).map((p) => [p.id, p] as const));

  const providerItems = useMemo(() => {
    return providerOptions
      .map((pid) => {
        const provider = providerById.get(pid);
        return {
          id: pid,
          name: providerDisplayName(provider, pid),
          logoUrl: provider?.logoUrl ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [providerById, providerOptions]);

  const selectedProviderItem = useMemo(() => {
    const pid = providerId.trim();
    if (!pid) return null;
    return providerItems.find((p) => p.id === pid) ?? null;
  }, [providerId, providerItems]);

  const normToken = (v: string) => norm(v).replace(/\s+/g, " ").trim();

  const resolveVehicleClassForProduct = (p: Product, decoded: Awaited<ReturnType<typeof decodeVin>> | null) => {
    if (!decoded) return null as string | null;
    if (p.pricingStructure !== "MILEAGE_CLASS") return null as string | null;

    const vMake = normToken(decoded.vehicleMake ?? "");
    const vModel = normToken(decoded.vehicleModel ?? "");
    if (!vMake) return null as string | null;

    const map = (p as any).classVehicleTypes as Record<string, string> | undefined;
    if (!map || typeof map !== "object") return null as string | null;

    type Candidate = { classCode: string; score: number };
    const candidates: Candidate[] = [];

    const entryMatches = (raw: string) => {
      const t = String(raw ?? "").trim();
      if (!t) return { ok: false, score: 0 } as const;

      const exMatch = t.match(/^(.+?)\s*\(\s*excluding\s+(.+?)\s*\)$/i);
      const base = normToken(exMatch ? exMatch[1] : t);
      const exclusion = normToken(exMatch ? exMatch[2] : "");

      // base supports either:
      // - "Honda"
      // - "Infiniti QX" (make + model prefix)
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
  };

  const parsedMileage = parseNum(mileageKm);
  const vehicleYear = parseNum(decoded?.vehicleYear ?? "");
  const vehicleAgeYears = typeof vehicleYear === "number" ? new Date().getFullYear() - vehicleYear : undefined;

  const eligibleByVehicle = (p: Product) => {
    if (!decoded) return false;

    const effectiveMaxAgeYears = (() => {
      if (typeof p.eligibilityMaxVehicleAgeYears === "number") return p.eligibilityMaxVehicleAgeYears;
      return isGapProduct(p) ? 10 : undefined;
    })();

    const eligibleByAge =
      typeof effectiveMaxAgeYears !== "number"
        ? true
        : typeof vehicleAgeYears === "number"
          ? vehicleAgeYears <= effectiveMaxAgeYears
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

  const loanAmountCents = (() => {
    const n = parseNum(loanAmount);
    return typeof n === "number" && n > 0 ? Math.round(n * 100) : undefined;
  })();

  const showGapQuoteFields = (() => {
    if (!decoded) return false;
    if (productType.trim() && productType.trim() === "GAP") return true;
    return anyGapProductsExist;
  })();

  const filtered = (decoded ? products.filter((p) => eligibleByVehicle(p)) : [])
    .filter((p) => (!providerId.trim() ? true : p.providerId === providerId.trim()))
    .filter((p) => (!productType.trim() ? true : p.productType === (productType.trim() as ProductType)))
    .filter((p) => {
      const mp = p as MarketplaceProduct;
      if (isGapProduct(mp) && mp.pricingStructure === "FINANCE_MATRIX" && !loanAmountCents) return false;
      return true;
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
      loanAmountCents ?? "",
    ],
    enabled: Boolean(decoded) && typeof parsedMileage === "number" && candidateProductIds.length > 0,
    queryFn: async () => {
      const treatClassAsWildcard = !vehicleClass.trim();

      const asFiniteNonNegativeNumber = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

      const matchesMinMax = (input: { value: number; min?: number | null; max?: number | null }) => {
        const min = typeof input.min === "number" && Number.isFinite(input.min) ? input.min : 0;
        const max = typeof input.max === "number" && Number.isFinite(input.max) ? input.max : null;
        if (input.value < min) return false;
        if (typeof max === "number" && input.value > max) return false;
        return true;
      };

      const matchesMin = (input: { value: number | null; min?: number | null }) => {
        const min = typeof input.min === "number" && Number.isFinite(input.min) ? input.min : null;
        if (typeof min !== "number") return true;
        if (input.value === null) return true;
        return input.value >= min;
      };

      const matchesMax = (input: { value: number; max?: number | null }) => {
        const max = typeof input.max === "number" && Number.isFinite(input.max) ? input.max : null;
        if (typeof max !== "number") return true;
        return input.value <= max;
      };

      const isEligibleIgnoringClass = (r: ProductPricing) => {
        const mileage = asFiniteNonNegativeNumber(parsedMileage);
        if (mileage === null) return false;

        if (
          !matchesMinMax({
            value: mileage,
            min: typeof r.vehicleMileageMinKm === "number" ? r.vehicleMileageMinKm : 0,
            max: r.vehicleMileageMaxKm ?? null,
          })
        ) {
          return false;
        }

        const termMonths = typeof r.termMonths === "number" && Number.isFinite(r.termMonths) ? r.termMonths : null;
        const termKm = typeof r.termKm === "number" && Number.isFinite(r.termKm) ? r.termKm : null;

        if (!matchesMin({ value: termMonths, min: minTermMonthsNum ?? null })) return false;
        if (!matchesMin({ value: termKm, min: minTermKmNum ?? null })) return false;

        const deductible = typeof r.deductibleCents === "number" && Number.isFinite(r.deductibleCents) ? r.deductibleCents : 0;
        if (!matchesMax({ value: deductible, max: maxDeductibleCents ?? null })) return false;

        return true;
      };

      const entries = await Promise.all(
        candidateProductIds.map(async (pid) => {
          const rows = (await productPricingApi.list({ productId: pid })) as ProductPricing[];

          const product = filtered.find((p) => p.id === pid) as MarketplaceProduct | undefined;
          if (product?.pricingStructure === "FINANCE_MATRIX") {
            return [pid, null] as const;
          }

          const inferredClass = treatClassAsWildcard ? resolveVehicleClassForProduct(product as any, decoded) : null;
          const effectiveVehicleClass = treatClassAsWildcard ? (inferredClass ?? "") : vehicleClass;
          const canApplyClass = !treatClassAsWildcard || Boolean(inferredClass);

          const eligibleRows = canApplyClass
            ? rows.filter((r) =>
                isPricingEligibleForVehicleWithConstraints({
                  pricing: r,
                  vehicleMileageKm: parsedMileage as number,
                  vehicleClass: effectiveVehicleClass,
                  minTermMonths: minTermMonthsNum ?? null,
                  minTermKm: minTermKmNum ?? null,
                  maxDeductibleCents: maxDeductibleCents ?? null,
                }),
              )
            : rows.filter((r) => isEligibleIgnoringClass(r));
          const primary = bestPricingRowForVehicleMileage(eligibleRows);
          return [pid, primary] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, ProductPricing | null>;
    },
  });

  const eligibleVariantPricingByProductId = (eligibleVariantPricingByProductIdQuery.data ?? {}) as Record<string, ProductPricing | null>;

  const canUseFilters = Boolean(decoded);

  const resetVehicleAndDealInfo = () => {
    setVin("");
    setMileageKm("");
    setVehicleClass("");
    setLoanAmount("");
    setDecoded(null);
    setDecodeError(null);
  };

  const filteredByVariant = useMemo(() => {
    if (!decoded) return [] as Product[];
    if (typeof parsedMileage !== "number") return [] as Product[];
    if (candidateProductIds.length === 0) return [] as Product[];
    return filtered.filter((p) => {
      const mp = p as MarketplaceProduct;
      if (mp.pricingStructure === "FINANCE_MATRIX") return true;
      return Boolean(eligibleVariantPricingByProductId[p.id]);
    });
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

  const eligibleFlat = useMemo(() => {
    return grouped.flatMap((g) =>
      g.products.map((p) => ({
        product: p,
        providerName: g.providerName,
        providerLogoUrl: g.providerLogoUrl,
      })),
    );
  }, [grouped]);

  const detailHrefFor = (productId: string) => {
    const params = new URLSearchParams();
    if (decoded?.vin) params.set("vin", decoded.vin);
    if (mileageKm.trim()) params.set("mileageKm", mileageKm.trim());
    if (!decoded && vehicleClass.trim()) params.set("vehicleClass", vehicleClass.trim());
    if (loanAmount.trim()) params.set("loanAmount", loanAmount.trim());
    const qs = params.toString();
    return `/dealer-marketplace/products/${productId}${qs ? `?${qs}` : ""}`;
  };

  const compareHref = (() => {
    const params = new URLSearchParams();
    if (vin.trim()) params.set("vin", vin.trim());
    if (mileageKm.trim()) params.set("mileageKm", mileageKm.trim());
    if (!decoded && vehicleClass.trim()) params.set("vehicleClass", vehicleClass.trim());
    if (loanAmount.trim()) params.set("loanAmount", loanAmount.trim());
    const qs = params.toString();
    return `/dealer-marketplace/compare${qs ? `?${qs}` : ""}`;
  })();

  return (
    <PageShell
      title=""
    >
      <div className="relative">
        <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-blue-600/10 via-transparent to-yellow-400/10 blur-2xl" />

        <div className="rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
          <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600/10 via-transparent to-yellow-500/10">
            <div className="font-semibold">Search</div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 space-y-6">
                <div className="rounded-2xl border bg-background/40 overflow-hidden">
                  <div className="px-5 py-4 border-b">
                    <div className="flex items-center gap-2 text-base font-semibold text-foreground">
                      <Car className="h-5 w-5" />
                      Vehicle &amp; Deal Information
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      <div className="md:col-span-9">
                        <div className="text-xs font-semibold text-foreground">VIN</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Input
                            value={vin}
                            onChange={(e) => setVin(e.target.value)}
                            placeholder="Enter VIN"
                            className="h-10 text-sm flex-1 min-w-[240px]"
                          />
                          <Button
                            className="h-10 whitespace-nowrap bg-blue-600 text-white hover:bg-blue-700"
                            disabled={!vin.trim() || decodeMutation.isPending}
                            onClick={() => void decodeMutation.mutateAsync(vin.trim())}
                          >
                            Decode
                          </Button>
                          <Button
                            variant="outline"
                            className="h-10 whitespace-nowrap"
                            disabled={decodeMutation.isPending && !decoded}
                            onClick={() => resetVehicleAndDealInfo()}
                          >
                            Reset
                          </Button>
                        </div>
                      </div>

                      <div className="md:col-span-3">
                        <div className="text-xs font-semibold text-foreground">Mileage (km)</div>
                        <div className="mt-2 relative">
                          <Input
                            value={mileageKm}
                            onChange={(e) => setMileageKm(e.target.value)}
                            placeholder="e.g. 50000"
                            inputMode="numeric"
                            className="h-10 text-sm pr-12"
                          />
                          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">km</div>
                        </div>
                      </div>
                    </div>

                    {decoded ? (
                      <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                        <CircleCheck className="h-4 w-4 text-emerald-600" />
                        <div className="truncate">
                          {decoded.vehicleYear ?? "—"} {decoded.vehicleMake ?? ""} {decoded.vehicleModel ?? ""}
                          {decoded.vehicleTrim ? ` ${decoded.vehicleTrim}` : ""}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border bg-background/40 overflow-hidden">
                  <div className="px-5 py-4 border-b">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <DollarSign className="h-4 w-4" />
                      Deal Finance
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      <div className="md:col-span-6 rounded-xl border bg-background/70 p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <Gauge className="h-4 w-4" />
                          Loan Details (GAP only)
                        </div>

                        <div className="mt-3">
                          <div className="text-xs text-muted-foreground mb-1">Loan Amount</div>
                          {showGapQuoteFields ? (
                            <Input
                              value={loanAmount}
                              onChange={(e) => setLoanAmount(e.target.value)}
                              placeholder="e.g. 12000"
                              inputMode="decimal"
                              className={"h-10 text-sm " + (!canUseFilters ? "opacity-60 pointer-events-none" : "")}
                            />
                          ) : (
                            <div className="h-10 rounded-md border border-input bg-transparent px-3 text-xs shadow-sm flex items-center text-muted-foreground/70">
                              —
                            </div>
                          )}
                          <div className="mt-2 text-xs text-muted-foreground">Finance term will be selected on the GAP plan page.</div>
                        </div>
                      </div>

                      <div className="md:col-span-5 rounded-xl border bg-background/70 p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <Shapes className="h-4 w-4" />
                          Compare Plans
                        </div>
                        <div className="mt-3 text-sm text-muted-foreground">Compare multiple plans side-by-side.</div>
                        <div className="mt-4">
                          <Button asChild className="w-full h-11 bg-yellow-400 text-black hover:bg-yellow-300">
                            <Link to={compareHref}>Compare Plans</Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {decoded ? (
                  <div className="rounded-2xl border bg-background/40 overflow-hidden">
                    <div className="px-5 py-4 border-b">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <Car className="h-4 w-4" />
                          Vehicle Summary
                        </div>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
                          onClick={() => setShowVehicleDetails((v: boolean) => !v)}
                        >
                          {showVehicleDetails ? "Hide details" : "More details"}
                        </button>
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground truncate">
                            {decoded.vehicleYear ?? "—"} {decoded.vehicleMake ?? ""} {decoded.vehicleModel ?? ""}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 truncate">VIN: {decoded.vin}</div>
                        </div>
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
                            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {primary.map((row) => (
                                <div key={row.label} className="rounded-lg border bg-background/60 px-2.5 py-2">
                                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80">{row.label}</div>
                                  <div className="text-[11px] font-semibold text-foreground mt-0.5 truncate">
                                    {row.value?.toString().trim() ? row.value : "NOT ON FILE"}
                                  </div>
                                </div>
                              ))}
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
                  </div>
                ) : null}

                {decodeError ? <div className="text-sm text-destructive">{decodeError}</div> : null}
                {import.meta.env.DEV ? (
                  <div className="text-[11px] text-muted-foreground">Mode: {mode} (supabase env: {supabaseConfigured ? "yes" : "no"})</div>
                ) : null}
                {roleMayBlockPublishedProducts && !productsQuery.isLoading && !productsQuery.isError && products.length === 0 ? (
                  <div className="text-xs text-destructive">
                    No products are visible for your current account. In Supabase mode, published Marketplace products are only selectable by Dealer/Admin users.
                    Please sign in with a Dealer (or Admin) account to view eligible products.
                  </div>
                ) : null}
              </div>

              <div className="lg:col-span-4 space-y-6">
                <div className="rounded-2xl border bg-background/40 overflow-hidden">
                  <div className="px-5 py-4 border-b">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <SlidersHorizontal className="h-4 w-4" />
                      Filters &amp; Sorting
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    <div>
                      <div className="text-xs font-semibold text-foreground">Product type</div>
                      <select
                        value={productType}
                        onChange={(e) => setProductType(e.target.value)}
                        disabled={!canUseFilters}
                        className="mt-2 h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm disabled:opacity-60"
                      >
                        <option value="">All types</option>
                        {productTypeOptions.map((t) => (
                          <option key={t} value={t}>
                            {t === "GAP" ? "GAP Insurance" : productTypeLabel(t as ProductType)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-foreground">Sort by</div>
                      <select
                        value={priceSort}
                        onChange={(e) => setPriceSort(e.target.value)}
                        disabled={!canUseFilters}
                        className="mt-2 h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm disabled:opacity-60"
                      >
                        <option value="">Sort by price</option>
                        <option value="PRICE_ASC">Low to High</option>
                        <option value="PRICE_DESC">High to Low</option>
                      </select>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-foreground">Provider</div>
                      <div className="mt-2 relative">
                        <Building2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <select
                          value={providerId}
                          onChange={(e) => setProviderId(e.target.value)}
                          disabled={!canUseFilters}
                          className="h-10 w-full appearance-none rounded-md border border-input bg-transparent pl-10 pr-10 text-sm shadow-sm disabled:opacity-60"
                        >
                          <option value="">All providers</option>
                          {providerItems.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border bg-background/40 overflow-hidden">
                  <div className="px-5 py-4 border-b">
                    <div className="text-sm font-semibold text-foreground">Active Filters</div>
                  </div>

                  <div className="p-5 space-y-2">
                    {decoded && mileageKm.trim() ? (
                      <div className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <Gauge className="h-4 w-4 text-muted-foreground" />
                          <div className="truncate">Mileage: {mileageKm.trim()} km</div>
                        </div>
                        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setMileageKm("")}> 
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}

                    {productType.trim() ? (
                      <div className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <Shapes className="h-4 w-4 text-muted-foreground" />
                          <div className="truncate">Type: {productType === "GAP" ? "GAP Insurance" : productTypeLabel(productType as ProductType)}</div>
                        </div>
                        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setProductType("")}> 
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}

                    {providerId.trim() ? (
                      <div className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <div className="truncate">Provider: {selectedProviderItem ? selectedProviderItem.name : "Selected"}</div>
                        </div>
                        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setProviderId("")}> 
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}

                    {showGapQuoteFields && loanAmount.trim() ? (
                      <div className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <BadgeDollarSign className="h-4 w-4 text-muted-foreground" />
                          <div className="truncate">Loan: ${loanAmount.trim()} (GAP)</div>
                        </div>
                        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setLoanAmount("")}> 
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}

                    {!mileageKm.trim() && !productType.trim() && !providerId.trim() && !loanAmount.trim() ? (
                      <div className="text-sm text-muted-foreground">No active filters.</div>
                    ) : null}

                    <div className="pt-2">
                      <button
                        type="button"
                        className="text-sm text-blue-600 hover:underline underline-offset-4"
                        disabled={!canUseFilters}
                        onClick={() => {
                          setMileageKm("");
                          setProviderId("");
                          setPriceSort("");
                          setProductType("");
                          if (showGapQuoteFields) setLoanAmount("");
                        }}
                      >
                        Clear all
                      </button>
                    </div>
                  </div>
                </div>

                {decoded ? (
                  <div className="text-xs text-muted-foreground">
                    <span className="inline-flex items-center rounded-full border bg-background px-2.5 py-1">
                      {filteredByVariant.length} eligible product{filteredByVariant.length === 1 ? "" : "s"}
                    </span>
                  </div>
                ) : null}

                {decoded && !mileageKm.trim() ? (
                  <div className="text-xs text-muted-foreground">Mileage is required to calculate eligibility.</div>
                ) : null}

                {decoded && (productType.trim() === "GAP" || anyGapProductsExist) ? (
                  typeof vehicleAgeYears === "number" && vehicleAgeYears > 10 ? (
                    <div className="text-xs text-muted-foreground">GAP Insurance is only eligible for vehicles up to 10 years old. This vehicle is {vehicleAgeYears} years old.</div>
                  ) : null
                ) : null}

                {decoded && showGapQuoteFields && (anyGapProductsExist || productType.trim() === "GAP") ? (
                  loanAmount.trim() ? (
                    !loanAmountCents ? (
                      <div className="text-xs text-destructive">Loan amount must be &gt; 0.</div>
                    ) : null
                  ) : (
                    <div className="text-xs text-muted-foreground">Enter loan amount to view eligible GAP loan bands. Choose term on the GAP plan page.</div>
                  )
                ) : null}
              </div>
            </div>
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
          <div className="p-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm text-muted-foreground">
                {eligibleFlat.length ? <span>Showing {eligibleFlat.length}</span> : null}
              </div>
            </div>

            <div className="mt-4 space-y-6">
              {(() => {
                let cardIdx = 0;
                return grouped.map((group) => {
                  if (group.products.length === 0) return null;
                  return (
                    <div key={group.providerId} className="rounded-2xl border bg-background/40 overflow-hidden">
                      <div className="px-5 py-4 border-b bg-gradient-to-r from-blue-600/10 via-transparent to-yellow-500/10">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-foreground truncate">{group.providerName}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {group.products.length} plan{group.products.length === 1 ? "" : "s"}
                            </div>
                          </div>
                          <div className="h-9 w-9 rounded-md border bg-white/70 overflow-hidden flex items-center justify-center shrink-0">
                            {group.providerLogoUrl ? <img src={group.providerLogoUrl} alt="" className="h-full w-full object-contain" /> : null}
                          </div>
                        </div>
                      </div>

                      <div className="p-5">
                        <div className="flex gap-4 overflow-x-auto pb-2">
                          {group.products.map((p) => {
                            const mp = p as MarketplaceProduct;
                            const primaryPricing = eligibleVariantPricingByProductId[p.id] ?? null;

                            const matrixNeedsLoanDetails = mp.pricingStructure === "FINANCE_MATRIX" && !loanAmountCents;

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

                            const isGap = isGapProduct(mp);
                            const isGapPlus160 = isGap && norm(mp.name ?? "").includes("160");
                            const gapLtvPct = isGap
                              ? typeof (mp as any).coverageMaxLtvPercent === "number"
                                ? (mp as any).coverageMaxLtvPercent
                                : isGapPlus160
                                  ? 160
                                  : 130
                              : null;
                            const gapMaxAgeYears = typeof mp.eligibilityMaxVehicleAgeYears === "number" ? mp.eligibilityMaxVehicleAgeYears : 10;
                            const gapDescription = firstSentenceOrLine(mp.coverageDetails ?? "") || "Protect your loan from total loss.";
                            const gapBulletsFromProduct = bulletLinesFromText(mp.keyBenefits ?? "", 4);
                            const gapBulletsFallback = bulletLinesFromText(mp.coverageDetails ?? "", 4);
                            const gapBullets = gapBulletsFromProduct.length
                              ? gapBulletsFromProduct
                              : gapBulletsFallback.length
                                ? gapBulletsFallback
                                : [
                                    "Covers loan balance after total loss",
                                    "Up to $50,000 deficit coverage",
                                    "Deductible reimbursement (up to $1,000)",
                                    `Vehicles up to ${gapMaxAgeYears} years eligible`,
                                  ];

                            const accent = accentForIndex(cardIdx++);

                            return (
                              <div
                                key={p.id}
                                className={
                                  "shrink-0 w-[320px] rounded-2xl border bg-background overflow-hidden shadow-sm ring-1 transition-shadow hover:shadow-md " +
                                  accent.ring +
                                  " " +
                                  accent.border
                                }
                              >
                                <div className={"px-4 py-3 border-b bg-gradient-to-r " + accent.header}>
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="text-xs font-semibold text-foreground truncate">{group.providerName}</div>
                                    </div>
                                    <div className="h-7 w-7 rounded-md border bg-white/70 overflow-hidden flex items-center justify-center shrink-0">
                                      {group.providerLogoUrl ? (
                                        <img src={group.providerLogoUrl} alt="" className="h-full w-full object-contain" />
                                      ) : null}
                                    </div>
                                  </div>
                                </div>

                                <div className="p-4">
                                  {isGap ? (
                                    <div className="space-y-4">
                                      <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2">
                                            <div className="font-semibold text-foreground truncate">
                                              <Link to={detailHrefFor(p.id)} className="hover:underline">
                                                {p.name}{gapLtvPct ? ` ${gapLtvPct}%` : ""}
                                              </Link>
                                            </div>
                                            {isGapPlus160 ? (
                                              <span className="inline-flex items-center rounded-full border bg-yellow-400/20 px-2 py-0.5 text-[11px] text-yellow-900">
                                                160% LTV Coverage
                                              </span>
                                            ) : null}
                                          </div>
                                          <div className="mt-1 text-sm text-muted-foreground">{gapDescription}</div>
                                        </div>

                                        <div className="shrink-0 text-right">
                                          {matrixNeedsLoanDetails ? (
                                            <>
                                              <div className="text-[11px] text-muted-foreground whitespace-nowrap">Price</div>
                                              <div className="text-sm font-semibold whitespace-nowrap leading-none mt-2 text-muted-foreground">Needs loan details</div>
                                            </>
                                          ) : (
                                            <>
                                              <div className="text-[11px] text-muted-foreground whitespace-nowrap">Price</div>
                                              <div className="text-sm font-semibold whitespace-nowrap leading-none mt-2 text-muted-foreground">Select term in View</div>
                                            </>
                                          )}
                                        </div>
                                      </div>

                                      <div className="rounded-lg border bg-muted/10 p-3">
                                        <div className="grid grid-cols-1 gap-2 text-[12px] text-muted-foreground leading-snug">
                                          {gapBullets.map((b) => (
                                            <div key={b} className="flex items-start gap-2">
                                              <span className="mt-0.5">✔</span>
                                              <span>{b}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      <div className="text-[11px] text-muted-foreground rounded-md border bg-background/70 px-3 py-2">
                                        {loanAmountCents ? (
                                          <span>
                                            Based on: {money(loanAmountCents)} loan <span className="text-muted-foreground">•</span> select term in View
                                          </span>
                                        ) : (
                                          <span>Enter loan amount to see GAP options</span>
                                        )}
                                      </div>

                                      <div className="grid grid-cols-1 gap-2">
                                        <Button size="sm" asChild className="h-11 bg-yellow-400 text-black hover:bg-yellow-300">
                                          <Link to={detailHrefFor(mp.id)}>View</Link>
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="space-y-4">
                                      <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                          <div className="font-semibold text-foreground leading-tight truncate">
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
                                          <div className="flex flex-col items-end">
                                            <div className="text-[11px] text-muted-foreground whitespace-nowrap">Price</div>
                                            <div className="text-2xl font-bold whitespace-nowrap leading-none mt-1">{money(shownPrice)}</div>
                                          </div>
                                        </div>
                                      </div>

                                      <div className="mt-4 flex items-center justify-end">
                                        <Button size="sm" asChild className="bg-yellow-400 text-black hover:bg-yellow-300 whitespace-nowrap">
                                          <Link to={detailHrefFor(mp.id)}>View</Link>
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {!productsQuery.isLoading && !productsQuery.isError && eligibleFlat.length === 0 ? (
              <div className="px-2 py-10 text-sm text-muted-foreground">
                <div className="font-medium text-foreground">No eligible products found</div>
                <div className="mt-2">Try clearing filters or adjusting your selections.</div>
                <div className="mt-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setProviderId("");
                      setProductType("");
                      setPriceSort("");
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </PageShell>
  );
}
