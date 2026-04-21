import * as React from "react";
import { cn } from "../../lib/utils";
import { ResponsiveContainer, Tooltip } from "recharts";

type ChartConfig = Record<string, { label: string; color: string }>;

interface ChartContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  config: ChartConfig;
}

const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ className, config, children, ...props }, ref) => {
    const cssVars = Object.entries(config).reduce<Record<string, string>>((acc, [key, val]) => {
      acc[`--color-${key}`] = val.color;
      return acc;
    }, {});

    return (
      <div ref={ref} className={cn("w-full", className)} style={cssVars as React.CSSProperties} {...props}>
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    );
  }
);
ChartContainer.displayName = "ChartContainer";

function ChartTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-2 shadow-sm">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">
            {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

const ChartTooltip = Tooltip;

export { ChartContainer, ChartTooltip, ChartTooltipContent };
