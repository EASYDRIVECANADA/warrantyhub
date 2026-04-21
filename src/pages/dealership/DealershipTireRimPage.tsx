import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout, { dealershipNavItems } from "../../components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Check, ArrowLeft, FileText, Shield, Loader2, Package } from "lucide-react";
import { supabase } from "../../integrations/supabase/client";

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

export default function DealershipTireRimPage() {
  const navigate = useNavigate();
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
    <DashboardLayout navItems={dealershipNavItems} title="Tire & Rim Protection">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dealership/find-products")} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" />
            Back to Find Products
          </Button>
          <Badge variant="outline" className="gap-1.5">
            <Shield className="w-3 h-3" />
            Tire & Rim Protection
          </Badge>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-foreground">Tire & Rim Protection Plans</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Protect customers against costly tire and wheel damage from road hazards, potholes, curb impacts, and more.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl border bg-card py-20 text-center">
            <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">No Tire & Rim products available</p>
            <p className="text-sm text-muted-foreground mt-1">Providers need to publish Tire & Rim products before they appear here.</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/dealership/find-products")}>
              Browse All Products
            </Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {products.map((product) => (
              <Card
                key={product.id}
                className="flex flex-col hover:shadow-lg transition-all hover:border-primary/30"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Badge variant="secondary" className="text-xs mb-2">{product.providerName}</Badge>
                      <CardTitle className="text-base leading-tight">{product.name}</CardTitle>
                      {product.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{product.description}</p>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col space-y-4">

                  {/* Coverage categories */}
                  {product.categories.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                        What's Covered
                      </p>
                      <ul className="space-y-1.5">
                        {product.categories.slice(0, 5).map((cat) => (
                          <li key={cat.name} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <Check className="w-3 h-3 text-primary mt-0.5 shrink-0" />
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

                  {/* Benefits / inclusions */}
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

                  {/* Exclusions */}
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

                  {/* Pricing */}
                  {(product.minDealerCost > 0 || product.minRetail > 0) && (
                    <div className="rounded-lg bg-muted/40 p-3 space-y-1">
                      {product.minDealerCost > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Dealer cost from</span>
                          <span className="font-semibold">${product.minDealerCost.toLocaleString()}</span>
                        </div>
                      )}
                      {product.minRetail > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Retail from</span>
                          <span className="font-semibold text-primary">${product.minRetail.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-auto pt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => navigate(`/dealership/coverage/${product.id}`)}
                    >
                      View Details
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => navigate(`/dealership/contracts/new?productId=${product.id}`)}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Quote
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!loading && products.length > 0 && (
          <div className="bg-muted/40 rounded-xl p-5 text-center text-sm text-muted-foreground border border-border">
            Coverage terms and pricing vary by product and provider. Select a product above to view full coverage details and create a contract.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
