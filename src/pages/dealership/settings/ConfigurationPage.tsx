import { useEffect, useState, useMemo } from "react";
import DashboardLayout, { dealershipNavItems } from "../../../components/dashboard/DashboardLayout";
import { Card, CardContent } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../../../components/ui/select";
import { Badge } from "../../../components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { supabase } from "../../../integrations/supabase/client";
import { useDealership } from "../../../hooks/useDealership";
import { useToast } from "../../../hooks/use-toast";
import {
  Settings2, DollarSign, Pencil, Check, X, ChevronRight, ChevronLeft,
  Search, Package, Zap, Building2, Shield, GripVertical, Sparkles,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { compareProductsByConfiguredOrder } from "../../../lib/products/defaultProductOrder";
import {
  cellKey as sharedCellKey,
  coercePrice,
  isAddonPricingRow,
  parseVehicleClass,
} from "../../../lib/pricing/dealerPricing";

// ─────────────────────── Types ───────────────────────

interface Product {
  id: string;
  name: string;
  type: string;
  pricing: any;
  coverage_details: any;
  eligibility_rules: any;
  provider_id: string;
}

interface PricingConfig {
  product_id: string;
  dealer_cost?: Record<string, number>;
  retail_price: Record<string, number>;
  confidentiality_enabled: boolean;
  sort_order?: number | null;
}

interface StructuredRow {
  label: string;
  values: (number | string)[];
  suggestedValues?: (number | string)[];
}

interface StructuredBand {
  label: string;
  values: (number | string)[];
  suggestedValues?: (number | string)[];
}

interface StructuredTier {
  label: string;
  perClaimAmount?: number;
  deductible?: number;
  terms: { label: string; months: number; km: string }[];
  mileageBands?: StructuredBand[];
  rows: StructuredRow[];
  baseInRows: boolean;
}

interface Structured {
  tiers: StructuredTier[];
}

type RecommendationStrategy = "conservative" | "standard" | "aggressive";

type Recommendation = {
  retail: number;
  markupPct: number;
  grossProfit: number;
  confidence: "High" | "Medium" | "Low";
  reason: string;
};

const fmt = (v: number) => `$${v.toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const RECOMMENDATION_STRATEGIES: Record<RecommendationStrategy, { label: string; description: string }> = {
  conservative: {
    label: "Conservative",
    description: "Lower retail target for price-sensitive quotes.",
  },
  standard: {
    label: "Standard",
    description: "Balanced retail target for normal warranty sales.",
  },
  aggressive: {
    label: "Aggressive",
    description: "Higher margin target for stronger gross profit.",
  },
};

function retailEnding(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(9, Math.ceil((value - 9) / 10) * 10 + 9);
}

function recommendRetail(input: {
  cost: number;
  isBase: boolean;
  termMonths?: number;
  claimLimit?: number;
  strategy: RecommendationStrategy;
}): Recommendation | null {
  const { cost, isBase, termMonths = 0, claimLimit = 0, strategy } = input;
  if (!Number.isFinite(cost) || cost <= 0) return null;

  if (!isBase) {
    const addonProfiles: Record<RecommendationStrategy, { multiplier: number; minProfit: number }> = {
      conservative: { multiplier: 1.5, minProfit: 75 },
      standard: { multiplier: 1.8, minProfit: 100 },
      aggressive: { multiplier: 2.1, minProfit: 150 },
    };
    const profile = addonProfiles[strategy];
    const raw = Math.max(cost * profile.multiplier, cost + profile.minProfit);
    const retail = retailEnding(raw);
    return {
      retail,
      markupPct: ((retail - cost) / cost) * 100,
      grossProfit: retail - cost,
      confidence: "Medium",
      reason: `${RECOMMENDATION_STRATEGIES[strategy].label} add-on target uses ${profile.multiplier.toFixed(1)}x cost with a ${fmt(profile.minProfit)} minimum gross profit.`,
    };
  }

  const baseProfiles: Record<RecommendationStrategy, Array<{ maxCost: number; multiplier: number; minProfit: number }>> = {
    conservative: [
      { maxCost: 199, multiplier: 2.6, minProfit: 500 },
      { maxCost: 499, multiplier: 2.2, minProfit: 550 },
      { maxCost: 999, multiplier: 1.9, minProfit: 650 },
      { maxCost: 1999, multiplier: 1.65, minProfit: 800 },
      { maxCost: Infinity, multiplier: 1.45, minProfit: 1000 },
    ],
    standard: [
      { maxCost: 199, multiplier: 3.4, minProfit: 700 },
      { maxCost: 499, multiplier: 2.5, minProfit: 700 },
      { maxCost: 999, multiplier: 2.2, minProfit: 850 },
      { maxCost: 1999, multiplier: 1.9, minProfit: 1100 },
      { maxCost: Infinity, multiplier: 1.6, minProfit: 1400 },
    ],
    aggressive: [
      { maxCost: 199, multiplier: 4.2, minProfit: 900 },
      { maxCost: 499, multiplier: 2.8, minProfit: 850 },
      { maxCost: 999, multiplier: 2.5, minProfit: 1050 },
      { maxCost: 1999, multiplier: 2.15, minProfit: 1400 },
      { maxCost: Infinity, multiplier: 1.8, minProfit: 1800 },
    ],
  };

  const profile = baseProfiles[strategy].find((p) => cost <= p.maxCost) ?? baseProfiles[strategy][baseProfiles[strategy].length - 1];
  const termLift = termMonths >= 48 ? 0.08 : termMonths >= 36 ? 0.05 : termMonths >= 24 ? 0.03 : 0;
  const claimLift = claimLimit >= 20000 ? 0.08 : claimLimit >= 10000 ? 0.06 : claimLimit >= 5000 ? 0.04 : 0;
  const multiplier = profile.multiplier + termLift + claimLift;
  const raw = Math.max(cost * multiplier, cost + profile.minProfit);
  const retail = retailEnding(raw);
  const confidence: Recommendation["confidence"] = claimLimit > 0 && termMonths > 0 ? "High" : "Medium";

  return {
    retail,
    markupPct: ((retail - cost) / cost) * 100,
    grossProfit: retail - cost,
    confidence,
    reason: `${RECOMMENDATION_STRATEGIES[strategy].label} target uses ${multiplier.toFixed(2)}x cost with a ${fmt(profile.minProfit)} minimum gross profit${claimLimit ? ` for a ${fmt(claimLimit)} claim tier` : ""}.`,
  };
}

// ─────────────────────── V2 parsing ───────────────────────

function parseTermMonths(label: string): number {
  const m = label.match(/^(\d+)\s*(Months?|Mo)/i);
  return m ? parseInt(m[1], 10) : 0;
}

function parseTermKm(label: string): string {
  const parts = label.split(" / ");
  return parts[1]?.trim() ?? "";
}

/** Parse vehicleClass into a (tierKey, bandKey) pair.
 *  - "0–60,000 km · $5,000/claim"   → tierKey="$5,000 / claim", bandKey="0–60,000 km"
 *  - "Essential - Class 1"          → tierKey="Essential", bandKey="Class 1"
 *  - "Bronze - $750 Per Claim"      → tierKey="Bronze - $750 Per Claim", bandKey=null
 */
function parseVC(vc: string): { tierKey: string; bandKey: string | null } {
  return parseVehicleClass(vc);
}

function legacyParseVC(vc: string): { tierKey: string; bandKey: string | null } {
  // Diamond Plus style: mileageBand · perClaim
  if (vc.includes("·")) {
    const parts = vc.split("·").map((s) => s.trim());
    const tierKey = parts[1].replace("/claim", " / claim");
    return { tierKey, bandKey: parts[0] };
  }
  // Tire & Rim style: Level - Class N
  const classMatch = vc.match(/^(.+?)\s*-\s*(Class \d+)$/);
  if (classMatch) {
    return { tierKey: classMatch[1].trim(), bandKey: classMatch[2].trim() };
  }
  return { tierKey: vc, bandKey: null };
}
void legacyParseVC;

function isAddonRow(row: any): boolean {
  return isAddonPricingRow(row);
}

function coerceCellValue(value: any): number | string {
  return coercePrice(value);
}

function legacyCoerceCellValue(value: any): number | string {
  if (typeof value === "number") return Number.isFinite(value) ? value : "n/a";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "n/a";
    const lower = trimmed.toLowerCase();
    if (lower === "included") return "Included";
    if (["n/a", "na", "-", "—"].includes(lower)) return "n/a";
    const parsed = Number(trimmed.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : trimmed;
  }
  return "n/a";
}
void legacyCoerceCellValue;

function extractStructuredFromV2(rows: any[]): Structured {
  if (!Array.isArray(rows) || rows.length === 0) return { tiers: [] };

  const baseRows = rows.filter((row) => !isAddonRow(row));
  const addonRows = rows.filter(isAddonRow);
  const tierOrder: string[] = [];
  const perClaimMap: Map<string, number | undefined> = new Map();
  const bandOrder: Map<string, string[]> = new Map();
  const termOrder: Map<string, string[]> = new Map();
  const addonOrder: Map<string, string[]> = new Map();
  type Cell = { cost: number | string; retail: number | string };
  const cells: Map<string, Map<string, Map<string, Cell>>> = new Map();
  const addonCells: Map<string, Map<string, Map<string, Cell>>> = new Map();

  for (const row of baseRows) {
    const vc = (row.vehicleClass || "Standard").toString().trim();
    const termLabel = (row.label || "").toString().trim();
    const { tierKey, bandKey } = parseVC(vc);
    const bk = bandKey ?? "-";

    if (!tierOrder.includes(tierKey)) {
      tierOrder.push(tierKey);
      const m = tierKey.match(/\$([0-9,]+)/);
      perClaimMap.set(tierKey, m ? parseInt(m[1].replace(/,/g, ""), 10) : undefined);
      cells.set(tierKey, new Map());
      bandOrder.set(tierKey, []);
      termOrder.set(tierKey, []);
      addonOrder.set(tierKey, []);
      addonCells.set(tierKey, new Map());
    }

    const bands = bandOrder.get(tierKey)!;
    if (!bands.includes(bk)) bands.push(bk);

    const terms = termOrder.get(tierKey)!;
    if (!terms.includes(termLabel)) terms.push(termLabel);

    const tierCells = cells.get(tierKey)!;
    if (!tierCells.has(bk)) tierCells.set(bk, new Map());
    tierCells.get(bk)!.set(termLabel, {
      cost: coerceCellValue(row.dealerCost ?? row.dealer_cost ?? 0),
      retail: coerceCellValue(row.suggestedRetail ?? row.suggested_retail ?? 0),
    });
  }

  for (const row of addonRows) {
    const vc = (row.vehicleClass || row.vehicle_class || "Standard").toString().trim();
    const termLabel = (row.label || row.term || "").toString().trim();
    const addonLabel = (row.addonName || row.name || "Add-on").toString().trim();
    const { tierKey } = parseVC(vc);

    if (!cells.has(tierKey) || !termOrder.get(tierKey)?.includes(termLabel)) continue;

    const labels = addonOrder.get(tierKey)!;
    if (!labels.includes(addonLabel)) labels.push(addonLabel);

    const byAddon = addonCells.get(tierKey)!;
    if (!byAddon.has(addonLabel)) byAddon.set(addonLabel, new Map());
    byAddon.get(addonLabel)!.set(termLabel, {
      cost: coerceCellValue(row.dealerCost ?? row.dealer_cost ?? row.price ?? "n/a"),
      retail: coerceCellValue(row.suggestedRetail ?? row.suggested_retail ?? row.retail ?? "n/a"),
    });
  }

  const tiers: StructuredTier[] = tierOrder.map((tierKey) => {
    const bands = bandOrder.get(tierKey)!;
    const terms = termOrder.get(tierKey)!.map((label) => ({
      label,
      months: parseTermMonths(label),
      km: parseTermKm(label),
    }));
    const tierCells = cells.get(tierKey)!;
    const hasBands = bands.length > 1 || (bands.length === 1 && bands[0] !== "-");
    const addonRowsForTier: StructuredRow[] = (addonOrder.get(tierKey) ?? []).map((addonLabel) => {
      const byTerm = addonCells.get(tierKey)?.get(addonLabel) ?? new Map();
      return {
        label: addonLabel,
        values: terms.map((t) => byTerm.get(t.label)?.cost ?? "n/a"),
        suggestedValues: terms.map((t) => byTerm.get(t.label)?.retail ?? "n/a"),
      };
    });

    if (hasBands) {
      const mileageBands: StructuredBand[] = bands.map((bk) => {
        const bandCells = tierCells.get(bk) ?? new Map();
        return {
          label: bk,
          values: terms.map((t) => bandCells.get(t.label)?.cost ?? 0),
          suggestedValues: terms.map((t) => bandCells.get(t.label)?.retail ?? 0),
        };
      });
      return {
        label: tierKey,
        perClaimAmount: perClaimMap.get(tierKey),
        terms,
        mileageBands,
        rows: addonRowsForTier,
        baseInRows: false,
      };
    } else {
      const bandCells = tierCells.get("-") ?? new Map();
      return {
        label: tierKey,
        perClaimAmount: perClaimMap.get(tierKey),
        terms,
        mileageBands: undefined,
        rows: [
          {
            label: "Base Price",
            values: terms.map((t) => bandCells.get(t.label)?.cost ?? 0),
            suggestedValues: terms.map((t) => bandCells.get(t.label)?.retail ?? 0),
          },
          ...addonRowsForTier,
        ],
        baseInRows: true,
      };
    }
  });

  return { tiers };
}

function extractStructuredFromV1(pricing: any): Structured {
  const pricingTiers = pricing.pricingTiers || [];
  const tiers: StructuredTier[] = [];

  for (const pt of pricingTiers) {
    const terms = pt.terms || [];
    const allRows = pt.rows || [];
    const mileageBands = pt.mileageBands;
    const baseRowIdx = allRows.findIndex((r: any) => r?.label === "Base Price");
    const baseInRows = baseRowIdx >= 0 && (!mileageBands || mileageBands.length === 0);

    const rows: StructuredRow[] = allRows.map((r: any) => ({
      label: r.label,
      values: r.values || [],
    }));

    const label = pt.perClaimAmount
      ? `$${pt.perClaimAmount.toLocaleString()} / claim`
      : pt.label || `Tier ${tiers.length + 1}`;

    tiers.push({
      label,
      perClaimAmount: pt.perClaimAmount,
      deductible: pt.deductible,
      terms,
      mileageBands: mileageBands && mileageBands.length ? mileageBands : undefined,
      rows,
      baseInRows,
    });
  }

  return { tiers };
}

function extractStructured(pricing: any): Structured {
  if (!pricing) return { tiers: [] };
  if (Array.isArray(pricing.rows) && pricing.rows.length > 0) {
    return extractStructuredFromV2(pricing.rows);
  }
  if (Array.isArray(pricing.pricingTiers) && pricing.pricingTiers.length > 0) {
    return extractStructuredFromV1(pricing);
  }
  return { tiers: [] };
}

// ─────────────────────── Cell keys ───────────────────────

function cellKey(tierIdx: number, bandIdx: number | null, rowIdx: number, termIdx: number) {
  return sharedCellKey(tierIdx, bandIdx, rowIdx, termIdx);
}

// ─────────────────────── Helpers ───────────────────────

const typeLabel = (type: string) => {
  const map: Record<string, string> = {
    VSC: "Extended Warranty",
    "Tire & Rim": "Tire and Rim",
    GAP: "Gap Insurance",
    warranty: "Extended Warranty",
    tire_rim: "Tire and Rim",
  };
  return map[type] || type;
};

const isNumericCost = (v: any): v is number => typeof v === "number" && !isNaN(v) && v > 0;
const isIncluded = (v: any) => typeof v === "string" && v.trim().toLowerCase() === "included";
const isNA = (v: any) => v == null || (typeof v === "string" && ["n/a", "—", ""].includes(v.trim().toLowerCase()));

// ─────────────────────── Component ───────────────────────

export default function ConfigurationPage() {
  const { dealershipId, memberRole, loading: dLoading } = useDealership();
  const { toast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [providers, setProviders] = useState<Record<string, string>>({});
  const [pricingConfigs, setPricingConfigs] = useState<Record<string, PricingConfig>>({});
  const [confidentialityEnabled, setConfidentialityEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  // Navigation
  const [view, setView] = useState<"providers" | "plans">("providers");
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draggedProductId, setDraggedProductId] = useState<string | null>(null);

  // Pricing matrix state
  const [activeTier, setActiveTier] = useState(0);
  const [activeBand, setActiveBand] = useState(0);
  const [editingCell, setEditingCell] = useState<{ kind: "cost" | "retail"; key: string } | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [bulkPercent, setBulkPercent] = useState("40");
  const [recommendationStrategy, setRecommendationStrategy] = useState<RecommendationStrategy>("standard");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const isAdmin = memberRole === "admin";

  useEffect(() => {
    (async () => {
      const { data: prods } = await supabase
        .from("products")
        .select("id, name, product_type, pricing_json, coverage_details_json, coverage_details, eligibility_rules, provider_id, provider_entity_id, published")
        .eq("published", true)
        .order("name");

      const prodList = (prods || []).map((p: any) => {
        const cd = p.coverage_details_json ?? p.coverage_details;
        const pricing = p.pricing_json;
        const er = p.eligibility_rules;
        const parse = (val: any) => {
          if (!val) return {};
          if (typeof val === "object") return val;
          try { return JSON.parse(val); } catch { return {}; }
        };
        return {
          ...p,
          type: p.product_type || "",
          pricing: parse(pricing),
          coverage_details: parse(cd),
          eligibility_rules: parse(er),
          provider_id: p.provider_entity_id ?? p.provider_id,
        } as Product;
      });

      setProducts(prodList);

      const providerIds = [...new Set(prodList.map((p) => p.provider_id).filter(Boolean))];
      if (providerIds.length) {
        const { data: provs } = await supabase.from("providers").select("id, company_name").in("id", providerIds);
        const map: Record<string, string> = {};
        (provs || []).forEach((p: any) => { map[p.id] = p.company_name; });
        setProviders(map);
      }

      if (dealershipId) {
        const { data: configs } = await supabase
          .from("dealership_product_pricing")
          .select("product_id, dealer_cost, retail_price, confidentiality_enabled, sort_order")
          .eq("dealership_id", dealershipId);

        const configMap: Record<string, PricingConfig> = {};
        (configs || []).forEach((c: any) => {
        configMap[c.product_id] = c;
          if (c.confidentiality_enabled) setConfidentialityEnabled(true);
        });
        setPricingConfigs(configMap);
      }

      setLoading(false);
    })();
  }, [dealershipId]);

  // Reset matrix state when product changes
  useEffect(() => {
    setActiveTier(0);
    setActiveBand(0);
    setEditingCell(null);
  }, [selectedProductId]);

  // ── Provider groups ──
  const providerGroups = useMemo(() => {
    const groups: Record<string, Product[]> = {};
    products.forEach((p) => {
      if (!groups[p.provider_id]) groups[p.provider_id] = [];
      groups[p.provider_id].push(p);
    });
    return groups;
  }, [products]);

  const providerList = useMemo(() =>
    Object.entries(providerGroups)
      .map(([id, plans]) => ({ id, name: providers[id] || "Unknown", plans }))
      .filter((g) => view !== "providers" || !search || g.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [providerGroups, providers, search, view]);

  const plansForProvider = useMemo(() => {
    if (!activeProviderId) return [];
    return (providerGroups[activeProviderId] || [])
      .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => compareProductsByConfiguredOrder(a, b, pricingConfigs));
  }, [providerGroups, activeProviderId, search, pricingConfigs]);

  // ── Selected product & structured pricing ──
  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const structured = useMemo(() => selectedProduct ? extractStructured(selectedProduct.pricing) : { tiers: [] }, [selectedProduct]);
  const currentTier: StructuredTier | undefined = structured.tiers[activeTier];
  const hasBands = !!currentTier?.mileageBands?.length;

  // Retail map for the currently-active product
  const retailMap: Record<string, number> = useMemo(() => {
    if (!selectedProductId) return {};
    return (pricingConfigs[selectedProductId]?.retail_price || {}) as Record<string, number>;
  }, [pricingConfigs, selectedProductId]);

  const costMap: Record<string, number> = useMemo(() => {
    if (!selectedProductId) return {};
    return (pricingConfigs[selectedProductId]?.dealer_cost || {}) as Record<string, number>;
  }, [pricingConfigs, selectedProductId]);

  const storageKey = (bandIdx: number | null, rowIdx: number, termIdx: number) =>
    cellKey(activeTier, bandIdx, rowIdx, termIdx);

  // ── Persist dealer cost and retail prices ──
  const persistPricing = async (productId: string, newRetail: Record<string, number>, newCost: Record<string, number>) => {
    if (!dealershipId) return;
    const existing = pricingConfigs[productId];
    if (existing) {
      await supabase
        .from("dealership_product_pricing")
        .update({ dealer_cost: newCost, retail_price: newRetail, confidentiality_enabled: confidentialityEnabled })
        .eq("dealership_id", dealershipId)
        .eq("product_id", productId);
    } else {
      await supabase.from("dealership_product_pricing").insert({
        dealership_id: dealershipId,
        product_id: productId,
        dealer_cost: newCost,
        retail_price: newRetail,
        confidentiality_enabled: confidentialityEnabled,
      });
    }
    setPricingConfigs((prev) => ({
      ...prev,
      [productId]: {
        product_id: productId,
        dealer_cost: newCost,
        retail_price: newRetail,
        confidentiality_enabled: confidentialityEnabled,
        sort_order: existing?.sort_order ?? null,
      },
    }));
  };

  const persistRetail = async (productId: string, newRetail: Record<string, number>) => {
    await persistPricing(productId, newRetail, pricingConfigs[productId]?.dealer_cost ?? {});
  };

  const persistCost = async (productId: string, newCost: Record<string, number>) => {
    await persistPricing(productId, pricingConfigs[productId]?.retail_price ?? {}, newCost);
  };

  const persistPlanOrder = async (orderedPlans: Product[]) => {
    if (!dealershipId || !isAdmin) return;

    const rows = orderedPlans.map((product, index) => ({
      dealership_id: dealershipId,
      product_id: product.id,
      dealer_cost: pricingConfigs[product.id]?.dealer_cost ?? {},
      retail_price: pricingConfigs[product.id]?.retail_price ?? {},
      confidentiality_enabled: confidentialityEnabled,
      sort_order: index,
    }));

    const { error } = await supabase
      .from("dealership_product_pricing")
      .upsert(rows, { onConflict: "dealership_id,product_id" });

    if (error) {
      toast({ title: "Could not save plan order", description: error.message, variant: "destructive" });
      return;
    }

    setPricingConfigs((prev) => {
      const next = { ...prev };
      orderedPlans.forEach((product, index) => {
        const existing = next[product.id];
        next[product.id] = {
          product_id: product.id,
          dealer_cost: existing?.dealer_cost ?? {},
          retail_price: existing?.retail_price ?? {},
          confidentiality_enabled: existing?.confidentiality_enabled ?? confidentialityEnabled,
          sort_order: index,
        };
      });
      return next;
    });
  };

  const movePlan = (fromProductId: string, toProductId: string) => {
    if (!isAdmin || fromProductId === toProductId) return;
    const fromIndex = plansForProvider.findIndex((product) => product.id === fromProductId);
    const toIndex = plansForProvider.findIndex((product) => product.id === toProductId);
    if (fromIndex < 0 || toIndex < 0) return;

    const ordered = [...plansForProvider];
    const [moved] = ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, moved);
    void persistPlanOrder(ordered);
  };

  const saveCell = async (kind: "cost" | "retail", key: string, value: number) => {
    if (!selectedProductId) return;
    setSavingKey(`${kind}:${key}`);
    if (kind === "cost") {
      const newCost = { ...costMap, [key]: value };
      await persistCost(selectedProductId, newCost);
    } else {
      const newRetail = { ...retailMap, [key]: value };
      await persistRetail(selectedProductId, newRetail);
    }
    setSavingKey(null);
    setEditingCell(null);
    toast({ title: kind === "cost" ? "Cost saved" : "Retail price saved" });
  };

  const clearCell = async (kind: "cost" | "retail", key: string) => {
    if (!selectedProductId) return;
    setSavingKey(`${kind}:${key}`);
    if (kind === "cost") {
      const newCost = { ...costMap };
      delete newCost[key];
      await persistCost(selectedProductId, newCost);
    } else {
      const newRetail = { ...retailMap };
      delete newRetail[key];
      await persistRetail(selectedProductId, newRetail);
    }
    setSavingKey(null);
    setEditingCell(null);
    toast({ title: kind === "cost" ? "Custom cost cleared" : "Custom retail cleared" });
  };

  const applyBulkMarkup = async (overwriteAll = false) => {
    if (!currentTier || !selectedProductId) return;
    const pct = parseFloat(bulkPercent);
    if (isNaN(pct) || pct < 0) {
      toast({ title: "Invalid markup", description: "Enter a positive number.", variant: "destructive" });
      return;
    }
    const factor = 1 + pct / 100;
    const newRetail = { ...retailMap };
    let count = 0;

    const fill = (cost: any, key: string) => {
      const effectiveCost = costMap[key] ?? cost;
      if (!isNumericCost(effectiveCost)) return;
      if (!overwriteAll && newRetail[key] != null) return;
      newRetail[key] = Math.round(effectiveCost * factor);
      count++;
    };

    if (hasBands && currentTier.mileageBands) {
      currentTier.mileageBands.forEach((band, bIdx) => {
        currentTier.terms.forEach((_t, tIdx) => {
          fill(band.values[tIdx], storageKey(bIdx, -1, tIdx));
        });
      });
      currentTier.rows.forEach((row, rIdx) => {
        currentTier.terms.forEach((_t, tIdx) => {
          fill(row.values[tIdx], storageKey(null, rIdx, tIdx));
        });
      });
    } else {
      currentTier.rows.forEach((row, rIdx) => {
        currentTier.terms.forEach((_t, tIdx) => {
          fill(row.values[tIdx], storageKey(null, rIdx, tIdx));
        });
      });
    }

    await persistRetail(selectedProductId, newRetail);
    toast({
      title: overwriteAll ? "All prices updated" : "Bulk markup applied",
      description: `${overwriteAll ? "Set" : "Filled"} ${count} cell${count !== 1 ? "s" : ""} to +${pct}% markup.`,
    });
  };

  const applyRecommendedPricing = async (overwriteAll = false) => {
    if (!currentTier || !selectedProductId) return;
    const newRetail = { ...retailMap };
    let count = 0;

    const fill = (costValue: any, key: string, isBase: boolean, termIdx: number) => {
      const effectiveCost = costMap[key] ?? costValue;
      if (!isNumericCost(effectiveCost)) return;
      if (!overwriteAll && newRetail[key] != null) return;

      const rec = recommendRetail({
        cost: effectiveCost,
        isBase,
        termMonths: currentTier.terms[termIdx]?.months,
        claimLimit: isBase ? currentTier.perClaimAmount : undefined,
        strategy: recommendationStrategy,
      });
      if (!rec) return;

      newRetail[key] = rec.retail;
      count++;
    };

    if (hasBands && currentTier.mileageBands) {
      currentTier.mileageBands.forEach((band, bIdx) => {
        currentTier.terms.forEach((_t, tIdx) => {
          fill(band.values[tIdx], storageKey(bIdx, -1, tIdx), true, tIdx);
        });
      });
      currentTier.rows.forEach((row, rIdx) => {
        currentTier.terms.forEach((_t, tIdx) => {
          fill(row.values[tIdx], storageKey(null, rIdx, tIdx), false, tIdx);
        });
      });
    } else {
      currentTier.rows.forEach((row, rIdx) => {
        currentTier.terms.forEach((_t, tIdx) => {
          fill(row.values[tIdx], storageKey(null, rIdx, tIdx), row.label === "Base Price", tIdx);
        });
      });
    }

    await persistRetail(selectedProductId, newRetail);
    toast({
      title: overwriteAll ? "Recommended prices applied" : "Empty prices filled",
      description: `${RECOMMENDATION_STRATEGIES[recommendationStrategy].label} recommendations ${overwriteAll ? "updated" : "filled"} ${count} retail cell${count !== 1 ? "s" : ""}.`,
    });
  };

  const handleToggleConfidentiality = async (enabled: boolean) => {
    setConfidentialityEnabled(enabled);
    if (dealershipId) {
      for (const productId of Object.keys(pricingConfigs)) {
        await supabase
          .from("dealership_product_pricing")
          .update({ confidentiality_enabled: enabled })
          .eq("dealership_id", dealershipId)
          .eq("product_id", productId);
      }
    }
    toast({
      title: enabled ? "Customer-facing retail enabled" : "Customer-facing retail disabled",
    });
  };

  // ── Matrix rows for current tier/band ──
  type MatrixRow = {
    label: string; isBase: boolean; rowIdx: number; bandIdx: number | null;
    values: (number | string)[]; suggestedValues?: (number | string)[];
  };

  const matrixRows: MatrixRow[] = [];
  if (currentTier) {
    if (hasBands && currentTier.mileageBands) {
      const band = currentTier.mileageBands[activeBand];
      if (band) {
        matrixRows.push({ label: "Base Price", isBase: true, rowIdx: -1, bandIdx: activeBand, values: band.values, suggestedValues: band.suggestedValues });
      }
      currentTier.rows.forEach((r, idx) => {
        matrixRows.push({ label: r.label, isBase: false, rowIdx: idx, bandIdx: null, values: r.values, suggestedValues: r.suggestedValues });
      });
    } else {
      currentTier.rows.forEach((r, idx) => {
        matrixRows.push({ label: r.label, isBase: r.label === "Base Price", rowIdx: idx, bandIdx: null, values: r.values, suggestedValues: r.suggestedValues });
      });
    }
  }

  // ── Cell renderer ──
  const renderCell = (mr: MatrixRow, termIdx: number) => {
    const raw = mr.values[termIdx];
    const key = cellKey(activeTier, mr.bandIdx, mr.rowIdx, termIdx);
    const customCost = costMap[key];
    const customRetail = retailMap[key];

    if (isNA(raw)) return <span className="text-muted-foreground/40 text-sm">—</span>;
    if (isIncluded(raw)) {
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">Included</Badge>
      );
    }
    const defaultSuggested = mr.suggestedValues?.[termIdx];
    const defaultSuggestedNumber = typeof defaultSuggested === "number" && defaultSuggested > 0 ? defaultSuggested : null;
    const isZeroCostRetailCell = typeof raw === "number" && Number.isFinite(raw) && raw === 0 && defaultSuggestedNumber != null;
    if (!isNumericCost(raw) && !isZeroCostRetailCell) return <span className="text-sm">{String(raw)}</span>;

    const defaultCost = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
    const cost = customCost ?? defaultCost;
    const suggested = customRetail ?? defaultSuggestedNumber ?? Math.round(cost * 1.4);
    const hasCustomCost = customCost != null;
    const hasCustom = customRetail != null;
    const markupPct = cost > 0 ? ((suggested - cost) / cost) * 100 : 0;
    const recommendation = recommendRetail({
      cost,
      isBase: mr.isBase,
      termMonths: currentTier?.terms[termIdx]?.months,
      claimLimit: mr.isBase ? currentTier?.perClaimAmount : undefined,
      strategy: recommendationStrategy,
    });
    const isEditingCost = editingCell?.kind === "cost" && editingCell.key === key;
    const isEditingRetail = editingCell?.kind === "retail" && editingCell.key === key;
    const renderEditor = (kind: "cost" | "retail") => (
      <div className="flex items-center gap-1">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
          <Input
            type="number"
            className="w-24 h-7 pl-5 text-xs"
            value={draftValue}
            autoFocus
            onChange={(e) => setDraftValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const n = parseFloat(draftValue);
                if (!isNaN(n)) saveCell(kind, key, n);
              } else if (e.key === "Escape") setEditingCell(null);
            }}
          />
        </div>
        <Button size="icon" variant="ghost" className="h-6 w-6" disabled={savingKey === `${kind}:${key}`}
          onClick={() => { const n = parseFloat(draftValue); if (!isNaN(n)) saveCell(kind, key, n); }}>
          <Check className="w-3.5 h-3.5 text-green-600" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingCell(null)}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    );

    return (
      <div className="flex flex-col gap-1 min-w-[130px]">
        {isEditingCost ? (
          renderEditor("cost")
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn("text-[11px]", hasCustomCost ? "font-semibold text-slate-700" : "text-muted-foreground")}>
              Cost {fmt(cost)}
            </span>
            {isAdmin && (
              <Button size="icon" variant="ghost" className="h-6 w-6 opacity-50 hover:opacity-100"
                onClick={() => { setEditingCell({ kind: "cost", key }); setDraftValue(cost.toString()); }}>
                <Pencil className="w-3 h-3" />
              </Button>
            )}
            {isAdmin && hasCustomCost && (
              <Button size="icon" variant="ghost" className="h-6 w-6 opacity-30 hover:opacity-100"
                onClick={() => clearCell("cost", key)} title="Clear custom cost">
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
        )}
        {isEditingRetail ? (
          renderEditor("retail")
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn("text-sm font-semibold", hasCustom ? "text-primary" : "text-muted-foreground/60 italic")}>
              {fmt(suggested)}
            </span>
            <Badge
              variant={hasCustom ? "default" : "secondary"}
              className={cn("text-[9px] px-1 py-0 h-4", hasCustom && "bg-green-100 text-green-700 hover:bg-green-100")}
            >
              {markupPct >= 0 ? "+" : ""}{markupPct.toFixed(0)}%
            </Badge>
            {isAdmin && (
              <Button size="icon" variant="ghost" className="h-6 w-6 opacity-50 hover:opacity-100"
                onClick={() => { setEditingCell({ kind: "retail", key }); setDraftValue(suggested.toString()); }}>
                <Pencil className="w-3 h-3" />
              </Button>
            )}
            {isAdmin && hasCustom && (
              <Button size="icon" variant="ghost" className="h-6 w-6 opacity-30 hover:opacity-100"
                onClick={() => clearCell("retail", key)} title="Clear custom retail">
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
        )}
        {isAdmin && recommendation && !isEditingRetail && (
          <button
            type="button"
            title={recommendation.reason}
            className={cn(
              "w-fit rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
              hasCustom && recommendation.retail === suggested
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-700 hover:bg-amber-100"
            )}
            onClick={() => saveCell("retail", key, recommendation.retail)}
          >
            REC {fmt(recommendation.retail)} · {recommendation.confidence}
          </button>
        )}
      </div>
    );
  };

  if (dLoading || loading) {
    return (
      <DashboardLayout navItems={dealershipNavItems} title="Configuration">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout navItems={dealershipNavItems} title="Configuration">
      <div className="space-y-5 max-w-[1600px] mx-auto">

        {/* Header */}
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="py-5 px-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Settings2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Dealer Pricing Configuration</h2>
                  <p className="text-sm text-muted-foreground">Mark up dealer cost to your retail price for every base term and add-on.</p>
                </div>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-3 bg-background/80 rounded-xl px-4 py-2.5 border">
                  <span className="text-sm font-medium whitespace-nowrap">Show Retail to Customers</span>
                  <Switch checked={confidentialityEnabled} onCheckedChange={handleToggleConfidentiality} />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Search + provider switcher */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={view === "providers" ? "Search providers..." : `Search plans in ${providers[activeProviderId || ""] || ""}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {view === "plans" && (
            <Select value={activeProviderId || ""} onValueChange={(v) => { setActiveProviderId(v); setSelectedProductId(null); setSearch(""); }}>
              <SelectTrigger className="w-full sm:w-[240px]">
                <span className="truncate text-sm">
                  {activeProviderId && providers[activeProviderId]
                    ? providers[activeProviderId]
                    : "Switch provider"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(providers).map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm flex-wrap">
          <button
            onClick={() => { setView("providers"); setActiveProviderId(null); setSelectedProductId(null); setSearch(""); }}
            className={cn("px-2 py-1 rounded-md hover:bg-muted transition-colors", view === "providers" ? "font-semibold" : "text-muted-foreground")}
          >
            Providers
          </button>
          {view === "plans" && activeProviderId && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
              <button
                onClick={() => setSelectedProductId(null)}
                className={cn("px-2 py-1 rounded-md hover:bg-muted transition-colors", !selectedProductId ? "font-semibold" : "text-muted-foreground")}
              >
                {providers[activeProviderId] || "Provider"}
              </button>
            </>
          )}
          {selectedProduct && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
              <span className="px-2 py-1 font-semibold">{selectedProduct.name}</span>
            </>
          )}
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">

          {/* ── Left panel ── */}
          <div className="space-y-2">
            {view === "providers" ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                  Providers ({providerList.length})
                </p>
                <div className="space-y-1.5 max-h-[calc(100vh-360px)] overflow-y-auto pr-1">
                  {providerList.map((g) => {
                    const typeCounts: Record<string, number> = {};
                    g.plans.forEach((p) => {
                      const lbl = typeLabel(p.type);
                      typeCounts[lbl] = (typeCounts[lbl] || 0) + 1;
                    });
                    return (
                      <button
                        key={g.id}
                        onClick={() => { setActiveProviderId(g.id); setView("plans"); setSelectedProductId(null); setSearch(""); }}
                        className="w-full text-left rounded-xl px-4 py-3.5 transition-all hover:bg-muted/60 bg-card border border-transparent hover:border-primary/20 hover:shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Building2 className="w-5 h-5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm truncate">{g.name}</p>
                            <p className="text-xs text-muted-foreground">{g.plans.length} plan{g.plans.length !== 1 ? "s" : ""}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground/40" />
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2 ml-13">
                          {Object.entries(typeCounts).map(([lbl, count]) => (
                            <Badge key={lbl} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">{count} {lbl}</Badge>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                  {providerList.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No providers found.</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between px-1">
                  <button
                    onClick={() => { setView("providers"); setSearch(""); }}
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    All Providers
                  </button>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {plansForProvider.length} plan{plansForProvider.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="space-y-1 max-h-[calc(100vh-360px)] overflow-y-auto pr-1">
                  {plansForProvider.map((p) => {
                    const s = extractStructured(p.pricing);
                    const isSelected = selectedProductId === p.id;
                    return (
                      <button
                        key={p.id}
                        draggable={isAdmin && !search}
                        onDragStart={(e) => {
                          if (!isAdmin || search) return;
                          setDraggedProductId(p.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", p.id);
                        }}
                        onDragOver={(e) => {
                          if (!isAdmin || search || !draggedProductId || draggedProductId === p.id) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromId = e.dataTransfer.getData("text/plain") || draggedProductId;
                          if (fromId) movePlan(fromId, p.id);
                          setDraggedProductId(null);
                        }}
                        onDragEnd={() => setDraggedProductId(null)}
                        onClick={() => setSelectedProductId(p.id)}
                        className={cn(
                          "w-full text-left rounded-xl px-4 py-3 transition-all hover:bg-muted/60",
                          isSelected ? "bg-primary/10 border border-primary/30 shadow-sm" : "bg-card border border-transparent",
                          draggedProductId === p.id && "opacity-50",
                          isAdmin && !search && "cursor-grab active:cursor-grabbing"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex items-center gap-2">
                            {isAdmin && !search && (
                              <GripVertical className="w-4 h-4 shrink-0 text-muted-foreground/40" aria-hidden="true" />
                            )}
                            <Shield className={cn("w-4 h-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground/60")} />
                            <div className="min-w-0">
                              <p className="font-semibold text-sm truncate">{p.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{typeLabel(p.type)}</p>
                            </div>
                          </div>
                          <ChevronRight className={cn("w-4 h-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground/40")} />
                        </div>
                        <div className={cn("flex flex-wrap gap-1.5 mt-1.5", isAdmin && !search ? "pl-10" : "pl-6")}>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {s.tiers.length} tier{s.tiers.length !== 1 ? "s" : ""}
                          </Badge>
                        </div>
                      </button>
                    );
                  })}
                  {plansForProvider.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No plans found.</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Right panel ── */}
          <div className="space-y-5 min-w-0">
            {!selectedProduct ? (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-muted-foreground font-medium">
                    {view === "providers" ? "Select a provider, then a plan to configure pricing" : "Select a plan to configure pricing"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Plan header */}
                <Card>
                  <CardContent className="py-5 px-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <DollarSign className="w-6 h-6 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xl font-bold">{selectedProduct.name}</h3>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {typeLabel(selectedProduct.type)} • {providers[selectedProduct.provider_id] || "Unknown Provider"}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {(() => {
                            const er = selectedProduct.eligibility_rules || {};
                            const parts: string[] = [];
                            if (er.maxAge) parts.push(`${er.maxAge} Years or Newer`);
                            if (er.maxMileage) parts.push(`up to ${Number(er.maxMileage).toLocaleString()} km`);
                            return parts.length > 0 ? (
                              <Badge variant="outline" className="font-normal">{parts.join(" and ")}</Badge>
                            ) : null;
                          })()}
                          <Badge variant="outline" className="font-normal">
                            {structured.tiers.length} tier{structured.tiers.length !== 1 ? "s" : ""}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Pricing matrix */}
                {structured.tiers.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-12 text-center text-muted-foreground">No pricing configured for this plan yet.</CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="py-4 px-4 sm:px-6 space-y-4">

                      {/* Tier (per-claim) tabs */}
                      <Tabs
                        value={activeTier.toString()}
                        onValueChange={(v) => { setActiveTier(parseInt(v, 10)); setActiveBand(0); setEditingCell(null); }}
                      >
                        <TabsList className="flex-wrap h-auto gap-1">
                          {structured.tiers.map((t, i) => (
                            <TabsTrigger key={i} value={i.toString()} className="text-xs sm:text-sm">
                              {t.label}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      </Tabs>

                      {currentTier && (
                        <>
                          {/* Tier metadata row */}
                          <div className="flex flex-wrap items-center gap-2 justify-between">
                            <div className="flex flex-wrap gap-2">
                              {currentTier.perClaimAmount != null && (
                                <Badge variant="secondary">Per Claim: {fmt(currentTier.perClaimAmount)}</Badge>
                              )}
                              {currentTier.deductible != null && (
                                <Badge variant="secondary">
                                  Deductible: {currentTier.deductible === 0 ? "None" : fmt(currentTier.deductible)}
                                </Badge>
                              )}
                              <Badge variant="outline">{currentTier.terms.length} term{currentTier.terms.length !== 1 ? "s" : ""}</Badge>
                              {hasBands && (
                                <Badge variant="outline">{currentTier.mileageBands!.length} mileage bands</Badge>
                              )}
                            </div>

                            {/* Suggested retail + bulk markup */}
                            {isAdmin && (
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 shadow-sm flex-wrap">
                                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                                  <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">Suggested retail</span>
                                  <div className="flex items-center gap-1 rounded-md bg-white p-0.5 border border-amber-100">
                                    {(Object.keys(RECOMMENDATION_STRATEGIES) as RecommendationStrategy[]).map((strategy) => (
                                      <button
                                        key={strategy}
                                        type="button"
                                        title={RECOMMENDATION_STRATEGIES[strategy].description}
                                        onClick={() => setRecommendationStrategy(strategy)}
                                        className={cn(
                                          "h-7 rounded px-2 text-[11px] font-semibold transition-colors",
                                          recommendationStrategy === strategy
                                            ? "bg-amber-500 text-white"
                                            : "text-slate-600 hover:bg-amber-100"
                                        )}
                                      >
                                        {RECOMMENDATION_STRATEGIES[strategy].label}
                                      </button>
                                    ))}
                                  </div>
                                  <Button size="sm" variant="outline" className="h-8 text-xs px-3 whitespace-nowrap bg-white" onClick={() => applyRecommendedPricing(false)}>
                                    Fill empty
                                  </Button>
                                  <Button size="sm" className="h-8 text-xs px-3 whitespace-nowrap bg-amber-600 hover:bg-amber-700" onClick={() => applyRecommendedPricing(true)}>
                                    Apply to all
                                  </Button>
                                </div>

                                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm flex-wrap">
                                  <Zap className="w-4 h-4 text-primary shrink-0" />
                                  <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">Bulk markup</span>
                                  <div className="flex items-center gap-1.5">
                                    <Input
                                      type="number"
                                      value={bulkPercent}
                                      onChange={(e) => setBulkPercent(e.target.value)}
                                      className="w-20 h-8 text-sm font-bold text-center border-slate-300"
                                      min="0"
                                      max="999"
                                    />
                                    <span className="text-sm font-bold text-slate-600">%</span>
                                  </div>
                                  <Button size="sm" variant="outline" className="h-8 text-xs px-3 whitespace-nowrap" onClick={() => applyBulkMarkup(false)}>
                                    Fill empty
                                  </Button>
                                  <Button size="sm" variant="default" className="h-8 text-xs px-3 whitespace-nowrap bg-primary hover:bg-primary/90" onClick={() => applyBulkMarkup(true)}>
                                    Apply to all
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Mileage band tabs */}
                          {hasBands && currentTier.mileageBands && (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mileage Band</span>
                              <Tabs
                                value={activeBand.toString()}
                                onValueChange={(v) => { setActiveBand(parseInt(v, 10)); setEditingCell(null); }}
                              >
                                <TabsList className="flex-wrap h-auto">
                                  {currentTier.mileageBands.map((b, i) => (
                                    <TabsTrigger key={i} value={i.toString()} className="text-xs">{b.label}</TabsTrigger>
                                  ))}
                                </TabsList>
                              </Tabs>
                            </div>
                          )}

                          {/* Pricing matrix table */}
                          <div className="overflow-x-auto border rounded-lg">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/40">
                                <tr>
                                  <th className="text-left px-3 py-2.5 font-semibold sticky left-0 bg-muted/40 z-10 min-w-[180px]">
                                    Coverage / Add-on
                                  </th>
                                  {currentTier.terms.map((term, i) => (
                                    <th key={i} className="text-left px-3 py-2.5 font-semibold whitespace-nowrap min-w-[150px]">
                                      <div className="text-xs">{term.label}</div>
                                      {term.km && <div className="text-[10px] text-muted-foreground font-normal">{term.km}</div>}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {matrixRows.map((mr, rIdx) => (
                                  <tr
                                    key={`${mr.rowIdx}-${mr.bandIdx ?? "x"}`}
                                    className={cn(
                                      "border-t",
                                      mr.isBase && "bg-primary/5",
                                      rIdx % 2 === 1 && !mr.isBase && "bg-muted/20"
                                    )}
                                  >
                                    <td className="px-3 py-2.5 font-medium sticky left-0 bg-inherit z-10">
                                      <div className="flex items-center gap-2">
                                        {mr.isBase && (
                                          <Badge className="bg-primary/15 text-primary hover:bg-primary/15 text-[9px] px-1 py-0 h-4">
                                            BASE
                                          </Badge>
                                        )}
                                        <span className={cn(mr.isBase && "font-bold")}>{mr.label}</span>
                                      </div>
                                    </td>
                                    {currentTier.terms.map((_t, tIdx) => (
                                      <td key={tIdx} className="px-3 py-2.5 align-top">
                                        {renderCell(mr, tIdx)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            Click either pencil to edit dealer cost or customer retail. Grey italic retail values show provider suggested retail until you save a custom price. REC values update with the selected margin profile and can be clicked to apply that suggested retail to one cell.
                          </p>
                        </>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
