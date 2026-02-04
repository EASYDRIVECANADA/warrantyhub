import { useEffect, useMemo, useState } from "react";
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
import {
  costFromProductOrPricing,
  marginFromCostAndRetail,
  marginPctFromCostAndRetail,
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

type WizardStep = "CUSTOMER" | "VEHICLE" | "PLAN" | "PRICING" | "CONFIRM";

function productTypeLabel(t: string | undefined) {
  if (t === "EXTENDED_WARRANTY") return "Extended Warranty";
  if (t === "TIRE_RIM") return "Tire & Rim";
  if (t === "APPEARANCE") return "Appearance";
  if (t === "GAP") return "GAP";
  if (t === "OTHER") return "Other";
  return "—";
}

function money(cents?: number) {
  if (typeof cents !== "number") return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type MatchLevel = "TRIM_EXACT" | "TRIM_CONTAINS" | "MODEL" | "MAKE" | "NONE";

function matchLevelForVehicle(input: {
  vehicleTrim?: string;
  vehicleModel?: string;
  vehicleMake?: string;
  providerText: string;
}): MatchLevel {
  const trim = norm(input.vehicleTrim ?? "");
  const model = norm(input.vehicleModel ?? "");
  const make = norm(input.vehicleMake ?? "");
  const hay = norm(input.providerText);

  if (trim && hay === trim) return "TRIM_EXACT";
  if (trim && (hay.includes(trim) || trim.includes(hay))) return "TRIM_CONTAINS";
  if (model && hay.includes(model)) return "MODEL";
  if (make && hay.includes(make)) return "MAKE";
  return "NONE";
}

export function DealerContractDetailPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const contractId = id ?? "";

  const mode = useMemo(() => getAppMode(), []);
  const isEmployee = user?.role === "DEALER_EMPLOYEE";
  const canSeeCost = user?.role === "DEALER_ADMIN";
  const dealerId = (mode === "local" ? (user?.dealerId ?? user?.id ?? "") : (user?.dealerId ?? "")).trim();
  const { markupPct } = useDealerMarkupPct(dealerId);

  const api = useMemo(() => getContractsApi(), []);
  const marketplaceApi = useMemo(() => getMarketplaceApi(), []);
  const productPricingApi = useMemo(() => getProductPricingApi(), []);
  const providersApi = useMemo(() => getProvidersApi(), []);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const contractQuery = useQuery({
    queryKey: ["contract", contractId],
    enabled: !!contractId,
    queryFn: () => api.get(contractId),
  });

  const allContractsQuery = useQuery({
    queryKey: ["contracts"],
    queryFn: () => api.list(),
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
        badge="Dealer Portal"
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
  const [vehicleEngine, setVehicleEngine] = useState("");
  const [vehicleTransmission, setVehicleTransmission] = useState("");
  const [productId, setProductId] = useState("");
  const [pricingId, setPricingId] = useState("");
  const [step, setStep] = useState<WizardStep>("VEHICLE");

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
    setVehicleEngine(contract.vehicleEngine ?? "");
    setVehicleTransmission(contract.vehicleTransmission ?? "");
    setProductId(contract.productId ?? "");
    setPricingId(contract.productPricingId ?? "");

    const vinNormalized = (contract.vin ?? "").trim().replace(/[^a-z0-9]/gi, "").toUpperCase();
    const hasVin = vinNormalized.length === 17;
    const hasPlan = Boolean((contract.productId ?? "").trim());

    if (contract.status !== "DRAFT") {
      setStep("CONFIRM");
      return;
    }
    if (!hasVin) {
      setStep("VEHICLE");
      return;
    }
    if (!hasPlan) {
      setStep("PLAN");
      return;
    }
    setStep("PRICING");
  }, [contract]);

  type ContractPatch = Parameters<ContractsApi["update"]>[1] & {
    productPricingId?: string | null;
    pricingTermMonths?: number | null;
    pricingTermKm?: number | null;
    pricingDeductibleCents?: number | null;
    pricingBasePriceCents?: number | null;
    pricingDealerCostCents?: number | null;
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
    if (!(await confirmProceed("Save vehicle details?"))) return;
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
    if (!(await confirmProceed("Save customer details?"))) return;
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

  const eligibleProducts = useMemo(() => {
    const items = marketplaceProducts
      .map((p) => {
        const eligibleByAge =
          typeof p.eligibilityMaxVehicleAgeYears !== "number"
            ? true
            : typeof vehicleAgeYears === "number"
              ? vehicleAgeYears <= p.eligibilityMaxVehicleAgeYears
              : false;
        const eligibleByMileage =
          typeof p.eligibilityMaxMileageKm !== "number"
            ? true
            : typeof parsedMileage === "number"
              ? parsedMileage <= p.eligibilityMaxMileageKm
              : false;

        const eligibleByVehicle = (() => {
          const makeAllow = (p.eligibilityMakeAllowlist ?? []).map((x) => norm(x)).filter(Boolean);
          const modelAllow = (p.eligibilityModelAllowlist ?? []).map((x) => norm(x)).filter(Boolean);
          const trimAllow = (p.eligibilityTrimAllowlist ?? []).map((x) => norm(x)).filter(Boolean);

          const vMake = norm(vehicleMake);
          const vModel = norm(vehicleModel);
          const vTrim = norm(vehicleTrim);

          if (makeAllow.length > 0 && (!vMake || !makeAllow.includes(vMake))) return false;
          if (modelAllow.length > 0 && (!vModel || !modelAllow.includes(vModel))) return false;

          if (trimAllow.length > 0) {
            if (!vTrim) return false;
            const ok = trimAllow.some((t) => vTrim.includes(t) || t.includes(vTrim));
            if (!ok) return false;
          }

          return true;
        })();

        const match = matchLevelForVehicle({
          vehicleTrim,
          vehicleModel,
          vehicleMake,
          providerText: `${p.name} ${p.coverageDetails ?? ""}`,
        });

        return {
          product: p,
          eligible: eligibleByAge && eligibleByMileage && eligibleByVehicle,
          eligibleByAge,
          eligibleByMileage,
          eligibleByVehicle,
          match,
        };
      })
      .filter((x) => x.eligible)
      .sort((a, b) => {
        const weight = (m: MatchLevel) => {
          if (m === "TRIM_EXACT") return 5;
          if (m === "TRIM_CONTAINS") return 4;
          if (m === "MODEL") return 3;
          if (m === "MAKE") return 2;
          return 1;
        };
        return weight(b.match) - weight(a.match);
      });
    return items;
  }, [marketplaceProducts, parsedMileage, vehicleAgeYears, vehicleMake, vehicleModel, vehicleTrim]);

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

  const selectPlan = async (p: Product) => {
    if (!contract) return;
    if (!(await confirmProceed(`Select ${p.name} for this contract?`))) return;
    setProductId(p.id);
    setPricingId("");
    await updateMutation.mutateAsync({
      productId: p.id,
      providerId: p.providerId,
      productPricingId: null,
      pricingTermMonths: null,
      pricingTermKm: null,
      pricingDeductibleCents: null,
      pricingBasePriceCents: null,
      pricingDealerCostCents: null,
    });
  };

  const selectPricing = async (row: ProductPricing) => {
    if (!contract) return;
    if (!(await confirmProceed(`Select ${row.termMonths} mo / ${row.termKm} km for this contract?`))) return;

    const costCents = costFromProductOrPricing({ dealerCostCents: row.dealerCostCents, basePriceCents: row.basePriceCents });
    if (typeof costCents !== "number") throw new Error("Pricing row is missing a cost");
    const retailCents = retailFromCost(costCents, markupPct) ?? costCents;

    setPricingId(row.id);
    await updateMutation.mutateAsync({
      productPricingId: row.id,
      pricingTermMonths: row.termMonths,
      pricingTermKm: row.termKm,
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
  const selectedPricing = useMemo(() => {
    const id = selectedPricingId;
    if (!id) return null;
    return pricingOptions.find((r) => r.id === id) ?? null;
  }, [pricingOptions, selectedPricingId]);

  const vinNormalized = vin.trim().replace(/[^a-z0-9]/gi, "").toUpperCase();
  const vinError = canEdit && vinNormalized.length > 0 && vinNormalized.length !== 17 ? "VIN must be 17 characters." : null;

  const stepItems: Array<{ key: WizardStep; label: string; enabled: boolean }> = [
    { key: "VEHICLE", label: "Vehicle", enabled: true },
    { key: "PLAN", label: "Plan", enabled: vinNormalized.length === 17 },
    { key: "CUSTOMER", label: "Customer", enabled: true },
    { key: "PRICING", label: "Pricing", enabled: Boolean(selectedProductId) && vinNormalized.length === 17 },
    {
      key: "CONFIRM",
      label: "Confirm",
      enabled: Boolean(selectedProductId) && Boolean(selectedPricingId) && vinNormalized.length === 17 && Boolean(customerName.trim()),
    },
  ];

  const suggestions = useMemo(() => {
    if (!canEdit) return [];
    const all = ((allContractsQuery.data ?? []) as Contract[]).filter((c) => c.id !== contractId);
    const q = customerName.trim().toLowerCase();
    if (!q) return [];

    const seen = new Set<string>();
    const items: Array<Pick<Contract, "customerName" | "customerEmail" | "customerPhone" | "customerAddress" | "customerCity" | "customerProvince" | "customerPostalCode">> = [];

    for (const c of all) {
      const name = (c.customerName ?? "").trim();
      if (!name) continue;
      if (!name.toLowerCase().includes(q)) continue;
      const key = `${name.toLowerCase()}|${(c.customerEmail ?? "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        customerName: c.customerName,
        customerEmail: c.customerEmail,
        customerPhone: c.customerPhone,
        customerAddress: c.customerAddress,
        customerCity: c.customerCity,
        customerProvince: c.customerProvince,
        customerPostalCode: c.customerPostalCode,
      });
      if (items.length >= 5) break;
    }
    return items;
  }, [allContractsQuery.data, canEdit, contractId, customerName]);

  return (
    <PageShell
      badge="Dealer Portal"
      title={contract ? `Contract ${contract.contractNumber}` : "Contract"}
      subtitle="Create a customer warranty contract in a step-by-step flow."
      actions={
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <Link to="/dealer-contracts">Back</Link>
          </Button>
          <Button variant="outline" onClick={() => navigate(`/dealer-contracts/${contractId}/print/dealer`)} disabled={!contractId}>
            Dealer Copy
          </Button>
          {isEmployee ? null : (
            <Button variant="outline" onClick={() => navigate(`/dealer-contracts/${contractId}/print/provider`)} disabled={!contractId}>
              Provider Copy
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate(`/dealer-contracts/${contractId}/print/customer`)} disabled={!contractId}>
            Customer Copy
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
              <div className="rounded-2xl border bg-card p-6 shadow-card">
                <div className="font-semibold">Customer</div>
                <div className="text-sm text-muted-foreground mt-1">Collect customer contact details (Draft only).</div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    value={canEdit ? customerName : contract.customerName}
                    onChange={(e) => setCustomerName(sanitizeLettersOnly(e.target.value))}
                    placeholder="Customer name"
                    disabled={!canEdit}
                  />

                  <Input
                    value={canEdit ? customerEmail : contract.customerEmail ?? ""}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="Email"
                    disabled={!canEdit}
                  />

                  <Input
                    value={canEdit ? customerPhone : contract.customerPhone ?? ""}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Phone"
                    disabled={!canEdit}
                  />

                  <Input
                    value={canEdit ? customerAddress : contract.customerAddress ?? ""}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Address"
                    disabled={!canEdit}
                  />

                  <Input
                    value={canEdit ? customerCity : contract.customerCity ?? ""}
                    onChange={(e) => setCustomerCity(sanitizeLettersOnly(e.target.value))}
                    placeholder="City"
                    disabled={!canEdit}
                  />

                  <Input
                    value={canEdit ? customerProvince : contract.customerProvince ?? ""}
                    onChange={(e) => setCustomerProvince(sanitizeLettersOnly(e.target.value))}
                    placeholder="Province"
                    disabled={!canEdit}
                  />

                  <Input
                    value={canEdit ? customerPostalCode : contract.customerPostalCode ?? ""}
                    onChange={(e) => setCustomerPostalCode(e.target.value)}
                    placeholder="Postal code"
                    disabled={!canEdit}
                  />
                </div>

                {canEdit && suggestions.length > 0 ? (
                  <div className="mt-4">
                    <div className="text-xs text-muted-foreground">Suggestions</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {suggestions.map((s) => (
                        <button
                          key={`${s.customerName}-${s.customerEmail ?? ""}`}
                          type="button"
                          onClick={() => {
                            setCustomerName(s.customerName);
                            setCustomerEmail(s.customerEmail ?? "");
                            setCustomerPhone(s.customerPhone ?? "");
                            setCustomerAddress(s.customerAddress ?? "");
                            setCustomerCity(s.customerCity ?? "");
                            setCustomerProvince(s.customerProvince ?? "");
                            setCustomerPostalCode(s.customerPostalCode ?? "");
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg border bg-background hover:bg-muted text-muted-foreground"
                        >
                          {s.customerName}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 flex gap-2 flex-wrap">
                  <Button
                    onClick={() => {
                      void (async () => {
                        await onSaveCustomer();
                        setStep("VEHICLE");
                      })();
                    }}
                    disabled={!canEdit || updateMutation.isPending}
                  >
                    Save & Continue
                  </Button>
                  <Button variant="outline" onClick={() => setStep("VEHICLE")}>
                    Skip to vehicle
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
                        setStep("PLAN");
                      })();
                    }}
                    disabled={!canEdit || updateMutation.isPending}
                  >
                    Save & Continue
                  </Button>
                  <Button variant="outline" onClick={() => setStep("PLAN")}>
                    Continue to plan
                  </Button>
                </div>
              </div>
            ) : null}

            {step === "PLAN" ? (
              <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
                <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-semibold">Select a Plan</div>
                    <div className="text-sm text-muted-foreground mt-1">Retail pricing shown. Select to attach to this contract.</div>
                  </div>
                  <div className="text-sm text-muted-foreground">{eligibleProducts.length} eligible</div>
                </div>

                {eligibleProducts.length === 0 ? (
                  <div className="px-6 py-10 text-sm text-muted-foreground">
                    No eligible plans yet. Decode a VIN and enter mileage to apply provider eligibility rules.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left px-6 py-3 text-xs text-muted-foreground">Provider</th>
                          <th className="text-left px-6 py-3 text-xs text-muted-foreground">Product / Type</th>
                          <th className="text-left px-6 py-3 text-xs text-muted-foreground">Term / KM</th>
                          <th className="text-left px-6 py-3 text-xs text-muted-foreground">Deductible</th>
                          <th className="text-left px-6 py-3 text-xs text-muted-foreground">From</th>
                          <th className="text-right px-6 py-3 text-xs text-muted-foreground">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {eligibleProducts.map(({ product: p }) => (
                          <tr key={p.id} className={p.id === selectedProductId ? "bg-muted/20" : ""}>
                            <td className="px-6 py-4 text-muted-foreground">{providerDisplay(p.providerId)}</td>
                            <td className="px-6 py-4">
                              <div className="font-medium text-foreground">{p.name}</div>
                              <div className="text-xs text-muted-foreground mt-1">{productTypeLabel(p.productType)}</div>
                            </td>
                            <td className="px-6 py-4 text-muted-foreground">
                              See pricing
                            </td>
                            <td className="px-6 py-4 text-muted-foreground">See pricing</td>
                            <td className="px-6 py-4 font-medium">
                              {(() => {
                                const cost = costFromProductOrPricing({ dealerCostCents: p.dealerCostCents, basePriceCents: p.basePriceCents });
                                const retail = retailFromCost(cost, markupPct) ?? cost;
                                return money(retail);
                              })()}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <Button
                                size="sm"
                                onClick={() => {
                                  void (async () => {
                                    await selectPlan(p);
                                    setStep("PRICING");
                                  })();
                                }}
                                disabled={!canEdit || updateMutation.isPending || p.id === selectedProductId}
                              >
                                {p.id === selectedProductId ? "Selected" : "Select"}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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
                    {selectedPricing ? `${selectedPricing.termMonths} mo / ${selectedPricing.termKm} km` : "Select a pricing option"}
                    {selectedPricing ? " • " : ""}
                    {selectedPricing ? `Deductible ${money(selectedPricing.deductibleCents)}` : ""}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border p-4">
                  <div className="text-xs text-muted-foreground">Available pricing</div>
                  {pricingOptionsQuery.isLoading ? <div className="mt-2 text-sm text-muted-foreground">Loading pricing…</div> : null}
                  {pricingOptionsQuery.isError ? <div className="mt-2 text-sm text-destructive">Failed to load pricing.</div> : null}

                  {!pricingOptionsQuery.isLoading && !pricingOptionsQuery.isError && pricingOptions.length === 0 ? (
                    <div className="mt-2 text-sm text-muted-foreground">No pricing rows found for this plan.</div>
                  ) : null}

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {pricingOptions
                      .slice()
                      .sort((a, b) => (a.termMonths - b.termMonths) || (a.termKm - b.termKm) || (a.deductibleCents - b.deductibleCents))
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
                          <div className="text-sm font-medium">{r.termMonths} mo / {r.termKm.toLocaleString()} km</div>
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
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      <div className="text-xs text-muted-foreground">Retail price</div>
                      {(() => {
                        const cost = costFromProductOrPricing({
                          dealerCostCents: selectedPricing?.dealerCostCents,
                          basePriceCents: selectedPricing?.basePriceCents,
                        });
                        const retail = retailFromCost(cost, markupPct) ?? cost;
                        const margin = marginFromCostAndRetail(cost, retail);
                        const marginPct = marginPctFromCostAndRetail(cost, retail);
                        return (
                          <>
                            <div className="text-lg font-semibold mt-1">{money(retail)}</div>
                            {canSeeCost ? (
                              <div className="text-xs text-muted-foreground mt-1">
                                Cost {money(cost)}
                                {typeof margin === "number" ? ` • Margin ${money(margin)}` : ""}
                                {typeof marginPct === "number" ? ` (${marginPct.toFixed(1)}%)` : ""}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground mt-1">Price is pulled from the selected pricing option.</div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Total</div>
                      {(() => {
                        const cost = costFromProductOrPricing({
                          dealerCostCents: selectedPricing?.dealerCostCents,
                          basePriceCents: selectedPricing?.basePriceCents,
                        });
                        const retail = retailFromCost(cost, markupPct) ?? cost;
                        return <div className="text-lg font-semibold mt-1">{money(retail)}</div>;
                      })()}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex gap-2 flex-wrap">
                  <Button onClick={() => setStep("CONFIRM")} disabled={!selectedProductId || !selectedPricingId}>
                    Continue to confirmation
                  </Button>
                  <Button variant="outline" onClick={() => setStep("PLAN")}>
                    Back to plan
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
                          const retail = retailFromCost(cost, markupPct) ?? cost;
                          return <div className="text-lg font-semibold mt-1">{money(retail)}</div>;
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
