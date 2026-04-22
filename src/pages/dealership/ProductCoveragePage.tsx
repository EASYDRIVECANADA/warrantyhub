import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import DashboardLayout, { dealershipNavItems } from "../../components/dashboard/DashboardLayout";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";
import {
  ArrowLeft, Check, Shield, Wrench, ChevronDown, ChevronRight,
  DollarSign, Clock, Gauge, Loader2, AlertCircle,
} from "lucide-react";
import { supabase } from "../../integrations/supabase/client";
import { useDealership } from "../../hooks/useDealership";
import { cn } from "../../lib/utils";

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

  // Returns the dealer's custom price for a tier, or falls back to suggestedRetail
  function getDisplayPrice(row: PricingRow, index: number): number {
    const key = `${row.term}|${row.vehicleClass || ""}|${index}`;
    if (confidentialityEnabled && customPricing[key] !== undefined) return customPricing[key];
    return row.dealerCost;
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

  const pricingRows: PricingRow[] = (pr.rows || []).map((r: any) => ({
    term: r.label || r.term || "",
    mileageBracket: r.mileageBracket || r.mileage_bracket || "",
    vehicleClass: r.vehicleClass || r.vehicle_class || "",
    dealerCost: Number(r.dealerCost || r.dealer_cost || 0),
    suggestedRetail: Number(r.suggestedRetail || r.suggested_retail || 0),
  }));

  const rawBenefits: Benefit[] = (pr.benefits || []).map((b: any) =>
    typeof b === "string" ? { name: b, included: true } : { name: b.name, included: b.included ?? true }
  );

  const termsSections: TermsSection[] = cd.termsSections || [];
  const exclusions: string[] = cd.exclusions || [];

  const powertrainCats = categories.filter(c => isPowertrain(c.name));
  const additionalCats = categories.filter(c => !isPowertrain(c.name));

  // Unique claim tiers (vehicleClass) for the selector buttons
  const uniqueTiers = [...new Set(pricingRows.map(r => r.vehicleClass).filter(Boolean))] as string[];
  // Auto-select first tier on load
  const activeTier = selectedTier ?? (uniqueTiers[0] || null);
  const tierRows = activeTier ? pricingRows.filter(r => r.vehicleClass === activeTier) : pricingRows;

  const allRetails = pricingRows.map(r => r.suggestedRetail).filter(Boolean);
  const minRetail = allRetails.length ? Math.min(...allRetails) : null;
  const maxRetail = allRetails.length ? Math.max(...allRetails) : null;

  const tierRetails = tierRows.map(r => r.suggestedRetail).filter(Boolean);
  const tierMinRetail = tierRetails.length ? Math.min(...tierRetails) : minRetail;
  const tierMaxRetail = tierRetails.length ? Math.max(...tierRetails) : maxRetail;

  const allCosts = pricingRows.map(r => r.dealerCost).filter(Boolean);
  const minCost = allCosts.length ? Math.min(...allCosts) : null;

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
                      onClick={() => setSelectedTier(tier)}
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
              {minCost !== null && (
                <p className="mt-0.5 text-sm text-white/40">Dealer cost from ${minCost.toLocaleString()}</p>
              )}

              {/* CTA */}
              <Button
                size="lg"
                className="mt-4 bg-accent text-[#0f1b3d] hover:bg-accent/90 font-semibold"
                onClick={() => navigate(`/dealership/contracts/new?productId=${product.id}`)}
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
                    <p className="text-sm text-muted-foreground mt-1">{uniqueTiers.length} claim tier{uniqueTiers.length !== 1 ? "s" : ""} available</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setActiveSection("pricing")}>View Full Pricing</Button>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {tierRows.slice(0, 4).map((row, i) => (
                    <div
                      key={i}
                      className="rounded-xl border bg-card p-5 cursor-pointer hover:border-primary/30 hover:shadow-md transition-all group"
                      onClick={() => setActiveSection("pricing")}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <Badge variant="secondary" className="text-xs">{row.vehicleClass || "Standard"}</Badge>
                        <DollarSign className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <p className="font-display font-bold text-2xl text-foreground">${getDisplayPrice(row, i).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Price</p>
                      <div className="border-t mt-3 pt-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />{row.term}
                        </div>
                        {row.mileageBracket && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Gauge className="h-3 w-3" />{row.mileageBracket}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
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
            <h2 className="font-display text-xl font-bold text-foreground">Pricing & Options</h2>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-semibold">Term</th>
                    <th className="text-left px-4 py-3 font-semibold">Vehicle Class</th>
                    <th className="text-right px-4 py-3 font-semibold text-primary">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pricingRows.map((row, i) => (
                    <tr key={i} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{row.term}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.vehicleClass || "—"}</td>
                      <td className="px-4 py-3 text-right text-primary font-semibold">
                        ${getDisplayPrice(row, i).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {deductible && (
              <p className="text-sm text-muted-foreground">Deductible: ${deductible} per claim</p>
            )}
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
          <Button className="bg-accent text-[#0f1b3d] hover:bg-accent/90 font-semibold" onClick={() => navigate("/dealership/contracts/new")}>
            Get a Quote →
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
