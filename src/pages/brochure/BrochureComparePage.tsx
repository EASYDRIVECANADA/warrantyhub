import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import BrochureHeader from "../../components/brochure/BrochureHeader";
import ComparisonMatrix from "../../components/brochure/ComparisonMatrix";
import { supabase } from "../../integrations/supabase/client";
import type { CoverageCategory } from "../../data/coverageMatrix";

function parseCoverage(row: any): { name: string; categories: { name: string; parts: string[] }[] } {
  const cd = row.coverage_details_json ?? row.coverage_details ?? {};
  const cdObj = typeof cd === "string" ? (() => { try { return JSON.parse(cd); } catch { return {}; } })() : (cd ?? {});
  const categories = (cdObj.categories || []).map((c: any) => ({
    name: c.name || "",
    parts: Array.isArray(c.parts) ? c.parts : [],
  }));
  return { name: row.name, categories };
}

export default function BrochureComparePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planIds = searchParams.get("plans")?.split(",").filter(Boolean) ?? [];

  const [columns, setColumns] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<CoverageCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let query = supabase
        .from("products")
        .select("id, name, product_type, coverage_details_json, coverage_details")
        .eq("published", true)
        .not("product_type", "eq", "Tire & Rim")
        .order("name");

      if (planIds.length > 0) {
        query = query.in("id", planIds);
      }

      const { data: rows } = await query;

      if (!rows || rows.length === 0) { setLoading(false); return; }

      const parsed = rows.map(parseCoverage);
      const colNames = parsed.map((p) => p.name);

      // Collect all unique category names
      const allCategories = new Map<string, Set<string>>();
      parsed.forEach((p) => {
        p.categories.forEach((cat) => {
          if (!allCategories.has(cat.name)) {
            allCategories.set(cat.name, new Set(cat.parts));
          } else {
            cat.parts.forEach((part) => allCategories.get(cat.name)!.add(part));
          }
        });
      });

      // Build matrix
      const dynamicMatrix: CoverageCategory[] = [...allCategories.entries()].map(([catName, allParts]) => ({
        category: catName,
        items: [...allParts].map((part) => ({
          label: part,
          values: parsed.map((p) => {
            const cat = p.categories.find((c) => c.name === catName);
            return cat ? cat.parts.includes(part) : false;
          }),
        })),
      }));

      // If a category has no items (empty parts), add the category itself as a single row
      const matrixWithFallback = dynamicMatrix.map((section) => {
        if (section.items.length === 0) {
          return {
            ...section,
            items: [
              {
                label: section.category,
                values: parsed.map((p) => p.categories.some((c) => c.name === section.category)),
              },
            ],
          };
        }
        return section;
      });

      setColumns(colNames);
      setMatrix(matrixWithFallback);
      setLoading(false);
    })();
  }, [planIds.join(",")]);

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
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">Compare Plans</h1>
          <p className="text-white/60 text-sm">
            {planIds.length > 0
              ? `Comparing ${planIds.length} selected plans`
              : "Side-by-side coverage comparison across all plans"}
          </p>
        </div>
      </div>

      {/* Matrix */}
      <div className="max-w-7xl mx-auto px-4 py-10">
        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : matrix.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <p className="font-medium">No coverage data available to compare.</p>
            <button
              onClick={() => navigate("/brochure")}
              className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Browse all plans →
            </button>
          </div>
        ) : (
          <>
            {planIds.length > 0 && (
              <div className="mb-4 flex items-center gap-3">
                <button
                  onClick={() => navigate("/brochure/compare")}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Compare all plans instead →
                </button>
              </div>
            )}
            <ComparisonMatrix columns={columns} matrix={matrix} />
          </>
        )}
      </div>

      <div className="py-8 text-center text-xs text-muted-foreground border-t border-border">
        © {new Date().getFullYear()} Bridge Warranty. Coverage terms subject to individual plan agreements.
      </div>
    </div>
  );
}
