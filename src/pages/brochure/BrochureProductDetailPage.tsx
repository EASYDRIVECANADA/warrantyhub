import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Zap, Shield } from "lucide-react";
import BrochureHeader from "../../components/brochure/BrochureHeader";
import BrochureCoverageAccordion from "../../components/brochure/BrochureCoverageAccordion";
import BrochureBenefitsSection from "../../components/brochure/BrochureBenefitsSection";
import BrochureFinePrintSection from "../../components/brochure/BrochureFinePrintSection";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../providers/AuthProvider";

interface PricingTier {
  label: string;
  vehicleClass?: string;
  dealerCost: number;
  suggestedRetail: number;
}

interface ProductDetail {
  id: string;
  name: string;
  productType: string;
  providerName: string;
  eligibilityText: string;
  description: string;
  tiers: PricingTier[];
  deductible: string;
  categories: { name: string; parts: string[] }[];
  benefits: any[];
  termsSections: { title: string; content: string }[];
  exclusions: string[];
}

type Tab = "overview" | "coverage" | "benefits" | "terms";

export default function BrochureProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const showPricing = user?.role === "DEALER_ADMIN" || user?.role === "DEALER_EMPLOYEE";

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [selectedTierIdx, setSelectedTierIdx] = useState(0);

  const overviewRef = useRef<HTMLDivElement>(null);
  const coverageRef = useRef<HTMLDivElement>(null);
  const benefitsRef = useRef<HTMLDivElement>(null);
  const termsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!productId) return;
    (async () => {
      const { data: row } = await supabase
        .from("products")
        .select("id, name, product_type, pricing_json, coverage_details_json, coverage_details, eligibility_rules, provider_entity_id")
        .eq("id", productId)
        .single();

      if (!row) { setLoading(false); return; }

      let providerName = "Provider";
      if (row.provider_entity_id) {
        const { data: prov } = await supabase
          .from("providers")
          .select("company_name")
          .eq("id", row.provider_entity_id)
          .single();
        if (prov) providerName = prov.company_name;
      }

      const cd = row.coverage_details_json ?? row.coverage_details ?? {};
      const pr = row.pricing_json ?? {};
      const cdObj = typeof cd === "string" ? (() => { try { return JSON.parse(cd); } catch { return {}; } })() : (cd ?? {});
      const prObj = typeof pr === "string" ? (() => { try { return JSON.parse(pr); } catch { return {}; } })() : (pr ?? {});
      const er = row.eligibility_rules ?? {};
      const erObj = typeof er === "string" ? (() => { try { return JSON.parse(er); } catch { return {}; } })() : (er ?? {});

      const eligParts: string[] = [];
      if (erObj.maxAge) eligParts.push(`up to ${erObj.maxAge} yrs`);
      if (erObj.maxMileage) eligParts.push(`up to ${Number(erObj.maxMileage).toLocaleString()} km`);

      const rawTiers: any[] = prObj.rows || prObj.tiers || [];
      const tiers: PricingTier[] = rawTiers.map((r: any) => ({
        label: r.label || r.term || "Standard",
        vehicleClass: r.vehicleClass || r.vehicle_class || "",
        dealerCost: Number(r.dealerCost ?? r.dealer_cost ?? 0),
        suggestedRetail: Number(r.suggestedRetail ?? r.suggested_retail ?? r.retail ?? 0),
      }));

      const categories = (cdObj.categories || []).map((c: any) => ({
        name: c.name || "",
        parts: Array.isArray(c.parts) ? c.parts : [],
      }));

      const benefits = prObj.benefits || cdObj.benefits || [];
      const termsSections = cdObj.termsSections || cdObj.terms_sections || [];
      const exclusions = cdObj.exclusions || [];

      setProduct({
        id: row.id,
        name: row.name,
        productType: row.product_type || "Extended Warranty",
        providerName,
        eligibilityText: eligParts.length ? eligParts.join(" · ") : "",
        description: cdObj.description || "",
        tiers,
        deductible: prObj.deductible || cdObj.deductible || "",
        categories,
        benefits,
        termsSections: Array.isArray(termsSections) ? termsSections : [],
        exclusions: Array.isArray(exclusions) ? exclusions : [],
      });
      setLoading(false);
    })();
  }, [productId]);

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>, tab: Tab) => {
    setActiveTab(tab);
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const tabs: { id: Tab; label: string; ref: React.RefObject<HTMLDivElement | null> }[] = [
    { id: "overview", label: "Overview", ref: overviewRef },
    { id: "coverage", label: "What's Covered", ref: coverageRef },
    { id: "benefits", label: "Benefits", ref: benefitsRef },
    { id: "terms", label: "Terms & Conditions", ref: termsRef },
  ];

  const selectedTier = product?.tiers[selectedTierIdx];

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <BrochureHeader />
        <div className="hero-gradient pt-[70px]">
          <div className="max-w-5xl mx-auto px-4 py-10 animate-pulse">
            <div className="h-3 w-16 rounded bg-white/20 mb-6" />
            <div className="flex gap-2 mb-3">
              <div className="h-6 w-20 rounded-full bg-white/20" />
              <div className="h-6 w-24 rounded-full bg-white/20" />
              <div className="h-6 w-28 rounded-full bg-white/20" />
            </div>
            <div className="h-9 w-64 rounded bg-white/20 mb-4" />
            <div className="flex gap-2 mb-4">
              {[1,2,3].map((i) => <div key={i} className="h-7 w-20 rounded-full bg-white/20" />)}
            </div>
            <div className="grid md:grid-cols-3 gap-6 mt-6">
              <div className="md:col-span-2 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-4 w-full rounded bg-white/10" />
                ))}
              </div>
              <div className="h-36 rounded-xl bg-white/10" />
            </div>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 py-10 space-y-4 animate-pulse">
          <div className="h-6 w-32 rounded bg-muted" />
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="h-40 rounded-xl bg-muted" />
            <div className="h-40 rounded-xl bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background">
        <BrochureHeader />
        <div className="max-w-3xl mx-auto px-4 py-24 text-center pt-[70px]">
          <p className="text-muted-foreground">Product not found.</p>
          <button
            onClick={() => navigate("/brochure")}
            className="mt-4 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            ← Back to all plans
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <BrochureHeader />

      {/* Hero */}
      <div className="hero-gradient pt-[70px]">
        <div className="max-w-5xl mx-auto px-4 py-10">

          {/* Back */}
          <button
            onClick={() => navigate("/brochure")}
            className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            All Plans
          </button>

          {/* Badges */}
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-white/10 border border-white/20 text-white/80">
              {product.providerName}
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-400/20 border border-amber-400/30 text-amber-300">
              {product.productType}
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-400/20 border border-green-400/30 text-green-300">
              $0 Premium Fees
            </span>
          </div>

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-1">{product.name}</h1>

          {/* Tier selector */}
          {product.tiers.length > 1 && (
            <div className="flex flex-wrap gap-2 mt-4 mb-4">
              {product.tiers.map((tier, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedTierIdx(i)}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${
                    selectedTierIdx === i
                      ? "bg-white text-primary border-white scale-105 shadow-md"
                      : "border-white/30 text-white/70 hover:bg-white/10"
                  }`}
                >
                  {tier.label}
                  {tier.vehicleClass ? ` · ${tier.vehicleClass}` : ""}
                </button>
              ))}
            </div>
          )}

          {product.eligibilityText && (
            <p className="text-white/60 text-sm mt-2 mb-6">{product.eligibilityText}</p>
          )}

          {/* Bottom two-col layout */}
          <div className="grid md:grid-cols-3 gap-6 mt-4">

            {/* Left — covered components checklist */}
            {product.categories.length > 0 && (
              <div className="md:col-span-2">
                <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mb-3">
                  What's Included
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                  {product.categories.map((cat) => (
                    <div key={cat.name} className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-green-400/20 border border-green-400/30 flex items-center justify-center shrink-0">
                        <Check className="w-2.5 h-2.5 text-green-300" />
                      </span>
                      <span className="text-white/80 text-xs font-medium truncate">{cat.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Right — stats panel */}
            <div className="flex flex-col gap-3">
              {showPricing && selectedTier ? (
                <div className="rounded-xl bg-white/10 border border-white/20 p-4 space-y-3">
                  {selectedTier.suggestedRetail > 0 && (
                    <div>
                      <div className="text-white/50 text-[10px] uppercase tracking-wider mb-0.5">Retail price</div>
                      <div className="text-amber-400 font-extrabold text-2xl">
                        ${selectedTier.suggestedRetail.toLocaleString()}
                      </div>
                    </div>
                  )}
                  {selectedTier.dealerCost > 0 && (
                    <div>
                      <div className="text-white/50 text-[10px] uppercase tracking-wider mb-0.5">Dealer cost</div>
                      <div className="text-white font-bold text-lg">
                        ${selectedTier.dealerCost.toLocaleString()}
                      </div>
                    </div>
                  )}
                  {product.deductible && (
                    <div className="pt-2 border-t border-white/10">
                      <div className="text-white/50 text-[10px] uppercase tracking-wider mb-0.5">Deductible</div>
                      <div className="text-white font-semibold">${product.deductible}</div>
                    </div>
                  )}
                </div>
              ) : !showPricing ? (
                <div className="rounded-xl bg-white/10 border border-white/20 p-4 text-center">
                  <p className="text-white/60 text-xs mb-3 leading-relaxed">
                    Dealer pricing is available to registered dealerships only.
                  </p>
                  <button
                    onClick={() => navigate("/sign-in")}
                    className="w-full px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-primary font-bold text-sm transition-colors"
                  >
                    Sign In to View Pricing
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky section nav */}
      <div className="sticky top-[70px] z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-0 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => scrollTo(tab.ref, tab.id)}
                className={`shrink-0 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content sections */}
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-14">

        {/* Overview */}
        <section ref={overviewRef}>
          <h2 className="text-xl font-bold text-foreground mb-6">Overview</h2>
          {product.description && (
            <p className="text-muted-foreground text-sm leading-relaxed mb-6">{product.description}</p>
          )}
          {product.categories.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-4">
              {/* First half — Powertrain / Core Coverage */}
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Zap className="w-3.5 h-3.5 text-primary" />
                  </span>
                  <h3 className="font-semibold text-sm text-foreground">Core Coverage</h3>
                </div>
                <ul className="space-y-2">
                  {product.categories.slice(0, Math.ceil(product.categories.length / 2)).map((c) => (
                    <li key={c.name} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      <span className="text-foreground font-medium">{c.name}</span>
                      {c.parts.length > 0 && (
                        <span className="text-xs text-muted-foreground">({c.parts.length} parts)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              {/* Second half — Additional Coverage */}
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <Shield className="w-3.5 h-3.5 text-emerald-600" />
                  </span>
                  <h3 className="font-semibold text-sm text-foreground">Additional Coverage</h3>
                </div>
                <ul className="space-y-2">
                  {product.categories.slice(Math.ceil(product.categories.length / 2)).map((c) => (
                    <li key={c.name} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      <span className="text-foreground font-medium">{c.name}</span>
                      {c.parts.length > 0 && (
                        <span className="text-xs text-muted-foreground">({c.parts.length} parts)</span>
                      )}
                    </li>
                  ))}
                  {product.categories.slice(Math.ceil(product.categories.length / 2)).length === 0 && (
                    <li className="text-sm text-muted-foreground italic">See coverage tab for details</li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </section>

        {/* What's Covered */}
        <section ref={coverageRef}>
          <h2 className="text-xl font-bold text-foreground mb-6">What's Covered</h2>
          <BrochureCoverageAccordion categories={product.categories} />
        </section>

        {/* Benefits */}
        <section ref={benefitsRef}>
          <h2 className="text-xl font-bold text-foreground mb-6">Included Benefits</h2>
          <BrochureBenefitsSection benefits={product.benefits} />
        </section>

        {/* Terms & Conditions */}
        <section ref={termsRef}>
          <h2 className="text-xl font-bold text-foreground mb-6">Terms & Conditions</h2>
          <BrochureFinePrintSection
            termsSections={product.termsSections}
            exclusions={product.exclusions}
          />
        </section>
      </div>

      {/* Footer */}
      <div className="py-8 text-center text-xs text-muted-foreground border-t border-border">
        © {new Date().getFullYear()} Bridge Warranty. Coverage terms subject to individual plan agreements.
      </div>
    </div>
  );
}
