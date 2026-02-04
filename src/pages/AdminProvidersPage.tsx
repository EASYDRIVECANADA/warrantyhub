import { useMemo } from "react";
import { Link } from "react-router-dom";

import { Button } from "../components/ui/button";
import { PageShell } from "../components/PageShell";
import { getAppMode } from "../lib/runtime";

export function AdminProvidersPage() {
  const mode = useMemo(() => getAppMode(), []);

  return (
    <PageShell
      badge="Admin"
      title="Providers"
      subtitle="Read-only provider visibility."
      actions={
        <Button variant="outline" asChild>
          <Link to="/company-dashboard">Back to dashboard</Link>
        </Button>
      }
    >
      <div className="rounded-xl border bg-card shadow-card p-6">
        <div className="text-sm text-muted-foreground">
          This view will list provider companies and published products (read-only). Current mode: {mode}.
        </div>
      </div>
    </PageShell>
  );
}
