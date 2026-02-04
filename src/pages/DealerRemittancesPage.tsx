import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { getBatchesApi } from "../lib/batches/batches";
import type { Batch, RemittanceWorkflowStatus } from "../lib/batches/types";
import { getContractsApi } from "../lib/contracts/contracts";
import type { Contract } from "../lib/contracts/types";
import { getAppMode } from "../lib/runtime";
import { alertMissing, confirmProceed } from "../lib/utils";
import { logAuditEvent } from "../lib/auditLog";
import { useAuth } from "../providers/AuthProvider";

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const LOCAL_DEALER_MEMBERSHIPS_KEY = "warrantyhub.local.dealer_memberships";

function readLocalDealerMemberships(): Array<{ dealerId?: string; userId?: string }> {
  const raw = localStorage.getItem(LOCAL_DEALER_MEMBERSHIPS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as any[]) : [];
  } catch {
    return [];
  }
}

function dealershipUserIds(dealerId: string) {
  const memberships = readLocalDealerMemberships();
  const ids = new Set<string>();
  ids.add(dealerId);
  for (const m of memberships) {
    const did = (m?.dealerId ?? "").toString();
    const uid = (m?.userId ?? "").toString();
    if (did && uid && did === dealerId) ids.add(uid);
  }
  return ids;
}

export function DealerRemittancesPage() {
  const contractsApi = useMemo(() => getContractsApi(), []);
  const batchesApi = useMemo(() => getBatchesApi(), []);
  const qc = useQueryClient();
  const { user } = useAuth();

  const mode = useMemo(() => getAppMode(), []);

  if (!user) return <Navigate to="/sign-in" replace />;
  if (user.role !== "DEALER_ADMIN") return <Navigate to="/dealer-dashboard" replace />;

  const [remittanceNumber, setRemittanceNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const contractsQuery = useQuery({
    queryKey: ["contracts"],
    queryFn: () => contractsApi.list(),
  });

  const batchesQuery = useQuery({
    queryKey: ["batches"],
    queryFn: () => batchesApi.list(),
  });

  const allContracts = (contractsQuery.data ?? []) as Contract[];
  const uid = (user?.id ?? "").trim();
  const uem = (user?.email ?? "").trim().toLowerCase();
  const isMine = (c: Contract) => {
    const byId = (c.createdByUserId ?? "").trim();
    const byEmail = (c.createdByEmail ?? "").trim().toLowerCase();
    if (uid && byId) return byId === uid;
    if (uem && byEmail) return byEmail === uem;
    return false;
  };

  const visibleContracts = useMemo(() => {
    if (!user) return [] as Contract[];
    if (user.role !== "DEALER_ADMIN") return allContracts.filter(isMine);
    if (mode !== "local") return allContracts.filter(isMine);

    const did = (user.dealerId ?? "").trim();
    if (!did) return allContracts.filter(isMine);
    const ids = dealershipUserIds(did);
    return allContracts.filter((c) => {
      const cdid = (c.dealerId ?? "").trim();
      if (cdid && cdid === did) return true;
      const byId = (c.createdByUserId ?? "").trim();
      return byId && ids.has(byId);
    });
  }, [allContracts, isMine, mode, user]);

  const visibleContractIds = useMemo(() => new Set(visibleContracts.map((c) => c.id)), [visibleContracts]);
  const soldContracts = visibleContracts.filter((c) => c.status === "SOLD");

  const selectedIds = soldContracts.filter((c) => selected[c.id]).map((c) => c.id);
  const selectedContracts = soldContracts.filter((c) => selected[c.id]);

  const calculatedTotalCents = useMemo(() => {
    return selectedContracts.reduce((sum, c) => {
      const cost =
        typeof c.pricingDealerCostCents === "number"
          ? c.pricingDealerCostCents
          : typeof c.pricingBasePriceCents === "number"
            ? c.pricingBasePriceCents
            : 0;
      return sum + cost;
    }, 0);
  }, [selectedContracts]);

  useEffect(() => {
    if (selectedIds.length === 0) {
      setAmount("");
      return;
    }
    setAmount((calculatedTotalCents / 100).toFixed(2));
  }, [calculatedTotalCents, selectedIds.length]);

  const createRemittanceMutation = useMutation({
    mutationFn: async () => {
      const r = remittanceNumber.trim();
      if (!r) throw new Error("Remittance # is required");
      if (selectedIds.length === 0) throw new Error("Select at least 1 SOLD contract");

      const providerIds = new Set<string>();
      for (const c of selectedContracts) {
        const pid = (c.providerId ?? "").trim();
        if (!pid) throw new Error("Selected contracts must have a provider");
        providerIds.add(pid);
      }
      if (providerIds.size !== 1) throw new Error("A remittance can only contain contracts from ONE provider");
      const providerId = Array.from(providerIds)[0]!;

      const created = await batchesApi.create({ batchNumber: r });
      const cents = calculatedTotalCents;
      await batchesApi.update(created.id, {
        contractIds: selectedIds,
        totalCents: cents,
        remittanceStatus: "DRAFT",
        dealerUserId: user?.id,
        dealerEmail: user?.email,
        providerId,
      });

      logAuditEvent({
        kind: "REMITTANCE_CREATED",
        actorUserId: user?.id,
        actorEmail: user?.email,
        actorRole: user?.role,
        dealerId: (user?.dealerId ?? "").trim() || undefined,
        entityType: "remittance",
        entityId: created.id,
        message: `Created remittance ${r}`,
        meta: { totalCents: cents, contractCount: selectedIds.length, providerId },
      });

      return created;
    },
    onSuccess: async () => {
      setRemittanceNumber("");
      setAmount("");
      setSelected({});
      await qc.invalidateQueries({ queryKey: ["batches"] });
      await qc.invalidateQueries({ queryKey: ["contracts"] });
    },
  });

  const submitRemittanceMutation = useMutation({
    mutationFn: async (remittanceId: string) => {
      const now = new Date().toISOString();
      const all = await batchesApi.list();
      const r = (all as Batch[]).find((x) => x.id === remittanceId);
      if (!r) throw new Error("Remittance not found");
      const workflow = (r.remittanceStatus ?? (r.status === "CLOSED" ? "SUBMITTED" : "DRAFT")) as RemittanceWorkflowStatus;
      if (workflow !== "DRAFT") throw new Error("Remittance is already submitted");
      if (!Array.isArray(r.contractIds) || r.contractIds.length === 0) throw new Error("No contracts linked");

      await batchesApi.update(remittanceId, {
        status: "CLOSED",
        remittanceStatus: "SUBMITTED",
        submittedAt: now,
        dealerUserId: user?.id,
        dealerEmail: user?.email,
      });

      logAuditEvent({
        kind: "REMITTANCE_SUBMITTED",
        actorUserId: user?.id,
        actorEmail: user?.email,
        actorRole: user?.role,
        dealerId: (user?.dealerId ?? "").trim() || undefined,
        entityType: "remittance",
        entityId: remittanceId,
        message: `Submitted remittance ${r.batchNumber}`,
      });

      for (const id of r.contractIds) {
        await contractsApi.update(id, {
          status: "REMITTED",
          remittedByUserId: user?.id,
          remittedByEmail: user?.email,
          remittedAt: now,
        });
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["batches"] });
      await qc.invalidateQueries({ queryKey: ["contracts"] });
    },
  });

  const busy = createRemittanceMutation.isPending || submitRemittanceMutation.isPending;

  const allBatches = batchesQuery.data ?? [];
  const myRemittances = (allBatches as Batch[])
    .filter((b) => Array.isArray(b.contractIds) && b.contractIds.length > 0)
    .filter((b) => (b.contractIds ?? []).every((id) => visibleContractIds.has(id)));

  const derivedWorkflow = (b: Batch): RemittanceWorkflowStatus => {
    const s = b.remittanceStatus;
    if (s) return s;
    if (b.paymentStatus === "PAID") return "PAID";
    if (b.status === "CLOSED") return "SUBMITTED";
    return "DRAFT";
  };

  const pending = myRemittances.filter((r) => derivedWorkflow(r) === "DRAFT");
  const submitted = myRemittances.filter((r) => derivedWorkflow(r) === "SUBMITTED");
  const approved = myRemittances.filter((r) => derivedWorkflow(r) === "APPROVED");
  const rejected = myRemittances.filter((r) => derivedWorkflow(r) === "REJECTED");
  const paid = myRemittances.filter((r) => derivedWorkflow(r) === "PAID");

  const statusBadge = (status: RemittanceWorkflowStatus) => {
    if (status === "PAID") return "inline-flex items-center text-xs px-2 py-1 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200";
    if (status === "APPROVED") return "inline-flex items-center text-xs px-2 py-1 rounded-md border bg-sky-50 text-sky-800 border-sky-200";
    if (status === "REJECTED") return "inline-flex items-center text-xs px-2 py-1 rounded-md border bg-rose-50 text-rose-700 border-rose-200";
    if (status === "SUBMITTED") return "inline-flex items-center text-xs px-2 py-1 rounded-md border bg-amber-50 text-amber-800 border-amber-200";
    return "inline-flex items-center text-xs px-2 py-1 rounded-md border bg-muted text-muted-foreground";
  };

  return (
    <PageShell
      badge="Dealer Portal"
      title="Remittances"
      subtitle="Create remittances for SOLD contracts and submit them for review."
      actions={
        <Button variant="outline" asChild>
          <Link to="/dealer-dashboard">Back to dashboard</Link>
        </Button>
      }
    >
      <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b">
          <div className="font-semibold">Create Remittance</div>
          <div className="text-sm text-muted-foreground mt-1">Submitted remittances are reviewed by administrators.</div>
        </div>

        <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Remittance #</div>
            <Input value={remittanceNumber} onChange={(e) => setRemittanceNumber(e.target.value)} placeholder="Remittance #" disabled={busy} />
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">Amount (e.g. 199.99)</div>
            <Input
              value={amount}
              onChange={() => {}}
              placeholder="199.99"
              inputMode="decimal"
              disabled={true}
            />
            <div className="mt-2 text-xs text-muted-foreground">Total is calculated from selected contracts using provider cost.</div>
          </div>

          <Button
            disabled={busy}
            onClick={() => {
              void (async () => {
                const r = remittanceNumber.trim();
                if (!r) return alertMissing("Remittance # is required.");
                if (selectedIds.length === 0) return alertMissing("Select at least 1 SOLD contract.");
                if (!(await confirmProceed(`Create remittance ${r} for ${selectedIds.length} contract(s)?`))) return;
                createRemittanceMutation.mutate();
              })();
            }}
          >
            Create remittance
          </Button>
        </div>

        <div className="px-6 pb-6">
          {createRemittanceMutation.isError ? (
            <div className="mt-4 text-sm text-destructive">
              {createRemittanceMutation.error instanceof Error ? createRemittanceMutation.error.message : "Failed to create remittance"}
            </div>
          ) : null}

          <div className="mt-6 rounded-xl border overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b text-sm text-muted-foreground">
              <div className="col-span-1">Pick</div>
              <div className="col-span-3">Warranty ID</div>
              <div className="col-span-2">Contract #</div>
              <div className="col-span-4">Customer</div>
              <div className="col-span-2">Status</div>
            </div>

            <div className="divide-y">
              {soldContracts.map((c) => (
                <div key={c.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm items-center">
                  <div className="col-span-1">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[c.id])}
                      onChange={(e) => setSelected((s) => ({ ...s, [c.id]: e.target.checked }))}
                      disabled={busy}
                    />
                  </div>
                  <div className="col-span-3 font-medium">{c.warrantyId}</div>
                  <div className="col-span-2">{c.contractNumber}</div>
                  <div className="col-span-4">{c.customerName}</div>
                  <div className="col-span-2 text-xs text-muted-foreground">{c.status}</div>
                </div>
              ))}

              {contractsQuery.isLoading ? <div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div> : null}
              {!contractsQuery.isLoading && soldContracts.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">No SOLD contracts available for remittance.</div>
              ) : null}
              {contractsQuery.isError ? <div className="px-4 py-6 text-sm text-destructive">Failed to load contracts.</div> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b">
          <div className="font-semibold">Pending Remittances</div>
          <div className="text-sm text-muted-foreground mt-1">Draft remittances can be submitted when ready.</div>
        </div>

        <div className="divide-y">
          {pending.map((r) => (
            <div key={r.id} className="px-6 py-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-sm font-medium">Remittance {r.batchNumber}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {r.contractIds.length} contract(s) • Created {new Date(r.createdAt).toLocaleString()}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium">{money(r.totalCents)}</div>
                  <span className={statusBadge("DRAFT")}>Draft</span>
                  <Button
                    size="sm"
                    onClick={() => {
                      void (async () => {
                        if (!(await confirmProceed(`Submit remittance ${r.batchNumber}?`))) return;
                        submitRemittanceMutation.mutate(r.id);
                      })();
                    }}
                    disabled={submitRemittanceMutation.isPending}
                  >
                    Submit
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {submitRemittanceMutation.isError ? (
            <div className="px-6 py-6 text-sm text-destructive">
              {submitRemittanceMutation.error instanceof Error ? submitRemittanceMutation.error.message : "Failed to submit remittance"}
            </div>
          ) : null}

          {batchesQuery.isLoading ? <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div> : null}
          {!batchesQuery.isLoading && pending.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">No pending remittances yet.</div>
          ) : null}
          {batchesQuery.isError ? <div className="px-6 py-6 text-sm text-destructive">Failed to load remittances.</div> : null}
        </div>
      </div>

      <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b">
          <div className="font-semibold">Submitted Remittances</div>
          <div className="text-sm text-muted-foreground mt-1">Submitted remittances are reviewed by administrators.</div>
        </div>

        <div className="divide-y">
          {submitted.map((r) => (
            <div key={r.id} className="px-6 py-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-sm font-medium">Remittance {r.batchNumber}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {r.contractIds.length} contract(s) • Created {new Date(r.createdAt).toLocaleString()}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium">{money(r.totalCents)}</div>
                  <span className={statusBadge("SUBMITTED")}>Submitted</span>
                </div>
              </div>
            </div>
          ))}

          {batchesQuery.isLoading ? <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div> : null}
          {!batchesQuery.isLoading && submitted.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">No submitted remittances yet.</div>
          ) : null}
          {batchesQuery.isError ? <div className="px-6 py-6 text-sm text-destructive">Failed to load remittances.</div> : null}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b">
            <div className="font-semibold">Approved</div>
            <div className="text-sm text-muted-foreground mt-1">Approved remittances are awaiting provider payment.</div>
          </div>
          <div className="divide-y">
            {approved.map((r) => (
              <div key={r.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-sm font-medium">Remittance {r.batchNumber}</div>
                    <div className="text-xs text-muted-foreground mt-1">{r.contractIds.length} contract(s)</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">{money(r.totalCents)}</div>
                    <span className={statusBadge("APPROVED")}>Approved</span>
                  </div>
                </div>
              </div>
            ))}
            {!batchesQuery.isLoading && approved.length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted-foreground">No approved remittances yet.</div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b">
            <div className="font-semibold">Rejected</div>
            <div className="text-sm text-muted-foreground mt-1">Rejected remittances require admin follow-up.</div>
          </div>
          <div className="divide-y">
            {rejected.map((r) => (
              <div key={r.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-sm font-medium">Remittance {r.batchNumber}</div>
                    <div className="text-xs text-muted-foreground mt-1">Reason: {(r.rejectionReason ?? "—").trim() || "—"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">{money(r.totalCents)}</div>
                    <span className={statusBadge("REJECTED")}>Rejected</span>
                  </div>
                </div>
              </div>
            ))}
            {!batchesQuery.isLoading && rejected.length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted-foreground">No rejected remittances.</div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b">
            <div className="font-semibold">Paid</div>
            <div className="text-sm text-muted-foreground mt-1">Completed remittances.</div>
          </div>
          <div className="divide-y">
            {paid.map((r) => (
              <div key={r.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-sm font-medium">Remittance {r.batchNumber}</div>
                    <div className="text-xs text-muted-foreground mt-1">Paid {new Date(r.paidAt ?? r.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">{money(r.totalCents)}</div>
                    <span className={statusBadge("PAID")}>Paid</span>
                  </div>
                </div>
              </div>
            ))}
            {!batchesQuery.isLoading && paid.length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted-foreground">No paid remittances yet.</div>
            ) : null}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
