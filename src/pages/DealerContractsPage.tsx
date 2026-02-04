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

  const filtered = tab === "ALL" ? visibleContracts : visibleContracts.filter((c) => c.status === tab);

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
      <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b">
            <div className="font-semibold">New Contract</div>
            <div className="text-sm text-muted-foreground mt-1">Start by decoding the VIN to see which coverages are eligible.</div>
          </div>

          {selectedProduct ? (
            <div className="px-6 py-4 border-b bg-muted/20">
              <div className="text-xs text-muted-foreground">Selected product</div>
              <div className="text-sm font-medium text-foreground mt-1">{selectedProduct.name}</div>
              <div className="text-xs text-muted-foreground mt-1">This will be attached to the draft contract.</div>
              <div className="mt-2">
                <Button size="sm" variant="outline" asChild>
                  <Link to="/dealer-marketplace">Change product</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="px-6 py-4 border-b bg-muted/10">
              <div className="text-sm text-muted-foreground">
                No product selected yet.
                <Button size="sm" variant="outline" asChild className="ml-2">
                  <Link to="/dealer-marketplace">Find Products</Link>
                </Button>
              </div>
            </div>
          )}

          <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-4 gap-3">
            <Input
              value={vin}
              onChange={(e) => setVin(e.target.value)}
              placeholder="VIN (17 characters)"
            />
            <div className="hidden md:block" />
            <div className="hidden md:block" />
            <Button
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
              Create Draft
            </Button>
          </div>

          {createMutation.isError ? (
            <div className="px-6 pb-6 text-sm text-destructive">
              {createMutation.error instanceof Error ? createMutation.error.message : "Failed to create draft"}
            </div>
          ) : null}
        </div>

      <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold">Contracts</div>
              <div className="text-sm text-muted-foreground mt-1">Filter by lifecycle status and open a contract to manage it.</div>
            </div>

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
                  <div className="md:col-span-2 text-sm font-medium text-foreground">{c.contractNumber}</div>

                  <div className="md:col-span-2 text-sm text-foreground">{c.customerName}</div>

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
                      <Link to={`/dealer-contracts/${c.id}`}>View</Link>
                    </Button>
                    <Button size="sm" asChild>
                      <Link to={`/dealer-contracts/${c.id}/print/customer`}>Download</Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {listQuery.isLoading ? (
              <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div>
            ) : null}

            {!listQuery.isLoading && filtered.length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted-foreground">No contracts in this view yet.</div>
            ) : null}

            {listQuery.isError ? (
              <div className="px-6 py-6 text-sm text-destructive">Failed to load contracts.</div>
            ) : null}
          </div>
        </div>
    </PageShell>
  );
}
