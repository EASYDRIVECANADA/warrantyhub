import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout, { dealershipNavItems } from "../../components/dashboard/DashboardLayout";
import ComparisonMatrix from "../../components/brochure/ComparisonMatrix";
import { type CoverageCategory } from "../../data/coverageMatrix";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { ArrowLeft, Loader2, LayoutGrid } from "lucide-react";
import { supabase } from "../../integrations/supabase/client";

interface Product {
  id: string;
  name: string;
  product_type: string;
  coverage_details_json: any;
  coverage_details?: any;
}

function parseCoverage(raw: any): { categories: { name: string; parts: string[] }[] } | null {
  if (!raw) return null;
  const obj = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!obj || typeof obj !== "object") return null;
  return obj;
}

export default function DealershipComparePlansPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase
          .from("products")
          .select("id, name, product_type, coverage_details_json, coverage_details")
          .eq("published", true)
          .order("name");
        setProducts(data || []);
      } catch {
        // silently fall back to static data
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const vscProducts = products.filter((p) =>
    ["VSC", "EXTENDED_WARRANTY", "warranty"].includes(p.product_type)
  );

  const columnNames = vscProducts.length > 0
    ? vscProducts.slice(0, 6).map((p) => p.name)
    : undefined;

  const dynamicMatrix: CoverageCategory[] | undefined = useMemo(() => {
    if (vscProducts.length === 0) return undefined;

    const allCategoryNames: string[] = [];
    const categoryItems: Record<string, Record<string, boolean[]>> = {};

    for (const p of vscProducts.slice(0, 6)) {
      const cd = parseCoverage(p.coverage_details_json ?? p.coverage_details);
      if (!cd?.categories?.length) continue;
      for (const cat of cd.categories) {
        if (!allCategoryNames.includes(cat.name)) allCategoryNames.push(cat.name);
        if (!categoryItems[cat.name]) categoryItems[cat.name] = {};
        for (const part of cat.parts) {
          if (!categoryItems[cat.name][part]) categoryItems[cat.name][part] = new Array(vscProducts.length).fill(false);
        }
      }
    }

    const idxMap = new Map(vscProducts.slice(0, 6).map((p, i) => [p.id, i]));

    for (const p of vscProducts.slice(0, 6)) {
      const idx = idxMap.get(p.id) ?? -1;
      if (idx < 0) continue;
      const cd = parseCoverage(p.coverage_details_json ?? p.coverage_details);
      if (!cd?.categories) continue;
      for (const cat of cd.categories) {
        const section = categoryItems[cat.name];
        if (!section) continue;
        for (const part of cat.parts) {
          if (section[part]) section[part][idx] = true;
        }
      }
    }

    if (allCategoryNames.length === 0) return undefined;

    return allCategoryNames.map((catName) => ({
      category: catName,
      items: Object.entries(categoryItems[catName] || {}).map(([label, values]) => ({
        label,
        values: [...values],
      })),
    }));
  }, [vscProducts]);

  return (
    <DashboardLayout navItems={dealershipNavItems} title="Compare Plans">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/dealership/find-products")}
              className="gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Find Products
            </Button>
          </div>
          <Badge variant="outline" className="gap-1.5">
            <LayoutGrid className="w-3 h-3" />
            Coverage Comparison
          </Badge>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-foreground">Compare All Plans</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Side-by-side coverage comparison across all available warranty plans.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ComparisonMatrix columns={columnNames} matrix={dynamicMatrix} />
        )}

        {/* Footer CTA */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-border">
          <Button onClick={() => navigate("/dealership/contracts/new")} className="w-full sm:w-auto">
            New Quote
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/dealership/find-products")}
            className="w-full sm:w-auto"
          >
            Browse All Products
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
