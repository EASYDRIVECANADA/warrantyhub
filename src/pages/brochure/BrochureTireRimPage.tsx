import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Shield, Zap, Package } from "lucide-react";
import BrochureHeader from "../../components/brochure/BrochureHeader";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../providers/AuthProvider";

interface TireRimProduct {
  id: string;
  name: string;
  providerName: string;
  description: string;
  categories: { name: string; parts: string[] }[];
  tiers: { label: string; vehicleClass: string; dealerCost: number; suggestedRetail: number }[];
  minRetail: number;
}

function parseProductRow(row: any, providerName: string): TireRimProduct {
  const cd = row.coverage_details_json ?? row.coverage_details ?? {};
  const pr = row.pricing_json ?? {};
  const cdObj = typeof cd === "string" ? (() => { try { return JSON.parse(cd); } catch { return {}; } })() : (cd ?? {});
  const prObj = typeof pr === "string" ? (() => { try { return JSON.parse(pr); } catch { return {}; } })() : (pr ?? {});

  const categories: { name: string; parts: string[] }[] = (cdObj.categories || []).map((c: any) => ({
    name: c.name || "",
    parts: Array.isArray(c.parts) ? c.parts : [],
  }));

  const rows: any[] = prObj.rows || prObj.tiers || [];
  const tiers = rows.map((r: any) => ({
    label: r.label || "",
    vehicleClass: r.vehicleClass ?? r.vehicle_class ?? "",
    dealerCost: Number(r.dealerCost ?? r.dealer_cost ?? 0),
    suggestedRetail: Number(r.suggestedRetail ?? r.suggested_retail ?? 0),
  }));

  const retails = tiers.map((t) => t.suggestedRetail).filter(Boolean);

  return {
    id: row.id,
    name: row.name,
    providerName,
    description: cdObj.description || "",
    categories,
    tiers,
    minRetail: retails.length ? Math.min(...retails) : 0,
  };
}

// Extract unique protection levels from tier vehicleClass (Essential, Extended, Superior)
function getProtectionLevels(tiers: TireRimProduct["tiers"]) {
  const seen = new Set<string>();
  const levels: string[] = [];
  for (const t of tiers) {
    const level = t.vehicleClass.split(" - ")[0].trim();
    if (level && !seen.has(level)) { seen.add(level); levels.push(level); }
  }
  return levels;
}

const LEVEL_CONFIG: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  "Essential": {
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    dot: "bg-blue-500",
  },
  "Extended": {
    color: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-200",
    dot: "bg-violet-500",
  },
  "Superior": {
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
  },
};

const LEVEL_DESCRIPTIONS: Record<string, string> = {
  "Essential": "Tire & wheel repair + roadside assistance",
  "Extended": "Essential + key replacement & car rental",
  "Superior": "Extended + windshield, dent & interior repair",
};

// Get min retail per level
function getMinRetailForLevel(tiers: TireRimProduct["tiers"], level: string) {
  const filtered = tiers.filter((t) => t.vehicleClass.startsWith(level));
  const retails = filtered.map((t) => t.suggestedRetail).filter(Boolean);
  return retails.length ? Math.min(...retails) : 0;
}

export default function BrochureTireRimPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const showPricing = user?.role === "DEALER_ADMIN" || user?.role === "DEALER_EMPLOYEE";

  const [products, setProducts] = useState<TireRimProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase
        .from("products")
        .select("id, name, product_type, pricing_json, coverage_details_json, coverage_details, provider_entity_id")
        .eq("published", true)
        .eq("product_type", "Tire & Rim")
        .order("name");

      if (!rows || rows.length === 0) { setLoading(false); return; }

      const entityIds = [...new Set(rows.map((r: any) => r.provider_entity_id).filter(Boolean))] as string[];
      const providerNames: Record<string, string> = {};
      if (entityIds.length > 0) {
        const { data: provs } = await supabase.from("providers").select("id, company_name").in("id", entityIds);
        (provs || []).forEach((p: any) => { providerNames[p.id] = p.company_name; });
      }

      setProducts(rows.map((r: any) => parseProductRow(r, providerNames[r.provider_entity_id] || "Provider")));
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <BrochureHeader />

      {/* Hero */}
      <div className="hero-gradient pt-[70px]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
          <button
            onClick={() => navigate("/brochure")}
            className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            All Plans
          </button>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">Tire & Rim Protection</h1>
              <p className="text-white/60 text-sm max-w-xl">
                Complete road-hazard protection for tires and wheels. Three coverage levels across all vehicle classes — from daily drivers to luxury makes.
              </p>
            </div>
          </div>

          {/* Level overview chips */}
          <div className="flex flex-wrap gap-3 mt-8">
            {["Essential", "Extended", "Superior"].map((level) => {
              const cfg = LEVEL_CONFIG[level];
              return (
                <div key={level} className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5">
                  <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  <span className="text-white text-xs font-semibold">{level}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Products */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">

        {loading ? (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white overflow-hidden animate-pulse shadow-sm">
                <div className="h-1.5 bg-slate-200" />
                <div className="p-5 space-y-3">
                  <div className="h-4 w-24 rounded-full bg-slate-200" />
                  <div className="h-5 w-3/4 rounded bg-slate-200" />
                  <div className="space-y-2 pt-2">
                    {[1,2,3].map((j) => <div key={j} className="h-12 rounded-lg bg-slate-100" />)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border bg-white py-20 text-center shadow-sm">
            <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No Tire & Rim products available</p>
            <button onClick={() => navigate("/brochure")} className="mt-4 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50 transition-colors">
              Browse All Products
            </button>
          </div>
        ) : products.map((product) => {
          const levels = getProtectionLevels(product.tiers);
          return (
            <div key={product.id} className="mb-10">
              {/* Product header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{product.name}</h2>
                  <p className="text-xs text-slate-500">{product.providerName} · {product.tiers.length} plan options available</p>
                </div>
              </div>

              {/* What's covered */}
              {product.categories.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">What's Covered</p>
                  <div className="grid sm:grid-cols-2 gap-1.5">
                    {product.categories.map((cat) => (
                      <div key={cat.name} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                        <div>
                          <span className="text-xs font-semibold text-slate-700">{cat.name}</span>
                          {cat.parts.length > 0 && (
                            <p className="text-[10px] text-slate-400 leading-relaxed">
                              {cat.parts.slice(0, 3).join(", ")}{cat.parts.length > 3 ? "..." : ""}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Coverage level cards */}
              <div className="grid sm:grid-cols-3 gap-4">
                {levels.map((level, idx) => {
                  const cfg = LEVEL_CONFIG[level] ?? LEVEL_CONFIG["Essential"];
                  const desc = LEVEL_DESCRIPTIONS[level] ?? "";
                  const minRetail = getMinRetailForLevel(product.tiers, level);
                  const classTiers = [...new Set(
                    product.tiers
                      .filter((t) => t.vehicleClass.startsWith(level))
                      .map((t) => t.vehicleClass.split(" - ")[1]?.trim())
                      .filter(Boolean)
                  )];
                  const termOptions = [...new Set(
                    product.tiers
                      .filter((t) => t.vehicleClass.startsWith(level))
                      .map((t) => t.label)
                      .filter(Boolean)
                  )];

                  return (
                    <div
                      key={level}
                      className={`relative flex flex-col rounded-2xl border bg-white overflow-hidden shadow-sm hover:shadow-md transition-all ${cfg.border}`}
                    >
                      {/* Accent bar */}
                      <div className={`h-1.5 w-full ${cfg.dot}`} />

                      {/* Best Value badge on Superior */}
                      {idx === 2 && (
                        <div className="absolute top-0 right-4 translate-y-[-50%]">
                          <span className="px-3 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white shadow">
                            Best Value
                          </span>
                        </div>
                      )}

                      <div className="p-4 flex flex-col gap-3 flex-1">
                        {/* Level name */}
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${cfg.bg} ${cfg.color} ${cfg.border} border w-fit`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {level} Protection
                        </div>

                        <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>

                        {/* Pricing */}
                        {showPricing && minRetail > 0 ? (
                          <div className={`rounded-lg ${cfg.bg} border ${cfg.border} px-3 py-2`}>
                            <p className="text-[10px] text-slate-500">Starting from</p>
                            <p className={`text-lg font-extrabold ${cfg.color}`}>${minRetail.toLocaleString()}</p>
                          </div>
                        ) : !showPricing ? (
                          <button
                            onClick={() => navigate("/sign-in")}
                            className={`text-left rounded-lg ${cfg.bg} border ${cfg.border} px-3 py-2 hover:opacity-80 transition-opacity`}
                          >
                            <p className="text-[10px] text-slate-500">Pricing</p>
                            <p className={`text-xs font-semibold ${cfg.color}`}>Sign in to view →</p>
                          </button>
                        ) : null}

                        {/* Vehicle classes */}
                        {classTiers.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Vehicle Classes</p>
                            <div className="flex flex-wrap gap-1">
                              {classTiers.map((cls) => (
                                <span key={cls} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                                  {cls}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Terms available */}
                        {termOptions.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Terms Available</p>
                            <div className="flex flex-wrap gap-1">
                              {termOptions.slice(0, 4).map((t) => (
                                <span key={t} className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                  {t}
                                </span>
                              ))}
                              {termOptions.length > 4 && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-500">
                                  +{termOptions.length - 4} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* CTA */}
                        <div className="mt-auto pt-2">
                          <button
                            onClick={() =>
                              user
                                ? navigate(`/dealership/contracts/new?productId=${product.id}`)
                                : navigate("/sign-in")
                            }
                            className={`w-full py-2.5 text-xs font-bold rounded-xl transition-colors shadow-sm ${
                              idx === 2
                                ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                                : idx === 1
                                  ? "bg-violet-600 hover:bg-violet-700 text-white"
                                  : "bg-primary hover:bg-primary/90 text-white"
                            }`}
                          >
                            {user ? `Get ${level} Quote` : "Sign In to Quote"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Divider between products */}
              <div className="flex items-center gap-3 mt-8">
                <div className="flex-1 h-px bg-slate-200" />
                <button
                  onClick={() => navigate(`/brochure/${product.id}`)}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <Zap className="w-3 h-3" />
                  View full plan details
                </button>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="py-8 text-center text-xs text-slate-400 border-t border-slate-200">
        © {new Date().getFullYear()} Bridge Warranty. Coverage terms subject to individual plan agreements.
      </div>
    </div>
  );
}
