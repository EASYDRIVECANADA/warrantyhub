import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { logAuditEvent } from "../lib/auditLog";
import { decodeVin } from "../lib/vin/decodeVin";
import { getContractsApi } from "../lib/contracts/contracts";
import { getMarketplaceApi } from "../lib/marketplace/marketplace";
import { getProductPricingApi } from "../lib/productPricing/productPricing";
import { getProductAddonsApi } from "../lib/productAddons/productAddons";
import { isPricingEligibleForVehicle } from "../lib/productPricing/eligibility";
import { defaultPricingRow } from "../lib/productPricing/defaultRow";
import {
  costFromProductOrPricing,
  retailFromCost,
} from "../lib/dealerPricing";
import { useDealerMarkupPct } from "../lib/dealerMarkup";
import { getAppMode } from "../lib/runtime";
import { alertMissing, confirmProceed, sanitizeDigitsOnly, sanitizeLettersOnly, sanitizeWordsOnly } from "../lib/utils";
import { getProvidersApi } from "../lib/providers/providers";
import type { ProviderPublic } from "../lib/providers/types";
import type { ContractsApi } from "../lib/contracts/api";
import type { Contract } from "../lib/contracts/types";
import type { Product } from "../lib/products/types";
import type { ProductPricing } from "../lib/productPricing/types";
import type { ProductAddon } from "../lib/productAddons/types";
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

type WizardStep = "PRICING" | "VEHICLE" | "CUSTOMER" | "CONFIRM";

function money(cents?: number) {
  if (typeof cents !== "number") return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export function DealerContractDetailPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const contractId = id ?? "";

  const mode = useMemo(() => getAppMode(), []);
  const isEmployee = user?.role === "DEALER_EMPLOYEE";
  const dealerId = (mode === "local" ? (user?.dealerId ?? user?.id ?? "") : (user?.dealerId ?? "")).trim();
  const { markupPct } = useDealerMarkupPct(dealerId);

  const api = useMemo(() => getContractsApi(), []);
  const marketplaceApi = useMemo(() => getMarketplaceApi(), []);
  const productPricingApi = useMemo(() => getProductPricingApi(), []);
  const productAddonsApi = useMemo(() => getProductAddonsApi(), []);
  const providersApi = useMemo(() => getProvidersApi(), []);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const contractQuery = useQuery({
    queryKey: ["contract", contractId],
    enabled: !!contractId,
    queryFn: () => api.get(contractId),
  });

  const marketplaceProductsQuery = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: () => marketplaceApi.listPublishedProducts(),
  });

  const contract = contractQuery.data as Contract | null | undefined;

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

  const unauthorized = contract != null && !canView(contract);
  if (!contractQuery.isLoading && unauthorized) {
    return (
      <PageShell
        title="Contract"
        subtitle="You can only access contracts created by your dealership."
        actions={
          <Button variant="outline" asChild>
            <Link to="/dealer-contracts">Back to contracts</Link>
          </Button>
        }
      >
        <div className="mt-6 text-sm text-muted-foreground">Contract not found.</div>
      </PageShell>
    );
  }

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerCity, setCustomerCity] = useState("");
  const [customerProvince, setCustomerProvince] = useState("");
  const [customerPostalCode, setCustomerPostalCode] = useState("");
  const [vin, setVin] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleTrim, setVehicleTrim] = useState("");
  const [vehicleMileageKm, setVehicleMileageKm] = useState("");
  const [vehicleBodyClass, setVehicleBodyClass] = useState("");
  const [vehicleClass, setVehicleClass] = useState("");
  const [vehicleEngine, setVehicleEngine] = useState("");
  const [vehicleTransmission, setVehicleTransmission] = useState("");
  const [productId, setProductId] = useState("");
  const [pricingId, setPricingId] = useState("");
  const [step, setStep] = useState<WizardStep>("PRICING");
  const [selectedAddonIds, setSelectedAddonIds] = useState<Record<string, boolean>>({});
  const didInitStepRef = useRef(false);

  useEffect(() => {
    if (!contract) return;
    setCustomerName(contract.customerName);
    setCustomerEmail(contract.customerEmail ?? "");
    setCustomerPhone(contract.customerPhone ?? "");
    setCustomerAddress(contract.customerAddress ?? "");
    setCustomerCity(contract.customerCity ?? "");
    setCustomerProvince(contract.customerProvince ?? "");
    setCustomerPostalCode(contract.customerPostalCode ?? "");
    setVin(contract.vin ?? "");
    setVehicleYear(contract.vehicleYear ?? "");
    setVehicleMake(contract.vehicleMake ?? "");
    setVehicleModel(contract.vehicleModel ?? "");
    setVehicleTrim(contract.vehicleTrim ?? "");
    setVehicleMileageKm(typeof contract.vehicleMileageKm === "number" ? String(contract.vehicleMileageKm) : "");
    setVehicleBodyClass(contract.vehicleBodyClass ?? "");
    setVehicleClass("");
    setVehicleEngine(contract.vehicleEngine ?? "");
    setVehicleTransmission(contract.vehicleTransmission ?? "");
    setProductId(contract.productId ?? "");
    setPricingId(contract.productPricingId ?? "");

    const snap = (contract as any).addonSnapshot as unknown;
    if (Array.isArray(snap)) {
      const next: Record<string, boolean> = {};
      for (const item of snap as any[]) {
        const id = (item?.id ?? "").toString().trim();
        if (id) next[id] = true;
      }
      setSelectedAddonIds(next);
    } else {
      setSelectedAddonIds({});
    }

    const vinNormalized = (contract.vin ?? "").trim().replace(/[^a-z0-9]/gi, "").toUpperCase();
    const hasVin = vinNormalized.length === 17;

    const hasSelectedPricing = Boolean((contract.productId ?? "").trim()) && Boolean((contract.productPricingId ?? "").trim());

    if (contract.status !== "DRAFT") {
      setStep("CONFIRM");
      didInitStepRef.current = true;
      return;
    }

    if (didInitStepRef.current) return;
    if (!hasVin && !hasSelectedPricing) {
      setStep("VEHICLE");
      didInitStepRef.current = true;
      return;
    }
    setStep("PRICING");
    didInitStepRef.current = true;
  }, [contract]);

  const selectedAddonIdList = useMemo(() => Object.keys(selectedAddonIds).filter((id) => selectedAddonIds[id]), [selectedAddonIds]);

  type ContractPatch = Parameters<ContractsApi["update"]>[1] & {
    productPricingId?: string | null;
    pricingTermMonths?: number | null;
    pricingTermKm?: number | null;
    pricingVehicleMileageMinKm?: number | null;
    pricingVehicleMileageMaxKm?: number | null;
    pricingVehicleClass?: string | null;
    pricingDeductibleCents?: number | null;
    pricingBasePriceCents?: number | null;
    pricingDealerCostCents?: number | null;
    addonSnapshot?: unknown | null;
    addonTotalRetailCents?: number | null;
    addonTotalCostCents?: number | null;
  };

  const updateMutation = useMutation({
    mutationFn: async (patch: ContractPatch) => {
      if (!contract) throw new Error("Contract not loaded");
      return api.update(contract.id, patch);
    },
    onSuccess: async (updated) => {
      await qc.invalidateQueries({ queryKey: ["contracts"] });
      await qc.invalidateQueries({ queryKey: ["contract", updated.id] });
    },
  });

  const decodeVinMutation = useMutation({
    mutationFn: (v: string) => decodeVin(v),
    onSuccess: async (decoded) => {
      setVin(decoded.vin);
      setVehicleYear(decoded.vehicleYear ?? "");
      setVehicleMake(decoded.vehicleMake ?? "");
      setVehicleModel(decoded.vehicleModel ?? "");
      setVehicleTrim(decoded.vehicleTrim ?? "");
      setVehicleBodyClass(decoded.vehicleBodyClass ?? "");
      setVehicleEngine(decoded.vehicleEngine ?? "");
      setVehicleTransmission(decoded.vehicleTransmission ?? "");

      if (!contract) return;
      const patch: ContractPatch = { vin: decoded.vin };
      if (typeof decoded.vehicleYear === "string") patch.vehicleYear = decoded.vehicleYear;
      if (typeof decoded.vehicleMake === "string") patch.vehicleMake = decoded.vehicleMake;
      if (typeof decoded.vehicleModel === "string") patch.vehicleModel = decoded.vehicleModel;
      if (typeof decoded.vehicleTrim === "string") patch.vehicleTrim = decoded.vehicleTrim;
      if (typeof decoded.vehicleBodyClass === "string") patch.vehicleBodyClass = decoded.vehicleBodyClass;
      if (typeof decoded.vehicleEngine === "string") patch.vehicleEngine = decoded.vehicleEngine;
      if (typeof decoded.vehicleTransmission === "string") patch.vehicleTransmission = decoded.vehicleTransmission;
      await updateMutation.mutateAsync(patch);
    },
  });

  const onSaveVehicle = async () => {
    if (!contract) return;
    await updateMutation.mutateAsync({
      vin,
      vehicleYear,
      vehicleMake,
      vehicleModel,
      vehicleTrim,
      vehicleMileageKm: (() => {
        const raw = vehicleMileageKm.trim();
        if (!raw) return undefined;
        const n = Number(raw);
        return Number.isFinite(n) ? n : undefined;
      })(),
      vehicleBodyClass,
      vehicleEngine,
      vehicleTransmission,
    });
  };

  const onSaveCustomer = async () => {
    if (!contract) return;
    const name = customerName.trim();
    if (!name) return alertMissing("Customer name is required.");
    await updateMutation.mutateAsync({
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      customerCity,
      customerProvince,
      customerPostalCode,
    });
  };

  const onSubmit = async () => {
    if (!contract) return;
    if (contract.status !== "DRAFT") return;

    const vinNormalized = vin.trim().replace(/[^a-z0-9]/gi, "").toUpperCase();
    const hasVin = vinNormalized.length === 17;
    const selectedPlanId = (productId || contract.productId || "").trim();
    const selectedPriceId = (pricingId || contract.productPricingId || "").trim();

    if (!customerName.trim()) return alertMissing("Customer name is required.");
    if (!hasVin) return alertMissing("Enter a valid 17-character VIN before submission.");
    if (!selectedPlanId) return alertMissing("Select a plan before submission.");
    if (!selectedPriceId) return alertMissing("Select a pricing option before submission.");

    if (!(await confirmProceed("Submit contract? This will lock editing."))) return;
    const now = new Date().toISOString();
    await updateMutation.mutateAsync({
      status: "SOLD",
      soldByUserId: user?.id,
      soldByEmail: user?.email,
      soldAt: now,
    });

    logAuditEvent({
      kind: "CONTRACT_SOLD",
      actorUserId: user?.id,
      actorEmail: user?.email,
      actorRole: user?.role,
      dealerId: (user?.dealerId ?? "").trim() || undefined,
      entityType: "contract",
      entityId: contract.id,
      message: `Sold contract ${contract.contractNumber}`,
    });
    setStep("CONFIRM");
  };

  const marketplaceProducts = (marketplaceProductsQuery.data ?? []) as Product[];

  const parsedVehicleYear = Number(vehicleYear);
  const vehicleAgeYears = Number.isFinite(parsedVehicleYear) ? new Date().getFullYear() - parsedVehicleYear : undefined;
  const parsedMileage = (() => {
    const raw = vehicleMileageKm.trim();
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  })();

  const providerIdsForLookup = Array.from(
    new Set(
      marketplaceProducts
        .map((p) => p.providerId)
        .filter(Boolean)
        .map((x) => (x ?? "").trim())
        .filter(Boolean),
    ),
  );

  const providersQuery = useQuery({
    queryKey: ["providers", providerIdsForLookup.join(",")],
    queryFn: () => providersApi.listByIds(providerIdsForLookup),
    enabled: providerIdsForLookup.length > 0,
  });

  const providerById = new Map(((providersQuery.data ?? []) as ProviderPublic[]).map((p) => [p.id, p] as const));

  const providerLabel = (id: string) => {
    const t = id.trim();
    if (!t) return "—";
    return `Provider ${t.slice(0, 8)}`;
  };

  const providerDisplay = (id: string | undefined) => {
    if (!id) return "—";
    const p = providerById.get(id);
    const company = (p?.companyName ?? "").trim();
    if (company) return company;
    const display = (p?.displayName ?? "").trim();
    if (display) return display;
    return providerLabel(id);
  };

  const selectPricing = async (row: ProductPricing) => {
    if (!contract) return;
    if (
      !(
        await confirmProceed(
          `Select ${row.termMonths === null ? "Unlimited" : `${row.termMonths} mo`} / ${row.termKm === null ? "Unlimited" : `${row.termKm.toLocaleString()} km`} for this contract?`,
        )
      )
    )
      return;

    const costCents = costFromProductOrPricing({ dealerCostCents: row.dealerCostCents, basePriceCents: row.basePriceCents });
    if (typeof costCents !== "number") throw new Error("Pricing row is missing a cost");
    const retailCents = retailFromCost(costCents, markupPct) ?? costCents;

    setPricingId(row.id);
    await updateMutation.mutateAsync({
      productPricingId: row.id,
      pricingTermMonths: row.termMonths,
      pricingTermKm: row.termKm,
      pricingVehicleMileageMinKm: typeof row.vehicleMileageMinKm === "number" ? row.vehicleMileageMinKm : null,
      pricingVehicleMileageMaxKm:
        row.vehicleMileageMaxKm === null ? null : typeof row.vehicleMileageMaxKm === "number" ? row.vehicleMileageMaxKm : null,
      pricingVehicleClass: typeof row.vehicleClass === "string" ? row.vehicleClass : null,
      pricingDeductibleCents: row.deductibleCents,
      pricingBasePriceCents: retailCents,
      pricingDealerCostCents: costCents,
    });
  };

  const canEdit = (contract?.status ?? "DRAFT") === "DRAFT";
  const selectedProductId = (productId || contract?.productId || "").trim();
  const selectedPricingId = (pricingId || contract?.productPricingId || "").trim();

  const selectedProduct = useMemo(() => {
    const id = selectedProductId;
    if (!id) return null;
    return marketplaceProducts.find((p) => p.id === id) ?? null;
  }, [marketplaceProducts, selectedProductId]);

  const pricingOptionsQuery = useQuery({
    queryKey: ["product-pricing-public", selectedProductId],
    enabled: Boolean(selectedProductId),
    queryFn: () => productPricingApi.list({ productId: selectedProductId }),
  });

  const pricingOptions = (pricingOptionsQuery.data ?? []) as ProductPricing[];

  const productAddonsQuery = useQuery({
    queryKey: ["product-addons-public", selectedProductId],
    enabled: Boolean(selectedProductId),
    queryFn: () => productAddonsApi.list({ productId: selectedProductId }),
  });

  const activeAddons = useMemo(() => {
    const rows = (productAddonsQuery.data ?? []) as ProductAddon[];
    const actives = rows.filter((a) => a.active);

    const pricingId = (selectedPricingId || contract?.productPricingId || "").trim();
    if (!pricingId) return actives;

    return actives.filter((a) => {
      const appliesToAll = typeof (a as any).appliesToAllPricingRows === "boolean" ? Boolean((a as any).appliesToAllPricingRows) : true;
      if (appliesToAll) return true;
      const ids = Array.isArray((a as any).applicablePricingRowIds)
        ? ((a as any).applicablePricingRowIds as unknown[]).filter((x) => typeof x === "string")
        : [];
      return ids.includes(pricingId);
    });
  }, [productAddonsQuery.data, selectedPricingId, contract?.productPricingId]);

  const selectedAddonSnapshots = useMemo(() => {
    const byId = new Map(activeAddons.map((a) => [a.id, a] as const));
    return selectedAddonIdList
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((a) => {
        const min = typeof (a as any).minPriceCents === "number" ? (a as any).minPriceCents : a!.basePriceCents;
        const max = typeof (a as any).maxPriceCents === "number" ? (a as any).maxPriceCents : min;
        const costCents = costFromProductOrPricing({ dealerCostCents: a!.dealerCostCents, basePriceCents: a!.basePriceCents });
        const retailCents = retailFromCost(costCents, markupPct) ?? costCents;
        const chosenPriceCents = typeof retailCents === "number" ? retailCents : 0;

        return {
          id: a!.id,
          name: a!.name,
          description: a!.description,
          pricingType: (a as any).pricingType,
          basePriceCents: a!.basePriceCents,
          minPriceCents: min,
          maxPriceCents: max,
          chosenPriceCents,
        };
      });
  }, [activeAddons, markupPct, selectedAddonIdList]);

  const addonTotals = useMemo(() => {
    const retail = selectedAddonSnapshots.reduce((sum, a) => sum + (typeof (a as any).chosenPriceCents === "number" ? (a as any).chosenPriceCents : 0), 0);
    const cost = selectedAddonSnapshots.reduce((sum, a) => {
      const base = typeof (a as any).basePriceCents === "number" ? (a as any).basePriceCents : 0;
      return sum + base;
    }, 0);
    return { retail, cost };
  }, [selectedAddonSnapshots]);

  const persistAddonSelection = async (nextSelectedIds: Record<string, boolean>) => {
    if (!contract) return;

    const ids = Object.keys(nextSelectedIds).filter((id) => nextSelectedIds[id]);
    const byId = new Map(activeAddons.map((a) => [a.id, a] as const));
    const snap = ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((a) => {
        const min = typeof (a as any).minPriceCents === "number" ? (a as any).minPriceCents : a!.basePriceCents;
        const max = typeof (a as any).maxPriceCents === "number" ? (a as any).maxPriceCents : min;
        const costCents = costFromProductOrPricing({ dealerCostCents: a!.dealerCostCents, basePriceCents: a!.basePriceCents });
        const retailCents = retailFromCost(costCents, markupPct) ?? costCents;
        const chosen = typeof retailCents === "number" ? retailCents : 0;
        return {
          id: a!.id,
          name: a!.name,
          description: a!.description,
          pricingType: (a as any).pricingType,
          basePriceCents: a!.basePriceCents,
          minPriceCents: min,
          maxPriceCents: max,
          chosenPriceCents: chosen,
        };
      });

    const retail = snap.reduce((sum, a) => sum + (typeof (a as any).chosenPriceCents === "number" ? (a as any).chosenPriceCents : 0), 0);
    const cost = snap.reduce((sum, a) => {
      const base = typeof (a as any).basePriceCents === "number" ? (a as any).basePriceCents : 0;
      return sum + base;
    }, 0);

    await updateMutation.mutateAsync({
      addonSnapshot: snap,
      addonTotalRetailCents: retail,
      addonTotalCostCents: cost,
    });
  };

  const eligiblePricingOptions = useMemo(() => {
    if (typeof parsedMileage !== "number") return pricingOptions;
    return pricingOptions.filter((r) => isPricingEligibleForVehicle({ pricing: r, vehicleMileageKm: parsedMileage, vehicleClass }));
  }, [parsedMileage, pricingOptions, vehicleClass]);

  useEffect(() => {
    if (!canEdit) return;
    if (!contract) return;
    if (!selectedProductId) return;
    if (selectedPricingId) return;
    if (pricingOptionsQuery.isLoading || pricingOptionsQuery.isError) return;
    if (eligiblePricingOptions.length === 0) return;

    const row = defaultPricingRow(eligiblePricingOptions);
    if (!row) return;

    void (async () => {
      const costCents = costFromProductOrPricing({ dealerCostCents: row.dealerCostCents, basePriceCents: row.basePriceCents });
      if (typeof costCents !== "number") return;
      const retailCents = retailFromCost(costCents, markupPct) ?? costCents;

      setPricingId(row.id);
      await updateMutation.mutateAsync({
        productPricingId: row.id,
        pricingTermMonths: row.termMonths,
        pricingTermKm: row.termKm,
        pricingVehicleMileageMinKm: typeof row.vehicleMileageMinKm === "number" ? row.vehicleMileageMinKm : null,
        pricingVehicleMileageMaxKm:
          row.vehicleMileageMaxKm === null ? null : typeof row.vehicleMileageMaxKm === "number" ? row.vehicleMileageMaxKm : null,
        pricingVehicleClass: typeof row.vehicleClass === "string" ? row.vehicleClass : null,
        pricingDeductibleCents: row.deductibleCents,
        pricingBasePriceCents: retailCents,
        pricingDealerCostCents: costCents,
      });
    })();
  }, [
    canEdit,
    contract,
    eligiblePricingOptions,
    markupPct,
    pricingOptionsQuery.isError,
    pricingOptionsQuery.isLoading,
    selectedPricingId,
    selectedProductId,
    updateMutation,
  ]);

  const selectedPricing = useMemo(() => {
    const id = selectedPricingId;
    if (!id) return null;
    return pricingOptions.find((r) => r.id === id) ?? null;
  }, [pricingOptions, selectedPricingId]);

  useEffect(() => {
    if (!selectedPricingId) return;
    if (typeof parsedMileage !== "number") return;
    const stillOk = eligiblePricingOptions.some((r) => r.id === selectedPricingId);
    if (!stillOk) setPricingId("");
  }, [eligiblePricingOptions, parsedMileage, selectedPricingId]);

  const vinNormalized = vin.trim().replace(/[^a-z0-9]/gi, "").toUpperCase();
  const vinError = canEdit && vinNormalized.length > 0 && vinNormalized.length !== 17 ? "VIN must be 17 characters." : null;

  const stepItems: Array<{ key: WizardStep; label: string; enabled: boolean }> = [
    { key: "PRICING", label: "Pricing", enabled: true },
    { key: "VEHICLE", label: "Vehicle", enabled: true },
    { key: "CUSTOMER", label: "Customer", enabled: true },
    {
      key: "CONFIRM",
      label: "Confirm",
      enabled: Boolean(selectedProductId) && Boolean(selectedPricingId) && vinNormalized.length === 17 && Boolean(customerName.trim()),
    },
  ];

  return (
    <PageShell
      title={contract ? `Contract ${contract.contractNumber}` : "Contract"}
      actions={
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <Link to="/dealer-contracts">Back</Link>
          </Button>
        </div>
      }
    >
      <div className="max-w-4xl mx-auto">
        {contractQuery.isError ? (
          <div className="text-sm text-destructive">Failed to load contract.</div>
        ) : null}

        {!contractQuery.isLoading && !contract ? (
          <div className="mt-6 rounded-2xl border bg-card p-6 shadow-card">
            <div className="text-sm text-muted-foreground">Contract not found.</div>
          </div>
        ) : null}

        {contract ? (
          <div className="mt-6 grid grid-cols-1 gap-6">
            <div className="rounded-2xl border bg-card p-4 shadow-card">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-semibold">Contract Setup</div>
                  <div className="text-sm text-muted-foreground mt-1">Complete each step, then submit to lock the contract.</div>
                </div>
                <div className="text-xs text-muted-foreground">{canEdit ? "Draft" : "Locked"}</div>
              </div>

              <div className="mt-4 flex gap-2 flex-wrap">
                {stepItems.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => {
                      if (!s.enabled) return;
                      setStep(s.key);
                    }}
                    className={
                      "text-sm px-3 py-1.5 rounded-lg border transition-colors " +
                      (step === s.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : s.enabled
                          ? "bg-background hover:bg-muted text-muted-foreground"
                          : "bg-muted/30 text-muted-foreground border-muted")
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {step === "CUSTOMER" ? (
              <div className="rounded-2xl border bg-card p-4 shadow-card">
                <div className="font-semibold">Customer</div>
                <div className="text-sm text-muted-foreground mt-1">Customer contact + address (Draft only).</div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-6 gap-2">
                  <div className="md:col-span-3">
                    <Input
                      value={canEdit ? customerName : contract.customerName}
                      onChange={(e) => setCustomerName(sanitizeLettersOnly(e.target.value))}
                      placeholder="Full name"
                      autoComplete="name"
                      name="name"
                      className="h-9 text-sm"
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="md:col-span-3">
                    <Input
                      value={canEdit ? customerPhone : contract.customerPhone ?? ""}
                      onChange={(e) => setCustomerPhone(sanitizeDigitsOnly(e.target.value))}
                      placeholder="Phone"
                      autoComplete="tel"
                      name="tel"
                      inputMode="tel"
                      className="h-9 text-sm"
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="md:col-span-6">
                    <Input
                      value={canEdit ? customerEmail : contract.customerEmail ?? ""}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="Email"
                      autoComplete="email"
                      name="email"
                      inputMode="email"
                      className="h-9 text-sm"
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="md:col-span-6">
                    <Input
                      value={canEdit ? customerAddress : contract.customerAddress ?? ""}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      placeholder="Street address"
                      autoComplete="street-address"
                      name="street-address"
                      className="h-9 text-sm"
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="md:col-span-3">
                    <Input
                      value={canEdit ? customerCity : contract.customerCity ?? ""}
                      onChange={(e) => setCustomerCity(sanitizeLettersOnly(e.target.value))}
                      placeholder="City"
                      autoComplete="address-level2"
                      name="address-level2"
                      className="h-9 text-sm"
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Input
                      value={canEdit ? customerProvince : contract.customerProvince ?? ""}
                      onChange={(e) => setCustomerProvince(sanitizeLettersOnly(e.target.value))}
                      placeholder="Province"
                      autoComplete="address-level1"
                      name="address-level1"
                      className="h-9 text-sm"
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="md:col-span-1">
                    <Input
                      value={canEdit ? customerPostalCode : contract.customerPostalCode ?? ""}
                      onChange={(e) => setCustomerPostalCode(e.target.value.toUpperCase())}
                      placeholder="Postal"
                      autoComplete="postal-code"
                      name="postal-code"
                      className="h-9 text-sm"
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div className="mt-3 flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    onClick={() => {
                      void (async () => {
                        await onSaveCustomer();
                        setStep("CONFIRM");
                      })();
                    }}
                    disabled={!canEdit || updateMutation.isPending}
                  >
                    Confirm
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setStep("VEHICLE")}>
                    Back
                  </Button>
                </div>
              </div>
            ) : null}

            {step === "VEHICLE" ? (
              <div className="rounded-2xl border bg-card p-6 shadow-card">
                <div className="font-semibold">Vehicle</div>
                <div className="text-sm text-muted-foreground mt-1">Enter VIN and vehicle details (Draft only).</div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div className="md:col-span-2">
                    <div className="text-xs text-muted-foreground mb-1">VIN</div>
                    <Input
                      value={canEdit ? vin : contract.vin ?? ""}
                      onChange={(e) => setVin(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        if (!canEdit) return;
                        if (vinNormalized.length !== 17) return;
                        decodeVinMutation.mutate(vinNormalized);
                      }}
                      placeholder="VIN"
                      disabled={!canEdit}
                    />
                    {vinError ? <div className="mt-1 text-xs text-destructive">{vinError}</div> : null}
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => decodeVinMutation.mutate(vinNormalized)}
                    disabled={!canEdit || vinNormalized.length !== 17 || !!vinError || decodeVinMutation.isPending || updateMutation.isPending}
                  >
                    Decode VIN
                  </Button>

                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Mileage (km)</div>
                    <Input
                      value={vehicleMileageKm}
                      onChange={(e) => setVehicleMileageKm(sanitizeDigitsOnly(e.target.value))}
                      placeholder="e.g. 85000"
                      inputMode="numeric"
                      disabled={!canEdit}
                    />
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Vehicle class</div>
                    <select
                      value={vehicleClass}
                      onChange={(e) => setVehicleClass(e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                      disabled={!canEdit}
                    >
                      <option value="">Select (optional)</option>
                      <option value="CLASS_1">Class 1</option>
                      <option value="CLASS_2">Class 2</option>
                      <option value="CLASS_3">Class 3</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border p-4 bg-muted/20">
                  <div className="text-xs text-muted-foreground">Decoded Vehicle</div>
                  <div className="mt-2 text-sm">
                    <span className="font-medium text-foreground">{[vehicleYear, vehicleMake, vehicleModel].filter(Boolean).join(" ") || "—"}</span>
                    {vehicleTrim.trim() ? <span className="text-muted-foreground"> • {vehicleTrim}</span> : null}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {typeof vehicleAgeYears === "number" ? `Vehicle age: ${vehicleAgeYears} yr` : "Vehicle age: —"}
                    {" • "}
                    {parsedMileage ? `Mileage: ${parsedMileage.toLocaleString()} km` : "Mileage: —"}
                  </div>
                </div>

                {decodeVinMutation.isError ? <div className="mt-3 text-xs text-destructive">Failed to decode VIN.</div> : null}

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    value={canEdit ? vehicleYear : contract.vehicleYear ?? ""}
                    onChange={(e) => setVehicleYear(sanitizeDigitsOnly(e.target.value))}
                    placeholder="Year"
                    inputMode="numeric"
                    disabled={!canEdit}
                  />
                  <Input
                    value={canEdit ? vehicleMake : contract.vehicleMake ?? ""}
                    onChange={(e) => setVehicleMake(sanitizeWordsOnly(e.target.value))}
                    placeholder="Make"
                    disabled={!canEdit}
                  />
                  <Input
                    value={canEdit ? vehicleModel : contract.vehicleModel ?? ""}
                    onChange={(e) => setVehicleModel(sanitizeWordsOnly(e.target.value))}
                    placeholder="Model"
                    disabled={!canEdit}
                  />
                  <Input
                    value={canEdit ? vehicleTrim : contract.vehicleTrim ?? ""}
                    onChange={(e) => setVehicleTrim(sanitizeWordsOnly(e.target.value))}
                    placeholder="Trim"
                    disabled={!canEdit}
                  />
                  <Input
                    value={canEdit ? vehicleBodyClass : contract.vehicleBodyClass ?? ""}
                    onChange={(e) => setVehicleBodyClass(sanitizeWordsOnly(e.target.value))}
                    placeholder="Body Class"
                    disabled={!canEdit}
                  />
                  <Input
                    value={canEdit ? vehicleEngine : contract.vehicleEngine ?? ""}
                    onChange={(e) => setVehicleEngine(sanitizeWordsOnly(e.target.value))}
                    placeholder="Engine"
                    disabled={!canEdit}
                  />
                  <Input
                    value={canEdit ? vehicleTransmission : contract.vehicleTransmission ?? ""}
                    onChange={(e) => setVehicleTransmission(sanitizeWordsOnly(e.target.value))}
                    placeholder="Transmission"
                    disabled={!canEdit}
                  />
                </div>

                <div className="mt-4 flex gap-2 flex-wrap">
                  <Button
                    onClick={() => {
                      void (async () => {
                        await onSaveVehicle();
                        setStep("CUSTOMER");
                      })();
                    }}
                    disabled={!canEdit || updateMutation.isPending}
                  >
                    Next
                  </Button>
                  <Button variant="outline" onClick={() => setStep("PRICING")}>
                    Back
                  </Button>
                </div>
              </div>
            ) : null}

            {step === "PRICING" ? (
              <div className="rounded-2xl border bg-card p-6 shadow-card">
                <div className="font-semibold">Pricing</div>
                <div className="text-sm text-muted-foreground mt-1">Select the term + km option for this contract.</div>

                <div className="mt-4 rounded-xl border p-4 bg-muted/20">
                  <div className="text-xs text-muted-foreground">Selected plan</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{selectedProduct ? selectedProduct.name : "—"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {selectedProduct ? providerDisplay(selectedProduct.providerId) : ""}
                    {selectedProduct ? " • " : ""}
                    {selectedPricing
                      ? `${selectedPricing.termMonths === null ? "Unlimited" : `${selectedPricing.termMonths} mo`} / ${selectedPricing.termKm === null ? "Unlimited" : `${selectedPricing.termKm.toLocaleString()} km`}`
                      : "Select a pricing option"}
                    {selectedPricing ? " • " : ""}
                    {selectedPricing ? `Deductible ${money(selectedPricing.deductibleCents)}` : ""}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border p-4">
                  <div className="text-xs text-muted-foreground">Available pricing</div>
                  {pricingOptionsQuery.isLoading ? <div className="mt-2 text-sm text-muted-foreground">Loading pricing…</div> : null}
                  {pricingOptionsQuery.isError ? <div className="mt-2 text-sm text-destructive">Failed to load pricing.</div> : null}

                  {!pricingOptionsQuery.isLoading && !pricingOptionsQuery.isError && eligiblePricingOptions.length === 0 ? (
                    <div className="mt-2 text-sm text-muted-foreground">No eligible pricing rows found for this plan.</div>
                  ) : null}

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {eligiblePricingOptions
                      .slice()
                      .sort((a, b) => {
                        const am = a.termMonths ?? Number.MAX_SAFE_INTEGER;
                        const bm = b.termMonths ?? Number.MAX_SAFE_INTEGER;
                        const ak = a.termKm ?? Number.MAX_SAFE_INTEGER;
                        const bk = b.termKm ?? Number.MAX_SAFE_INTEGER;
                        return (am - bm) || (ak - bk) || (a.deductibleCents - b.deductibleCents);
                      })
                      .map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            void (async () => {
                              await selectPricing(r);
                            })();
                          }}
                          disabled={!canEdit || updateMutation.isPending}
                          className={
                            "rounded-xl border p-4 text-left transition-colors " +
                            (r.id === selectedPricingId ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted")
                          }
                        >
                          <div className="text-sm font-medium">
                            {(r.termMonths === null ? "Unlimited" : `${r.termMonths} mo`)} / {(r.termKm === null ? "Unlimited" : `${r.termKm.toLocaleString()} km`)}
                          </div>
                          <div className={"text-xs mt-1 " + (r.id === selectedPricingId ? "text-primary-foreground/80" : "text-muted-foreground")}>
                            Deductible {money(r.deductibleCents)}
                          </div>
                          <div className={"text-sm font-semibold mt-2 " + (r.id === selectedPricingId ? "text-primary-foreground" : "text-foreground")}>
                            {(() => {
                              const cost = costFromProductOrPricing({ dealerCostCents: r.dealerCostCents, basePriceCents: r.basePriceCents });
                              const retail = retailFromCost(cost, markupPct) ?? cost;
                              return money(retail);
                            })()}
                          </div>
                        </button>
                      ))}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border p-4">
                  <div className="text-xs text-muted-foreground">Add-ons</div>
                  {productAddonsQuery.isLoading ? <div className="mt-2 text-sm text-muted-foreground">Loading add-ons…</div> : null}
                  {productAddonsQuery.isError ? <div className="mt-2 text-sm text-destructive">Failed to load add-ons.</div> : null}
                  {!productAddonsQuery.isLoading && !productAddonsQuery.isError && activeAddons.length === 0 ? (
                    <div className="mt-2 text-sm text-muted-foreground">No add-ons available for this plan.</div>
                  ) : null}

                  <div className="mt-3 space-y-2">
                    {activeAddons.map((a) => {
                      const costCents = costFromProductOrPricing({ dealerCostCents: a.dealerCostCents, basePriceCents: a.basePriceCents });
                      const retailCents = retailFromCost(costCents, markupPct) ?? costCents;
                      return (
                        <label key={a.id} className="flex items-start justify-between gap-3 text-sm">
                          <span className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedAddonIds[a.id])}
                              disabled={!canEdit || updateMutation.isPending}
                              onChange={(e) => {
                                const next = { ...selectedAddonIds, [a.id]: e.target.checked };
                                setSelectedAddonIds(next);
                                void persistAddonSelection(next);
                              }}
                            />
                            <span className="flex-1">
                              <span className="font-medium text-foreground">{a.name}</span>
                              {a.description ? <span className="block text-xs text-muted-foreground mt-0.5">{a.description}</span> : null}
                            </span>
                          </span>
                          <span className="font-semibold text-foreground whitespace-nowrap">{money(retailCents)}</span>
                        </label>
                      );
                    })}
                  </div>

                  {selectedAddonSnapshots.length > 0 ? (
                    <div className="mt-3 text-xs text-muted-foreground">Selected add-ons total {money(addonTotals.retail)}</div>
                  ) : null}
                </div>

                <div className="mt-4 rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      <div className="text-xs text-muted-foreground">Pricing</div>
                      {(() => {
                        const baseCost =
                          costFromProductOrPricing({
                            dealerCostCents: selectedPricing?.dealerCostCents,
                            basePriceCents: selectedPricing?.basePriceCents,
                          }) ?? 0;
                        const baseRetail = (retailFromCost(baseCost, markupPct) ?? baseCost) || 0;
                        const addonsRetail = addonTotals.retail;
                        const totalRetail = baseRetail + addonsRetail;
                        return (
                          <>
                            <div className="text-lg font-semibold mt-1">{money(totalRetail)}</div>
                            <div className="text-xs text-muted-foreground mt-1">Price shown includes your dealership markup.</div>
                          </>
                        );
                      })()}
                    </div>
                    <div className="text-right">
                      {(() => {
                        const baseCost =
                          costFromProductOrPricing({
                            dealerCostCents: selectedPricing?.dealerCostCents,
                            basePriceCents: selectedPricing?.basePriceCents,
                          }) ?? 0;
                        const baseRetail = (retailFromCost(baseCost, markupPct) ?? baseCost) || 0;
                        const addonsRetail = addonTotals.retail;
                        const totalRetail = baseRetail + addonsRetail;
                        return (
                          <>
                            <div className="text-xs text-muted-foreground">Total</div>
                            <div className="text-lg font-semibold mt-1">{money(totalRetail)}</div>
                            <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                              <div className="flex items-center justify-end gap-2">
                                <span>Add-ons</span>
                                <span className="tabular-nums">{money(addonsRetail)}</span>
                              </div>
                              <div className="flex items-center justify-end gap-2">
                                <span>Plan</span>
                                <span className="tabular-nums">{money(baseRetail)}</span>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex gap-2 flex-wrap">
                  <Button onClick={() => setStep("VEHICLE")} disabled={!selectedProductId || !selectedPricingId}>
                    Next
                  </Button>
                </div>
              </div>
            ) : null}

            {step === "CONFIRM" ? (
              <div className="rounded-2xl border bg-card p-6 shadow-card">
                <div className="font-semibold">Confirmation</div>
                <div className="text-sm text-muted-foreground mt-1">Confirm details and submit to finalize the contract.</div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border p-4">
                    <div className="text-xs text-muted-foreground">Customer</div>
                    <div className="text-sm font-medium mt-1">{contract.customerName || "—"}</div>
                    <div className="text-xs text-muted-foreground mt-1">{contract.customerEmail || ""}</div>
                    <div className="text-xs text-muted-foreground">{contract.customerPhone || ""}</div>
                  </div>
                  <div className="rounded-xl border p-4">
                    <div className="text-xs text-muted-foreground">Vehicle</div>
                    <div className="text-sm font-medium mt-1">{contract.vin || "—"}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {[contract.vehicleYear, contract.vehicleMake, contract.vehicleModel, contract.vehicleTrim].filter(Boolean).join(" ")}
                    </div>
                  </div>
                  <div className="rounded-xl border p-4 md:col-span-2">
                    <div className="text-xs text-muted-foreground">Plan</div>
                    <div className="text-sm font-medium mt-1">{selectedProduct ? selectedProduct.name : "—"}</div>
                    <div className="text-xs text-muted-foreground mt-1">{selectedProduct ? providerDisplay(selectedProduct.providerId) : ""}</div>
                  </div>
                  <div className="rounded-xl border p-4 md:col-span-2">
                    <div className="flex items-start justify-between gap-6">
                      <div>
                        <div className="text-xs text-muted-foreground">Total</div>
                        {(() => {
                          const cost = costFromProductOrPricing({
                            dealerCostCents: selectedPricing?.dealerCostCents,
                            basePriceCents: selectedPricing?.basePriceCents,
                          });
                          const retail = (retailFromCost(cost, markupPct) ?? cost) || 0;
                          const totalRetail = retail + addonTotals.retail;
                          return <div className="text-lg font-semibold mt-1">{money(totalRetail)}</div>;
                        })()}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Status</div>
                        <div className="text-sm font-medium mt-1">{contract.status}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {contract.status === "DRAFT" ? (
                  <div className="mt-4 flex gap-2 flex-wrap">
                    <Button onClick={() => void onSubmit()} disabled={updateMutation.isPending}>
                      Submit contract
                    </Button>
                    <Button variant="outline" onClick={() => setStep("CUSTOMER")}>
                      Review details
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4 text-sm text-muted-foreground">This contract has been submitted and is locked.</div>
                )}

                <div className="mt-4 flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    className="bg-yellow-400 text-black hover:bg-yellow-300"
                    onClick={() => navigate(`/dealer-contracts/${contractId}/print/customer`)}
                    disabled={!contractId}
                    title="Print or save the customer copy"
                  >
                    Customer copy
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/dealer-contracts/${contractId}/print/dealer`)}
                    disabled={!contractId}
                    title="Print or save the dealer copy"
                  >
                    Dealer copy
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border bg-card p-6 shadow-card">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Warranty ID</div>
                  <div className="text-lg font-semibold mt-1">{contract.warrantyId}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Status</div>
                  <div className="text-lg font-semibold mt-1">{contract.status}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Created</div>
                  <div className="text-sm mt-1">{new Date(contract.createdAt).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Last updated</div>
                  <div className="text-sm mt-1">{new Date(contract.updatedAt).toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
