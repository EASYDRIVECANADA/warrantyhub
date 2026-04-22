import { useEffect, useState, useMemo } from "react";
import DashboardLayout, { dealershipNavItems } from "../../../components/dashboard/DashboardLayout";
import { Card, CardContent } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Badge } from "../../../components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { supabase } from "../../../integrations/supabase/client";
import { useDealership } from "../../../hooks/useDealership";
import { useToast } from "../../../hooks/use-toast";
import {
  Settings2, DollarSign, Pencil, Check, X, ChevronRight, ChevronLeft,
  Search, Package, Zap, Building2, Shield,
} from "lucide-react";
import { cn } from "../../../lib/utils";

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
  retail_price: Record<string, number>;
  confidentiality_enabled: boolean;
}

interface StructuredRow {
  label: string;
  values: (number | string)[];
  suggestedValues?: number[];
}

interface StructuredBand {
  label: string;
  values: (number | string)[];
  suggestedValues?: number[];
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

const fmt = (v: number) => `$${v.toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

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

function extractStructuredFromV2(rows: any[]): Structured {
  if (!Array.isArray(rows) || rows.length === 0) return { tiers: [] };

  const tierOrder: string[] = [];
  const perClaimMap: Map<string, number | undefined> = new Map();
  const bandOrder: Map<string, string[]> = new Map();
  const termOrder: Map<string, string[]> = new Map();
  type Cell = { cost: number; retail: number };
  const cells: Map<string, Map<string, Map<string, Cell>>> = new Map();

  for (const row of rows) {
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
    }

    const bands = bandOrder.get(tierKey)!;
    if (!bands.includes(bk)) bands.push(bk);

    const terms = termOrder.get(tierKey)!;
    if (!terms.includes(termLabel)) terms.push(termLabel);

    const tierCells = cells.get(tierKey)!;
    if (!tierCells.has(bk)) tierCells.set(bk, new Map());
    tierCells.get(bk)!.set(termLabel, {
      cost: Number(row.dealerCost ?? row.dealer_cost ?? 0),
      retail: Number(row.suggestedRetail ?? row.suggested_retail ?? 0),
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
        rows: [],
        baseInRows: false,
      };
    } else {
      const bandCells = tierCells.get("-") ?? new Map();
      return {
        label: tierKey,
        perClaimAmount: perClaimMap.get(tierKey),
        terms,
        mileageBands: undefined,
        rows: [{
          label: "Base Price",
          values: terms.map((t) => bandCells.get(t.label)?.cost ?? 0),
          suggestedValues: terms.map((t) => bandCells.get(t.label)?.retail ?? 0),
        }],
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
  return `t${tierIdx}|m${bandIdx == null ? "-" : bandIdx}|r${rowIdx}|term${termIdx}`;
}

// ─────────────────────── Helpers ───────────────────────

const typeLabel = (type: string) => {
  const map: Record<string, string> = {
    VSC: "Vehicle Service Contract",
    "Tire & Rim": "Tire & Rim Protection",
    GAP: "GAP Insurance",
    warranty: "Vehicle Service Contract",
    tire_rim: "Tire & Rim Protection",
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

  // Pricing matrix state
  const [activeTier, setActiveTier] = useState(0);
  const [activeBand, setActiveBand] = useState(0);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [bulkPercent, setBulkPercent] = useState("40");
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
          .select("product_id, retail_price, confidentiality_enabled")
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
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [providerGroups, activeProviderId, search]);

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

  const storageKey = (bandIdx: number | null, rowIdx: number, termIdx: number) =>
    cellKey(activeTier, bandIdx, rowIdx, termIdx);

  // ── Persist retail prices ──
  const persistRetail = async (productId: string, newRetail: Record<string, number>) => {
    if (!dealershipId) return;
    const existing = pricingConfigs[productId];
    if (existing) {
      await supabase
        .from("dealership_product_pricing")
        .update({ retail_price: newRetail, confidentiality_enabled: confidentialityEnabled })
        .eq("dealership_id", dealershipId)
        .eq("product_id", productId);
    } else {
      await supabase.from("dealership_product_pricing").insert({
        dealership_id: dealershipId,
        product_id: productId,
        retail_price: newRetail,
        confidentiality_enabled: confidentialityEnabled,
      });
    }
    setPricingConfigs((prev) => ({
      ...prev,
      [productId]: { product_id: productId, retail_price: newRetail, confidentiality_enabled: confidentialityEnabled },
    }));
  };

  const saveCell = async (key: string, value: number) => {
    if (!selectedProductId) return;
    setSavingKey(key);
    const newRetail = { ...retailMap, [key]: value };
    await persistRetail(selectedProductId, newRetail);
    setSavingKey(null);
    setEditingCell(null);
    toast({ title: "Price saved" });
  };

  const clearCell = async (key: string) => {
    if (!selectedProductId) return;
    setSavingKey(key);
    const newRetail = { ...retailMap };
    delete newRetail[key];
    await persistRetail(selectedProductId, newRetail);
    setSavingKey(null);
    setEditingCell(null);
    toast({ title: "Custom price cleared" });
  };

  const applyBulkMarkup = async () => {
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
      if (!isNumericCost(cost)) return;
      if (newRetail[key] != null) return; // skip already-set cells
      newRetail[key] = Math.round(cost * factor);
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
    toast({ title: "Bulk markup applied", description: `Filled ${count} empty cell${count !== 1 ? "s" : ""} with +${pct}% markup.` });
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
    values: (number | string)[]; suggestedValues?: number[];
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
    const customRetail = retailMap[key];

    if (isNA(raw)) return <span className="text-muted-foreground/40 text-sm">—</span>;
    if (isIncluded(raw)) {
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">Included</Badge>
      );
    }
    if (!isNumericCost(raw)) return <span className="text-sm">{String(raw)}</span>;

    const cost = raw as number;
    const defaultSuggested = mr.suggestedValues?.[termIdx];
    const suggested = customRetail ?? (defaultSuggested != null && defaultSuggested > 0 ? defaultSuggested : Math.round(cost * 1.4));
    const hasCustom = customRetail != null;
    const markupPct = cost > 0 ? ((suggested - cost) / cost) * 100 : 0;
    const isEditing = editingCell === key;

    return (
      <div className="flex flex-col gap-1 min-w-[130px]">
        <span className="text-[11px] text-muted-foreground">Cost {fmt(cost)}</span>
        {isEditing ? (
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
                  if (e.key === "Enter") { const n = parseFloat(draftValue); if (!isNaN(n)) saveCell(key, n); }
                  else if (e.key === "Escape") setEditingCell(null);
                }}
              />
            </div>
            <Button size="icon" variant="ghost" className="h-6 w-6" disabled={savingKey === key}
              onClick={() => { const n = parseFloat(draftValue); if (!isNaN(n)) saveCell(key, n); }}>
              <Check className="w-3.5 h-3.5 text-green-600" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingCell(null)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
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
                onClick={() => { setEditingCell(key); setDraftValue(suggested.toString()); }}>
                <Pencil className="w-3 h-3" />
              </Button>
            )}
            {isAdmin && hasCustom && (
              <Button size="icon" variant="ghost" className="h-6 w-6 opacity-30 hover:opacity-100"
                onClick={() => clearCell(key)} title="Clear custom price">
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
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
                        onClick={() => setSelectedProductId(p.id)}
                        className={cn(
                          "w-full text-left rounded-xl px-4 py-3 transition-all hover:bg-muted/60",
                          isSelected ? "bg-primary/10 border border-primary/30 shadow-sm" : "bg-card border border-transparent"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex items-center gap-2">
                            <Shield className={cn("w-4 h-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground/60")} />
                            <div className="min-w-0">
                              <p className="font-semibold text-sm truncate">{p.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{typeLabel(p.type)}</p>
                            </div>
                          </div>
                          <ChevronRight className={cn("w-4 h-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground/40")} />
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5 pl-6">
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

                            {/* Bulk markup */}
                            {isAdmin && (
                              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
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
                                <Button size="sm" variant="default" className="h-8 text-xs px-3 whitespace-nowrap bg-primary hover:bg-primary/90" onClick={applyBulkMarkup}>
                                  Apply to empty
                                </Button>
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
                            Click the pencil on any cell to set a custom retail price. Grey italic values show suggested retail — customers only see your saved price.
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
