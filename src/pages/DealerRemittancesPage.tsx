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

function providerShort(id: string | undefined) {
  const t = (id ?? "").trim();
  if (!t) return "—";
  return `Provider ${t.slice(0, 8)}`;
}

type RemittanceTabKey = "ALL" | RemittanceWorkflowStatus;

function remittanceTabLabel(t: RemittanceTabKey) {
  if (t === "ALL") return "All";
  if (t === "DRAFT") return "Draft";
  if (t === "SUBMITTED") return "Submitted";
  if (t === "APPROVED") return "Approved";
  if (t === "REJECTED") return "Rejected";
  return "Paid";
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
  const [contractSearch, setContractSearch] = useState("");
  const [remittanceTab, setRemittanceTab] = useState<RemittanceTabKey>("ALL");

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

  const filteredSoldContracts = useMemo(() => {
    const query = contractSearch.trim().toLowerCase();
    if (!query) return soldContracts;
    return soldContracts.filter((c) => {
      const hay = [c.warrantyId, c.contractNumber, c.customerName]
        .map((x) => (x ?? "").toString().toLowerCase())
        .join(" ");
      return hay.includes(query);
    });
  }, [contractSearch, soldContracts]);

  const selectedIds = soldContracts.filter((c) => selected[c.id]).map((c) => c.id);
  const selectedContracts = soldContracts.filter((c) => selected[c.id]);

  const selectedProviderId = useMemo(() => {
    const set = new Set(selectedContracts.map((c) => (c.providerId ?? "").trim()).filter(Boolean));
    if (set.size === 0) return undefined;
    if (set.size === 1) return Array.from(set)[0];
    return "__multiple__";
  }, [selectedContracts]);

  const calculatedTotalCents = useMemo(() => {
    return selectedContracts.reduce((sum, c) => {
      const cost =
        typeof c.pricingDealerCostCents === "number"
          ? c.pricingDealerCostCents
          : typeof c.pricingBasePriceCents === "number"
            ? c.pricingBasePriceCents
            : 0;
      const addonCost = typeof c.addonTotalCostCents === "number" ? c.addonTotalCostCents : 0;
      return sum + cost + addonCost;
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

  const remittanceCounts = useMemo(() => {
    return {
      ALL: myRemittances.length,
      DRAFT: pending.length,
      SUBMITTED: submitted.length,
      APPROVED: approved.length,
      REJECTED: rejected.length,
      PAID: paid.length,
    };
  }, [approved.length, myRemittances.length, paid.length, pending.length, rejected.length, submitted.length]);

  const statusBadge = (status: RemittanceWorkflowStatus) => {
    if (status === "PAID") return "inline-flex items-center text-xs px-2 py-1 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200";
    if (status === "APPROVED") return "inline-flex items-center text-xs px-2 py-1 rounded-md border bg-sky-50 text-sky-800 border-sky-200";
    if (status === "REJECTED") return "inline-flex items-center text-xs px-2 py-1 rounded-md border bg-rose-50 text-rose-700 border-rose-200";
    if (status === "SUBMITTED") return "inline-flex items-center text-xs px-2 py-1 rounded-md border bg-amber-50 text-amber-800 border-amber-200";
    return "inline-flex items-center text-xs px-2 py-1 rounded-md border bg-muted text-muted-foreground";
  };

  const remittanceTabs: RemittanceTabKey[] = ["ALL", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PAID"];
  const showSection = (k: RemittanceWorkflowStatus) => remittanceTab === "ALL" || remittanceTab === k;
  const remittancePrintUrl = (id: string) => `/dealer-remittances/batches/${id}/print`;

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
      <div className="relative">
        <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-blue-600/10 via-transparent to-yellow-400/10 blur-2xl" />

        <div className="rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
          <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600/10 via-transparent to-yellow-500/10">
            <div className="font-semibold">Remittances overview</div>
            <div className="text-sm text-muted-foreground mt-1">Track draft → submitted → approved → paid. Filter the sections below.</div>
          </div>
          <div className="p-6 grid grid-cols-2 md:grid-cols-6 gap-3">
            {remittanceTabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setRemittanceTab(t)}
                className={
                  "rounded-xl border p-3 text-left transition-colors " +
                  (remittanceTab === t ? "bg-muted/50 border-blue-500/30" : "bg-background hover:bg-muted/30")
                }
              >
                <div className="text-xs text-muted-foreground">{remittanceTabLabel(t)}</div>
                <div className="text-lg font-semibold text-foreground mt-1">{remittanceCounts[t]}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-yellow-500/10">
          <div className="px-6 py-4 border-b bg-gradient-to-r from-yellow-500/10 to-blue-600/10">
            <div className="font-semibold">Create remittance</div>
            <div className="text-sm text-muted-foreground mt-1">Select SOLD contracts (same provider), then create the draft remittance.</div>
          </div>

          <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Remittance #</div>
              <Input value={remittanceNumber} onChange={(e) => setRemittanceNumber(e.target.value)} placeholder="Remittance #" disabled={busy} />
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-1">Amount</div>
              <Input value={amount} placeholder="199.99" inputMode="decimal" disabled={true} />
              <div className="mt-2 text-xs text-muted-foreground">Total is calculated from selected contracts using provider cost.</div>
            </div>

            <Button
              className="bg-yellow-400 text-black hover:bg-yellow-300"
              disabled={busy || selectedIds.length === 0 || selectedProviderId === "__multiple__"}
              onClick={() => {
                void (async () => {
                  const r = remittanceNumber.trim();
                  if (!r) return alertMissing("Remittance # is required.");
                  if (selectedIds.length === 0) return alertMissing("Select at least 1 SOLD contract.");
                  if (selectedProviderId === "__multiple__") return alertMissing("Select contracts from a single provider.");
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

            <div className="mt-4 rounded-xl border p-4 bg-gradient-to-br from-blue-600/5 via-transparent to-yellow-400/10">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-xs text-muted-foreground">Selected contracts</div>
                  <div className="text-sm text-foreground mt-1">
                    {selectedIds.length} selected
                    {selectedProviderId && selectedProviderId !== "__multiple__" ? ` • ${providerShort(selectedProviderId)}` : ""}
                    {selectedProviderId === "__multiple__" ? " • Multiple providers" : ""}
                  </div>
                </div>
                <div className="text-sm font-medium">Total {money(calculatedTotalCents)}</div>
              </div>
              {selectedProviderId === "__multiple__" ? (
                <div className="mt-2 text-sm text-destructive">A remittance can only include contracts from one provider. Uncheck contracts to continue.</div>
              ) : null}
            </div>

            <div className="mt-6 rounded-xl border overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/20">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="w-full md:w-[320px]">
                    <Input
                      value={contractSearch}
                      onChange={(e) => setContractSearch(e.target.value)}
                      placeholder="Search sold contracts (warranty id, contract #, customer)…"
                      disabled={busy}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || filteredSoldContracts.length === 0}
                      onClick={() => {
                        setSelected((prev) => {
                          const providerForBulk =
                            selectedProviderId && selectedProviderId !== "__multiple__"
                              ? selectedProviderId
                              : (filteredSoldContracts.find((c) => (c.providerId ?? "").trim())?.providerId ?? "").trim();
                          const next: Record<string, boolean> = { ...prev };
                          for (const c of filteredSoldContracts) {
                            const pid = (c.providerId ?? "").trim();
                            if (providerForBulk && pid && pid !== providerForBulk) continue;
                            next[c.id] = true;
                          }
                          return next;
                        });
                      }}
                    >
                      Select visible
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy || selectedIds.length === 0} onClick={() => setSelected({})}>
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-12 gap-2 text-sm text-muted-foreground">
                  <div className="col-span-1">Pick</div>
                  <div className="col-span-3">Warranty ID</div>
                  <div className="col-span-2">Contract #</div>
                  <div className="col-span-3">Customer</div>
                  <div className="col-span-2">Provider</div>
                  <div className="col-span-1 text-right">Cost</div>
                </div>
              </div>

            <div className="divide-y">
              {filteredSoldContracts.map((c) => (
                <div key={c.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm items-center">
                  <div className="col-span-1">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[c.id])}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        if (checked) {
                          const pid = (c.providerId ?? "").trim();
                          if (selectedProviderId && selectedProviderId !== "__multiple__" && pid && pid !== selectedProviderId) {
                            alertMissing("A remittance can only include contracts from one provider.");
                            return;
                          }
                        }
                        setSelected((s) => ({ ...s, [c.id]: checked }));
                      }}
                      disabled={busy}
                    />
                  </div>
                  <div className="col-span-3 font-medium">{c.warrantyId}</div>
                  <div className="col-span-2">{c.contractNumber}</div>
                  <div className="col-span-3">{c.customerName}</div>
                  <div className="col-span-2 text-xs text-muted-foreground">{providerShort(c.providerId)}</div>
                  <div className="col-span-1 text-right text-xs text-muted-foreground">
                    {(() => {
                      const cost =
                        typeof c.pricingDealerCostCents === "number"
                          ? c.pricingDealerCostCents
                          : typeof c.pricingBasePriceCents === "number"
                            ? c.pricingBasePriceCents
                            : 0;
                      return money(cost);
                    })()}
                  </div>
                </div>
              ))}

              {contractsQuery.isLoading ? <div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div> : null}
              {!contractsQuery.isLoading && soldContracts.length === 0 ? (
                <div className="px-4 py-8 text-sm text-muted-foreground">
                  <div className="font-medium text-foreground">No SOLD contracts yet</div>
                  <div className="mt-1">Sell a contract in the Contracts page (status must be SOLD), then come back here to create a remittance.</div>
                  <div className="mt-3">
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/dealer-contracts?tab=SOLD">Go to Contracts</Link>
                    </Button>
                  </div>
                </div>
              ) : null}
              {!contractsQuery.isLoading && soldContracts.length > 0 && filteredSoldContracts.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">No SOLD contracts match your search.</div>
              ) : null}
              {contractsQuery.isError ? <div className="px-4 py-6 text-sm text-destructive">Failed to load contracts.</div> : null}
            </div>
          </div>
        </div>

        </div>

        {showSection("DRAFT") ? (
        <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
          <div className="px-6 py-4 border-b flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold">Draft Remittances</div>
              <div className="text-sm text-muted-foreground mt-1">Draft remittances can be submitted when ready.</div>
            </div>
            <span className="text-sm text-muted-foreground">{pending.length} total</span>
          </div>

          <div className="divide-y">
            {pending.map((r) => (
              <div key={r.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-sm font-medium">Remittance {r.batchNumber}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {r.contractIds.length} contract(s) • {providerShort(r.providerId)} • Created {new Date(r.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm font-medium">{money(r.totalCents)}</div>
                    <span className={statusBadge("DRAFT")}>Draft</span>
                    <Button size="sm" variant="outline" asChild>
                      <Link to={remittancePrintUrl(r.id)}>Download</Link>
                    </Button>
                    <Button
                      className="bg-yellow-400 text-black hover:bg-yellow-300"
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
              <div className="px-6 py-10 text-sm text-muted-foreground">No draft remittances yet.</div>
            ) : null}
            {batchesQuery.isError ? <div className="px-6 py-6 text-sm text-destructive">Failed to load remittances.</div> : null}
          </div>
        </div>
      ) : null}

        {showSection("SUBMITTED") ? (
        <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-yellow-500/10">
          <div className="px-6 py-4 border-b flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold">Submitted Remittances</div>
              <div className="text-sm text-muted-foreground mt-1">Submitted remittances are reviewed by administrators.</div>
            </div>
            <span className="text-sm text-muted-foreground">{submitted.length} total</span>
          </div>

          <div className="divide-y">
            {submitted.map((r) => (
              <div key={r.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-sm font-medium">Remittance {r.batchNumber}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {r.contractIds.length} contract(s) • {providerShort(r.providerId)} • Submitted {new Date(r.submittedAt ?? r.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm font-medium">{money(r.totalCents)}</div>
                    <span className={statusBadge("SUBMITTED")}>Submitted</span>
                    <Button size="sm" variant="outline" asChild>
                      <Link to={remittancePrintUrl(r.id)}>Download</Link>
                    </Button>
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
      ) : null}

        {showSection("APPROVED") ? (
        <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
          <div className="px-6 py-4 border-b flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold">Approved</div>
              <div className="text-sm text-muted-foreground mt-1">Approved remittances are awaiting provider payment.</div>
            </div>
            <span className="text-sm text-muted-foreground">{approved.length} total</span>
          </div>
          <div className="divide-y">
            {approved.map((r) => (
              <div key={r.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-sm font-medium">Remittance {r.batchNumber}</div>
                    <div className="text-xs text-muted-foreground mt-1">{r.contractIds.length} contract(s) • {providerShort(r.providerId)}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm font-medium">{money(r.totalCents)}</div>
                    <span className={statusBadge("APPROVED")}>Approved</span>
                    <Button size="sm" variant="outline" asChild>
                      <Link to={remittancePrintUrl(r.id)}>Download</Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {!batchesQuery.isLoading && approved.length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted-foreground">No approved remittances yet.</div>
            ) : null}
          </div>
        </div>
      ) : null}

        {showSection("REJECTED") ? (
        <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-yellow-500/10">
          <div className="px-6 py-4 border-b flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold">Rejected</div>
              <div className="text-sm text-muted-foreground mt-1">Rejected remittances require admin follow-up.</div>
            </div>
            <span className="text-sm text-muted-foreground">{rejected.length} total</span>
          </div>
          <div className="divide-y">
            {rejected.map((r) => (
              <div key={r.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-sm font-medium">Remittance {r.batchNumber}</div>
                    <div className="text-xs text-muted-foreground mt-1">Reason: {(r.rejectionReason ?? "—").trim() || "—"}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm font-medium">{money(r.totalCents)}</div>
                    <span className={statusBadge("REJECTED")}>Rejected</span>
                    <Button size="sm" variant="outline" asChild>
                      <Link to={remittancePrintUrl(r.id)}>Download</Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {!batchesQuery.isLoading && rejected.length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted-foreground">No rejected remittances.</div>
            ) : null}
          </div>
        </div>
      ) : null}

        {showSection("PAID") ? (
        <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
          <div className="px-6 py-4 border-b flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold">Paid</div>
              <div className="text-sm text-muted-foreground mt-1">Completed remittances.</div>
            </div>
            <span className="text-sm text-muted-foreground">{paid.length} total</span>
          </div>
          <div className="divide-y">
            {paid.map((r) => (
              <div key={r.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-sm font-medium">Remittance {r.batchNumber}</div>
                    <div className="text-xs text-muted-foreground mt-1">Paid {new Date(r.paidAt ?? r.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm font-medium">{money(r.totalCents)}</div>
                    <span className={statusBadge("PAID")}>Paid</span>
                    <Button size="sm" variant="outline" asChild>
                      <Link to={remittancePrintUrl(r.id)}>Download</Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {!batchesQuery.isLoading && paid.length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted-foreground">No paid remittances yet.</div>
            ) : null}
          </div>
        </div>
      ) : null}
      </div>
    </PageShell>
  );
}
