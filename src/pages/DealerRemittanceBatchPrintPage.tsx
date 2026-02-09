import { useEffect, useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { getBatchesApi } from "../lib/batches/batches";
import type { Batch } from "../lib/batches/types";
import { getContractsApi } from "../lib/contracts/contracts";
import type { Contract } from "../lib/contracts/types";
import { getMarketplaceApi } from "../lib/marketplace/marketplace";
import type { Product } from "../lib/products/types";
import { BRAND } from "../lib/brand";
import { getAppMode } from "../lib/runtime";
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

export function DealerRemittanceBatchPrintPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const batchId = id ?? "";

  const mode = useMemo(() => getAppMode(), []);

  if (!user) return <Navigate to="/sign-in" replace />;
  if (user.role !== "DEALER_ADMIN") return <Navigate to="/dealer-dashboard" replace />;

  const batchesApi = useMemo(() => getBatchesApi(), []);
  const contractsApi = useMemo(() => getContractsApi(), []);
  const marketplaceApi = useMemo(() => getMarketplaceApi(), []);

  const batchesQuery = useQuery({
    queryKey: ["batches"],
    queryFn: () => batchesApi.list(),
  });

  const contractsQuery = useQuery({
    queryKey: ["contracts"],
    queryFn: () => contractsApi.list(),
  });

  const productsQuery = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: () => marketplaceApi.listPublishedProducts(),
  });

  const batch = ((batchesQuery.data ?? []) as Batch[]).find((b) => b.id === batchId);
  const contracts = (contractsQuery.data ?? []) as Contract[];
  const products = (productsQuery.data ?? []) as Product[];

  const uid = (user?.id ?? "").trim();
  const uem = (user?.email ?? "").trim().toLowerCase();
  const isMine = (c: Contract) => {
    const byId = (c.createdByUserId ?? "").trim();
    const byEmail = (c.createdByEmail ?? "").trim().toLowerCase();
    if (uid && byId) return byId === uid;
    if (uem && byEmail) return byEmail === uem;
    return false;
  };

  const canViewContract = (c: Contract) => {
    if (!user) return false;
    if (user.role !== "DEALER_ADMIN") return isMine(c);
    if (mode !== "local") return isMine(c);

    const did = (user.dealerId ?? "").trim();
    if (!did) return isMine(c);
    const ids = dealershipUserIds(did);
    const cdid = (c.dealerId ?? "").trim();
    if (cdid && cdid === did) return true;
    const byId = (c.createdByUserId ?? "").trim();
    return byId && ids.has(byId);
  };

  const visibleContractIds = new Set(contracts.filter(canViewContract).map((c) => c.id));
  const unauthorized = batch != null && batch.contractIds.some((cid) => !visibleContractIds.has(cid));

  const contractById = new Map(contracts.map((c) => [c.id, c] as const));
  const productById = new Map(products.map((p) => [p.id, p] as const));

  const lines = batch
    ? batch.contractIds.map((cid) => {
        const c = contractById.get(cid);
        const pid = (c?.productId ?? "").trim();
        const p = pid ? productById.get(pid) : undefined;
        const amountCents =
          typeof c?.pricingDealerCostCents === "number"
            ? c.pricingDealerCostCents
            : typeof c?.pricingBasePriceCents === "number"
              ? c.pricingBasePriceCents
              : 0;
        const addonCostCents = typeof c?.addonTotalCostCents === "number" ? c.addonTotalCostCents : 0;
        return {
          id: cid,
          warrantyId: c?.warrantyId ?? "—",
          contractNumber: c?.contractNumber ?? "—",
          customerName: c?.customerName ?? "—",
          productName: p?.name ?? "—",
          amountCents: amountCents + addonCostCents,
        };
      })
    : [];

  useEffect(() => {
    if (!batch) return;
    const t = window.setTimeout(() => {
      window.print();
    }, 250);
    return () => window.clearTimeout(t);
  }, [batch]);

  if (batchesQuery.isLoading || contractsQuery.isLoading || productsQuery.isLoading) {
    return <div className="container mx-auto px-4 py-10 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!batch || unauthorized) {
    return <div className="container mx-auto px-4 py-10 text-sm text-muted-foreground">Batch not found.</div>;
  }

  const createdAt = new Date(batch.createdAt).toLocaleString();

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="max-w-5xl mx-auto p-8">
        <div className="border rounded-xl overflow-hidden">
          <div className="px-6 py-5 border-b">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{BRAND.name}</div>
                <h1 className="text-xl font-bold font-display mt-1">Remittance • Submission Summary</h1>
                <div className="text-sm text-slate-500 mt-1">Generated for submission and audit trail.</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Remittance #</div>
                <div className="text-sm font-semibold">{batch.batchNumber}</div>
                <div className="text-[11px] text-slate-500 mt-1">Created {createdAt}</div>
              </div>
            </div>
          </div>

          <div className="px-6 py-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="rounded-lg border p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Remittance Amount</div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-slate-600">Amount</div>
                    <div className="font-semibold">{money(batch.totalCents)}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Status</div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-slate-600">Remittance status</div>
                    <div className="font-medium">{batch.status === "CLOSED" ? "Submitted" : "Pending"}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Contracts</div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-slate-600">Count</div>
                    <div className="font-medium">{batch.contractIds.length}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 border rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b text-[11px] uppercase tracking-wide text-slate-500">
                <div className="col-span-2">Warranty ID</div>
                <div className="col-span-2">Contract #</div>
                <div className="col-span-4">Customer</div>
                <div className="col-span-3">Product</div>
                <div className="col-span-1 text-right">Amount</div>
              </div>

              <div className="divide-y">
                {lines.map((l) => (
                  <div key={l.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm items-center">
                    <div className="col-span-2 font-medium">{l.warrantyId}</div>
                    <div className="col-span-2">{l.contractNumber}</div>
                    <div className="col-span-4">{l.customerName}</div>
                    <div className="col-span-3 text-slate-600">{l.productName}</div>
                    <div className="col-span-1 text-right font-medium">{money(l.amountCents)}</div>
                  </div>
                ))}

                {lines.length === 0 ? <div className="px-4 py-6 text-sm text-slate-500">No contracts in this batch.</div> : null}
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t text-[11px] text-slate-500">
            Generated by {BRAND.name} • Keep this copy for audit and reconciliation.
          </div>
        </div>
      </div>
    </div>
  );
}
