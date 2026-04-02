
import type { ReactNode } from "react";

type PageShellProps = {
  title: string;
  subtitle?: ReactNode;
  subtitleAsChild?: boolean;
  badge?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function PageShell({ title, subtitle, subtitleAsChild, badge, actions, children }: PageShellProps) {
  const hasHeader = Boolean(title.trim() || subtitle || badge || actions);
  return (
    <div className="relative isolate min-h-screen bg-slate-50">
      <div className={"relative z-10 container mx-auto px-4 max-w-7xl " + (hasHeader ? "py-10" : "py-4")}>
      {hasHeader ? (
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            {badge ? (
              <div className="inline-flex items-center gap-2 rounded-full border bg-card/90 backdrop-blur px-3 py-1 text-[11px] font-medium text-slate-700 shadow-sm">
                <span className="inline-flex h-2 w-2 rounded-full bg-blue-600" />
                <span>{badge}</span>
              </div>
            ) : null}
            {title.trim() ? <h1 className="text-3xl md:text-[34px] font-semibold tracking-tight text-foreground mt-3">{title}</h1> : null}
            {subtitle ? (
              subtitleAsChild ? (
                <div className="mt-2">{subtitle}</div>
              ) : (
                <p className="text-sm text-muted-foreground mt-2">{subtitle}</p>
              )
            ) : null}
          </div>

          {actions ? <div className="flex gap-2">{actions}</div> : null}
        </div>
      ) : null}

      <div className={hasHeader ? "mt-8" : ""}>{children}</div>
      </div>
    </div>
  );
}
