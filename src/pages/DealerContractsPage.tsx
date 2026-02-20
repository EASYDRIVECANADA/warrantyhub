import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2 } from "lucide-react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { getBatchesApi } from "../lib/batches/batches";
import type { Batch } from "../lib/batches/types";
import { getContractsApi } from "../lib/contracts/contracts";
import { getMarketplaceApi } from "../lib/marketplace/marketplace";
import type { MarketplaceProduct } from "../lib/marketplace/api";
import { getProvidersApi } from "../lib/providers/providers";
import type { ProviderPublic } from "../lib/providers/types";
import { costFromProductOrPricing, retailFromCost } from "../lib/dealerPricing";
import { useDealerMarkupPct } from "../lib/dealerMarkup";
import { getProductPricingApi } from "../lib/productPricing/productPricing";
import type { ProductPricing } from "../lib/productPricing/types";
import { defaultPricingRow } from "../lib/productPricing/defaultRow";
import { confirmProceed } from "../lib/utils";
import { getAppMode } from "../lib/runtime";
import { useAuth } from "../providers/AuthProvider";
import type { Contract, ContractStatus } from "../lib/contracts/types";
import { getProductAddonsApi } from "../lib/productAddons/productAddons";
import { decodeVin } from "../lib/vin/decodeVin";

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

type QuickFilterKey = "ALL" | "DRAFT" | "ACTIVE" | "COMPLETED" | "MISSING_INFO" | "READY_TO_REMIT";

function uiStatusLabel(s: ContractStatus) {
  if (s === "DRAFT") return "Draft";
  if (s === "PAID") return "Completed";
  return "Active";
}

function statusPillClass(s: ContractStatus) {
  if (s === "DRAFT") return "bg-blue-50 text-blue-700 border-blue-200";
  if (s === "PAID") return "bg-slate-50 text-slate-700 border-slate-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function statusTooltip(s: ContractStatus) {
  if (s === "DRAFT") return "Draft in progress";
  if (s === "SOLD") return "Active contract";
  if (s === "REMITTED") return "Active (submitted for remittance)";
  return "Completed";
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
  const batchesApi = useMemo(() => getBatchesApi(), []);
  const marketplaceApi = useMemo(() => getMarketplaceApi(), []);
  const providersApi = useMemo(() => getProvidersApi(), []);
  const productPricingApi = useMemo(() => getProductPricingApi(), []);
  const productAddonsApi = useMemo(() => getProductAddonsApi(), []);
  const qc = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();

  const mode = useMemo(() => getAppMode(), []);

  const dealerId = (mode === "local" ? (user?.dealerId ?? user?.id ?? "") : user?.dealerId ?? "").trim();
  const { markupPct } = useDealerMarkupPct(dealerId);

  const [searchParams] = useSearchParams();
  const preselectedProductId = (searchParams.get("productId") ?? "").trim();
  const preselectedProductPricingId = (searchParams.get("productPricingId") ?? "").trim();
  const prefilledVin = (searchParams.get("vin") ?? "").trim();
  const preselectedAddonIds = (searchParams.get("addonIds") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const [q, setQ] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilterKey>("ALL");

  const didAutoCreateRef = useRef(false);

  const listQuery = useQuery({
    queryKey: ["contracts"],
    queryFn: () => api.list(),
  });

  const batchesQuery = useQuery({
    queryKey: ["batches"],
    queryFn: () => batchesApi.list(),
  });

  const productsQuery = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: () => marketplaceApi.listPublishedProducts(),
  });

  const products = (productsQuery.data ?? []) as MarketplaceProduct[];
  const selectedProduct = preselectedProductId ? products.find((p) => p.id === preselectedProductId) : undefined;

  const productNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) {
      const id = (p?.id ?? "").trim();
      const name = (p?.name ?? "").trim();
      if (id) m.set(id, name || id);
    }
    return m;
  }, [products]);

  const createFromMarketplaceMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      if (!selectedProduct) throw new Error("Selected product not found");

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

      const selectedProductId = (selectedProduct.id ?? "").trim();
      let defaultPricing: ProductPricing | null = null;
      if (selectedProductId) {
        const rows = (await productPricingApi.list({ productId: selectedProductId })) as ProductPricing[];

        const preselectedRow = preselectedProductPricingId
          ? rows.find((r) => (r.id ?? "").trim() === preselectedProductPricingId)
          : undefined;
        if (preselectedRow) {
          defaultPricing = preselectedRow;
        } else {
          defaultPricing = defaultPricingRow(rows);
          if (!defaultPricing) throw new Error("Selected product has no pricing rows");
        }

      }

      let decoded: Awaited<ReturnType<typeof decodeVin>> | null = null;
      const v = prefilledVin.trim();
      if (v) {
        decoded = await decodeVin(v);
      }

      const costCents = defaultPricing
        ? costFromProductOrPricing({
            dealerCostCents: defaultPricing.dealerCostCents,
            basePriceCents: defaultPricing.basePriceCents,
          })
        : undefined;

      const retailCents = typeof costCents === "number" ? (retailFromCost(costCents, markupPct) ?? costCents) : undefined;

      let finalAddonSnapshot: any[] = [];
      let finalAddonTotals: { retail: number; cost: number } = { retail: 0, cost: 0 };
      if (selectedProductId && preselectedAddonIds.length > 0) {
        const ids = new Set(preselectedAddonIds);
        const selectedPricingId = (defaultPricing?.id ?? "").trim();
        const all = (await productAddonsApi.list({ productId: selectedProductId })) as any[];
        const actives = all.filter((a) => (a?.active ?? true) === true);
        const applicable = actives.filter((a) => {
          const id = (a?.id ?? "").toString();
          if (!ids.has(id)) return false;
          if (!selectedPricingId) return true;

          const appliesToAll = typeof a?.appliesToAllPricingRows === "boolean" ? Boolean(a.appliesToAllPricingRows) : true;
          if (appliesToAll) return true;
          const rowIds = Array.isArray(a?.applicablePricingRowIds)
            ? (a.applicablePricingRowIds as unknown[]).filter((x) => typeof x === "string")
            : [];
          return rowIds.includes(selectedPricingId);
        });

        finalAddonSnapshot = applicable.map((a) => {
          const min = typeof a?.minPriceCents === "number" ? a.minPriceCents : a.basePriceCents;
          const max = typeof a?.maxPriceCents === "number" ? a.maxPriceCents : min;
          const costCents = costFromProductOrPricing({ dealerCostCents: a.dealerCostCents, basePriceCents: a.basePriceCents });
          const retailCents = retailFromCost(costCents, markupPct) ?? costCents;
          return {
            id: a.id,
            name: a.name,
            description: a.description,
            pricingType: a.pricingType,
            basePriceCents: a.basePriceCents,
            minPriceCents: min,
            maxPriceCents: max,
            chosenPriceCents: typeof retailCents === "number" ? retailCents : 0,
          };
        });

        finalAddonTotals = {
          retail: finalAddonSnapshot.reduce(
            (sum, a) => sum + (typeof (a as any).chosenPriceCents === "number" ? (a as any).chosenPriceCents : 0),
            0,
          ),
          cost: applicable.reduce((sum, a) => {
            const cost = costFromProductOrPricing({ dealerCostCents: a?.dealerCostCents, basePriceCents: a?.basePriceCents });
            return sum + (typeof cost === "number" ? cost : 0);
          }, 0),
        };
      }

      return api.create({
        contractNumber: cn,
        customerName: "",
        dealerId,
        productId: selectedProduct.id,
        providerId: selectedProduct.providerId,
        productPricingId: defaultPricing?.id,
        pricingTermMonths: defaultPricing ? defaultPricing.termMonths : undefined,
        pricingTermKm: defaultPricing ? defaultPricing.termKm : undefined,
        pricingVehicleMileageMinKm:
          defaultPricing && typeof defaultPricing.vehicleMileageMinKm === "number" ? defaultPricing.vehicleMileageMinKm : undefined,
        pricingVehicleMileageMaxKm:
          defaultPricing && defaultPricing.vehicleMileageMaxKm !== undefined
            ? defaultPricing.vehicleMileageMaxKm === null
              ? null
              : typeof defaultPricing.vehicleMileageMaxKm === "number"
                ? defaultPricing.vehicleMileageMaxKm
                : undefined
            : undefined,
        pricingVehicleClass: defaultPricing && typeof defaultPricing.vehicleClass === "string" ? defaultPricing.vehicleClass : undefined,
        pricingDeductibleCents: defaultPricing ? defaultPricing.deductibleCents : undefined,
        pricingBasePriceCents: typeof retailCents === "number" ? retailCents : undefined,
        pricingDealerCostCents: typeof costCents === "number" ? costCents : undefined,
        addonSnapshot: finalAddonSnapshot,
        addonTotalRetailCents: finalAddonTotals.retail,
        addonTotalCostCents: finalAddonTotals.cost,
        createdByUserId: user?.id,
        createdByEmail: user?.email,
        vin: decoded?.vin,
        vehicleYear: decoded?.vehicleYear,
        vehicleMake: decoded?.vehicleMake,
        vehicleModel: decoded?.vehicleModel,
        vehicleTrim: decoded?.vehicleTrim,
        vehicleBodyClass: decoded?.vehicleBodyClass,
        vehicleEngine: decoded?.vehicleEngine,
        vehicleTransmission: decoded?.vehicleTransmission,
      });
    },
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ["contracts"] });
      if (created?.id) navigate(`/dealer-contracts/${created.id}`);
    },
  });

  useEffect(() => {
    if (!preselectedProductId) return;
    if (didAutoCreateRef.current) return;
    if (!selectedProduct) return;
    if (createFromMarketplaceMutation.isPending) return;
    didAutoCreateRef.current = true;
    createFromMarketplaceMutation.mutate();
  }, [createFromMarketplaceMutation, preselectedProductId, selectedProduct]);

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

  const isDealerAdmin = user?.role === "DEALER_ADMIN";
  const batches = (batchesQuery.data ?? []) as Batch[];
  const contractIdsInAnyBatch = useMemo(() => {
    const ids = new Set<string>();
    for (const b of batches) {
      const list = Array.isArray(b.contractIds) ? (b.contractIds as string[]) : [];
      for (const id of list) ids.add(id);
    }
    return ids;
  }, [batches]);

  const isMissingInfo = (c: Contract) => !c.customerName?.trim() || !c.customerEmail?.trim() || !c.customerPhone?.trim();
  const isReadyToRemit = (c: Contract) => c.status === "SOLD" && !contractIdsInAnyBatch.has(c.id);
  const isActive = (c: Contract) => c.status === "SOLD" || c.status === "REMITTED";

  const filtered = useMemo(() => {
    if (quickFilter === "ALL") return searched;
    if (quickFilter === "DRAFT") return searched.filter((c) => c.status === "DRAFT");
    if (quickFilter === "ACTIVE") return searched.filter(isActive);
    if (quickFilter === "COMPLETED") return searched.filter((c) => c.status === "PAID");
    if (quickFilter === "MISSING_INFO") return searched.filter(isMissingInfo);
    if (quickFilter === "READY_TO_REMIT") {
      if (!isDealerAdmin) return searched;
      return searched.filter(isReadyToRemit);
    }
    return searched;
  }, [isActive, isDealerAdmin, isMissingInfo, isReadyToRemit, quickFilter, searched]);

  const quickFilterCounts = useMemo(() => {
    const base = searched;
    const all = base.length;
    const draft = base.filter((c) => c.status === "DRAFT").length;
    const active = base.filter(isActive).length;
    const completed = base.filter((c) => c.status === "PAID").length;
    const missing = base.filter(isMissingInfo).length;
    const ready = isDealerAdmin ? base.filter(isReadyToRemit).length : 0;
    return {
      ALL: all,
      DRAFT: draft,
      ACTIVE: active,
      COMPLETED: completed,
      MISSING_INFO: missing,
      READY_TO_REMIT: ready,
    };
  }, [isActive, isDealerAdmin, isMissingInfo, isReadyToRemit, searched]);

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

  const deleteMutation = useMutation({
    mutationFn: async (contractId: string) => {
      await api.delete(contractId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contracts"] });
    },
  });

  const headerSubtitle = preselectedProductId
    ? createFromMarketplaceMutation.isPending
      ? "Creating contract…"
      : createFromMarketplaceMutation.isError
        ? createFromMarketplaceMutation.error instanceof Error
          ? createFromMarketplaceMutation.error.message
          : "Failed to create contract"
        : selectedProduct
          ? `Selected: ${selectedProduct.name}`
          : "Loading selected product…"
    : undefined;

  return (
    <PageShell
      title="Contracts"
      subtitle={headerSubtitle}
      actions={
        <Button asChild className="bg-yellow-400 text-black hover:bg-yellow-300">
          <Link to="/dealer-marketplace">Find Products to Create Contract</Link>
        </Button>
      }
    >
      <div className="relative">
        <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-blue-600/10 via-transparent to-yellow-400/10 blur-2xl" />

        <div className="space-y-6">
          <div className="rounded-2xl border bg-card shadow-card overflow-hidden ring-1 ring-blue-500/10">
            <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap bg-gradient-to-r from-blue-600/10 via-transparent to-yellow-500/10">
              <div className="font-semibold">Contracts</div>
              <div className="w-full sm:w-[320px] relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search"
                  className="h-9 pl-9"
                />
              </div>
            </div>

            <div className="px-6 py-3 border-b">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setQuickFilter("ALL");
                  }}
                  className={
                    "text-sm px-3 py-1.5 rounded-lg border transition-colors " +
                    (quickFilter === "ALL"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted text-muted-foreground")
                  }
                >
                  All
                  <span className="ml-2 text-xs opacity-70">{quickFilterCounts.ALL}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuickFilter("DRAFT");
                  }}
                  className={
                    "text-sm px-3 py-1.5 rounded-lg border transition-colors " +
                    (quickFilter === "DRAFT"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted text-muted-foreground")
                  }
                  title="Draft contracts in progress"
                >
                  Draft
                  <span className="ml-2 text-xs opacity-70">{quickFilterCounts.DRAFT}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuickFilter("ACTIVE");
                  }}
                  className={
                    "text-sm px-3 py-1.5 rounded-lg border transition-colors " +
                    (quickFilter === "ACTIVE"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted text-muted-foreground")
                  }
                  title="Contracts in progress"
                >
                  Active
                  <span className="ml-2 text-xs opacity-70">{quickFilterCounts.ACTIVE}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuickFilter("COMPLETED");
                  }}
                  className={
                    "text-sm px-3 py-1.5 rounded-lg border transition-colors " +
                    (quickFilter === "COMPLETED"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted text-muted-foreground")
                  }
                  title="Paid contracts"
                >
                  Completed
                  <span className="ml-2 text-xs opacity-70">{quickFilterCounts.COMPLETED}</span>
                </button>
                {isDealerAdmin ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuickFilter("READY_TO_REMIT");
                    }}
                    className={
                      "text-sm px-3 py-1.5 rounded-lg border transition-colors " +
                      (quickFilter === "READY_TO_REMIT"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted text-muted-foreground")
                    }
                    title="SOLD contracts not yet included in a remittance"
                  >
                    Ready to remit
                    <span className="ml-2 text-xs opacity-70">{quickFilterCounts.READY_TO_REMIT}</span>
                  </button>
                ) : null}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                    <th className="text-left px-6 py-3 font-medium whitespace-nowrap">Contract #</th>
                    <th className="text-left px-6 py-3 font-medium">Customer</th>
                    <th className="text-left px-6 py-3 font-medium">Product</th>
                    <th className="text-left px-6 py-3 font-medium">Provider</th>
                    <th className="text-left px-6 py-3 font-medium">Status</th>
                    <th className="text-left px-6 py-3 font-medium whitespace-nowrap">Created</th>
                    <th className="text-right px-6 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/20">
                      <td className="px-6 py-3 whitespace-nowrap">
                        <div className="font-medium text-foreground">{c.contractNumber}</div>
                        <div className="text-[11px] text-muted-foreground">{c.warrantyId}</div>
                      </td>
                      <td className="px-6 py-3 text-foreground">{c.customerName || "—"}</td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {(() => {
                          const pid = (c.productId ?? "").trim();
                          if (!pid) return "—";
                          return productNameById.get(pid) ?? pid;
                        })()}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{providerDisplay(c.providerId)}</td>
                      <td className="px-6 py-3">
                        <span
                          className={"inline-flex items-center text-xs px-2 py-1 rounded-full border " + statusPillClass(c.status)}
                          title={statusTooltip(c.status)}
                        >
                          {uiStatusLabel(c.status)}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(c.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link to={`/dealer-contracts/${c.id}`}>Edit</Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="hover:text-foreground hover:bg-red-500/10 hover:border-red-500/30"
                            onClick={() => {
                              void (async () => {
                                if (c.status !== "DRAFT") return;
                                if (!(await confirmProceed(`Delete contract ${c.contractNumber}? This cannot be undone.`))) return;
                                await deleteMutation.mutateAsync(c.id);
                              })();
                            }}
                            disabled={deleteMutation.isPending || c.status !== "DRAFT"}
                            title={c.status !== "DRAFT" ? "Only Draft contracts can be deleted." : "Delete"}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="ml-2">Delete</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {listQuery.isLoading ? (
                    <tr>
                      <td className="px-6 py-6 text-sm text-muted-foreground" colSpan={7}>
                        Loading…
                      </td>
                    </tr>
                  ) : null}

                  {!listQuery.isLoading && filtered.length === 0 ? (
                    <tr>
                      <td className="px-6 py-10 text-sm text-muted-foreground" colSpan={7}>
                        No contracts found.
                      </td>
                    </tr>
                  ) : null}

                  {listQuery.isError ? (
                    <tr>
                      <td className="px-6 py-6 text-sm text-destructive" colSpan={7}>
                        Failed to load contracts.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
