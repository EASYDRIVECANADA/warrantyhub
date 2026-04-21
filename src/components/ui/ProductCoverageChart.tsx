import React from "react";
import { Check, Circle, Info } from "lucide-react";
import { cn } from "../../lib/utils";
import type { CoverageDetails, CoverageItem, CoverageStatus } from "../../lib/products/types";

interface ProductCoverageChartProps {
  productName: string;
  providerName: string;
  productType?: string;
  coverageDetails?: CoverageDetails | Record<string, any> | null;
}

const StatusIcon = ({ status }: { status: CoverageStatus }) => {
  switch (status) {
    case "included":
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-600">
          <Check className="w-3.5 h-3.5" strokeWidth={3} />
        </span>
      );
    case "term_specific":
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-sky-100 text-sky-600">
          <Info className="w-3.5 h-3.5" strokeWidth={2.5} />
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-500">
          <Circle className="w-2.5 h-2.5 fill-current" />
        </span>
      );
  }
};

function normalizeCoverageDetails(raw: CoverageDetails | Record<string, any> | null | undefined): CoverageDetails | null {
  if (!raw) return null;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { return null; } }
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, any>;

  // V1 format: already { items: [...] }
  if ("items" in obj && Array.isArray(obj.items)) return obj as CoverageDetails;

  // V2 format: { categories: [{ name, parts }] }
  if ("categories" in obj && Array.isArray(obj.categories)) {
    const items: CoverageItem[] = [];
    for (const cat of obj.categories) {
      if (!cat.name && (!cat.parts || cat.parts.length === 0)) continue;
      for (const part of cat.parts || []) {
        if (typeof part === "string" && part.trim()) {
          items.push({ id: `${cat.name}-${part}`, name: part.trim(), status: "included" });
        } else if (typeof part === "object" && part.name) {
          items.push({ id: part.id || `${cat.name}-${part.name}`, name: part.name, status: part.status || "included" });
        }
      }
      if ((!cat.parts || cat.parts.length === 0) && cat.name) {
        items.push({ id: cat.name, name: cat.name, status: "included" });
      }
    }
    if (items.length > 0) return { items };
  }

  // Fallback: try to extract any array from the object
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object" && val[0] !== null && "name" in val[0]) {
      return { items: val.map((item: any, i: number) => ({
        id: item.id || `item-${i}`,
        name: item.name || String(item),
        status: item.status || "included",
      })) };
    }
  }

  return null;
}


const CoverageSection = ({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string; name: string; status: CoverageStatus }>;
}) => (
  <div className="rounded-lg border overflow-hidden">
    <div className="px-4 py-2.5 bg-slate-800 border-b border-white/10">
      <h3 className="text-xs font-bold text-white tracking-wide uppercase">{title}</h3>
    </div>
    <div>
      {items.length === 0 ? (
        <div className="px-4 py-3 text-sm text-muted-foreground italic">No items configured</div>
      ) : (
        items.map((item, i) => (
          <div
            key={item.id}
            className={cn(
              "flex items-center justify-between px-4 py-2.5 border-b border-border/50",
              i % 2 === 0 ? "bg-background" : "bg-muted/20"
            )}
          >
            <span className="text-sm font-medium text-foreground">{item.name}</span>
            <div className="flex items-center gap-2">
              <StatusIcon status={item.status} />
            </div>
          </div>
        ))
      )}
    </div>
  </div>
);

const ProductCoverageChart: React.FC<ProductCoverageChartProps> = ({
  productName,
  providerName,
  productType,
  coverageDetails: rawCoverageDetails,
}) => {
  const coverageDetails = normalizeCoverageDetails(rawCoverageDetails);
  const powertrainItems = coverageDetails?.items?.filter((i) => i.status === "included" || i.status === "term_specific") || [];
  const additionalItems = coverageDetails?.items?.filter((i) => i.status === "not_included") || [];

  const hasCoverage = (coverageDetails?.items?.length || 0) > 0;

  return (
    <div className="max-w-2xl mx-auto bg-card rounded-xl overflow-hidden shadow-lg border border-border">
      <div className="bg-gradient-to-br from-slate-800 to-slate-700 px-6 py-8 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(45,93,58,0.15),transparent_60%)]" />
        <div className="relative z-10">
          <h1 className="text-xl md:text-2xl font-extrabold text-white mt-2 tracking-tight">
            Coverage Details
          </h1>
          <div className="mt-2 h-0.5 w-12 mx-auto bg-yellow-400 rounded-full" />
          <p className="text-white/90 text-base font-semibold mt-4">{productName}</p>
          <p className="text-white/60 text-sm mt-1">by {providerName}</p>
          {productType && (
            <span className="inline-block mt-3 px-3 py-1 rounded-full bg-white/10 text-white/80 text-xs font-medium tracking-wide uppercase">
              {productType.replace(/_/g, " ")}
            </span>
          )}
        </div>
      </div>

      {hasCoverage ? (
        <>
          <div className="mx-5 my-4 rounded-lg bg-slate-50 border border-slate-200 px-4 py-2.5">
            <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Legend</p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
              <span className="flex items-center gap-1.5 text-xs text-foreground">
                <StatusIcon status="included" /> Included
              </span>
              <span className="flex items-center gap-1.5 text-xs text-foreground">
                <StatusIcon status="not_included" /> Not Included
              </span>
              <span className="flex items-center gap-1.5 text-xs text-foreground">
                <StatusIcon status="term_specific" /> Term / Coverage Specific
              </span>
            </div>
          </div>

          {powertrainItems.length > 0 && (
            <div className="px-5 pb-2">
              <CoverageSection title="Covered & Limited Items" items={powertrainItems} />
            </div>
          )}

          {additionalItems.length > 0 && (
            <div className="px-5 pb-5">
              <CoverageSection title="Not Included" items={additionalItems} />
            </div>
          )}
        </>
      ) : (
        <div className="px-5 py-8 text-center">
          <p className="text-muted-foreground text-sm italic">No coverage details configured for this product.</p>
        </div>
      )}

      <div className="px-5 py-4 bg-muted/30 border-t border-border text-center">
        <p className="text-[11px] text-muted-foreground leading-relaxed max-w-md mx-auto">
          Coverage details are subject to the terms and conditions of the specific warranty contract.
          Contact your dealership for full plan details.
        </p>
      </div>
    </div>
  );
};

export default ProductCoverageChart;
