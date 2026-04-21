import { Check, Minus } from "lucide-react";
import { coverageMatrix, PLAN_COLUMNS, type CoverageCategory } from "../../data/coverageMatrix";

interface ComparisonMatrixProps {
  /** Override the plan column headings (e.g. real product names from Supabase) */
  columns?: string[];
  /** Override the coverage rows (e.g. built from real product coverage_details_json) */
  matrix?: CoverageCategory[];
}

export default function ComparisonMatrix({ columns, matrix }: ComparisonMatrixProps) {
  const cols = columns && columns.length > 0 ? columns : PLAN_COLUMNS;
  const rows = matrix && matrix.length > 0 ? matrix : coverageMatrix;

  // Trim or pad boolean arrays to match the number of columns
  const normalizeValues = (values: boolean[]): boolean[] => {
    if (values.length >= cols.length) return values.slice(0, cols.length);
    return [...values, ...Array(cols.length - values.length).fill(false)];
  };

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[640px] text-sm border-collapse">
        <thead>
          <tr className="border-b border-border">
            {/* Sticky feature label column */}
            <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-semibold text-foreground w-56 min-w-[14rem]">
              Coverage Feature
            </th>
            {cols.map((col) => (
              <th
                key={col}
                className="px-4 py-3 text-center font-semibold text-foreground whitespace-nowrap min-w-[110px]"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((section) => (
            <>
              {/* Category header row */}
              <tr key={`cat-${section.category}`} className="bg-muted/50">
                <td
                  colSpan={cols.length + 1}
                  className="sticky left-0 z-10 bg-muted/50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                >
                  {section.category}
                </td>
              </tr>

              {/* Item rows */}
              {section.items.map((item, idx) => {
                const vals = normalizeValues(item.values);
                return (
                  <tr
                    key={`${section.category}-${idx}`}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <td className="sticky left-0 z-10 bg-card hover:bg-muted/30 px-4 py-2.5 text-sm text-foreground transition-colors">
                      {item.label}
                    </td>
                    {vals.map((covered, ci) => (
                      <td key={ci} className="px-4 py-2.5 text-center">
                        {covered ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30">
                            <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-6 h-6">
                            <Minus className="w-3.5 h-3.5 text-muted-foreground/50" />
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
