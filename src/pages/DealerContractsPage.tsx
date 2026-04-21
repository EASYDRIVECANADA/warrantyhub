import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, FileText, Loader2, Plus, Search, Square, Trash2 } from "lucide-react";

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
import { getDealerProductAddonRetailCents, getDealerProductPricingRetailCents, getDealerProductRetailCents } from "../lib/dealerProductRetail";
import { useToast } from "../providers/ToastProvider";

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

type QuickFilterKey = "ALL" | "DRAFT" | "ACTIVE" | "PRINTABLE" | "COMPLETED" | "MISSING_INFO" | "READY_TO_REMIT";

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
  const { toast } = useToast();

  const mode = useMemo(() => getAppMode(), []);

  const dealerId = (mode === "local" ? (user?.dealerId ?? user?.id ?? "") : user?.dealerId ?? "").trim();
  const { markupPct } = useDealerMarkupPct(dealerId);

  const [searchParams] = useSearchParams();
  const preselectedProductId = (searchParams.get("productId") ?? "").trim();
  const preselectedProductPricingId = (searchParams.get("productPricingId") ?? "").trim();
  const prefilledVin = (searchParams.get("vin") ?? "").trim();
  const prefilledMileageKmRaw = (searchParams.get("mileageKm") ?? "").trim();
  const prefilledMileageKmNum = prefilledMileageKmRaw ? Number(prefilledMileageKmRaw) : NaN;
  const prefilledMileageKm = Number.isFinite(prefilledMileageKmNum) && prefilledMileageKmNum >= 0 ? Math.round(prefilledMileageKmNum) : null;
  const preselectedAddonIds = (searchParams.get("addonIds") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const [q, setQ] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilterKey>("ALL");
  const [selectedContractIds, setSelectedContractIds] = useState<Record<string, boolean>>({});

  const didAutoCreateRef = useRef(false);

  const autoCreateGuardKey = useMemo(() => {
    if (!preselectedProductId) return "";
    const parts = [
      (user?.id ?? "").trim(),
      dealerId,
      preselectedProductId,
      preselectedProductPricingId,
      prefilledVin,
      prefilledMileageKmRaw,
      (preselectedAddonIds ?? []).join(","),
    ];
    return `wh.autoCreateContract.v1:${parts.join("|")}`;
  }, [dealerId, prefilledMileageKmRaw, prefilledVin, preselectedAddonIds, preselectedProductId, preselectedProductPricingId, user?.id]);

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
      if (!dealerId) throw new Error("Your user is not linked to a dealer account.");
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

      const selectedPricingId = (defaultPricing?.id ?? "").trim();
      const retailTermOverrideCents =
        selectedProductId && selectedPricingId ? getDealerProductPricingRetailCents(dealerId, selectedProductId, selectedPricingId) : null;
      const retailOverrideCents = selectedProductId ? getDealerProductRetailCents(dealerId, selectedProductId) : null;
      const retailCents =
        typeof retailTermOverrideCents === "number"
          ? retailTermOverrideCents
          : typeof retailOverrideCents === "number"
            ? retailOverrideCents
          : typeof costCents === "number"
            ? retailFromCost(costCents, markupPct) ?? costCents
            : undefined;

      let finalAddonSnapshot: any[] = [];
      let finalAddonTotals: { retail: number; cost: number } = { retail: 0, cost: 0 };
      if (selectedProductId && preselectedAddonIds.length > 0) {
        const ids = new Set(preselectedAddonIds);
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
          const pid = (selectedProductId ?? "").trim();
          const aid = (a?.id ?? "").toString().trim();
          const addonOverride = pid && aid ? getDealerProductAddonRetailCents(dealerId, pid, aid) : null;
          const retailCents = typeof addonOverride === "number" ? addonOverride : retailFromCost(costCents, markupPct) ?? costCents;
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
        vehicleMileageKm: prefilledMileageKm ?? undefined,
        vehicleBodyClass: decoded?.vehicleBodyClass,
        vehicleEngine: decoded?.vehicleEngine,
        vehicleTransmission: decoded?.vehicleTransmission,
      });
    },
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ["contracts"] });

      const feeCents = (created as any)?.contractProcessingFeeCents;
      const feePaidAt = (created as any)?.processingFeePaidAt;
      const piStatus = ((created as any)?.stripePaymentIntentStatus ?? "").toString().toLowerCase();
      const feePaid = Boolean(feePaidAt) || (typeof feeCents === "number" && feeCents > 0 && piStatus === "succeeded");
      if (feePaid) {
        toast({
          title: "Contract fee successful",
          message: "The contract processing fee was processed successfully. Your draft contract is ready to complete.",
          variant: "success",
          withCheckAnimation: true,
          durationMs: 5200,
        });
      } else {
        toast({
          title: "Contract created",
          message: "Your draft contract is ready to complete.",
          variant: "success",
          durationMs: 4200,
        });
      }

      if (created?.id) navigate(`/dealer-contracts/${created.id}`);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Failed to create contract";
      if (autoCreateGuardKey) sessionStorage.removeItem(autoCreateGuardKey);
      toast({
        title: "Unable to create contract",
        message: msg,
        variant: "error",
        durationMs: 6000,
      });
    },
  });

  useEffect(() => {
    if (!preselectedProductId) return;
    if (didAutoCreateRef.current) return;
    if (!selectedProduct) return;
    if (createFromMarketplaceMutation.isPending) return;

    if (autoCreateGuardKey && sessionStorage.getItem(autoCreateGuardKey) === "1") {
      didAutoCreateRef.current = true;
      return;
    }

    didAutoCreateRef.current = true;
    if (autoCreateGuardKey) sessionStorage.setItem(autoCreateGuardKey, "1");
    createFromMarketplaceMutation.mutate();
  }, [autoCreateGuardKey, createFromMarketplaceMutation, preselectedProductId, selectedProduct]);

  const contracts = (listQuery.data ?? []) as Contract[];
  const myContracts = useMemo(() => {
    const uid = (user?.id ?? "").trim();
    const uem = (user?.email ?? "").trim().toLowerCase();
    if (!uid && !uem) return [] as Contract[];
    return contracts.filter((c) => {
      const byId = (c.createdByUserId ?? "").trim();
      const byEmail = (c.createdByEmail ?? "").trim().toLowerCase();
      if (uid && byId) return byId === uid;
      if (uem && byEmail) return byEmail === uem;
      return false;
    });
  }, [contracts, user?.email, user?.id]);

  const visibleContracts = useMemo(() => {
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
  }, [contracts, mode, myContracts, user, user?.dealerId, user?.role]);

  const searched = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return visibleContracts;
    return visibleContracts.filter((c) => {
      const hay = [
        c.id,
        c.contractNumber,
        c.status,
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
  }, [q, visibleContracts]);

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

  const isMissingInfo = useCallback(
    (c: Contract) => !c.customerName?.trim() || !c.customerEmail?.trim() || !c.customerPhone?.trim(),
    [],
  );

  const isReadyToRemit = useCallback(
    (c: Contract) => c.status === "SOLD" && !contractIdsInAnyBatch.has(c.id),
    [contractIdsInAnyBatch],
  );

  const isActive = useCallback((c: Contract) => c.status === "SOLD" || c.status === "REMITTED", []);
  const isPrintable = useCallback((c: Contract) => c.status !== "DRAFT", []);

  const filtered = useMemo(() => {
    if (quickFilter === "ALL") return searched;
    if (quickFilter === "DRAFT") return searched.filter((c) => c.status === "DRAFT");
    if (quickFilter === "ACTIVE") return searched.filter(isActive);
    if (quickFilter === "PRINTABLE") return searched.filter(isPrintable);
    if (quickFilter === "COMPLETED") return searched.filter((c) => c.status === "PAID");
    if (quickFilter === "MISSING_INFO") return searched.filter(isMissingInfo);
    if (quickFilter === "READY_TO_REMIT") {
      if (!isDealerAdmin) return searched;
      return searched.filter(isReadyToRemit);
    }
    return searched;
  }, [isActive, isDealerAdmin, isMissingInfo, isPrintable, isReadyToRemit, quickFilter, searched]);

  useEffect(() => {
    setSelectedContractIds((prev) => {
      const visible = new Set(filtered.map((c) => (c.id ?? "").trim()).filter(Boolean));
      const next: Record<string, boolean> = {};
      for (const [id, on] of Object.entries(prev)) {
        if (!on) continue;
        if (!visible.has(id)) continue;
        next[id] = true;
      }
      const prevKeys = Object.keys(prev).filter((k) => Boolean(prev[k]));
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) return next;
      for (const k of nextKeys) {
        if (!prev[k]) return next;
      }
      return prev;
    });
  }, [filtered]);

  const visibleDraftIds = useMemo(
    () => filtered.filter((c) => c.status === "DRAFT").map((c) => (c.id ?? "").trim()).filter(Boolean),
    [filtered],
  );
  const selectedDraftIds = useMemo(
    () => visibleDraftIds.filter((id) => Boolean(selectedContractIds[id])),
    [selectedContractIds, visibleDraftIds],
  );
  const allVisibleDraftSelected = visibleDraftIds.length > 0 && selectedDraftIds.length === visibleDraftIds.length;

  const quickFilterCounts = useMemo(() => {
    const base = searched;
    const all = base.length;
    const draft = base.filter((c) => c.status === "DRAFT").length;
    const active = base.filter(isActive).length;
    const printable = base.filter(isPrintable).length;
    const completed = base.filter((c) => c.status === "PAID").length;
    const missing = base.filter(isMissingInfo).length;
    const ready = isDealerAdmin ? base.filter(isReadyToRemit).length : 0;
    return {
      ALL: all,
      DRAFT: draft,
      ACTIVE: active,
      PRINTABLE: printable,
      COMPLETED: completed,
      MISSING_INFO: missing,
      READY_TO_REMIT: ready,
    };
  }, [isActive, isDealerAdmin, isMissingInfo, isPrintable, isReadyToRemit, searched]);

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

  const bulkDeleteMutation = useMutation({
    mutationFn: async (contractIds: string[]) => {
      const ids = Array.from(new Set(contractIds.map((x) => (x ?? "").toString().trim()).filter(Boolean)));
      if (ids.length === 0) return;
      await Promise.all(ids.map((id) => api.delete(id)));
    },
    onSuccess: async () => {
      setSelectedContractIds({});
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
    <PageShell title="">
      {createFromMarketplaceMutation.isPending ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-2xl border bg-card shadow-lg overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div className="font-semibold">Creating contract…</div>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Processing your contract setup and confirming the contract fee. This can take a few seconds.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Contracts</h1>
            {headerSubtitle ? <p className="text-sm text-slate-500 mt-0.5 truncate">{headerSubtitle}</p> : null}
          </div>
          <Button asChild className="bg-yellow-400 text-black hover:bg-yellow-300 font-semibold gap-2">
            <Link to="/dealer-marketplace">
              <Plus className="h-4 w-4" />
              Find Products
            </Link>
          </Button>
        </div>

        <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
          {/* Search + actions bar */}
          <div className="px-5 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
            <div className="relative w-full sm:w-[280px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search contracts…"
                className="h-9 pl-9 text-sm"
              />
            </div>
            {selectedDraftIds.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                className="hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30 gap-1.5"
                disabled={bulkDeleteMutation.isPending || deleteMutation.isPending}
                onClick={() => {
                  void (async () => {
                    const count = selectedDraftIds.length;
                    if (!(await confirmProceed(`Delete ${count} draft contract${count === 1 ? "" : "s"}? This cannot be undone.`))) return;
                    await bulkDeleteMutation.mutateAsync(selectedDraftIds);
                  })();
                }}
              >
                <Trash2 className="h-4 w-4" />
                Delete ({selectedDraftIds.length})
              </Button>
            ) : null}
          </div>

          {/* Filter tabs */}
          <div className="px-5 py-2.5 border-b bg-slate-50 flex items-center gap-1.5 overflow-x-auto">
            {([
              { key: "ALL", label: "All" },
              { key: "DRAFT", label: "Draft" },
              { key: "ACTIVE", label: "Active" },
              { key: "PRINTABLE", label: "Printable" },
              { key: "COMPLETED", label: "Completed" },
              ...(isDealerAdmin ? [{ key: "READY_TO_REMIT", label: "Ready to Remit" }] : []),
            ] as { key: QuickFilterKey; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setQuickFilter(key)}
                className={`text-sm px-3.5 py-1.5 rounded-full border font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  quickFilter === key
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
                }`}
              >
                {label}
                <span className={`text-xs ${quickFilter === key ? "opacity-70" : "opacity-50"}`}>
                  {quickFilterCounts[key]}
                </span>
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-semibold w-10">
                    <button
                      type="button"
                      className="flex items-center"
                      onClick={() => {
                        const on = !allVisibleDraftSelected;
                        setSelectedContractIds((prev) => {
                          const next = { ...prev };
                          for (const id of visibleDraftIds) {
                            if (on) next[id] = true;
                            else delete next[id];
                          }
                          return next;
                        });
                      }}
                      disabled={visibleDraftIds.length === 0 || bulkDeleteMutation.isPending || deleteMutation.isPending}
                    >
                      {allVisibleDraftSelected ? (
                        <CheckSquare className="h-4 w-4 text-slate-700" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">Contract #</th>
                  <th className="text-left px-5 py-3 font-semibold">Customer</th>
                  <th className="text-left px-5 py-3 font-semibold">Product</th>
                  <th className="text-left px-5 py-3 font-semibold">Provider</th>
                  <th className="text-left px-5 py-3 font-semibold">Status</th>
                  <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">Created</th>
                  <th className="text-right px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <button
                        type="button"
                        onClick={() => {
                          const on = !selectedContractIds[c.id];
                          const id = (c.id ?? "").trim();
                          if (!id) return;
                          setSelectedContractIds((prev) => {
                            const next = { ...prev };
                            if (on) next[id] = true;
                            else delete next[id];
                            return next;
                          });
                        }}
                        disabled={c.status !== "DRAFT" || bulkDeleteMutation.isPending || deleteMutation.isPending}
                      >
                        {selectedContractIds[c.id] ? (
                          <CheckSquare className="h-4 w-4 text-slate-700" />
                        ) : (
                          <Square className={`h-4 w-4 ${c.status === "DRAFT" ? "text-slate-400" : "text-transparent"}`} />
                        )}
                      </button>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="font-semibold text-slate-900 text-sm">{c.contractNumber}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{c.warrantyId}</div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-700 font-medium">{c.customerName || "—"}</td>
                    <td className="px-5 py-3.5 text-slate-500 max-w-[160px] truncate">
                      {(() => {
                        const pid = (c.productId ?? "").trim();
                        if (!pid) return "—";
                        return productNameById.get(pid) ?? pid;
                      })()}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">{providerDisplay(c.providerId)}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={"inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border " + statusPillClass(c.status)}
                        title={statusTooltip(c.status)}
                      >
                        {uiStatusLabel(c.status)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {c.status !== "DRAFT" ? (
                          <>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" asChild>
                              <Link to={`/dealer-contracts/${c.id}/print/dealer`}>Dealer</Link>
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" asChild>
                              <Link to={`/dealer-contracts/${c.id}/print/customer`}>Customer</Link>
                            </Button>
                          </>
                        ) : null}
                        <Button size="sm" variant="outline" className="h-7 px-3 text-xs font-medium" asChild>
                          <Link to={`/dealer-contracts/${c.id}`}>Edit</Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0 hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                          onClick={() => {
                            void (async () => {
                              if (c.status !== "DRAFT") return;
                              if (!(await confirmProceed(`Delete contract ${c.contractNumber}? This cannot be undone.`))) return;
                              await deleteMutation.mutateAsync(c.id);
                            })();
                          }}
                          disabled={deleteMutation.isPending || bulkDeleteMutation.isPending || c.status !== "DRAFT"}
                          title={c.status !== "DRAFT" ? "Only Draft contracts can be deleted." : "Delete"}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}

                {listQuery.isLoading ? (
                  <tr>
                    <td className="px-5 py-12 text-sm text-slate-400 text-center" colSpan={8}>
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-slate-300" />
                      Loading contracts…
                    </td>
                  </tr>
                ) : null}

                {!listQuery.isLoading && filtered.length === 0 ? (
                  <tr>
                    <td className="px-5 py-14 text-sm text-center" colSpan={8}>
                      <FileText className="h-10 w-10 mx-auto mb-3 text-slate-200" />
                      <div className="font-semibold text-slate-500">No contracts found</div>
                      <div className="text-xs text-slate-400 mt-1">Find products in the marketplace to create a contract.</div>
                      <Button asChild className="mt-4 bg-yellow-400 text-black hover:bg-yellow-300 gap-2 text-xs h-8" size="sm">
                        <Link to="/dealer-marketplace"><Plus className="h-3.5 w-3.5" />Find Products</Link>
                      </Button>
                    </td>
                  </tr>
                ) : null}

                {listQuery.isError ? (
                  <tr>
                    <td className="px-5 py-10 text-sm text-destructive text-center" colSpan={8}>
                      Failed to load contracts.
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
