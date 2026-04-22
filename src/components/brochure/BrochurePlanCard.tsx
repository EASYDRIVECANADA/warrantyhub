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
  popular: { label: "🔥 Most Popular", className: "bg-amber-500 text-white shadow-amber-200" },
  value:   { label: "💎 Best Value",   className: "bg-emerald-500 text-white shadow-emerald-200" },
  pick:    { label: "⭐ Top Pick",     className: "bg-primary text-white shadow-primary/30" },
} as const;

const ACCENT_COLORS = {
  popular: "from-amber-400 to-orange-400",
  value:   "from-emerald-400 to-teal-400",
  pick:    "from-primary to-blue-400",
  default: "from-blue-500 to-primary",
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
  const tierCount = product.planChips?.length ?? 0;
  const accentColor = product.salesTag ? ACCENT_COLORS[product.salesTag] : ACCENT_COLORS.default;

  return (
    <div className="relative flex flex-col">

      {/* Floating sales banner above card */}
      {tag && (
        <div className="flex justify-center mb-[-1px] z-10 relative">
          <span className={`px-5 py-1 rounded-t-xl text-xs font-bold tracking-wide shadow-lg ${tag.className}`}>
            {tag.label}
          </span>
        </div>
      )}

      <div
        className={`relative flex flex-col flex-1 rounded-2xl bg-white border transition-all duration-200 overflow-hidden ${
          isSelected
            ? "border-primary ring-2 ring-primary/20 shadow-lg"
            : promoted
              ? "border-amber-300 shadow-md hover:shadow-xl hover:border-amber-400"
              : "border-slate-200 shadow-sm hover:border-primary/40 hover:shadow-md"
        }`}
      >
        {/* Colorful top accent bar */}
        <div className={`h-1.5 w-full bg-gradient-to-r ${accentColor}`} />

        <div className="p-5 flex flex-col flex-1 gap-3">

          {/* Badges row: provider left, tier count right */}
          <div className="flex items-center justify-between gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
              {product.providerName}
            </span>
            {tierCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                {tierCount} Tier{tierCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Plan name + pricing */}
          <div>
            <h3 className="font-bold text-slate-900 text-[15px] leading-snug">{product.name}</h3>
            {showPricing && product.minRetail > 0 ? (
              <p className="text-sm font-semibold text-primary mt-0.5">
                from ${product.minRetail.toLocaleString()}
                {product.maxRetail > product.minRetail && ` – $${product.maxRetail.toLocaleString()}`}
              </p>
            ) : !showPricing ? (
              <button
                onClick={() => navigate("/sign-in")}
                className="text-xs text-slate-400 mt-0.5 hover:text-primary transition-colors"
              >
                Sign in to view pricing →
              </button>
            ) : null}
          </div>

          {/* Eligibility box */}
          {product.eligibilityText && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
              <p className="text-xs text-slate-500 leading-relaxed">{product.eligibilityText}</p>
            </div>
          )}

          {/* Coverage count */}
          {product.categories.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-xs font-semibold text-slate-800">
                <strong>{totalCoverage}</strong> item{totalCoverage !== 1 ? "s" : ""} covered
              </span>
            </div>
          )}

          {/* Coverage list — simple checkmarks like prototype */}
          {product.categories.length > 0 && (
            <ul className="space-y-1">
              {visibleCategories.map((cat) => (
                <li key={cat.name} className="flex items-center gap-2 text-xs text-slate-600">
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="font-medium text-slate-700">{cat.name}</span>
                </li>
              ))}
              {hiddenCount > 0 && (
                <li>
                  <button
                    onClick={() => navigate(`/brochure/${product.id}`)}
                    className="text-xs text-primary hover:underline pl-5 font-medium"
                  >
                    +{hiddenCount} more
                  </button>
                </li>
              )}
            </ul>
          )}

          {/* $0 Premium Fees badge */}
          <div className="flex">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              $0 Premium Fees
            </span>
          </div>

          {/* Buttons */}
          <div className="mt-auto pt-1 flex gap-2">
            <button
              onClick={() => navigate(`/brochure/${product.id}`)}
              className="flex-1 px-3 py-2.5 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-white transition-colors shadow-sm"
            >
              View Tiers →
            </button>
            <button
              onClick={() => onToggleCompare(product.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-xl border transition-colors ${
                isSelected
                  ? "bg-primary/10 border-primary text-primary"
                  : "border-slate-300 text-slate-600 hover:border-primary/40 hover:text-primary bg-white"
              }`}
            >
              <span className="w-3.5 h-3.5 grid grid-cols-2 gap-[2px] shrink-0">
                <span className="rounded-[1px] bg-current opacity-70" />
                <span className="rounded-[1px] bg-current" />
                <span className="rounded-[1px] bg-current" />
                <span className="rounded-[1px] bg-current opacity-70" />
              </span>
              {isSelected ? "Selected" : "+ Compare"}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
