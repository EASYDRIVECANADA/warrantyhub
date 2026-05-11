import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import DashboardLayout, { dealershipNavItems } from "../../components/dashboard/DashboardLayout";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";
import {
  ArrowLeft, Check, Shield, Wrench, ChevronDown, ChevronRight,
  DollarSign, Gauge, Loader2, AlertCircle,
} from "lucide-react";
import { supabase } from "../../integrations/supabase/client";
import { useDealership } from "../../hooks/useDealership";
import { cn } from "../../lib/utils";
import {
  buildAddOnPricingRows as buildSharedAddOnPricingRows,
  buildBasePricingRows,
  numericPrice,
  parseVehicleClass as parseSharedVehicleClass,
  pricingRowKey,
  resolveCustomerRetail,
  resolveCustomerRetailNumber,
} from "../../lib/pricing/dealerPricing";

// ── Types ─────────────────────────────────────────

interface CoverageCategory {
  name: string;
  parts: string[];
}

interface PricingRow {
  term: string;
  mileageBracket?: string;
  vehicleClass?: string;
  dealerCost: number;
  suggestedRetail: number;
  retailKey: string;
}

interface AddOnPricingRow {
  name: string;
  term: string;
  label: string;
  vehicleClass: string;
  tierKey: string;
  dealerCost: number | string;
  suggestedRetail: number | string;
  retailKey: string;
}

interface Benefit {
  name: string;
  included?: boolean;
}

interface TermsSection {
  title: string;
  content: string;
}

interface ProductData {
  id: string;
  name: string;
  type: string;
  description?: string;
  provider_entity_id?: string;
  provider_id?: string;
  coverage_details_json?: any;
  pricing_json?: any;
  eligibility_rules?: any;
  status?: string;
}


const POWERTRAIN_KEYWORDS = ["engine", "transmission", "transfer case", "differential", "turbo", "supercharger", "drive axle"];

function isPowertrain(name: string) {
  const lower = name.toLowerCase();
  return POWERTRAIN_KEYWORDS.some(k => lower.includes(k));
}

// ── Main Component ────────────────────────────────

export function cellKey(tierIdx: number, bandIdx: number | null, rowIdx: number, termIdx: number) {
  return `t${tierIdx}|m${bandIdx == null ? "-" : bandIdx}|r${rowIdx}|term${termIdx}`;
}

export function parseVehicleClass(vcRaw: string): { tierKey: string; bandKey: string | null } {
  const vc = vcRaw.replace(/\u00c2\u00b7/g, "\u00b7").trim();
  if (vc.includes("\u00b7")) {
    const [band = "", tier = ""] = vc.split("\u00b7").map((s) => s.trim());
    return { tierKey: tier.replace(/\/claim/i, " / claim"), bandKey: band || null };
  }

  const classMatch = vc.match(/^(.+?)\s*-\s*(Class \d+)$/i);
  if (classMatch) {
    return { tierKey: classMatch[1].trim(), bandKey: classMatch[2].trim() };
  }

  return { tierKey: vc || "Standard", bandKey: null };
}

export function buildRetailKeys(rows: any[]): string[] {
  const tierOrder: string[] = [];
  const bandOrder = new Map<string, string[]>();
  const termOrder = new Map<string, string[]>();

  const parsedRows = rows.map((row) => {
    const termLabel = (row.label || row.term || "").toString().trim();
    const { tierKey, bandKey } = parseVehicleClass((row.vehicleClass || row.vehicle_class || "Standard").toString());
    const normalizedBandKey = bandKey ?? "-";

    if (!tierOrder.includes(tierKey)) {
      tierOrder.push(tierKey);
      bandOrder.set(tierKey, []);
      termOrder.set(tierKey, []);
    }

    const bands = bandOrder.get(tierKey)!;
    if (!bands.includes(normalizedBandKey)) bands.push(normalizedBandKey);

    const terms = termOrder.get(tierKey)!;
    if (!terms.includes(termLabel)) terms.push(termLabel);

    return { tierKey, bandKey: normalizedBandKey, termLabel };
  });

  return parsedRows.map((row) => {
    const tierIdx = tierOrder.indexOf(row.tierKey);
    const bands = bandOrder.get(row.tierKey) ?? [];
    const terms = termOrder.get(row.tierKey) ?? [];
    const termIdx = Math.max(terms.indexOf(row.termLabel), 0);
    const hasBands = bands.length > 1 || (bands.length === 1 && bands[0] !== "-");

    if (hasBands) {
      return cellKey(tierIdx, Math.max(bands.indexOf(row.bandKey), 0), -1, termIdx);
    }

    return cellKey(tierIdx, null, 0, termIdx);
  });
}

export function isAddonPricingRow(row: any): boolean {
  return row?.kind === "addon" || row?.type === "addon" || !!row?.addonName;
}

export function coercePrice(value: any): number | string {
  if (typeof value === "number") return Number.isFinite(value) ? value : "n/a";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "n/a";
    const lower = trimmed.toLowerCase();
    if (lower === "included") return "Included";
    if (["n/a", "na", "-", "—"].includes(lower)) return "n/a";
    const numeric = Number(trimmed.replace(/[$,]/g, ""));
    return Number.isFinite(numeric) ? numeric : trimmed;
  }
  return "n/a";
}

export function isDisplayableAddOnPrice(value: number | string): boolean {
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return value.trim().toLowerCase() === "included";
}

export function buildAddOnPricingRows(baseRows: any[], addonRows: any[], activeTier: string | null): AddOnPricingRow[] {
  const tierOrder: string[] = [];
  const bandOrder = new Map<string, string[]>();
  const termOrder = new Map<string, string[]>();

  baseRows.forEach((row) => {
    const termLabel = (row.label || row.term || "").toString().trim();
    const { tierKey, bandKey } = parseVehicleClass((row.vehicleClass || row.vehicle_class || "Standard").toString());
    const normalizedBandKey = bandKey ?? "-";

    if (!tierOrder.includes(tierKey)) {
      tierOrder.push(tierKey);
      bandOrder.set(tierKey, []);
      termOrder.set(tierKey, []);
    }

    const bands = bandOrder.get(tierKey)!;
    if (!bands.includes(normalizedBandKey)) bands.push(normalizedBandKey);

    const terms = termOrder.get(tierKey)!;
    if (!terms.includes(termLabel)) terms.push(termLabel);
  });

  const activeTierKey = activeTier ? parseVehicleClass(activeTier).tierKey : null;
  const addonOrder = new Map<string, string[]>();
  const rows: AddOnPricingRow[] = [];

  addonRows.forEach((row) => {
    const name = (row.addonName || row.name || "Add-on").toString().trim();
    const termLabel = (row.label || row.term || "").toString().trim();
    const { tierKey } = parseVehicleClass((row.vehicleClass || row.vehicle_class || "Standard").toString());
    if (activeTierKey && tierKey !== activeTierKey) return;

    const tierIdx = tierOrder.indexOf(tierKey);
    const terms = termOrder.get(tierKey) ?? [];
    const termIdx = terms.indexOf(termLabel);
    if (tierIdx < 0 || termIdx < 0) return;

    const labels = addonOrder.get(tierKey) ?? [];
    if (!labels.includes(name)) labels.push(name);
    addonOrder.set(tierKey, labels);

    const bands = bandOrder.get(tierKey) ?? [];
    const hasBands = bands.length > 1 || (bands.length === 1 && bands[0] !== "-");
    const addonIdx = labels.indexOf(name);
    const rowIdx = hasBands ? addonIdx : addonIdx + 1;
    const suggestedRetail = coercePrice(row.suggestedRetail ?? row.suggested_retail ?? row.retail ?? row.price ?? "n/a");
    if (!isDisplayableAddOnPrice(suggestedRetail)) return;

    rows.push({
      name,
      term: termLabel,
      label: termLabel,
      vehicleClass: tierKey,
      tierKey,
      dealerCost: coercePrice(row.dealerCost ?? row.dealer_cost ?? row.price ?? 0),
      suggestedRetail,
      retailKey: cellKey(tierIdx, null, rowIdx, termIdx),
    });
  });

  return rows;
}

export default function ProductCoveragePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { dealershipId } = useDealership();

  const [product, setProduct] = useState<ProductData | null>(null);
  const [providerName, setProviderName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeSection, setActiveSection] = useState<"overview" | "coverage" | "pricing" | "benefits" | "terms">("overview");
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [customPricing, setCustomPricing] = useState<Record<string, number>>({});
  const [confidentialityEnabled, setConfidentialityEnabled] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [selectedBaseKey, setSelectedBaseKey] = useState<string>("");
  const [selectedAddOns, setSelectedAddOns] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) { setNotFound(true); setLoading(false); return; }
    (async () => {
      const { data: p, error } = await supabase.from("products").select("*").eq("id", id).single();
      if (error || !p) { setNotFound(true); setLoading(false); return; }
      setProduct(p as ProductData);

      // Try V2 providers table first, fall back to profiles
      const entityId = (p as any).provider_entity_id;
      let resolvedName = "";
      if (entityId) {
        const { data: prov } = await supabase.from("providers").select("company_name").eq("id", entityId).single();
        if (prov) resolvedName = (prov as any).company_name;
      }
      if (!resolvedName) {
        const legacyId = (p as any).provider_id;
        if (legacyId) {
          const { data: prof } = await supabase.from("profiles").select("display_name, company_name, email").eq("id", legacyId).single();
          if (prof) resolvedName = (prof as any).company_name || (prof as any).display_name || (prof as any).email || "";
        }
      }
      setProviderName(resolvedName);
      setLoading(false);
    })();
  }, [id]);

  // Load dealer's custom pricing for this product
  useEffect(() => {
    if (!dealershipId || !id) return;
    (async () => {
      const { data } = await supabase
        .from("dealership_product_pricing")
        .select("retail_price, confidentiality_enabled")
        .eq("dealership_id", dealershipId)
        .eq("product_id", id)
        .maybeSingle();
      if (data?.retail_price) setCustomPricing(data.retail_price as Record<string, number>);
      if (data?.confidentiality_enabled) setConfidentialityEnabled(true);
    })();
  }, [dealershipId, id]);

  // Returns the dealer's saved customer-facing retail, or falls back to provider suggested retail.
  function getDisplayPrice(row: PricingRow): number {
    return resolveCustomerRetailNumber(row, {
      retail_price: customPricing,
      confidentiality_enabled: confidentialityEnabled,
    });
  }

  function getAddOnDisplayPrice(row: AddOnPricingRow): number | string {
    return resolveCustomerRetail(row, {
      retail_price: customPricing,
      confidentiality_enabled: confidentialityEnabled,
    });
  }

  if (loading) {
    return (
      <DashboardLayout navItems={dealershipNavItems} title="Loading...">
        <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      </DashboardLayout>
    );
  }

  if (notFound || !product) {
    return (
      <DashboardLayout navItems={dealershipNavItems} title="Product Not Found">
        <div className="text-center py-20 space-y-4">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="font-display text-xl font-semibold">Product not found</h2>
          <Button variant="ghost" onClick={() => navigate("/dealership/find-products")}>← Back to Products</Button>
        </div>
      </DashboardLayout>
    );
  }

  // ── Parse JSONB data ──
  const cd = (product.coverage_details_json ?? {}) as any;
  const pr = (product.pricing_json ?? {}) as any;
  const er = (product.eligibility_rules ?? {}) as any;

  const categories: CoverageCategory[] = (cd.categories || []).map((c: any) => ({
    name: c.name || "",
    parts: Array.isArray(c.parts) ? c.parts : [],
  }));

  const pricingRows: PricingRow[] = buildBasePricingRows(pr);

  const rawBenefits: Benefit[] = (pr.benefits || []).map((b: any) =>
    typeof b === "string" ? { name: b, included: true } : { name: b.name, included: b.included ?? true }
  );

  const termsSections: TermsSection[] = cd.termsSections || [];
  const exclusions: string[] = cd.exclusions || [];

  const powertrainCats = categories.filter(c => isPowertrain(c.name));
  const additionalCats = categories.filter(c => !isPowertrain(c.name));

  // Unique claim tiers for the selector buttons
  const uniqueTiers = [...new Set(pricingRows.map(r => parseSharedVehicleClass(r.vehicleClass || "").tierKey).filter(Boolean))] as string[];
  const activeTier = selectedTier ?? (uniqueTiers[0] || null);
  const tierRows = activeTier
    ? pricingRows.filter(r => parseSharedVehicleClass(r.vehicleClass || "").tierKey === activeTier)
    : pricingRows;
  const baseTermLabels = [...new Set(tierRows.map((row) => row.term))];
  const baseMatrixRows = [...tierRows.reduce((map, row) => {
    const { bandKey } = parseSharedVehicleClass(row.vehicleClass || "");
    const label = bandKey ?? "Base Price";
    const termMap = map.get(label) ?? new Map<string, PricingRow>();
    termMap.set(row.term, row);
    map.set(label, termMap);
    return map;
  }, new Map<string, Map<string, PricingRow>>()).entries()];
  const addOnRows = buildSharedAddOnPricingRows(pr, activeTier);
  const addOnTermSet = new Set(addOnRows.map((row) => row.term));
  const addOnTermLabels = [
    ...baseTermLabels.filter((term) => addOnTermSet.has(term)),
    ...Array.from(addOnTermSet).filter((term) => !baseTermLabels.includes(term)),
  ];
  const addOnMatrixRows = [...addOnRows.reduce((map, row) => {
    const termMap = map.get(row.name) ?? new Map<string, AddOnPricingRow>();
    termMap.set(row.term, row);
    map.set(row.name, termMap);
    return map;
  }, new Map<string, Map<string, AddOnPricingRow>>()).entries()];
  const selectedBaseRow = pricingRows.find((row) => pricingRowKey(row) === selectedBaseKey) ?? null;
  const selectableAddOns = selectedBaseRow
    ? addOnRows.filter((row) => row.term === selectedBaseRow.term)
    : [];
  const selectedAddOnRows = Array.from(selectedAddOns)
    .map((name) => selectableAddOns.find((row) => row.name === name))
    .filter((row): row is AddOnPricingRow => Boolean(row));
  const selectedBaseRetail = selectedBaseRow ? getDisplayPrice(selectedBaseRow) : 0;
  const selectedAddOnRetail = selectedAddOnRows.reduce((sum, row) => sum + numericPrice(getAddOnDisplayPrice(row)), 0);
  const selectedQuoteTotal = selectedBaseRetail + selectedAddOnRetail;

  const allRetails = pricingRows.map(r => getDisplayPrice(r)).filter(Boolean);
  const minRetail = allRetails.length ? Math.min(...allRetails) : null;
  const maxRetail = allRetails.length ? Math.max(...allRetails) : null;

  const tierRetails = tierRows.map(r => getDisplayPrice(r)).filter(Boolean);
  const tierMinRetail = tierRetails.length ? Math.min(...tierRetails) : minRetail;
  const tierMaxRetail = tierRetails.length ? Math.max(...tierRetails) : maxRetail;

  const deductible = pr.deductible;

  const eligibilityText = [
    er.maxAge ? `Vehicles up to ${er.maxAge} years old` : null,
    er.maxMileage ? `Up to ${Number(er.maxMileage).toLocaleString()} km` : null,
  ].filter(Boolean).join(" • ");


  const sections = [
    { key: "overview" as const, label: "Overview" },
    { key: "coverage" as const, label: "What's Covered" },
    ...(pricingRows.length ? [{ key: "pricing" as const, label: "Pricing & Options" }] : []),
    ...(rawBenefits.length ? [{ key: "benefits" as const, label: "Benefits" }] : []),
    ...(termsSections.length || exclusions.length ? [{ key: "terms" as const, label: "Terms & Conditions" }] : []),
  ];

  const toggleCategory = (idx: number) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const selectTier = (tier: string) => {
    setSelectedTier(tier);
    setSelectedBaseKey("");
    setSelectedAddOns(new Set());
  };

  const selectBaseRow = (row: PricingRow) => {
    setSelectedBaseKey(pricingRowKey(row));
    setSelectedAddOns((prev) => {
      const validNames = new Set(addOnRows.filter((addOn) => addOn.term === row.term).map((addOn) => addOn.name));
      return new Set(Array.from(prev).filter((name) => validNames.has(name)));
    });
  };

  const toggleAddOn = (row: AddOnPricingRow) => {
    if (!selectedBaseRow || row.term !== selectedBaseRow.term) return;
    setSelectedAddOns((prev) => {
      const next = new Set(prev);
      next.has(row.name) ? next.delete(row.name) : next.add(row.name);
      return next;
    });
  };

  const quoteUrl = () => {
    const params = new URLSearchParams({ productId: product.id });
    if (selectedBaseRow) {
      params.set("pricingKey", pricingRowKey(selectedBaseRow));
      selectedAddOns.forEach((name) => params.append("addOn", name));
    }
    return `/dealership/contracts/new?${params.toString()}`;
  };

  return (
    <DashboardLayout navItems={dealershipNavItems} title={product.name}>
      <div className="space-y-6">

        {/* Back */}
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/dealership/find-products">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to Products
          </Link>
        </Button>

        {/* ── Hero card ── */}
        <div className="rounded-xl bg-gradient-to-br from-[#0f1b3d] via-[#162554] to-[#1a3066] text-white p-6 md:p-8">
          <div className="grid lg:grid-cols-[1fr,auto] gap-8 items-start">
            <div>
              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {providerName && (
                  <Badge className="bg-accent/20 text-accent border-accent/30 text-xs">{providerName}</Badge>
                )}
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs">$0 Premium Fees</Badge>
              </div>

              {/* Name */}
              <h1 className="font-display text-2xl md:text-3xl font-bold">
                {activeTier ? `${product.name.replace(" Warranty", "").replace(" Protection", "")} ${activeTier.split(" - ")[0]}` : product.name}
              </h1>

              {/* Claim tier selector buttons */}
              {uniqueTiers.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {uniqueTiers.map((tier) => (
                    <button
                      key={tier}
                      onClick={() => selectTier(tier)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                        activeTier === tier
                          ? "bg-accent text-[#0f1b3d] border-accent shadow-md"
                          : "bg-white/10 text-white/70 border-white/20 hover:bg-white/20 hover:text-white"
                      )}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              )}

              {/* Eligibility */}
              {eligibilityText && (
                <p className="text-white/50 mt-3 text-sm">{eligibilityText}</p>
              )}

              {/* Price range — updates per selected tier */}
              {tierMinRetail !== null && (
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-accent font-display text-2xl font-bold">
                    ${tierMinRetail!.toLocaleString()}
                    {tierMaxRetail !== null && tierMaxRetail !== tierMinRetail ? ` – $${tierMaxRetail!.toLocaleString()}` : ""}
                  </span>
                  <span className="text-white/40 text-sm">starting price range</span>
                </div>
              )}
              {/* CTA */}
              <Button
                size="lg"
                className="mt-4 bg-accent text-[#0f1b3d] hover:bg-accent/90 font-semibold"
                onClick={() => navigate(quoteUrl())}
              >
                Get a Quote →
              </Button>

              {/* Coverage includes bullets */}
              {categories.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-3">Includes</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
                    {categories.slice(0, 6).map(cat => (
                      <div key={cat.name} className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-accent shrink-0" />
                        <span className="text-sm text-white/80">{cat.name}</span>
                      </div>
                    ))}
                    {categories.length > 6 && (
                      <button
                        onClick={() => setActiveSection("coverage")}
                        className="flex items-center gap-1 text-xs text-white/50 hover:text-white/80 transition-colors"
                      >
                        +{categories.length - 6} more <ChevronRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right stats — dynamic based on selected tier */}
            <div className="flex flex-wrap lg:flex-col gap-3 lg:min-w-[160px]">
              {activeTier && (
                <div className="bg-white/10 rounded-lg px-5 py-3 w-full">
                  <p className="text-[10px] text-white/40 uppercase tracking-wider">Per Claim</p>
                  <p className="font-bold text-accent text-lg leading-snug">{activeTier.includes(" - ") ? activeTier.split(" - ")[1] : activeTier}</p>
                </div>
              )}
              {deductible && (
                <div className="bg-white/10 rounded-lg px-5 py-3 w-full">
                  <p className="text-[10px] text-white/40 uppercase tracking-wider">Deductible</p>
                  <p className="font-bold text-white text-lg">${deductible}</p>
                </div>
              )}
              {uniqueTiers.length > 0 && (
                <div className="bg-white/10 rounded-lg px-5 py-3 w-full">
                  <p className="text-[10px] text-white/40 uppercase tracking-wider">Claim Tiers</p>
                  <p className="font-bold text-white text-lg">{uniqueTiers.length} option{uniqueTiers.length !== 1 ? "s" : ""}</p>
                </div>
              )}
              {tierRows.length > 0 && (
                <div className="bg-white/10 rounded-lg px-5 py-3 w-full">
                  <p className="text-[10px] text-white/40 uppercase tracking-wider">Term Options</p>
                  <p className="font-bold text-white text-lg">{tierRows.length} total</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Sticky section nav ── */}
        <div className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-40 rounded-lg">
          <div className="flex items-center gap-1 py-1 px-2 overflow-x-auto">
            {sections.map(s => (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap border-b-2",
                  activeSection === s.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Overview ── */}
        {activeSection === "overview" && (
          <div className="space-y-8">
            {pricingRows.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-display text-xl font-bold text-foreground">Available Options</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {activeTier
                        ? `${tierRows.length} term option${tierRows.length !== 1 ? "s" : ""} for ${activeTier}`
                        : `${pricingRows.length} pricing option${pricingRows.length !== 1 ? "s" : ""} available`}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setActiveSection("pricing")}>View Full Pricing</Button>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {tierRows.slice(0, 4).map((row, i) => {
                    const parsedClass = parseSharedVehicleClass(row.vehicleClass || "");
                    const tierLabel = parsedClass.tierKey || row.vehicleClass || "Standard";
                    const bandLabel = parsedClass.bandKey || row.mileageBracket;

                    return (
                      <div
                        key={pricingRowKey(row) || i}
                        className="rounded-xl border bg-card p-5 cursor-pointer hover:border-primary/30 hover:shadow-md transition-all group"
                        onClick={() => setActiveSection("pricing")}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <Badge variant="secondary" className="text-xs">{row.term || "Term option"}</Badge>
                          <DollarSign className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <p className="font-display font-bold text-2xl text-foreground">${getDisplayPrice(row).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Customer price</p>
                        <div className="border-t mt-3 pt-3 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Shield className="h-3 w-3" />{tierLabel}
                          </div>
                          {bandLabel && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Gauge className="h-3 w-3" />{bandLabel}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {categories.length > 0 && (
              <div>
                <h2 className="font-display text-xl font-bold text-foreground mb-2">Coverage Overview</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  This plan covers {categories.length} component {categories.length === 1 ? "category" : "categories"}.
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="rounded-xl border bg-card p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Shield className="h-4 w-4 text-primary" />
                      </div>
                      <h3 className="font-display font-bold text-foreground">Powertrain Coverage</h3>
                    </div>
                    {powertrainCats.length > 0 ? (
                      <div className="space-y-2">
                        {powertrainCats.map(cat => (
                          <div key={cat.name} className="flex items-start gap-2">
                            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-foreground">{cat.name}</p>
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {cat.parts.slice(0, 4).join(", ")}{cat.parts.length > 4 ? "…" : ""}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">See full coverage details below.</p>
                    )}
                  </div>

                  <div className="rounded-xl border bg-card p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                        <Wrench className="h-4 w-4 text-accent" />
                      </div>
                      <h3 className="font-display font-bold text-foreground">Additional Coverage</h3>
                    </div>
                    {additionalCats.length > 0 ? (
                      <div className="space-y-2">
                        {additionalCats.slice(0, 8).map(cat => (
                          <div key={cat.name} className="flex items-start gap-2">
                            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-foreground">{cat.name}</p>
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {cat.parts.slice(0, 3).join(", ")}{cat.parts.length > 3 ? "…" : ""}
                              </p>
                            </div>
                          </div>
                        ))}
                        {additionalCats.length > 8 && (
                          <button
                            onClick={() => setActiveSection("coverage")}
                            className="text-xs text-primary font-medium hover:underline flex items-center gap-1 mt-2"
                          >
                            View all {additionalCats.length} categories <ChevronDown className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No additional categories listed.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {rawBenefits.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-xl font-bold text-foreground">Included Benefits</h2>
                  <Button variant="outline" size="sm" onClick={() => setActiveSection("benefits")}>View All</Button>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {rawBenefits.slice(0, 6).map((b, i) => (
                    <div key={i} className="flex items-center gap-2 p-3 rounded-lg border bg-card">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-sm">{b.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Coverage Accordion ── */}
        {activeSection === "coverage" && (
          <div className="space-y-4">
            <h2 className="font-display text-xl font-bold text-foreground">What's Covered</h2>
            {categories.length === 0 ? (
              <p className="text-muted-foreground">No coverage details available for this product.</p>
            ) : (
              <div className="divide-y border rounded-lg overflow-hidden">
                {categories.map((cat, idx) => (
                  <div key={idx}>
                    <button
                      onClick={() => toggleCategory(idx)}
                      className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Check className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-medium text-foreground">{cat.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {cat.parts.length} part{cat.parts.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expandedCategories.has(idx) && "rotate-180")} />
                    </button>
                    {expandedCategories.has(idx) && cat.parts.length > 0 && (
                      <div className="px-5 pb-4 bg-muted/20">
                        <ul className="grid sm:grid-cols-2 gap-1 mt-1">
                          {cat.parts.filter(Boolean).map((part, pi) => (
                            <li key={pi} className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                              {part}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Pricing Table ── */}
        {activeSection === "pricing" && pricingRows.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-bold text-foreground">Pricing & Options</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Compare base coverage and optional add-ons for the selected claim tier.
                  </p>
                </div>
                {tierMinRetail !== null && (
                  <div className="rounded-lg border bg-card px-4 py-3 md:text-right">
                    <p className="text-xs uppercase font-semibold tracking-wide text-muted-foreground">Selected range</p>
                    <p className="text-lg font-bold text-primary">
                      ${tierMinRetail.toLocaleString()}
                      {tierMaxRetail !== null && tierMaxRetail !== tierMinRetail ? ` - $${tierMaxRetail.toLocaleString()}` : ""}
                    </p>
                  </div>
                )}
              </div>
              {uniqueTiers.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {uniqueTiers.map((tier) => (
                    <button
                      key={tier}
                      onClick={() => selectTier(tier)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                        activeTier === tier
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                      )}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-3">
              <h3 className="font-display text-lg font-bold text-foreground">Base Pricing</h3>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-3 font-semibold min-w-[220px]">
                        {baseMatrixRows.length > 1 ? "Mileage Band" : "Coverage"}
                      </th>
                      {baseTermLabels.map((term) => (
                        <th key={term} className="text-right px-4 py-3 font-semibold text-primary min-w-[160px]">
                          {term}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {baseMatrixRows.map(([label, terms]) => (
                      <tr key={label} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-medium">{label}</td>
                        {baseTermLabels.map((term) => {
                          const row = terms.get(term);
                          const isSelected = row ? selectedBaseKey === pricingRowKey(row) : false;
                          return (
                            <td key={term} className="px-3 py-2 text-right">
                              {row ? (
                                <button
                                  type="button"
                                  onClick={() => selectBaseRow(row)}
                                  className={cn(
                                    "w-full rounded-lg border px-3 py-2 text-right font-semibold transition-all",
                                    isSelected
                                      ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                                      : "border-transparent text-primary hover:border-primary/40 hover:bg-muted/30"
                                  )}
                                >
                                  ${getDisplayPrice(row).toLocaleString()}
                                </button>
                              ) : (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {pricingRows.map((row, i) => (
                    <tr key={i} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{row.term}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.vehicleClass || "—"}</td>
                      <td className="px-4 py-3 text-right text-primary font-semibold">
                        ${getDisplayPrice(row).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {addOnRows.length > 0 && (
              <div className="space-y-3 pt-2">
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">Optional Add-ons</h3>
                  {activeTier && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Available for {parseSharedVehicleClass(activeTier).tierKey}
                    </p>
                  )}
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-4 py-3 font-semibold min-w-[220px]">Add-on</th>
                        {addOnTermLabels.map((term) => (
                          <th key={term} className="text-right px-4 py-3 font-semibold text-primary min-w-[160px]">
                            {term}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {addOnMatrixRows.map(([name, terms]) => (
                        <tr key={name} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-medium">{name}</td>
                          {addOnTermLabels.map((term) => {
                            const row = terms.get(term);
                            const price = row ? getAddOnDisplayPrice(row) : null;
                            const isEnabled = Boolean(row && selectedBaseRow && row.term === selectedBaseRow.term);
                            const isSelected = Boolean(row && isEnabled && selectedAddOns.has(row.name));
                            return (
                              <td key={term} className="px-3 py-2 text-right">
                                {price == null ? (
                                  <span className="text-muted-foreground/50">—</span>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={!isEnabled || !row}
                                    onClick={() => row && toggleAddOn(row)}
                                    className={cn(
                                      "w-full rounded-lg border px-3 py-2 text-right font-semibold transition-all",
                                      isSelected
                                        ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                                        : "border-transparent text-primary hover:border-primary/40 hover:bg-muted/30",
                                      !isEnabled && "cursor-not-allowed opacity-40 hover:border-transparent hover:bg-transparent"
                                    )}
                                  >
                                    <span className="inline-flex items-center justify-end gap-2">
                                      {isSelected && <Check className="h-3.5 w-3.5" />}
                                      {typeof price === "number" ? `$${price.toLocaleString()}` : (
                                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{price}</Badge>
                                      )}
                                    </span>
                                  </button>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {deductible && (
              <p className="text-sm text-muted-foreground">Deductible: ${deductible} per claim</p>
            )}
            <div className="rounded-xl border bg-card p-4 space-y-2">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase font-semibold tracking-wide text-muted-foreground">Selected quote</p>
                  <p className="text-sm font-medium text-foreground">
                    {selectedBaseRow ? `${selectedBaseRow.term} · ${selectedBaseRow.vehicleClass || "Standard"}` : "Select a base price to prefill the quote"}
                  </p>
                </div>
                <div className="text-left md:text-right">
                  <p className="text-xs text-muted-foreground">Customer price</p>
                  <p className="text-xl font-bold text-primary">{selectedQuoteTotal > 0 ? `$${selectedQuoteTotal.toLocaleString()}` : "-"}</p>
                </div>
              </div>
              {selectedAddOnRows.length > 0 && (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  {selectedAddOnRows.map((row) => (
                    <Badge key={row.name} variant="secondary" className="gap-1">
                      {row.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Benefits ── */}
        {activeSection === "benefits" && (
          <div className="space-y-4">
            <h2 className="font-display text-xl font-bold text-foreground">Included Benefits</h2>
            {rawBenefits.length === 0 ? (
              <p className="text-muted-foreground">No benefits listed for this product.</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {rawBenefits.map((b, i) => (
                  <div key={i} className={cn("flex items-center gap-3 p-4 rounded-lg border", b.included !== false ? "bg-card" : "bg-muted/30 opacity-60")}>
                    <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0", b.included !== false ? "bg-primary/10" : "bg-muted")}>
                      <Check className={cn("h-4 w-4", b.included !== false ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <span className="text-sm font-medium">{b.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Terms & Conditions ── */}
        {activeSection === "terms" && (
          <div className="space-y-6">
            <h2 className="font-display text-xl font-bold text-foreground">Terms, Conditions & Exclusions</h2>

            {termsSections.length > 0 && (
              <div className="space-y-4">
                {termsSections.map((section, i) => (
                  <Card key={i}>
                    <CardContent className="p-5 space-y-2">
                      <h3 className="font-semibold">{section.title}</h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{section.content}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {exclusions.length > 0 && (
              <Card>
                <CardContent className="p-5 space-y-3">
                  <h3 className="font-semibold text-destructive">Exclusions</h3>
                  <ul className="space-y-1.5">
                    {exclusions.map((ex, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-destructive/50 mt-1.5 shrink-0" />
                        {ex}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {eligibilityText && (
              <Card>
                <CardContent className="p-5 space-y-2">
                  <h3 className="font-semibold">Eligibility Requirements</h3>
                  <p className="text-sm text-muted-foreground">{eligibilityText}</p>
                  {er.makes?.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Premium makes (surcharge may apply):</p>
                      <p className="text-sm">{er.makes.join(", ")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <p className="text-xs text-muted-foreground text-center">
              For illustrative purposes only. Please refer to the actual contract for complete terms and conditions.
            </p>
          </div>
        )}

        {/* Bottom CTA bar */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="outline" onClick={() => navigate("/dealership/find-products")}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to Products
          </Button>
          <Button className="bg-accent text-[#0f1b3d] hover:bg-accent/90 font-semibold" onClick={() => navigate(quoteUrl())}>
            Get a Quote →
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
