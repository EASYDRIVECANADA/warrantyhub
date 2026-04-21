import { Check } from "lucide-react";

type Benefit =
  | string
  | { name: string; description?: string; limit?: string };

interface BrochureBenefitsSectionProps {
  benefits: Benefit[];
}

function parseBenefit(b: Benefit): { name: string; description: string; limit: string } {
  if (typeof b === "string") return { name: b, description: "", limit: "" };
  return {
    name: b.name || "",
    description: b.description || "",
    limit: b.limit || "",
  };
}

export default function BrochureBenefitsSection({ benefits }: BrochureBenefitsSectionProps) {
  if (!benefits || benefits.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No additional benefits listed for this plan.</p>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {benefits.map((raw, i) => {
        const { name, description, limit } = parseBenefit(raw);
        return (
          <div
            key={i}
            className="flex gap-3 p-4 rounded-xl border border-border bg-card hover:shadow-sm transition-shadow"
          >
            <span className="mt-0.5 w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
              <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
            </span>
            <div className="min-w-0">
              <div className="font-semibold text-sm text-foreground leading-tight">{name}</div>
              {description && (
                <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</div>
              )}
              {limit && (
                <div className="mt-1.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                  Limit: {limit}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
