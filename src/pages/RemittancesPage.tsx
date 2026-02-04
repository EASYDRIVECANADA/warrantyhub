import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { getBatchesApi } from "../lib/batches/batches";
import type { Batch, RemittanceWorkflowStatus } from "../lib/batches/types";
import { alertMissing, confirmProceed } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";

export function RemittancesPage({ title }: { title: string }) {
  const api = useMemo(() => getBatchesApi(), []);
  const qc = useQueryClient();
  const { user } = useAuth();

  const listQuery = useQuery({
    queryKey: ["batches"],
    queryFn: () => api.list(),
  });

  const [adminNotesById, setAdminNotesById] = useState<Record<string, string>>({});
  const [rejectionReasonById, setRejectionReasonById] = useState<Record<string, string>>({});

  const approveMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const all = (await api.list()) as Batch[];
      const b = all.find((x) => x.id === batchId);
      if (!b) throw new Error("Remittance not found");
      const workflow = (b.remittanceStatus ?? (b.status === "CLOSED" ? "SUBMITTED" : "DRAFT")) as RemittanceWorkflowStatus;
      if (workflow !== "SUBMITTED") throw new Error("Remittance is not awaiting review");

      const now = new Date().toISOString();
      await api.update(batchId, {
        remittanceStatus: "APPROVED",
        reviewedAt: now,
        reviewedByUserId: user?.id,
        reviewedByEmail: user?.email,
        rejectionReason: undefined,
        adminNotes: (adminNotesById[batchId] ?? "").trim() || undefined,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["batches"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const reason = (rejectionReasonById[batchId] ?? "").trim();
      if (!reason) throw new Error("Rejection reason is required");

      const all = (await api.list()) as Batch[];
      const b = all.find((x) => x.id === batchId);
      if (!b) throw new Error("Remittance not found");
      const workflow = (b.remittanceStatus ?? (b.status === "CLOSED" ? "SUBMITTED" : "DRAFT")) as RemittanceWorkflowStatus;
      if (workflow !== "SUBMITTED") throw new Error("Remittance is not awaiting review");

      const now = new Date().toISOString();
      await api.update(batchId, {
        remittanceStatus: "REJECTED",
        reviewedAt: now,
        reviewedByUserId: user?.id,
        reviewedByEmail: user?.email,
        rejectionReason: reason,
        adminNotes: (adminNotesById[batchId] ?? "").trim() || undefined,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["batches"] });
    },
  });

  const allBatches = (listQuery.data ?? []) as Batch[];
  const remittances = allBatches.filter((b) => Array.isArray(b.contractIds) && b.contractIds.length > 0);

  const derivedWorkflow = (b: Batch): RemittanceWorkflowStatus => {
    const s = b.remittanceStatus;
    if (s) return s;
    if (b.paymentStatus === "PAID") return "PAID";
    if (b.status === "CLOSED") return "SUBMITTED";
    return "DRAFT";
  };

  const awaitingReview = remittances.filter((r) => derivedWorkflow(r) === "SUBMITTED");
  const approved = remittances.filter((r) => derivedWorkflow(r) === "APPROVED");
  const rejected = remittances.filter((r) => derivedWorkflow(r) === "REJECTED");
  const paid = remittances.filter((r) => derivedWorkflow(r) === "PAID");

  const statusBadge = (status: RemittanceWorkflowStatus) => {
    if (status === "PAID") return "inline-flex items-center text-xs px-2 py-1 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200";
    if (status === "APPROVED") return "inline-flex items-center text-xs px-2 py-1 rounded-md border bg-sky-50 text-sky-800 border-sky-200";
    if (status === "REJECTED") return "inline-flex items-center text-xs px-2 py-1 rounded-md border bg-rose-50 text-rose-700 border-rose-200";
    if (status === "SUBMITTED") return "inline-flex items-center text-xs px-2 py-1 rounded-md border bg-amber-50 text-amber-800 border-amber-200";
    return "inline-flex items-center text-xs px-2 py-1 rounded-md border bg-muted text-muted-foreground";
  };

  return (
    <div className="container mx-auto px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground mt-1">Review submitted dealer remittances.</p>
      </div>

      {listQuery.isError ? (
        <div className="mt-6 text-sm text-destructive">Failed to load remittances.</div>
      ) : null}

      <div className="mt-6 rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-4 border-b">
          <div className="font-semibold">Awaiting Review</div>
          <div className="text-sm text-muted-foreground mt-1">Approve or reject submitted remittances.</div>
        </div>
        <div className="divide-y">
          {awaitingReview.map((r) => (
            <div key={r.id} className="px-4 py-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-sm font-medium">Remittance {r.batchNumber}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {r.contractIds.length} contract(s) • Total ${(r.totalCents / 100).toFixed(2)} • Submitted {new Date(r.submittedAt ?? r.createdAt).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Dealer: {(r.dealerEmail ?? "—").trim() || "—"}</div>
                  <div className="text-xs text-muted-foreground mt-1">Provider: {(r.providerId ?? "—").trim() || "—"}</div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={statusBadge("SUBMITTED")}>Submitted</span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-5">
                  <div className="text-xs text-muted-foreground mb-1">Admin Notes (internal)</div>
                  <Input
                    value={adminNotesById[r.id] ?? r.adminNotes ?? ""}
                    onChange={(e) => setAdminNotesById((p) => ({ ...p, [r.id]: e.target.value }))}
                    placeholder="Internal notes"
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                  />
                </div>
                <div className="md:col-span-5">
                  <div className="text-xs text-muted-foreground mb-1">Rejection Reason (required to reject)</div>
                  <Input
                    value={rejectionReasonById[r.id] ?? r.rejectionReason ?? ""}
                    onChange={(e) => setRejectionReasonById((p) => ({ ...p, [r.id]: e.target.value }))}
                    placeholder="Reason"
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                  />
                </div>

                <div className="md:col-span-2 flex gap-2 md:justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                    onClick={() => {
                      void (async () => {
                        if (!(await confirmProceed(`Approve remittance ${r.batchNumber}?`))) return;
                        approveMutation.mutate(r.id);
                      })();
                    }}
                  >
                    Approve
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="border-rose-200 text-rose-700 hover:bg-rose-50"
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                    onClick={() => {
                      void (async () => {
                        const reason = (rejectionReasonById[r.id] ?? r.rejectionReason ?? "").trim();
                        if (!reason) return alertMissing("Rejection reason is required.");
                        if (!(await confirmProceed(`Reject remittance ${r.batchNumber}?`))) return;
                        rejectMutation.mutate(r.id);
                      })();
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {approveMutation.isError ? (
            <div className="px-4 py-4 text-sm text-destructive">
              {approveMutation.error instanceof Error ? approveMutation.error.message : "Failed to approve remittance."}
            </div>
          ) : null}

          {rejectMutation.isError ? (
            <div className="px-4 py-4 text-sm text-destructive">
              {rejectMutation.error instanceof Error ? rejectMutation.error.message : "Failed to reject remittance."}
            </div>
          ) : null}

          {listQuery.isLoading ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>
          ) : null}
          {!listQuery.isLoading && awaitingReview.length === 0 ? (
            <div className="px-4 py-10 text-sm text-muted-foreground">No remittances awaiting review.</div>
          ) : null}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-4 border-b">
            <div className="font-semibold">Approved</div>
          </div>
          <div className="divide-y">
            {approved.map((r) => (
              <div key={r.id} className="px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{r.batchNumber}</div>
                    <div className="text-xs text-muted-foreground mt-1">Total ${(r.totalCents / 100).toFixed(2)}</div>
                  </div>
                  <span className={statusBadge("APPROVED")}>Approved</span>
                </div>
              </div>
            ))}
            {!listQuery.isLoading && approved.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">No approved remittances.</div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-4 border-b">
            <div className="font-semibold">Rejected</div>
          </div>
          <div className="divide-y">
            {rejected.map((r) => (
              <div key={r.id} className="px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{r.batchNumber}</div>
                    <div className="text-xs text-muted-foreground mt-1">Reason: {(r.rejectionReason ?? "—").trim() || "—"}</div>
                  </div>
                  <span className={statusBadge("REJECTED")}>Rejected</span>
                </div>
              </div>
            ))}
            {!listQuery.isLoading && rejected.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">No rejected remittances.</div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-4 border-b">
            <div className="font-semibold">Paid</div>
          </div>
          <div className="divide-y">
            {paid.map((r) => (
              <div key={r.id} className="px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{r.batchNumber}</div>
                    <div className="text-xs text-muted-foreground mt-1">Paid {new Date(r.paidAt ?? r.createdAt).toLocaleDateString()}</div>
                  </div>
                  <span className={statusBadge("PAID")}>Paid</span>
                </div>
              </div>
            ))}
            {!listQuery.isLoading && paid.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">No paid remittances.</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
