import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { getContractsApi } from "../lib/contracts/contracts";
import { getMarketplaceApi } from "../lib/marketplace/marketplace";
import { getProvidersApi } from "../lib/providers/providers";
import type { ProviderPublic } from "../lib/providers/types";
import { decodeVin } from "../lib/vin/decodeVin";
import { alertMissing, confirmProceed } from "../lib/utils";
import { getAppMode } from "../lib/runtime";
import { useAuth } from "../providers/AuthProvider";
import type { Contract, ContractStatus } from "../lib/contracts/types";
import type { Product } from "../lib/products/types";

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

type TabKey = "ALL" | ContractStatus;

function labelForTab(t: TabKey) {
  if (t === "ALL") return "All";
  if (t === "DRAFT") return "Draft";
  if (t === "SOLD") return "Sold";
  if (t === "REMITTED") return "Remitted";
  return "Paid";
}

function statusPillClass(s: ContractStatus) {
  if (s === "DRAFT") return "bg-blue-50 text-blue-700 border-blue-200";
  if (s === "SOLD") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "REMITTED") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function generateContractNumber(existing: Set<string>) {
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const d = new Date();
  const ymd = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;

  for (let i = 0; i < 25; i += 1) {
    const rnd = Math.floor(1000 + Math.random() * 9000);
    const cn = `CN-${ymd}-${rnd}`;
    if (!existing.has(cn)) return cn;
  }

  const fallback = `CN-${ymd}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  return fallback;
}

export function DealerContractsPage() {
  const api = useMemo(() => getContractsApi(), []);
  const marketplaceApi = useMemo(() => getMarketplaceApi(), []);
  const providersApi = useMemo(() => getProvidersApi(), []);
  const qc = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();

  const mode = useMemo(() => getAppMode(), []);

  const [searchParams] = useSearchParams();
  const defaultTab = (searchParams.get("tab")?.toUpperCase() ?? "ALL") as TabKey;
  const preselectedProductId = (searchParams.get("productId") ?? "").trim();
  const prefilledVin = (searchParams.get("vin") ?? "").trim();

  const [tab, setTab] = useState<TabKey>(defaultTab);
  const [vin, setVin] = useState(prefilledVin);
  const [q, setQ] = useState("");

  const listQuery = useQuery({
    queryKey: ["contracts"],
    queryFn: () => api.list(),
  });

  const productsQuery = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: () => marketplaceApi.listPublishedProducts(),
  });

  const products = (productsQuery.data ?? []) as Product[];
  const selectedProduct = preselectedProductId ? products.find((p) => p.id === preselectedProductId) : undefined;

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p] as const)), [products]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const uid = (user?.id ?? "").trim();
      const uem = (user?.email ?? "").trim().toLowerCase();
      const existing = new Set(
        (((listQuery.data ?? []) as Contract[]) || [])
          .filter((c) => {
            const byId = (c.createdByUserId ?? "").trim();
            const byEmail = (c.createdByEmail ?? "").trim().toLowerCase();
            if (uid && byId) return byId === uid;
            if (uem && byEmail) return byEmail === uem;
            return false;
          })
          .map((c) => c.contractNumber)
          .filter(Boolean),
      );
      const cn = generateContractNumber(existing);

      const v = vin.trim();
      if (!v) throw new Error("VIN is required");

      const decoded = await decodeVin(v);

      return api.create({
        contractNumber: cn,
        customerName: "",
        dealerId: user?.dealerId,
        productId: selectedProduct?.id,
        providerId: selectedProduct?.providerId,
        createdByUserId: user?.id,
        createdByEmail: user?.email,
        vin: decoded.vin,
        vehicleYear: decoded.vehicleYear,
        vehicleMake: decoded.vehicleMake,
        vehicleModel: decoded.vehicleModel,
        vehicleTrim: decoded.vehicleTrim,
        vehicleBodyClass: decoded.vehicleBodyClass,
        vehicleEngine: decoded.vehicleEngine,
        vehicleTransmission: decoded.vehicleTransmission,
      });
    },
    onSuccess: async (created) => {
      setVin("");
      await qc.invalidateQueries({ queryKey: ["contracts"] });
      if (created?.id) navigate(`/dealer-contracts/${created.id}`);
    },
  });

  const contracts = (listQuery.data ?? []) as Contract[];
  const myContracts = contracts.filter((c) => {
    const byId = (c.createdByUserId ?? "").trim();
    const byEmail = (c.createdByEmail ?? "").trim().toLowerCase();
    const uid = (user?.id ?? "").trim();
    const uem = (user?.email ?? "").trim().toLowerCase();
    if (uid && byId) return byId === uid;
    if (uem && byEmail) return byEmail === uem;
    return false;
  });

  const visibleContracts = (() => {
    if (!user) return [] as Contract[];
    if (user.role !== "DEALER_ADMIN") return myContracts;
    if (mode !== "local") return myContracts;
    const did = (user.dealerId ?? "").trim();
    if (!did) return myContracts;
    const ids = dealershipUserIds(did);
    return contracts.filter((c) => {
      const cdid = (c.dealerId ?? "").trim();
      if (cdid && cdid === did) return true;
      const byId = (c.createdByUserId ?? "").trim();
      return byId && ids.has(byId);
    });
  })();

  const searched = (() => {
    const query = q.trim().toLowerCase();
    if (!query) return visibleContracts;
    return visibleContracts.filter((c) => {
      const hay = [
        c.warrantyId,
        c.contractNumber,
        c.customerName,
        c.vin,
        c.vehicleYear,
        c.vehicleMake,
        c.vehicleModel,
        c.vehicleTrim,
      ]
        .map((x) => (x ?? "").toString().toLowerCase())
        .join(" ");
      return hay.includes(query);
    });
  })();

  const filtered = tab === "ALL" ? searched : searched.filter((c) => c.status === tab);

  const contractCounts = useMemo(() => {
    const all = visibleContracts;
    return {
      ALL: all.length,
      DRAFT: all.filter((c) => c.status === "DRAFT").length,
      SOLD: all.filter((c) => c.status === "SOLD").length,
      REMITTED: all.filter((c) => c.status === "REMITTED").length,
      PAID: all.filter((c) => c.status === "PAID").length,
    };
  }, [visibleContracts]);

  const providerIds = Array.from(
    new Set(
      filtered
        .map((c) => (c.providerId ?? "").trim())
        .filter(Boolean),
    ),
  );

  const providersQuery = useQuery({
    queryKey: ["providers", providerIds.join(",")],
    queryFn: () => providersApi.listByIds(providerIds),
    enabled: providerIds.length > 0,
  });

  const providerById = new Map(((providersQuery.data ?? []) as ProviderPublic[]).map((p) => [p.id, p] as const));

  const providerDisplay = (id: string | undefined) => {
    if (!id) return "—";
    const p = providerById.get(id);
    const company = (p?.companyName ?? "").trim();
    if (company) return company;
    const display = (p?.displayName ?? "").trim();
    if (display) return display;
    return `Provider ${id.slice(0, 8)}`;
  };

  const tabs: TabKey[] = ["ALL", "DRAFT", "SOLD", "REMITTED", "PAID"];

  const tabCount = (t: TabKey) => {
    if (t === "ALL") return contractCounts.ALL;
    return contractCounts[t];
  };

  return (
    <PageShell
      badge="Dealer Portal"
      title="Contracts"
      subtitle="Draft → Sold → Remitted → Paid"
      actions={
        <Button variant="outline" asChild>
          <Link to="/dealer-dashboard">Back to Dashboard</Link>
        </Button>
      }
    >
      <div className="relative">
        <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-blue-600/10 via-transparent to-yellow-400/10 blur-2xl" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-yellow-500/10">
            <div className="px-6 py-4 border-b bg-gradient-to-r from-yellow-500/10 to-blue-600/10">
              <div className="font-semibold">New Contract</div>
              <div className="text-sm text-muted-foreground mt-1">Enter a VIN, then create a draft and fill out the customer info.</div>
            </div>

            <div className="p-6 space-y-4">
              {selectedProduct ? (
                <div className="rounded-xl border p-4 bg-muted/10">
                  <div className="text-xs text-muted-foreground">Selected plan</div>
                  <div className="text-sm font-medium text-foreground mt-1">{selectedProduct.name}</div>
                  <div className="mt-3">
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/dealer-marketplace">Change plan</Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border p-4 bg-muted/10">
                  <div className="text-sm text-muted-foreground">No plan selected yet.</div>
                  <div className="mt-3">
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/dealer-marketplace">Find products</Link>
                    </Button>
                  </div>
                </div>
              )}

              <div>
                <div className="text-xs text-muted-foreground mb-1">VIN</div>
                <Input value={vin} onChange={(e) => setVin(e.target.value)} placeholder="VIN (17 characters)" />
              </div>

              <Button
                className="w-full bg-yellow-400 text-black hover:bg-yellow-300"
                onClick={() => {
                  void (async () => {
                    const v = vin.trim();
                    if (!v) return alertMissing("VIN is required.");
                    if (!(await confirmProceed("Decode VIN and create Draft contract?"))) return;
                    createMutation.mutate();
                  })();
                }}
                disabled={createMutation.isPending}
              >
                Create draft
              </Button>

              {createMutation.isError ? (
                <div className="text-sm text-destructive">
                  {createMutation.error instanceof Error ? createMutation.error.message : "Failed to create draft"}
                </div>
              ) : null}

              <div className="rounded-xl border p-4 bg-gradient-to-br from-blue-600/5 via-transparent to-yellow-400/10">
                <div className="font-medium text-foreground">Quick status</div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  {tabs.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTab(t)}
                      className={
                        "rounded-xl border p-3 text-left transition-colors " +
                        (tab === t ? "bg-muted/50 border-blue-500/30" : "bg-background hover:bg-muted/30")
                      }
                    >
                      <div className="text-xs text-muted-foreground">{labelForTab(t)}</div>
                      <div className="text-lg font-semibold text-foreground mt-1">{tabCount(t)}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
            <div className="px-6 py-4 border-b flex items-start justify-between gap-4 flex-wrap bg-gradient-to-r from-blue-600/10 via-transparent to-yellow-500/10">
              <div>
                <div className="font-semibold">Contracts</div>
                <div className="text-sm text-muted-foreground mt-1">Search and open a contract to manage it.</div>
              </div>
              <div className="w-full sm:w-[320px]">
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search (name, VIN, contract #)…" />
              </div>
            </div>

            <div className="px-6 py-4 border-b">
              <div className="flex items-center gap-2 flex-wrap">
                {tabs.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={
                      "text-sm px-3 py-1.5 rounded-lg border transition-colors " +
                      (tab === t
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted text-muted-foreground")
                    }
                  >
                    {labelForTab(t)}
                    <span className="ml-2 text-xs opacity-70">{tabCount(t)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 border-b text-xs text-muted-foreground">
              <div className="col-span-2">Contract #</div>
              <div className="col-span-2">Customer</div>
              <div className="col-span-3">Product</div>
              <div className="col-span-2">Provider</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1">Created</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>

            <div className="divide-y">
              {filtered.map((c) => (
                <div key={c.id} className="px-6 py-4">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                    <div className="md:col-span-2">
                      <div className="text-sm font-medium text-foreground">{c.contractNumber}</div>
                      <div className="text-xs text-muted-foreground mt-1">{c.warrantyId}</div>
                    </div>

                    <div className="md:col-span-2 text-sm text-foreground">{c.customerName || "—"}</div>

                    <div className="md:col-span-3 text-sm text-muted-foreground">
                      {(() => {
                        const pid = (c.productId ?? "").trim();
                        const p = pid ? productById.get(pid) : undefined;
                        return p?.name ?? (pid ? "Selected product" : "—");
                      })()}
                    </div>

                    <div className="md:col-span-2 text-sm text-muted-foreground">{providerDisplay(c.providerId)}</div>

                    <div className="md:col-span-1">
                      <span className={"inline-flex items-center text-xs px-2 py-1 rounded-md border " + statusPillClass(c.status)}>
                        {labelForTab(c.status)}
                      </span>
                    </div>

                    <div className="md:col-span-1 text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</div>

                    <div className="md:col-span-1 flex md:justify-end gap-2">
                      <Button size="sm" variant="outline" asChild>
                        <Link to={`/dealer-contracts/${c.id}`}>Open</Link>
                      </Button>
                      <Button size="sm" asChild className="bg-yellow-400 text-black hover:bg-yellow-300">
                        <Link to={`/dealer-contracts/${c.id}/print/customer`}>Download</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              {listQuery.isLoading ? <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div> : null}

              {!listQuery.isLoading && filtered.length === 0 ? (
                <div className="px-6 py-10 text-sm text-muted-foreground">No contracts found.</div>
              ) : null}

              {listQuery.isError ? <div className="px-6 py-6 text-sm text-destructive">Failed to load contracts.</div> : null}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
