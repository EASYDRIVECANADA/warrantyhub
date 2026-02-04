import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { PageShell } from "../components/PageShell";
import { Input } from "../components/ui/input";
import { getBatchesApi } from "../lib/batches/batches";
import type { Batch, PaymentMethod, RemittanceWorkflowStatus } from "../lib/batches/types";
import { alertMissing, confirmProceed } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";

function money(cents?: number) {
  if (typeof cents !== "number") return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function statusBadge(status: RemittanceWorkflowStatus) {
  if (status === "PAID") return "inline-flex items-center text-xs px-2 py-1 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "APPROVED") return "inline-flex items-center text-xs px-2 py-1 rounded-md border bg-sky-50 text-sky-800 border-sky-200";
  if (status === "REJECTED") return "inline-flex items-center text-xs px-2 py-1 rounded-md border bg-rose-50 text-rose-700 border-rose-200";
  if (status === "SUBMITTED") return "inline-flex items-center text-xs px-2 py-1 rounded-md border bg-amber-50 text-amber-800 border-amber-200";
  return "inline-flex items-center text-xs px-2 py-1 rounded-md border bg-muted text-muted-foreground";
}

export function ProviderRemittancesPage() {
  const api = useMemo(() => getBatchesApi(), []);
  const qc = useQueryClient();
  const { user } = useAuth();

  const listQuery = useQuery({
    queryKey: ["provider-remittances"],
    queryFn: () => api.list(),
  });

  const myProviderId = (user?.id ?? "").trim();
  const all = (listQuery.data ?? []) as Batch[];

  const derivedWorkflow = (b: Batch): RemittanceWorkflowStatus => {
    const s = b.remittanceStatus;
    if (s) return s;
    if (b.paymentStatus === "PAID") return "PAID";
    if (b.status === "CLOSED") return "SUBMITTED";
    return "DRAFT";
  };

  const rows = all
    .filter((b) => Array.isArray(b.contractIds) && b.contractIds.length > 0)
    .filter((b) => (b.providerId ?? "").trim() && (b.providerId ?? "").trim() === myProviderId)
    .sort((a, b) => (b.submittedAt ?? b.createdAt).localeCompare(a.submittedAt ?? a.createdAt));

  const approved = rows.filter((b) => derivedWorkflow(b) === "APPROVED");
  const paid = rows.filter((b) => derivedWorkflow(b) === "PAID");

  const [paymentMethodById, setPaymentMethodById] = useState<Record<string, PaymentMethod | undefined>>({});
  const [paymentReferenceById, setPaymentReferenceById] = useState<Record<string, string>>({});
  const [paymentDateById, setPaymentDateById] = useState<Record<string, string>>({});

  const markPaidMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const current = rows.find((r) => r.id === batchId);
      if (!current) throw new Error("Remittance not found");
      if (derivedWorkflow(current) !== "APPROVED") throw new Error("Only approved remittances can be marked paid");

      const method = paymentMethodById[batchId] ?? current.paymentMethod;
      const reference = (paymentReferenceById[batchId] ?? current.paymentReference ?? "").toString().trim();
      const date = (paymentDateById[batchId] ?? current.paymentDate ?? "").toString().trim();
      if (!method) throw new Error("Payment method is required");
      if (!date) throw new Error("Payment date is required");

      const now = new Date().toISOString();
      await api.update(batchId, {
        remittanceStatus: "PAID",
        paymentStatus: "PAID",
        paidAt: now,
        paymentMethod: method,
        paymentReference: reference || undefined,
        paymentDate: date,
        paidByUserId: user?.id,
        paidByEmail: user?.email,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["provider-remittances"] });
      await qc.invalidateQueries({ queryKey: ["batches"] });
    },
  });

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
          <div className="font-semibold">Approved Remittances</div>
          <div className="text-sm text-muted-foreground mt-1">Mark approved remittances as paid when payment is issued.</div>
        </div>

        <div className="divide-y">
          {approved.map((r) => (
            <div key={r.id} className="px-6 py-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-sm font-medium text-foreground">Remittance {r.batchNumber}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {r.contractIds.length} contract(s) • Total {money(r.totalCents)} • Dealer {(r.dealerEmail ?? "—").trim() || "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={statusBadge("APPROVED")}>Approved</span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-3">
                  <div className="text-xs text-muted-foreground mb-1">Payment Method</div>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={(paymentMethodById[r.id] ?? r.paymentMethod ?? "") as string}
                    onChange={(e) => {
                      const v = (e.target.value ?? "").toString().trim();
                      setPaymentMethodById((p) => ({ ...p, [r.id]: (v ? (v as PaymentMethod) : undefined) }));
                    }}
                    disabled={markPaidMutation.isPending}
                  >
                    <option value="">Select</option>
                    <option value="EFT">EFT</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>

                <div className="md:col-span-4">
                  <div className="text-xs text-muted-foreground mb-1">Payment Reference (optional)</div>
                  <Input
                    value={paymentReferenceById[r.id] ?? r.paymentReference ?? ""}
                    onChange={(e) => {
                      setPaymentReferenceById((p) => ({ ...p, [r.id]: e.target.value }));
                    }}
                    placeholder="e.g. EFT confirmation #"
                    disabled={markPaidMutation.isPending}
                  />
                </div>

                <div className="md:col-span-3">
                  <div className="text-xs text-muted-foreground mb-1">Payment Date</div>
                  <Input
                    type="date"
                    value={paymentDateById[r.id] ?? r.paymentDate ?? ""}
                    onChange={(e) => {
                      setPaymentDateById((p) => ({ ...p, [r.id]: e.target.value }));
                    }}
                    disabled={markPaidMutation.isPending}
                  />
                </div>

                <div className="md:col-span-2 flex gap-2 md:justify-end">
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/provider-remittances/${r.id}/print`}>Download</Link>
                  </Button>
                  <Button
                    size="sm"
                    disabled={markPaidMutation.isPending}
                    onClick={() => {
                      void (async () => {
                        const method = paymentMethodById[r.id] ?? r.paymentMethod;
                        const date = paymentDateById[r.id] ?? r.paymentDate;
                        if (!method) return alertMissing("Payment method is required.");
                        if (!(date ?? "").trim()) return alertMissing("Payment date is required.");
                        if (!(await confirmProceed(`Mark remittance ${r.batchNumber} as paid?`))) return;
                        markPaidMutation.mutate(r.id);
                      })();
                    }}
                  >
                    Mark Paid
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {markPaidMutation.isError ? (
            <div className="px-6 py-6 text-sm text-destructive">
              {markPaidMutation.error instanceof Error ? markPaidMutation.error.message : "Failed to mark paid."}
            </div>
          ) : null}

          {listQuery.isLoading ? <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div> : null}
          {listQuery.isError ? <div className="px-6 py-6 text-sm text-destructive">Failed to load remittances.</div> : null}
          {!listQuery.isLoading && !listQuery.isError && approved.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">No approved remittances yet.</div>
          ) : null}
        </div>
      </div>

      <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b">
          <div className="font-semibold">Paid</div>
        </div>
        <div className="divide-y">
          {paid.map((r) => (
            <div key={r.id} className="px-6 py-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-sm font-medium text-foreground">Remittance {r.batchNumber}</div>
                  <div className="text-xs text-muted-foreground mt-1">Paid {new Date(r.paidAt ?? r.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium">{money(r.totalCents)}</div>
                  <span className={statusBadge("PAID")}>Paid</span>
                </div>
              </div>
            </div>
          ))}
          {!listQuery.isLoading && !listQuery.isError && paid.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">No paid remittances yet.</div>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
