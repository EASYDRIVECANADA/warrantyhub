import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart2, Check, Shield } from "lucide-react";
import BrochureHeader from "../../components/brochure/BrochureHeader";
import BrochurePlanCard, { type BrochureProduct } from "../../components/brochure/BrochurePlanCard";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../providers/AuthProvider";

interface Provider {
  id: string;
  name: string;
}

function parseProduct(row: any, providerName: string): BrochureProduct {
  const cd = row.coverage_details_json ?? row.coverage_details ?? {};
  const pr = row.pricing_json ?? {};
  const cdObj = typeof cd === "string" ? (() => { try { return JSON.parse(cd); } catch { return {}; } })() : (cd ?? {});
  const prObj = typeof pr === "string" ? (() => { try { return JSON.parse(pr); } catch { return {}; } })() : (pr ?? {});

  const categories: { name: string; parts: string[] }[] = (cdObj.categories || []).map((c: any) => ({
    name: c.name || "",
    parts: Array.isArray(c.parts) ? c.parts : [],
  }));

  const rows: any[] = prObj.rows || prObj.tiers || [];
  const costs = rows.map((r: any) => Number(r.dealerCost ?? r.dealer_cost ?? 0)).filter(Boolean);
  const retails = rows.map((r: any) => Number(r.suggestedRetail ?? r.suggested_retail ?? r.retail ?? 0)).filter(Boolean);

  // Unique vehicleClass names (e.g. "Bronze - $750 Per Claim") for display chips
  const seenClasses = new Set<string>();
  const planChips: string[] = [];
  for (const r of rows) {
    const vc: string = (r.vehicleClass ?? r.vehicle_class ?? "").trim();
    if (vc && !seenClasses.has(vc)) { seenClasses.add(vc); planChips.push(vc); }
  }

  const er = row.eligibility_rules ?? {};
  const erObj = typeof er === "string" ? (() => { try { return JSON.parse(er); } catch { return {}; } })() : (er ?? {});
  const eligParts: string[] = [];
  if (erObj.maxAge) eligParts.push(`up to ${erObj.maxAge} yrs`);
  if (erObj.maxMileage) eligParts.push(`up to ${Number(erObj.maxMileage).toLocaleString()} km`);
  const eligibilityText = eligParts.length ? `Eligible: ${eligParts.join(", ")}` : "";

  return {
    id: row.id,
    name: row.name,
    productType: row.product_type || "Extended Warranty",
    providerName,
    description: cdObj.description || row.description || "",
    categories,
    eligibilityText,
    planChips,
    minDealerCost: costs.length ? Math.min(...costs) : 0,
    minRetail: retails.length ? Math.min(...retails) : 0,
    maxRetail: retails.length ? Math.max(...retails) : 0,
  };
}

const TIRE_TIER_CONFIG = [
  {
    level: "Essential",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    bar: "bg-blue-500",
    btn: "bg-blue-600 hover:bg-blue-700",
    desc: "Tire & wheel repair + roadside assistance",
    features: ["Tire & Rim repair/replacement", "Mounting & balancing", "Roadside assistance"],
  },
  {
    level: "Extended",
    color: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-200",
    bar: "bg-violet-500",
    btn: "bg-violet-600 hover:bg-violet-700",
    desc: "Everything in Essential + key/remote & car rental",
    features: ["Key & remote replacement (up to $800/yr)", "Car rental ($70/day)", "All Essential benefits"],
  },
  {
    level: "Superior",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    bar: "bg-emerald-500",
    btn: "bg-emerald-600 hover:bg-emerald-700",
    desc: "Everything in Extended + windshield, dent & interior",
    features: ["Windshield & lens chip repair", "Paintless dent repair (5 cm)", "Rip/tear/burn interior repair"],
    badge: "Best Value",
  },
];

export default function BrochurePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const showPricing = user?.role === "DEALER_ADMIN" || user?.role === "DEALER_EMPLOYEE";

  const [products, setProducts] = useState<BrochureProduct[]>([]);
  const [tireRimProducts, setTireRimProducts] = useState<BrochureProduct[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [activeProvider, setActiveProvider] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const plansRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase
        .from("products")
        .select("id, name, product_type, pricing_json, coverage_details_json, coverage_details, eligibility_rules, provider_entity_id")
        .eq("published", true)
        .order("name");

      if (!rows || rows.length === 0) { setLoading(false); return; }

      const entityIds = [...new Set(rows.map((r: any) => r.provider_entity_id).filter(Boolean))] as string[];
      const providerNames: Record<string, string> = {};
      if (entityIds.length > 0) {
        const { data: provs } = await supabase.from("providers").select("id, company_name").in("id", entityIds);
        (provs || []).forEach((p: any) => { providerNames[p.id] = p.company_name; });
      }

      const allProducts = rows.map((r: any) => parseProduct(r, providerNames[r.provider_entity_id] || "Provider"));
      const main = allProducts.filter((p) => p.productType !== "Tire & Rim");
      const tr = allProducts.filter((p) => p.productType === "Tire & Rim");

      // Build provider list from main products
      const providerSet = new Map<string, string>();
      main.forEach((p) => {
        if (!providerSet.has(p.providerName)) providerSet.set(p.providerName, p.providerName);
      });
      setProviders([...providerSet.entries()].map(([id, name]) => ({ id, name })));

      setProducts(main);
      setTireRimProducts(tr);
      setLoading(false);
    })();
  }, []);

  const filteredProducts =
    activeProvider === "all"
      ? products
      : products.filter((p) => p.providerName === activeProvider);

  const toggleCompare = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((s) => s !== id);
      if (prev.length >= 3) return [...prev.slice(1), id]; // drop oldest, max 3
      return [...prev, id];
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <BrochureHeader />

      {/* Hero */}
      <div className="hero-gradient pt-[70px]">
        <div className="max-w-7xl mx-auto px-4 py-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-white/80 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Real coverage from verified providers
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight mb-4">
            Warranty Coverage<br />
            <span className="text-amber-400">Made Simple</span>
          </h1>
          <p className="text-white/70 text-lg max-w-xl mx-auto mb-8">
            Browse protection plans from trusted providers. Transparent coverage, clear pricing.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => plansRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="px-6 py-3 rounded-full bg-amber-400 hover:bg-amber-300 text-[#0f1b3d] font-bold text-sm transition-colors shadow-lg"
            >
              Browse Plans
            </button>
            <button
              onClick={() => navigate("/brochure/compare")}
              className="px-6 py-3 rounded-full border border-white/30 hover:bg-white/10 text-white font-semibold text-sm transition-colors"
            >
              Compare Plans
            </button>
          </div>
        </div>
      </div>

      {/* Provider tab bar */}
      {!loading && providers.length > 0 && (
        <div className="sticky top-[70px] z-30 bg-background/95 backdrop-blur border-b border-border">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex gap-1 overflow-x-auto py-2 scrollbar-hide">
              <button
                onClick={() => setActiveProvider("all")}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeProvider === "all"
                    ? "bg-blue-600 text-white"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                All Providers
              </button>
              {providers.map((prov) => (
                <button
                  key={prov.id}
                  onClick={() => setActiveProvider(prov.id)}
                  className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    activeProvider === prov.id
                      ? "bg-blue-600 text-white"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {prov.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Plans grid */}
      <div ref={plansRef} id="plans" className="max-w-7xl mx-auto px-4 py-12">
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border bg-white dark:bg-card overflow-hidden animate-pulse">
                <div className="h-1 bg-muted" />
                <div className="p-5 space-y-3">
                  <div className="h-3 w-24 rounded bg-muted" />
                  <div className="flex gap-1.5">
                    <div className="h-4 w-16 rounded-full bg-muted" />
                    <div className="h-4 w-20 rounded-full bg-muted" />
                  </div>
                  <div className="h-4 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                  <div className="h-10 rounded-lg bg-muted" />
                  <div className="space-y-2 pt-1">
                    {[1,2,3,4].map((j) => (
                      <div key={j} className="h-3 w-full rounded bg-muted" />
                    ))}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <div className="flex-1 h-8 rounded-xl bg-muted" />
                    <div className="w-20 h-8 rounded-xl bg-muted" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <p className="font-medium">No plans available yet.</p>
            <p className="text-sm mt-1">Check back once providers publish their products.</p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">
                {activeProvider === "all"
                  ? `All Plans (${filteredProducts.length})`
                  : `${activeProvider} Plans (${filteredProducts.length})`}
              </h2>
              {selectedIds.length > 0 && (
                <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                  {selectedIds.length} selected for comparison
                </span>
              )}
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredProducts.map((product) => (
                <BrochurePlanCard
                  key={product.id}
                  product={product}
                  isSelected={selectedIds.includes(product.id)}
                  onToggleCompare={toggleCompare}
                  showPricing={showPricing}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Tire & Rim section */}
      {!loading && tireRimProducts.length > 0 && (
        <div className="border-t border-slate-200 py-14" style={{ background: "linear-gradient(135deg, #0f1b3d 0%, #1a3066 60%, #0f1b3d 100%)" }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6">

            {/* Section header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-xs font-bold text-white/50 uppercase tracking-widest">Add-On Protection</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Tire & Rim Protection</h2>
                <p className="text-white/60 text-sm mt-1 max-w-md">
                  Complete road-hazard coverage for tires and wheels. Choose your level of protection.
                </p>
              </div>
              <button
                onClick={() => navigate("/brochure/tire-rim")}
                className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-white text-sm font-semibold hover:bg-white/20 transition-colors"
              >
                View Full Plans →
              </button>
            </div>

            {/* Tier cards */}
            <div className="grid sm:grid-cols-3 gap-4">
              {TIRE_TIER_CONFIG.map((tier) => (
                <div key={tier.level} className="relative flex flex-col rounded-2xl bg-white border border-white/20 overflow-hidden shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5">
                  {/* Best Value badge */}
                  {tier.badge && (
                    <div className="absolute top-3 right-3 z-10">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white shadow">
                        {tier.badge}
                      </span>
                    </div>
                  )}

                  {/* Accent bar */}
                  <div className={`h-1.5 w-full ${tier.bar}`} />

                  <div className="p-5 flex flex-col gap-3 flex-1">
                    {/* Level badge */}
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${tier.bg} ${tier.color} border ${tier.border} w-fit`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${tier.bar}`} />
                      {tier.level} Protection
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed">{tier.desc}</p>

                    {/* Features */}
                    <ul className="space-y-1.5">
                      {tier.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-xs text-slate-700">
                          <Check className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${tier.color}`} />
                          {f}
                        </li>
                      ))}
                    </ul>

                    {/* Classes */}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {["Class 1", "Class 2", "Class 3"].map((cls) => (
                        <span key={cls} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tier.bg} ${tier.color} border ${tier.border}`}>
                          {cls}
                        </span>
                      ))}
                    </div>

                    <div className="mt-auto pt-2">
                      <button
                        onClick={() => navigate("/brochure/tire-rim")}
                        className={`w-full py-2.5 rounded-xl text-xs font-bold text-white transition-colors ${tier.btn}`}
                      >
                        View {tier.level} Plans →
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Provider tag */}
            <p className="text-center text-white/30 text-xs mt-6">
              Provided by {tireRimProducts[0]?.providerName} · Vehicles up to 10 years old · No deductible
            </p>
          </div>
        </div>
      )}

      {/* Footer spacer */}
      <div className="py-10 text-center text-xs text-muted-foreground border-t border-border">
        © {new Date().getFullYear()} Bridge Warranty. All coverage terms subject to individual plan agreements.
      </div>

      {/* Floating compare button */}
      {selectedIds.length >= 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4">
          <button
            onClick={() => navigate(`/brochure/compare?plans=${selectedIds.join(",")}`)}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-xl transition-colors"
          >
            <BarChart2 className="w-4 h-4" />
            Compare {selectedIds.length} Plans
          </button>
        </div>
      )}
    </div>
  );
}
