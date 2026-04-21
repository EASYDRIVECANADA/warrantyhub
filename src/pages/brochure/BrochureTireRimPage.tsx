import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Package } from "lucide-react";
import BrochureHeader from "../../components/brochure/BrochureHeader";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../providers/AuthProvider";

interface TireRimProduct {
  id: string;
  name: string;
  providerName: string;
  description: string;
  categories: { name: string; parts: string[] }[];
  inclusions: string[];
  exclusions: string[];
  minDealerCost: number;
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
  const costs = rows.map((r: any) => Number(r.dealerCost ?? r.dealer_cost ?? 0)).filter(Boolean);
  const retails = rows.map((r: any) => Number(r.suggestedRetail ?? r.suggested_retail ?? r.retail ?? 0)).filter(Boolean);

  const benefits: string[] = (prObj.benefits || []).map((b: any) => (typeof b === "string" ? b : b?.name)).filter(Boolean);
  const exclusions: string[] = (cdObj.exclusions || row.exclusions || []);

  return {
    id: row.id,
    name: row.name,
    providerName,
    description: cdObj.description || row.description || "",
    categories,
    inclusions: benefits,
    exclusions: Array.isArray(exclusions) ? exclusions : [],
    minDealerCost: costs.length ? Math.min(...costs) : 0,
    minRetail: retails.length ? Math.min(...retails) : 0,
  };
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
        .select("id, name, product_type, pricing_json, coverage_details_json, coverage_details, exclusions, provider_entity_id")
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
    <div className="min-h-screen bg-background">
      <BrochureHeader />

      {/* Hero */}
      <div className="hero-gradient pt-[70px]">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <button
            onClick={() => navigate("/brochure")}
            className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            All Plans
          </button>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">Tire & Rim Protection</h1>
          <p className="text-white/60 text-sm max-w-lg">
            Protect against costly tire and wheel damage from road hazards, potholes, curb impacts, and more.
          </p>
        </div>
      </div>

      {/* Products */}
      <div className="max-w-7xl mx-auto px-4 py-10">
        {loading ? (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-white dark:bg-card overflow-hidden animate-pulse">
                <div className="h-1 bg-muted rounded-t-xl" />
                <div className="p-5 space-y-3">
                  <div className="h-4 w-20 rounded-full bg-muted" />
                  <div className="h-5 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-full rounded bg-muted" />
                  <div className="space-y-2 pt-2">
                    {[1,2,3].map((j) => <div key={j} className="h-3 w-full rounded bg-muted" />)}
                  </div>
                  <div className="flex gap-2 pt-3">
                    <div className="flex-1 h-8 rounded-lg bg-muted" />
                    <div className="flex-1 h-8 rounded-lg bg-muted" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl border bg-card py-20 text-center">
            <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">No Tire & Rim products available</p>
            <p className="text-sm text-muted-foreground mt-1">
              Providers need to publish Tire & Rim products before they appear here.
            </p>
            <button
              onClick={() => navigate("/brochure")}
              className="mt-4 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              Browse All Products
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {products.map((product) => (
              <div
                key={product.id}
                className="flex flex-col rounded-xl border bg-white dark:bg-card hover:shadow-lg transition-all hover:border-blue-300"
              >
                <div className="h-1 w-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-t-xl" />
                <div className="p-5 flex flex-col flex-1 space-y-4">
                  <div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 mb-2">
                      {product.providerName}
                    </span>
                    <h3 className="font-bold text-foreground text-base leading-tight">{product.name}</h3>
                    {product.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{product.description}</p>
                    )}
                  </div>

                  {product.categories.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                        What's Covered
                      </p>
                      <ul className="space-y-1.5">
                        {product.categories.slice(0, 5).map((cat) => (
                          <li key={cat.name} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <Check className="w-3 h-3 text-blue-500 mt-0.5 shrink-0" />
                            <span>
                              <span className="font-medium text-foreground">{cat.name}</span>
                              {cat.parts.length > 0 && (
                                <span className="text-muted-foreground"> — {cat.parts.slice(0, 3).join(", ")}{cat.parts.length > 3 ? "..." : ""}</span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {product.inclusions.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                        Included Benefits
                      </p>
                      <ul className="space-y-1.5">
                        {product.inclusions.slice(0, 4).map((item) => (
                          <li key={item} className="flex items-start gap-1.5 text-xs text-foreground">
                            <span className="mt-0.5 w-3.5 h-3.5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                              <Check className="w-2.5 h-2.5 text-green-600 dark:text-green-400" />
                            </span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {product.exclusions.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                        Not Covered
                      </p>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {product.exclusions.slice(0, 3).map((ex) => (
                          <li key={ex} className="flex items-start gap-1.5">
                            <span className="mt-0.5 shrink-0">·</span>
                            {ex}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {showPricing && (product.minDealerCost > 0 || product.minRetail > 0) && (
                    <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-3 space-y-1">
                      {product.minDealerCost > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Dealer cost from</span>
                          <span className="font-semibold">${product.minDealerCost.toLocaleString()}</span>
                        </div>
                      )}
                      {product.minRetail > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Retail from</span>
                          <span className="font-semibold text-blue-600 dark:text-blue-400">${product.minRetail.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {!showPricing && (
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3 text-center">
                      <p className="text-xs text-muted-foreground">
                        <button
                          onClick={() => navigate("/sign-in")}
                          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                        >
                          Sign in
                        </button>{" "}
                        to view pricing
                      </p>
                    </div>
                  )}

                  <div className="mt-auto pt-2 flex gap-2">
                    <button
                      onClick={() => navigate(`/brochure/${product.id}`)}
                      className="flex-1 px-3 py-2 text-xs font-semibold rounded-lg border border-border hover:bg-muted/50 transition-colors text-foreground"
                    >
                      View Details
                    </button>
                    <button
                      onClick={() =>
                        user
                          ? navigate(`/dealership/contracts/new?productId=${product.id}`)
                          : navigate("/sign-in")
                      }
                      className="flex-1 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                    >
                      {user ? "Get Quote" : "Sign In to Quote"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="py-8 text-center text-xs text-muted-foreground border-t border-border">
        © {new Date().getFullYear()} Bridge Warranty. Coverage terms subject to individual plan agreements.
      </div>
    </div>
  );
}
