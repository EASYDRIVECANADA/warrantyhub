import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { getBatchesApi } from "../lib/batches/batches";
import { getContractsApi } from "../lib/contracts/contracts";
import type { Contract } from "../lib/contracts/types";
import { alertMissing, confirmProceed, sanitizeMoney } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";

function dollarsToCents(raw: string) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function DealerRemittancesPage() {
  const contractsApi = useMemo(() => getContractsApi(), []);
  const batchesApi = useMemo(() => getBatchesApi(), []);
  const qc = useQueryClient();
  const { user } = useAuth();

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

  const myContracts = allContracts.filter(isMine);
  const myContractIds = new Set(myContracts.map((c) => c.id));
  const soldContracts = myContracts.filter((c) => c.status === "SOLD");

  const selectedIds = soldContracts.filter((c) => selected[c.id]).map((c) => c.id);

  const createRemittanceMutation = useMutation({
    mutationFn: async () => {
      const r = remittanceNumber.trim();
      const a = amount.trim();
      if (!r) throw new Error("Remittance # is required");
      if (!a) throw new Error("Amount is required");
      if (selectedIds.length === 0) throw new Error("Select at least 1 SOLD contract");

      const created = await batchesApi.create({ batchNumber: r });
      const cents = dollarsToCents(a);
      await batchesApi.update(created.id, {
        contractIds: selectedIds,
        totalCents: cents,
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
      const r = all.find((x) => x.id === remittanceId);
      if (!r) throw new Error("Remittance not found");
      if (r.status !== "OPEN") throw new Error("Remittance is already submitted");
      if (!Array.isArray(r.contractIds) || r.contractIds.length === 0) throw new Error("No contracts linked");

      await batchesApi.update(remittanceId, { status: "CLOSED" });

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
  const myRemittances = allBatches
    .filter((b) => Array.isArray(b.contractIds) && (b.contractIds as string[]).length > 0)
    .filter((b) => (b.contractIds as string[]).every((id) => myContractIds.has(id)));

  const pending = myRemittances.filter((r) => r.status === "OPEN");
  const submitted = myRemittances.filter((r) => r.status === "CLOSED");

  const statusBadge = (status: "OPEN" | "CLOSED") => {
    return (
      "inline-flex items-center text-xs px-2 py-1 rounded-md border " +
      (status === "CLOSED" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200")
    );
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
              onChange={(e) => setAmount(sanitizeMoney(e.target.value))}
              placeholder="199.99"
              inputMode="decimal"
              disabled={busy}
            />
          </div>

          <Button
            disabled={busy}
            onClick={() => {
              void (async () => {
                const r = remittanceNumber.trim();
                const a = amount.trim();
                if (!r) return alertMissing("Remittance # is required.");
                if (!a) return alertMissing("Amount is required.");
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
                  <span className={statusBadge("OPEN")}>Pending</span>
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
                  <span className={statusBadge("CLOSED")}>Submitted</span>
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
    </PageShell>
  );
}
