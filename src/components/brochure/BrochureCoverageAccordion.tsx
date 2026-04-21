import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Minus } from "lucide-react";

interface Category {
  name: string;
  parts: string[];
}

interface BrochureCoverageAccordionProps {
  categories: Category[];
  includedNames?: string[];
}

export default function BrochureCoverageAccordion({
  categories,
  includedNames = [],
}: BrochureCoverageAccordionProps) {
  const [openItems, setOpenItems] = useState<string[]>([]);

  const toggle = (name: string) => {
    setOpenItems((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  if (categories.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Minus className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No coverage details available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {categories.map((cat) => {
        const isOpen = openItems.includes(cat.name);
        const isIncluded = includedNames.length === 0 || includedNames.includes(cat.name);

        return (
          <div
            key={cat.name}
            className="rounded-xl border border-border overflow-hidden"
          >
            {/* Header row */}
            <button
              onClick={() => toggle(cat.name)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/30 transition-colors"
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                  isIncluded
                    ? "bg-green-100 dark:bg-green-900/30"
                    : "bg-slate-100 dark:bg-slate-800"
                }`}
              >
                {isIncluded ? (
                  <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                ) : (
                  <Minus className="w-3.5 h-3.5 text-slate-400" />
                )}
              </span>

              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-foreground">{cat.name}</div>
                {cat.parts.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {cat.parts.length} components covered
                  </div>
                )}
              </div>

              {cat.parts.length > 0 && (
                <span className="text-muted-foreground shrink-0">
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </span>
              )}
            </button>

            {/* Expanded parts list */}
            {isOpen && cat.parts.length > 0 && (
              <div className="border-t border-border bg-muted/20 px-4 py-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                  {cat.parts.map((part) => (
                    <div key={part} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="w-1 h-1 rounded-full bg-blue-400 shrink-0" />
                      {part}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
