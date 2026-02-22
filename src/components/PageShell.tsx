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
  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          {badge ? (
            <div className="inline-flex items-center px-2.5 py-1 rounded-full border bg-card text-[11px] text-muted-foreground">
              {badge}
            </div>
          ) : null}
          <h1 className="text-3xl md:text-[34px] font-semibold tracking-tight text-foreground mt-3">{title}</h1>
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

      <div className="mt-8">{children}</div>
    </div>
  );
}
