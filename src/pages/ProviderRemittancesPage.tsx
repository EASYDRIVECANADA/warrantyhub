import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { PageShell } from "../components/PageShell";
import { getRemittancesApi } from "../lib/remittances/remittances";
import type { Remittance } from "../lib/remittances/types";

function money(cents?: number) {
  if (typeof cents !== "number") return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function statusBadge(status: Remittance["status"]) {
  return (
    "inline-flex items-center text-xs px-2 py-1 rounded-md border " +
    (status === "PAID" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200")
  );
}

export function ProviderRemittancesPage() {
  const api = useMemo(() => getRemittancesApi(), []);

  const listQuery = useQuery({
    queryKey: ["provider-remittances"],
    queryFn: () => api.list(),
  });

  const remittances = (listQuery.data ?? []) as Remittance[];

  return (
    <PageShell
      badge="Provider Portal"
      title="Remittances"
      subtitle="Remittances are submitted by dealers and reconciled by administrators."
      actions={
        <Button variant="outline" asChild>
          <Link to="/provider-dashboard">Back to dashboard</Link>
        </Button>
      }
    >
      <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b">
          <div className="font-semibold">Read-only financial view</div>
          <div className="text-sm text-muted-foreground mt-1">
            Providers can view remittances for support, but cannot create, edit, approve, reconcile, or create batches.
          </div>
        </div>

        <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 border-b text-xs text-muted-foreground">
          <div className="col-span-3">Remittance #</div>
          <div className="col-span-3">Amount</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-3">Created date</div>
          <div className="col-span-1 text-right">Action</div>
        </div>

        <div className="divide-y">
          {remittances.map((r) => (
            <div key={r.id} className="px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <div className="md:col-span-3">
                  <div className="text-sm font-medium text-foreground">{r.remittanceNumber}</div>
                </div>
                <div className="md:col-span-3 text-sm text-muted-foreground">{money(r.amountCents)}</div>
                <div className="md:col-span-2">
                  <span className={statusBadge(r.status)}>{r.status === "PAID" ? "Paid" : "Due"}</span>
                </div>
                <div className="md:col-span-3 text-sm text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</div>
                <div className="md:col-span-1 flex md:justify-end">
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/provider-remittances/${r.id}/print`}>Download</Link>
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {listQuery.isLoading ? <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div> : null}
          {listQuery.isError ? <div className="px-6 py-6 text-sm text-destructive">Failed to load remittances.</div> : null}
          {!listQuery.isLoading && !listQuery.isError && remittances.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">No remittances yet.</div>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
