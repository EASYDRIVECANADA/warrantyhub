import { Check, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface BrochureProduct {
  id: string;
  name: string;
  productType: string;
  providerName: string;
  description: string;
  categories: { name: string; parts: string[] }[];
  eligibilityText: string;
  planChips?: string[];
  minDealerCost: number;
  minRetail: number;
  maxRetail: number;
  salesTag?: "popular" | "value" | "pick";
}

interface BrochurePlanCardProps {
  product: BrochureProduct;
  isSelected: boolean;
  onToggleCompare: (id: string) => void;
  showPricing: boolean;
}

const SALES_TAG_CONFIG = {
  popular: { label: "🔥 Most Popular", className: "bg-amber-100 text-amber-700 border-amber-200" },
  value:   { label: "💎 Best Value",   className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  pick:    { label: "⭐ Top Pick",     className: "bg-primary/10 text-primary border-primary/20" },
} as const;

export default function BrochurePlanCard({
  product,
  isSelected,
  onToggleCompare,
  showPricing,
}: BrochurePlanCardProps) {
  const navigate = useNavigate();
  const tag = product.salesTag ? SALES_TAG_CONFIG[product.salesTag] : null;
  const totalCoverage = product.categories.length;
  const visibleCategories = product.categories.slice(0, 5);
  const hiddenCount = product.categories.length - 5;
  const promoted = product.salesTag === "popular" || product.salesTag === "pick";

  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-white dark:bg-card transition-all duration-200 overflow-hidden ${
        isSelected
          ? "border-primary shadow-lg ring-2 ring-primary/20"
          : promoted
            ? "border-primary/40 shadow-md hover:shadow-lg hover:border-primary/60"
            : "border-border hover:border-primary/30 hover:shadow-md"
      } ${promoted ? "scale-[1.02]" : ""}`}
    >
      {/* Top accent bar */}
      <div className={`h-1 w-full ${promoted ? "bg-primary" : "bg-gradient-to-r from-primary/60 to-primary/40"}`} />

      <div className="p-5 flex flex-col flex-1 gap-3">

        {/* Sales tag */}
        {tag && (
          <div className="flex">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${tag.className}`}>
              {tag.label}
            </span>
          </div>
        )}

        {/* Badges row */}
        <div className="flex flex-wrap gap-1.5">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {product.providerName}
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
            {product.productType}
          </span>
        </div>

        {/* Plan name */}
        <div>
          <h3 className="font-bold text-foreground text-base leading-snug">{product.name}</h3>

          {/* Pricing */}
          {showPricing && product.minRetail > 0 ? (
            <p className="text-sm font-semibold text-primary mt-0.5">
              from ${product.minRetail.toLocaleString()}
              {product.maxRetail > product.minRetail && ` – $${product.maxRetail.toLocaleString()}`}
            </p>
          ) : !showPricing ? (
            <button
              onClick={() => navigate("/sign-in")}
              className="text-xs text-muted-foreground mt-0.5 hover:text-primary transition-colors"
            >
              Sign in to view pricing →
            </button>
          ) : null}
        </div>

        {/* Plan tier chips — e.g. Bronze $750, Silver $1,000, Gold $1,500 */}
        {product.planChips && product.planChips.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {product.planChips.slice(0, 4).map((chip) => (
              <span
                key={chip}
                className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#0f1b3d] text-white"
              >
                {chip}
              </span>
            ))}
            {product.planChips.length > 4 && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-700">
                +{product.planChips.length - 4} more
              </span>
            )}
          </div>
        )}

        {/* Eligibility box */}
        {product.eligibilityText && (
          <div className="rounded-lg bg-muted/50 border border-border px-3 py-2">
            <p className="text-xs text-muted-foreground leading-relaxed">{product.eligibilityText}</p>
          </div>
        )}

        {/* Coverage count */}
        {product.categories.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-xs font-semibold text-foreground">
              {totalCoverage} item{totalCoverage !== 1 ? "s" : ""} covered
            </span>
          </div>
        )}

        {/* Coverage categories list */}
        {product.categories.length > 0 && (
          <ul className="space-y-1.5">
            {visibleCategories.map((cat) => (
              <li key={cat.name} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-4 h-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5 text-green-600 dark:text-green-400" />
                </span>
                <span className="text-foreground font-medium">{cat.name}</span>
              </li>
            ))}
            {hiddenCount > 0 && (
              <li>
                <button
                  onClick={() => navigate(`/brochure/${product.id}`)}
                  className="text-xs text-primary hover:underline pl-6 font-medium"
                >
                  +{hiddenCount} more →
                </button>
              </li>
            )}
          </ul>
        )}

        {/* Action buttons */}
        <div className="mt-auto pt-3 flex gap-2">
          <button
            onClick={() => navigate(`/brochure/${product.id}`)}
            className="flex-1 px-3 py-2 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-white transition-colors shadow-sm"
          >
            View Details
          </button>
          <button
            onClick={() => onToggleCompare(product.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-colors ${
              isSelected
                ? "bg-primary/10 border-primary text-primary"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
            }`}
          >
            <span className="w-3.5 h-3.5 grid grid-cols-2 gap-[2px] shrink-0">
              <span className="rounded-[1px] bg-current opacity-70" />
              <span className="rounded-[1px] bg-current" />
              <span className="rounded-[1px] bg-current" />
              <span className="rounded-[1px] bg-current opacity-70" />
            </span>
            {isSelected ? "Selected" : "Compare"}
          </button>
        </div>
      </div>
    </div>
  );
}
