import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { getContractsApi } from "../lib/contracts/contracts";
import { getMarketplaceApi } from "../lib/marketplace/marketplace";
import { getProvidersApi } from "../lib/providers/providers";
import type { Contract } from "../lib/contracts/types";
import type { Product } from "../lib/products/types";
import type { ProviderPublic } from "../lib/providers/types";
import { BRAND } from "../lib/brand";
import { getAppMode } from "../lib/runtime";
import { useAuth } from "../providers/AuthProvider";

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

type CopyType = "dealer" | "provider" | "customer";

function titleForCopyType(t: CopyType) {
  if (t === "dealer") return "Dealer Copy";
  if (t === "provider") return "Provider Copy";
  return "Customer Copy";
}

export function DealerContractPrintPage() {
  const { user } = useAuth();
  const { id, copyType } = useParams();
  const contractId = id ?? "";
  const type = (copyType ?? "dealer") as CopyType;

  const mode = useMemo(() => getAppMode(), []);
  const isEmployee = user?.role === "DEALER_EMPLOYEE";

  const api = useMemo(() => getContractsApi(), []);
  const marketplaceApi = useMemo(() => getMarketplaceApi(), []);
  const providersApi = useMemo(() => getProvidersApi(), []);

  const contractQuery = useQuery({
    queryKey: ["contract", contractId],
    enabled: !!contractId,
    queryFn: () => api.get(contractId),
  });

  const productsQuery = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: () => marketplaceApi.listPublishedProducts(),
  });

  const contract = contractQuery.data as Contract | null | undefined;

  const products = (productsQuery.data ?? []) as Product[];
  const productById = new Map(products.map((p) => [p.id, p] as const));
  const selectedProduct = (() => {
    const pid = (contract?.productId ?? "").trim();
    return pid ? productById.get(pid) : undefined;
  })();

  const providerIds = Array.from(
    new Set(
      [contract?.providerId, selectedProduct?.providerId]
        .map((x) => (x ?? "").trim())
        .filter(Boolean),
    ),
  );

  const providersQuery = useQuery({
    queryKey: ["providers", providerIds.join(",")],
    queryFn: () => providersApi.listByIds(providerIds),
    enabled: providerIds.length > 0,
  });

  const providers = (providersQuery.data ?? []) as ProviderPublic[];
  const providerById = new Map(providers.map((p) => [p.id, p] as const));

  const providerDisplay = (id: string | undefined) => {
    const pid = (id ?? "").trim();
    if (!pid) return "—";
    const p = providerById.get(pid);
    const company = (p?.companyName ?? "").trim();
    if (company) return company;
    const display = (p?.displayName ?? "").trim();
    if (display) return display;
    return `Provider ${pid.slice(0, 8)}`;
  };

  const money = (cents?: number) => {
    if (typeof cents !== "number") return "—";
    return `$${(cents / 100).toFixed(2)}`;
  };

  const uid = (user?.id ?? "").trim();
  const uem = (user?.email ?? "").trim().toLowerCase();
  const isMine = (c: Contract) => {
    const byId = (c.createdByUserId ?? "").trim();
    const byEmail = (c.createdByEmail ?? "").trim().toLowerCase();
    if (uid && byId) return byId === uid;
    if (uem && byEmail) return byEmail === uem;
    return false;
  };

  const canView = (c: Contract) => {
    if (!user) return false;
    if (isEmployee) return isMine(c);
    if (user.role !== "DEALER_ADMIN") return isMine(c);
    if (mode !== "local") return isMine(c);

    const did = (user.dealerId ?? "").trim();
    if (!did) return isMine(c);

    const cdid = (c.dealerId ?? "").trim();
    if (cdid && cdid === did) return true;

    const ids = dealershipUserIds(did);
    const byId = (c.createdByUserId ?? "").trim();
    return Boolean(byId) && ids.has(byId);
  };

  useEffect(() => {
    if (!contract) return;
    const t = window.setTimeout(() => {
      window.print();
    }, 250);
    return () => window.clearTimeout(t);
  }, [contract]);

  if (contractQuery.isLoading) {
    return <div className="container mx-auto px-4 py-10 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!contract || !canView(contract) || (isEmployee && type === "provider")) {
    return <div className="container mx-auto px-4 py-10 text-sm text-muted-foreground">Contract not found.</div>;
  }

  const vehicleLine = [contract.vehicleYear, contract.vehicleMake, contract.vehicleModel, contract.vehicleTrim]
    .filter(Boolean)
    .join(" ");

  const addressLine = [
    contract.customerAddress,
    contract.customerCity,
    contract.customerProvince,
    contract.customerPostalCode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="max-w-4xl mx-auto p-8">
        <div className="border rounded-xl overflow-hidden">
          <div className="px-6 py-5 border-b">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{BRAND.name}</div>
                <h1 className="text-xl font-bold font-display mt-1">Warranty Contract • {titleForCopyType(type)}</h1>
                <div className="text-sm text-slate-500 mt-1">Printed copy for records and audit trail.</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Warranty ID</div>
                <div className="text-sm font-semibold">{contract.warrantyId}</div>
                <div className="text-[11px] text-slate-500 mt-1">Contract #{contract.contractNumber}</div>
              </div>
            </div>
          </div>

          <div className="px-6 py-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-lg border p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Contract Details</div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[11px] text-slate-500">Status</div>
                    <div className="font-medium">{contract.status}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Created</div>
                    <div className="font-medium">{new Date(contract.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Last Updated</div>
                    <div className="font-medium">{new Date(contract.updatedAt).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Copy Type</div>
                    <div className="font-medium">{titleForCopyType(type)}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Customer Information</div>
                <div className="mt-3 space-y-2 text-sm">
                  <div>
                    <div className="text-[11px] text-slate-500">Name</div>
                    <div className="font-medium">{contract.customerName || "—"}</div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] text-slate-500">Email</div>
                      <div className="font-medium">{contract.customerEmail || "—"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">Phone</div>
                      <div className="font-medium">{contract.customerPhone || "—"}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Address</div>
                    <div className="font-medium">{addressLine || "—"}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-lg border p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Plan & Pricing</div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                <div>
                  <div className="text-[11px] text-slate-500">Product</div>
                  <div className="font-medium">{selectedProduct?.name ?? "—"}</div>
                  <div className="text-[11px] text-slate-500 mt-1">Provider: {providerDisplay(selectedProduct?.providerId ?? contract.providerId)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">{type === "provider" ? "Provider cost" : "Retail price"}</div>
                  <div className="font-medium">
                    {type === "provider" ? money(contract.pricingDealerCostCents) : money(contract.pricingBasePriceCents)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Deductible: {money(contract.pricingDeductibleCents ?? selectedProduct?.deductibleCents)}</div>
                </div>
              </div>
              <div className="mt-3 text-[11px] text-slate-500">
                Term: {typeof contract.pricingTermMonths === "number" ? `${contract.pricingTermMonths} mo` : "—"} / {typeof contract.pricingTermKm === "number" ? `${contract.pricingTermKm} km` : "—"}
              </div>
            </div>

            <div className="mt-6 rounded-lg border p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Vehicle Information</div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-[11px] text-slate-500">VIN</div>
                  <div className="font-medium">{contract.vin || "—"}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-[11px] text-slate-500">Vehicle</div>
                  <div className="font-medium">{vehicleLine || "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Body Class</div>
                  <div className="font-medium">{contract.vehicleBodyClass || "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Engine</div>
                  <div className="font-medium">{contract.vehicleEngine || "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Transmission</div>
                  <div className="font-medium">{contract.vehicleTransmission || "—"}</div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-lg border p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Dealer Signature</div>
                <div className="mt-6 border-b border-slate-300" />
                <div className="mt-2 grid grid-cols-2 gap-3 text-[11px] text-slate-500">
                  <div>Name / Title</div>
                  <div>Date</div>
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Customer Signature</div>
                <div className="mt-6 border-b border-slate-300" />
                <div className="mt-2 grid grid-cols-2 gap-3 text-[11px] text-slate-500">
                  <div>Signature</div>
                  <div>Date</div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t text-[11px] text-slate-500">
            Generated by {BRAND.name} • Keep this copy for your records.
          </div>
        </div>
      </div>
    </div>
  );
}
