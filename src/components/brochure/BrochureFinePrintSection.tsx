import { FileText, X } from "lucide-react";

interface TermsSection {
  title: string;
  content: string;
}

interface BrochureFinePrintSectionProps {
  termsSections: TermsSection[];
  exclusions: string[];
}

export default function BrochureFinePrintSection({
  termsSections,
  exclusions,
}: BrochureFinePrintSectionProps) {
  const hasContent = termsSections.length > 0 || exclusions.length > 0;

  if (!hasContent) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No terms & conditions configured for this plan.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {termsSections.map((section, i) => (
        <div key={i} className="rounded-xl border border-border p-5">
          <h4 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            {section.title}
          </h4>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
            {section.content}
          </p>
        </div>
      ))}

      {exclusions.length > 0 && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-900/10 p-5">
          <h4 className="font-semibold text-red-700 dark:text-red-400 text-sm mb-3 flex items-center gap-2">
            <X className="w-4 h-4" />
            What Is Not Covered
          </h4>
          <ul className="space-y-1.5">
            {exclusions.map((ex, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 w-1 h-1 rounded-full bg-red-400 shrink-0" />
                {ex}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
