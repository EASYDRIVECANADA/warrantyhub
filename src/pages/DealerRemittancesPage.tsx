import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { CheckSquare, Clock, DollarSign, FileText, Plus, RefreshCw, Search, Square } from "lucide-react";

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

type ContractPickerView = "READY" | "SOLD";

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
  const [remittanceTab, setRemittanceTab] = useState<RemittanceTabKey>("DRAFT");
  const [contractPickerView, setContractPickerView] = useState<ContractPickerView>("READY");
  const [remittanceSearch, setRemittanceSearch] = useState("");

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

  const contractIdsInAnyBatch = useMemo(() => {
    const ids = new Set<string>();
    for (const b of myRemittances) {
      const list = Array.isArray(b.contractIds) ? (b.contractIds as string[]) : [];
      for (const id of list) ids.add(id);
    }
    return ids;
  }, [myRemittances]);

  const readyToRemitContracts = useMemo(() => {
    return soldContracts.filter((c) => !contractIdsInAnyBatch.has(c.id));
  }, [contractIdsInAnyBatch, soldContracts]);

  const pickableContracts = contractPickerView === "READY" ? readyToRemitContracts : soldContracts;

  const filteredSoldContracts = useMemo(() => {
    const query = contractSearch.trim().toLowerCase();
    if (!query) return pickableContracts;
    return pickableContracts.filter((c) => {
      const hay = [c.warrantyId, c.contractNumber, c.customerName]
        .map((x) => (x ?? "").toString().toLowerCase())
        .join(" ");
      return hay.includes(query);
    });
  }, [contractSearch, pickableContracts]);

  useEffect(() => {
    setSelected({});
    setContractSearch("");
  }, [contractPickerView]);

  const selectedIds = pickableContracts.filter((c) => selected[c.id]).map((c) => c.id);
  const selectedContracts = pickableContracts.filter((c) => selected[c.id]);

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
    if (status === "PAID") return "inline-flex items-center text-xs px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200";
    if (status === "APPROVED") return "inline-flex items-center text-xs px-2.5 py-1 rounded-full border bg-sky-50 text-sky-800 border-sky-200";
    if (status === "REJECTED") return "inline-flex items-center text-xs px-2.5 py-1 rounded-full border bg-rose-50 text-rose-700 border-rose-200";
    if (status === "SUBMITTED") return "inline-flex items-center text-xs px-2.5 py-1 rounded-full border bg-amber-50 text-amber-800 border-amber-200";
    return "inline-flex items-center text-xs px-2.5 py-1 rounded-full border bg-slate-50 text-slate-700 border-slate-200";
  };

  const remittanceTabs: RemittanceTabKey[] = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PAID"];
  const remittancePrintUrl = (id: string) => `/dealer-remittances/batches/${id}/print`;

  const remittancesForTab = useMemo(() => {
    const list =
      remittanceTab === "ALL"
        ? myRemittances
        : remittanceTab === "DRAFT"
          ? pending
          : remittanceTab === "SUBMITTED"
            ? submitted
            : remittanceTab === "APPROVED"
              ? approved
              : remittanceTab === "REJECTED"
                ? rejected
                : paid;

    const q = remittanceSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const hay = [r.batchNumber, providerShort(r.providerId)]
        .map((x) => (x ?? "").toString().toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [approved, myRemittances, paid, pending, rejected, remittanceSearch, remittanceTab, submitted]);

  return (
    <PageShell title="">
      <div className="relative">
        <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-blue-600/8 via-transparent to-yellow-400/8 blur-2xl" />

        <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
          <div className="px-6 py-5 border-b bg-gradient-to-r from-blue-600/8 via-transparent to-yellow-400/8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-semibold">Create Remittance</div>
                <div className="text-xs text-muted-foreground mt-0.5">Select sold contracts to create a new remittance batch.</div>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="inline-flex items-center rounded-lg border bg-muted/50 p-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setContractPickerView("READY")}
                  className={
                    "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 " +
                    (contractPickerView === "READY" 
                      ? "bg-blue-600 text-white shadow-sm" 
                      : "text-muted-foreground hover:bg-background")
                  }
                >
                  <CheckSquare className="h-4 w-4" />
                  Ready to remit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setContractPickerView("SOLD")}
                  className={
                    "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 " +
                    (contractPickerView === "SOLD" 
                      ? "bg-blue-600 text-white shadow-sm" 
                      : "text-muted-foreground hover:bg-background")
                  }
                >
                  <FileText className="h-4 w-4" />
                  All sold
                </button>
              </div>

              <div className="flex-1 min-w-[200px]">
                <Input
                  value={remittanceNumber}
                  onChange={(e) => setRemittanceNumber(e.target.value)}
                  placeholder="Remittance #"
                  disabled={busy}
                  className="h-10"
                />
              </div>

              <div className="w-[140px]">
                <Input value={amount} placeholder="0.00" inputMode="decimal" disabled={true} className="h-10" />
              </div>

              <Button
                className="bg-yellow-400 text-black hover:bg-yellow-300 h-10"
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
                <Plus className="h-4 w-4 mr-2" />
                Create Remittance
              </Button>
            </div>

            {createRemittanceMutation.isError ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <p className="text-sm text-destructive">
                  {createRemittanceMutation.error instanceof Error ? createRemittanceMutation.error.message : "Failed to create remittance"}
                </p>
              </div>
            ) : null}

            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-xs text-muted-foreground">Selected contracts</div>
                  <div className="text-sm font-medium mt-1">
                    {selectedIds.length} selected
                    {selectedProviderId && selectedProviderId !== "__multiple__" ? ` • ${providerShort(selectedProviderId)}` : ""}
                    {selectedProviderId === "__multiple__" ? " • Multiple providers" : ""}
                  </div>
                </div>
                <div className="text-sm font-semibold">Provider total {money(calculatedTotalCents)}</div>
              </div>
              {selectedProviderId === "__multiple__" ? (
                <div className="mt-2 text-sm text-destructive">A remittance can only include contracts from one provider. Uncheck contracts to continue.</div>
              ) : null}
            </div>

            <div className="rounded-xl border overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs text-muted-foreground">
                  {contractPickerView === "READY" ? "Showing ready-to-remit SOLD contracts." : "Showing all SOLD contracts."}
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

              <div className="max-h-[280px] overflow-auto">
                <div className="divide-y">
                  {filteredSoldContracts.map((c) => (
                    <div key={c.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm items-center hover:bg-muted/10 transition-colors">
                      <div className="col-span-1">
                        <button
                          type="button"
                          className="flex items-center justify-center"
                          onClick={() => {
                            const checked = !selected[c.id];
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
                        >
                          {selected[c.id] ? (
                            <CheckSquare className="h-5 w-5 text-blue-600" />
                          ) : (
                            <Square className="h-5 w-5 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                      <div className="col-span-4 font-medium truncate">{c.warrantyId}</div>
                      <div className="col-span-3 truncate">{c.customerName}</div>
                      <div className="col-span-3 text-xs text-muted-foreground truncate">{providerShort(c.providerId)}</div>
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

                  {contractsQuery.isLoading ? <div className="px-4 py-6 text-sm text-muted-foreground text-center">Loading…</div> : null}
                  {!contractsQuery.isLoading && soldContracts.length === 0 ? (
                    <div className="px-4 py-10 text-sm text-muted-foreground text-center">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <div className="font-medium text-foreground">No SOLD contracts yet</div>
                      <div className="mt-1">Sell a contract in the Contracts page, then come back here.</div>
                      <div className="mt-3">
                        <Button size="sm" variant="outline" asChild>
                          <Link to="/dealer-contracts?tab=SOLD">Go to Contracts</Link>
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {!contractsQuery.isLoading && soldContracts.length > 0 && filteredSoldContracts.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-muted-foreground text-center">No SOLD contracts match your search.</div>
                  ) : null}
                  {contractsQuery.isError ? <div className="px-4 py-6 text-sm text-destructive text-center">Failed to load contracts.</div> : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border bg-card shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b bg-muted/20">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Remittance History</span>
              </div>
              <div className="w-full sm:w-[260px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    value={remittanceSearch} 
                    onChange={(e) => setRemittanceSearch(e.target.value)} 
                    placeholder="Search remittances..." 
                    disabled={busy}
                    className="h-9 pl-9"
                  />
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {remittanceTabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setRemittanceTab(t)}
                  className={
                    "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm border transition-all duration-200 " +
                    (remittanceTab === t
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                      : "bg-background hover:bg-muted/50 border-transparent text-muted-foreground")
                  }
                >
                  <span className="font-medium">{remittanceTabLabel(t)}</span>
                  <span className="text-xs opacity-70">({remittanceCounts[t]})</span>
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/10">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Remittance #</th>
                  <th className="px-5 py-3 text-left font-medium">Provider</th>
                  <th className="px-5 py-3 text-center font-medium">Contracts</th>
                  <th className="px-5 py-3 text-right font-medium">Batch Total</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                  <th className="px-5 py-3 text-left font-medium">Date</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {remittancesForTab.map((r) => {
                  const workflow = derivedWorkflow(r);
                  return (
                    <tr key={r.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-5 py-3.5 font-medium">{r.batchNumber}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{providerShort(r.providerId)}</td>
                      <td className="px-5 py-3.5 text-center">{Array.isArray(r.contractIds) ? r.contractIds.length : 0}</td>
                      <td className="px-5 py-3.5 text-right font-medium">{money(r.totalCents)}</td>
                      <td className="px-5 py-3.5">
                        <span className={statusBadge(workflow)}>{remittanceTabLabel(workflow)}</span>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {new Date((r.submittedAt ?? r.createdAt) as string).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link to={remittancePrintUrl(r.id)}>
                              <FileText className="h-3.5 w-3.5 mr-1" />
                              Download
                            </Link>
                          </Button>
                          {workflow === "DRAFT" ? (
                            <Button
                              size="sm"
                              className="bg-yellow-400 text-black hover:bg-yellow-300"
                              onClick={() => {
                                void (async () => {
                                  if (!(await confirmProceed(`Submit remittance ${r.batchNumber}?`))) return;
                                  submitRemittanceMutation.mutate(r.id);
                                })();
                              }}
                              disabled={submitRemittanceMutation.isPending}
                            >
                              <RefreshCw className="h-3.5 w-3.5 mr-1" />
                              Submit
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {batchesQuery.isLoading ? (
                  <tr>
                    <td className="px-5 py-8 text-sm text-muted-foreground text-center" colSpan={7}>
                      Loading…
                    </td>
                  </tr>
                ) : null}
                {!batchesQuery.isLoading && remittancesForTab.length === 0 ? (
                  <tr>
                    <td className="px-5 py-10 text-sm text-muted-foreground text-center" colSpan={7}>
                      No remittances found.
                    </td>
                  </tr>
                ) : null}
                {batchesQuery.isError ? (
                  <tr>
                    <td className="px-5 py-8 text-sm text-destructive text-center" colSpan={7}>
                      Failed to load remittances.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
