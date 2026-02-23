import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { getProductsApi } from "../lib/products/products";
import { getProductPricingApi } from "../lib/productPricing/productPricing";
import { getProductAddonsApi } from "../lib/productAddons/productAddons";
import { sanitizeDigitsOnly, sanitizeMoney, sanitizeWordsOnly } from "../lib/utils";
import type { CreateProductInput, Product, ProductType } from "../lib/products/types";
import type { ClaimLimitType, ProductPricing } from "../lib/productPricing/types";
import type { ProductAddon } from "../lib/productAddons/types";
import { defaultPricingRow } from "../lib/productPricing/defaultRow";

function productTypeLabel(t: ProductType) {
  if (t === "EXTENDED_WARRANTY") return "Extended Warranty";
  if (t === "TIRE_RIM") return "Tire & Rim";
  if (t === "APPEARANCE") return "Appearance / Rust / Key";
  if (t === "GAP") return "GAP Insurance";
  return "Other";
}

function dollarsToCents(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n * 100);
}

function centsToDollars(cents?: number) {
  if (typeof cents !== "number") return "";
  return (cents / 100).toFixed(2);
}

function money(cents?: number) {
  if (typeof cents !== "number") return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatUnknownError(e: unknown) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const anyE = e as any;
    if (typeof anyE.message === "string" && anyE.message.trim()) return anyE.message;
    if (typeof anyE.error_description === "string" && anyE.error_description.trim()) return anyE.error_description;
    if (typeof anyE.details === "string" && anyE.details.trim()) return anyE.details;
    if (typeof anyE.hint === "string" && anyE.hint.trim()) return anyE.hint;
  }
  return "Unexpected error";
}

function parseOptionalInt(v: string) {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}

function parseAllowlist(raw: string) {
  const items = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function allowlistToString(items: string[] | undefined) {
  if (!items || items.length === 0) return "";
  return items.join(", ");
}

function statusBadge(published: boolean) {
  return (
    "text-[10px] px-2 py-0.5 rounded-md border " +
    (published ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200")
  );
}

function eligibilitySummary(p: Product) {
  const parts: string[] = [];
  if (typeof p.eligibilityMaxVehicleAgeYears === "number") parts.push(`≤${p.eligibilityMaxVehicleAgeYears}y`);
  if (typeof p.eligibilityMaxMileageKm === "number") parts.push(`≤${p.eligibilityMaxMileageKm}km`);
  if (p.eligibilityMakeAllowlist && p.eligibilityMakeAllowlist.length > 0) parts.push(`${p.eligibilityMakeAllowlist.length} makes`);
  if (p.eligibilityModelAllowlist && p.eligibilityModelAllowlist.length > 0) parts.push(`${p.eligibilityModelAllowlist.length} models`);
  if (p.eligibilityTrimAllowlist && p.eligibilityTrimAllowlist.length > 0) parts.push(`${p.eligibilityTrimAllowlist.length} trims`);
  return parts.length > 0 ? parts.join(" • ") : "All";
}

function pricingUniqKey(r: {
  termMonths: number | null;
  termKm: number | null;
  vehicleMileageMinKm?: number;
  vehicleMileageMaxKm?: number | null;
  vehicleClass?: string;
  deductibleCents: number;
  claimLimitCents?: number;
}) {
  const termMonths = r.termMonths;
  const termKm = r.termKm;
  const mileageMin = typeof r.vehicleMileageMinKm === "number" ? r.vehicleMileageMinKm : null;
  const mileageMax = r.vehicleMileageMaxKm === null ? null : typeof r.vehicleMileageMaxKm === "number" ? r.vehicleMileageMaxKm : null;
  const vehicleClass = typeof r.vehicleClass === "string" && r.vehicleClass.trim() ? r.vehicleClass.trim() : null;
  const claimLimit = typeof r.claimLimitCents === "number" ? r.claimLimitCents : null;
  return JSON.stringify([termMonths, termKm, mileageMin, mileageMax, vehicleClass, r.deductibleCents, claimLimit]);
}

function validatePricingHealth(rows: ProductPricing[]) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, reason: "Published products require at least one valid pricing row.", primary: null as ProductPricing | null };
  }

  const defaults = rows.filter((r) => r.isDefault);
  if (defaults.length !== 1) {
    return { ok: false, reason: "Exactly one default pricing row is required.", primary: defaultPricingRow(rows) };
  }

  const seen = new Set<string>();
  for (const r of rows) {
    const key = pricingUniqKey(r);
    if (seen.has(key)) {
      return { ok: false, reason: "Duplicate pricing variants detected.", primary: defaultPricingRow(rows) };
    }
    seen.add(key);

    if (r.termMonths !== null && (!Number.isFinite(r.termMonths) || r.termMonths <= 0)) {
      return { ok: false, reason: "Invalid unlimited usage.", primary: defaultPricingRow(rows) };
    }
    if (r.termKm !== null && (!Number.isFinite(r.termKm) || r.termKm <= 0)) {
      return { ok: false, reason: "Invalid unlimited usage.", primary: defaultPricingRow(rows) };
    }

    if (!Number.isFinite(r.basePriceCents) || r.basePriceCents <= 0) {
      return { ok: false, reason: "Missing required fields.", primary: defaultPricingRow(rows) };
    }
    if (!Number.isFinite(r.deductibleCents) || r.deductibleCents < 0) {
      return { ok: false, reason: "Missing required fields.", primary: defaultPricingRow(rows) };
    }
    if (typeof r.vehicleMileageMinKm === "number" && r.vehicleMileageMinKm < 0) {
      return { ok: false, reason: "Invalid mileage bands.", primary: defaultPricingRow(rows) };
    }
    if (typeof r.vehicleMileageMaxKm === "number" && r.vehicleMileageMaxKm < 0) {
      return { ok: false, reason: "Invalid mileage bands.", primary: defaultPricingRow(rows) };
    }
    if (typeof r.vehicleMileageMinKm === "number" && typeof r.vehicleMileageMaxKm === "number" && r.vehicleMileageMaxKm < r.vehicleMileageMinKm) {
      return { ok: false, reason: "Invalid mileage bands.", primary: defaultPricingRow(rows) };
    }
  }

  return { ok: true, reason: null as string | null, primary: defaults[0] ?? defaultPricingRow(rows) };
}

type EditorState = {
  id?: string;
  name: string;
  productType: ProductType;
  programCode: string;
  pricingVariesByMileageBand: boolean;
  pricingVariesByVehicleClass: boolean;
  pricingRows: Array<{
    key: string;
    isDefault: boolean;
    termMonths: string;
    termMonthsUnlimited: boolean;
    termKm: string;
    termKmUnlimited: boolean;
    vehicleMileageMinKm: string;
    vehicleMileageMaxKm: string;
    vehicleMileageMaxUnlimited: boolean;
    vehicleClass: string;
    claimLimitType: "" | "PER_CLAIM" | "TOTAL_COVERAGE" | "FMV" | "MAX_RETAIL";
    claimLimitAmount: string;
    deductible: string;
    providerCost: string;
  }>;
  eligibilityMaxVehicleAgeYears: string;
  eligibilityMaxMileageKm: string;
  eligibilityMakeAllowlist: string;
  eligibilityModelAllowlist: string;
  eligibilityTrimAllowlist: string;
  coverageDetails: string;
  exclusions: string;
  internalNotes: string;
  published: boolean;
};

type ProductEditorTab = "OVERVIEW" | "ELIGIBILITY" | "PRICING" | "ADDONS" | "DOCUMENTS";

type PendingAddon = {
  key: string;
  name: string;
  description: string;
  price: string;
  pricingType: "FIXED" | "PER_TERM" | "PER_CLAIM";
};

function emptyEditor(): EditorState {
  return {
    name: "",
    productType: "EXTENDED_WARRANTY",
    programCode: "",
    pricingVariesByMileageBand: false,
    pricingVariesByVehicleClass: false,
    pricingRows: [
      {
        key: crypto.randomUUID(),
        isDefault: true,
        termMonths: "",
        termMonthsUnlimited: false,
        termKm: "",
        termKmUnlimited: false,
        vehicleMileageMinKm: "",
        vehicleMileageMaxKm: "",
        vehicleMileageMaxUnlimited: false,
        vehicleClass: "ALL",
        claimLimitType: "",
        claimLimitAmount: "",
        deductible: "",
        providerCost: "",
      },
    ],
    eligibilityMaxVehicleAgeYears: "",
    eligibilityMaxMileageKm: "",
    eligibilityMakeAllowlist: "",
    eligibilityModelAllowlist: "",
    eligibilityTrimAllowlist: "",
    coverageDetails: "",
    exclusions: "",
    internalNotes: "",
    published: false,
  };
}

function editorFromProduct(p: Product): EditorState {
  const fallbackRow: EditorState["pricingRows"][number] = {
    key: crypto.randomUUID(),
    isDefault: true,
    termMonths: "",
    termMonthsUnlimited: false,
    termKm: "",
    termKmUnlimited: false,
    vehicleMileageMinKm: "",
    vehicleMileageMaxKm: "",
    vehicleMileageMaxUnlimited: false,
    vehicleClass: "ALL",
    claimLimitType: "",
    claimLimitAmount: "",
    deductible: "",
    providerCost: "",
  };
  return {
    id: p.id,
    name: p.name,
    productType: p.productType,
    programCode: (p.programCode ?? "").trim(),
    pricingVariesByMileageBand: false,
    pricingVariesByVehicleClass: false,
    pricingRows: [fallbackRow],
    eligibilityMaxVehicleAgeYears:
      typeof p.eligibilityMaxVehicleAgeYears === "number" ? String(p.eligibilityMaxVehicleAgeYears) : "",
    eligibilityMaxMileageKm:
      typeof p.eligibilityMaxMileageKm === "number" ? String(p.eligibilityMaxMileageKm) : "",
    eligibilityMakeAllowlist: allowlistToString(p.eligibilityMakeAllowlist),
    eligibilityModelAllowlist: allowlistToString(p.eligibilityModelAllowlist),
    eligibilityTrimAllowlist: allowlistToString(p.eligibilityTrimAllowlist),
    coverageDetails: p.coverageDetails ?? "",
    exclusions: p.exclusions ?? "",
    internalNotes: p.internalNotes ?? "",
    published: p.published,
  };
}

function textareaClassName() {
  return "flex min-h-[90px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
}

function parsePositiveInt(v: string) {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.trunc(n);
  if (i <= 0) return undefined;
  return i;
}

function asClaimLimitType(v: string | undefined): ClaimLimitType | undefined {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  if (t === "PER_CLAIM" || t === "TOTAL_COVERAGE" || t === "FMV" || t === "MAX_RETAIL") return t;
  return undefined;
}

function normalizeClaimLimitTypeLabel(v: string | undefined): ClaimLimitType | undefined {
  const t = (v ?? "").trim().toUpperCase();
  if (!t) return undefined;
  if (t === "PER_CLAIM" || t === "PER CLAIM") return "PER_CLAIM";
  if (t === "TOTAL_COVERAGE" || t === "TOTAL COVERAGE") return "TOTAL_COVERAGE";
  if (t === "FMV" || t === "FAIR MARKET VALUE") return "FMV";
  if (t === "MAX_RETAIL" || t === "MAX RETAIL") return "MAX_RETAIL";
  return undefined;
}

function normalizeVehicleClassLabel(v: string | undefined): string {
  const t = (v ?? "").trim().toUpperCase();
  if (!t || t === "ALL" || t === "ALL CLASSES") return "ALL";
  if (t === "CLASS_1" || t === "CLASS 1" || t === "1") return "CLASS_1";
  if (t === "CLASS_2" || t === "CLASS 2" || t === "2") return "CLASS_2";
  if (t === "CLASS_3" || t === "CLASS 3" || t === "3") return "CLASS_3";
  return "ALL";
}

function splitTableRow(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((x) => x.trim());
  return line.split(",").map((x) => x.trim());
}

export function ProviderProductsPage() {
  const api = useMemo(() => getProductsApi(), []);
  const pricingApi = useMemo(() => getProductPricingApi(), []);
  const addonsApi = useMemo(() => getProductAddonsApi(), []);
  const qc = useQueryClient();

  const [showEditor, setShowEditor] = useState(false);
  const [editor, setEditor] = useState<EditorState>(() => emptyEditor());
  const [activeTab, setActiveTab] = useState<ProductEditorTab>("OVERVIEW");
  const [error, setError] = useState<string | null>(null);

  const [pastePricingOpen, setPastePricingOpen] = useState(false);
  const [pastePricingText, setPastePricingText] = useState("");

  const [pendingAddons, setPendingAddons] = useState<PendingAddon[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "PUBLISHED">("ALL");

  const editorProductId = (editor.id ?? "").trim();

  const addonsQuery = useQuery({
    queryKey: ["product-addons", editorProductId],
    enabled: showEditor && !!editorProductId,
    queryFn: () => addonsApi.list({ productId: editorProductId }),
  });

  const addons = (addonsQuery.data ?? []) as ProductAddon[];

  const hasHydratedAddons = useRef(false);
  useEffect(() => {
    if (!showEditor) return;
    if (!editorProductId) {
      hasHydratedAddons.current = false;
      setPendingAddons((s) => (s.length > 0 ? s : [{ key: crypto.randomUUID(), name: "", description: "", pricingType: "FIXED", price: "" }]));
      return;
    }

    if (addonsQuery.isLoading || addonsQuery.isError) return;
    if (hasHydratedAddons.current) return;
    hasHydratedAddons.current = true;

    const mapped = addons
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((a): PendingAddon => ({
        key: a.id,
        name: a.name,
        description: a.description ?? "",
        pricingType: ((a as any).pricingType ?? "FIXED") as any,
        price: centsToDollars(typeof a.dealerCostCents === "number" ? a.dealerCostCents : a.basePriceCents),
      }));

    setPendingAddons(mapped.length > 0 ? mapped : [{ key: crypto.randomUUID(), name: "", description: "", pricingType: "FIXED", price: "" }]);
  }, [addons, addonsQuery.isError, addonsQuery.isLoading, editorProductId, showEditor]);

  const productsQuery = useQuery({
    queryKey: ["provider-products"],
    queryFn: () => api.list(),
  });

  const pricingRowsQuery = useQuery({
    queryKey: ["provider-product-pricing", editorProductId],
    enabled: showEditor && !!editorProductId,
    queryFn: () => pricingApi.list({ productId: editorProductId }),
  });

  const pricingRowsFromApi = (pricingRowsQuery.data ?? []) as ProductPricing[];
  useEffect(() => {
    if (!showEditor) return;
    if (!editorProductId) return;
    if (pricingRowsQuery.isLoading) return;
    if (pricingRowsQuery.isError) return;

    if (pricingRowsFromApi.length === 0) return;

    setEditor((s) => {
      if ((s.id ?? "").trim() !== editorProductId) return s;
      const mapped = pricingRowsFromApi
        .slice()
        .sort((a, b) => {
          const am = a.termMonths ?? Number.MAX_SAFE_INTEGER;
          const bm = b.termMonths ?? Number.MAX_SAFE_INTEGER;
          const ak = a.termKm ?? Number.MAX_SAFE_INTEGER;
          const bk = b.termKm ?? Number.MAX_SAFE_INTEGER;
          return (am - bm) || (ak - bk) || (a.deductibleCents - b.deductibleCents);
        })
        .map((r): EditorState["pricingRows"][number] => ({
          key: r.id,
          isDefault: r.isDefault === true,
          termMonths: r.termMonths === null ? "" : String(r.termMonths),
          termMonthsUnlimited: r.termMonths === null,
          termKm: r.termKm === null ? "" : String(r.termKm),
          termKmUnlimited: r.termKm === null,
          vehicleMileageMinKm: typeof r.vehicleMileageMinKm === "number" ? String(r.vehicleMileageMinKm) : "",
          vehicleMileageMaxKm: r.vehicleMileageMaxKm === null ? "" : typeof r.vehicleMileageMaxKm === "number" ? String(r.vehicleMileageMaxKm) : "",
          vehicleMileageMaxUnlimited: r.vehicleMileageMaxKm === null,
          vehicleClass: typeof r.vehicleClass === "string" && r.vehicleClass.trim() ? r.vehicleClass.trim() : "ALL",
          claimLimitType: asClaimLimitType(typeof (r as any).claimLimitType === "string" ? (r as any).claimLimitType : undefined) ?? "",
          claimLimitAmount: typeof (r as any).claimLimitAmountCents === "number" ? centsToDollars((r as any).claimLimitAmountCents) : typeof r.claimLimitCents === "number" ? centsToDollars(r.claimLimitCents) : "",
          deductible: centsToDollars(r.deductibleCents),
          providerCost: centsToDollars(r.basePriceCents),
        }));

      const variesByMileageBand = pricingRowsFromApi.some(
        (r) => typeof r.vehicleMileageMinKm === "number" || r.vehicleMileageMaxKm === null || typeof r.vehicleMileageMaxKm === "number",
      );

      const variesByVehicleClass = pricingRowsFromApi.some((r) => typeof r.vehicleClass === "string" && r.vehicleClass.trim());

      if (mapped.length === 0) return s;
      const same =
        s.pricingRows.length === mapped.length &&
        s.pricingRows.every((row, idx) => {
          const next = mapped[idx]!;
          return (
            row.key === next.key &&
            row.isDefault === next.isDefault &&
            row.termMonths === next.termMonths &&
            row.termMonthsUnlimited === next.termMonthsUnlimited &&
            row.termKm === next.termKm &&
            row.termKmUnlimited === next.termKmUnlimited &&
            row.vehicleMileageMinKm === next.vehicleMileageMinKm &&
            row.vehicleMileageMaxKm === next.vehicleMileageMaxKm &&
            row.vehicleMileageMaxUnlimited === next.vehicleMileageMaxUnlimited &&
            row.vehicleClass === next.vehicleClass &&
            row.claimLimitType === next.claimLimitType &&
            row.claimLimitAmount === next.claimLimitAmount &&
            row.deductible === next.deductible &&
            row.providerCost === next.providerCost
          );
        });

      if (same) return s;
      return {
        ...s,
        pricingRows: mapped,
        pricingVariesByMileageBand: variesByMileageBand,
        pricingVariesByVehicleClass: variesByVehicleClass,
      };
    });
  }, [editorProductId, pricingRowsFromApi, pricingRowsQuery.isError, pricingRowsQuery.isLoading, showEditor]);

  const createMutation = useMutation({
    mutationFn: (input: CreateProductInput) => api.create(input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["provider-products"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.update>[1] }) => api.update(id, patch),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["provider-products"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const productId = (id ?? "").trim();
      if (!productId) return;

      const existing = await pricingApi.list({ productId });
      for (const r of existing) {
        await pricingApi.remove(r.id);
      }

      await api.remove(productId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["provider-products"] });
    },
  });

  const products = (productsQuery.data ?? []) as Product[];

  const pricingHealthProductIds = useMemo(() => {
    return products
      .map((p) => (p.id ?? "").trim())
      .filter(Boolean);
  }, [products]);

  const pricingHealthQueries = useQueries({
    queries: pricingHealthProductIds.map((productId) => ({
        queryKey: ["provider-product-pricing-health", productId],
        queryFn: () => pricingApi.list({ productId }),
        staleTime: 15_000,
      })),
  });

  const pricingHealthByProductId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof validatePricingHealth>>();
    for (let i = 0; i < pricingHealthQueries.length; i += 1) {
      const q = pricingHealthQueries[i]!;
      const productId = pricingHealthProductIds[i] ?? "";
      if (!productId) continue;
      const rows = (q.data ?? []) as ProductPricing[];
      map.set(productId, validatePricingHealth(rows));
    }
    return map;
  }, [pricingHealthProductIds, pricingHealthQueries]);

  const filteredProducts = products
    .filter((p) => {
      if (statusFilter === "PUBLISHED") return p.published;
      if (statusFilter === "DRAFT") return !p.published;
      return true;
    })
    .filter((p) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        productTypeLabel(p.productType).toLowerCase().includes(q) ||
        (p.coverageDetails ?? "").toLowerCase().includes(q) ||
        (p.exclusions ?? "").toLowerCase().includes(q)
      );
    });

  const publishedCount = products.filter((p) => p.published).length;
  const draftCount = products.filter((p) => !p.published).length;

  const beginNew = () => {
    setError(null);
    setEditor(emptyEditor());
    setActiveTab("OVERVIEW");
    setPendingAddons([]);
    setShowEditor(true);
  };

  const beginEdit = (p: Product) => {
    setError(null);
    setEditor(editorFromProduct(p));
    setActiveTab("OVERVIEW");
    setPendingAddons([]);
    setShowEditor(true);
  };

  const beginEditTab = (p: Product, tab: ProductEditorTab) => {
    setError(null);
    setEditor(editorFromProduct(p));
    setActiveTab(tab);
    setPendingAddons([]);
    setShowEditor(true);
  };

  const onSubmit = async () => {
    setError(null);

    const name = editor.name.trim();
    if (!name) {
      setError("Product name is required");
      setActiveTab("OVERVIEW");
      return;
    }

    type ValidatedRow = {
      key: string;
      isDefault: boolean;
      termMonths: number | null;
      termKm: number | null;
      vehicleMileageMinKm?: number;
      vehicleMileageMaxKm?: number | null;
      vehicleClass?: string;
      claimLimitCents?: number;
      claimLimitType?: ClaimLimitType;
      claimLimitAmountCents?: number;
      deductibleCents: number;
      providerCostCents: number;
    };

    const normalizedRows = editor.pricingRows
      .map((r) => ({
        key: r.key,
        isDefault: r.isDefault === true,
        termMonths: r.termMonthsUnlimited ? null : parsePositiveInt(r.termMonths),
        termKm: r.termKmUnlimited ? null : parsePositiveInt(r.termKm),
        vehicleMileageMinKm: editor.pricingVariesByMileageBand ? parseOptionalInt(r.vehicleMileageMinKm) : undefined,
        vehicleMileageMaxKm: editor.pricingVariesByMileageBand ? (r.vehicleMileageMaxUnlimited ? null : parseOptionalInt(r.vehicleMileageMaxKm)) : undefined,
        vehicleClass:
          editor.pricingVariesByVehicleClass === true
            ? r.vehicleClass === "ALL"
              ? undefined
              : r.vehicleClass.trim() || undefined
            : undefined,
        claimLimitType: asClaimLimitType(r.claimLimitType),
        claimLimitAmountCents: dollarsToCents(r.claimLimitAmount),
        deductibleCents: dollarsToCents(r.deductible) ?? 0,
        providerCostCents: dollarsToCents(r.providerCost),
      }))
      .filter((r) => r.termMonths !== undefined || r.termKm !== undefined || r.providerCostCents || r.deductibleCents);

    const validatedRows: ValidatedRow[] = normalizedRows.map((r) => {
      if (r.termMonths !== null && typeof r.termMonths !== "number") {
        throw new Error("Published products require at least one valid pricing row.");
      }
      if (r.termMonths !== null && (typeof r.termMonths !== "number" || r.termMonths <= 0)) {
        throw new Error("Each pricing row requires term months (positive number or Unlimited).");
      }

      if (r.termMonths === undefined) {
        throw new Error("Each pricing row requires term months (positive number or Unlimited).");
      }

      if (r.termKm === undefined) {
        throw new Error("Each pricing row requires term km (positive number or Unlimited).");
      }
      if (r.termKm !== null && (typeof r.termKm !== "number" || r.termKm <= 0)) {
        throw new Error("Each pricing row requires term km (positive number or Unlimited).");
      }
      if (typeof r.providerCostCents !== "number" || r.providerCostCents <= 0) {
        throw new Error("Each pricing row requires provider cost.");
      }
      if (!Number.isFinite(r.deductibleCents) || r.deductibleCents < 0) throw new Error("Deductible must be a number >= 0.");

      if (editor.pricingVariesByMileageBand) {
        if (typeof r.vehicleMileageMinKm !== "number" || !Number.isFinite(r.vehicleMileageMinKm)) {
          throw new Error("Mileage min is required when pricing varies by mileage band.");
        }
        if (r.vehicleMileageMinKm < 0) throw new Error("Mileage min must be >= 0.");
        if (typeof r.vehicleMileageMaxKm === "number" && r.vehicleMileageMaxKm < 0) throw new Error("Mileage max must be >= 0.");
        if (typeof r.vehicleMileageMaxKm === "number" && r.vehicleMileageMaxKm < r.vehicleMileageMinKm) {
          throw new Error("Mileage max must be >= mileage min.");
        }
      }

      const claimType = r.claimLimitType;
      const amount = r.claimLimitAmountCents;
      if (claimType) {
        if (claimType === "FMV") {
          return {
            key: r.key,
            isDefault: r.isDefault === true,
            termMonths: r.termMonths,
            termKm: r.termKm,
            vehicleMileageMinKm: typeof r.vehicleMileageMinKm === "number" ? r.vehicleMileageMinKm : undefined,
            vehicleMileageMaxKm: r.vehicleMileageMaxKm === null ? null : typeof r.vehicleMileageMaxKm === "number" ? r.vehicleMileageMaxKm : undefined,
            vehicleClass: typeof r.vehicleClass === "string" ? r.vehicleClass : undefined,
            claimLimitType: claimType,
            deductibleCents: r.deductibleCents,
            providerCostCents: r.providerCostCents,
          };
        }

        if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
          throw new Error("Claim limit amount is required and must be > 0 for the selected claim limit type.");
        }
      }

      return {
        key: r.key,
        isDefault: r.isDefault === true,
        termMonths: r.termMonths,
        termKm: r.termKm,
        vehicleMileageMinKm: typeof r.vehicleMileageMinKm === "number" ? r.vehicleMileageMinKm : undefined,
        vehicleMileageMaxKm: r.vehicleMileageMaxKm === null ? null : typeof r.vehicleMileageMaxKm === "number" ? r.vehicleMileageMaxKm : undefined,
        vehicleClass: typeof r.vehicleClass === "string" ? r.vehicleClass : undefined,
        claimLimitType: claimType,
        claimLimitAmountCents: typeof amount === "number" && amount > 0 ? amount : undefined,
        claimLimitCents: claimType && typeof amount === "number" && amount > 0 ? amount : undefined,
        deductibleCents: r.deductibleCents,
        providerCostCents: r.providerCostCents,
      };
    });

    if (editor.published && validatedRows.length === 0) {
      setError("Published products require at least one valid pricing row.");
      setActiveTab("PRICING");
      return;
    }

    if (validatedRows.filter((r) => r.isDefault).length > 1) {
      setError("Exactly one default pricing row is required.");
      setActiveTab("PRICING");
      return;
    }

    if (editor.published && !validatedRows.some((r) => r.isDefault)) {
      setError("Exactly one default pricing row is required.");
      setActiveTab("PRICING");
      return;
    }

    const rowsWithDefault = (() => {
      const anyDefault = validatedRows.some((r) => r.isDefault);
      if (anyDefault) return validatedRows.map((r, idx) => ({ ...r, isDefault: r.isDefault && idx === validatedRows.findIndex((x) => x.isDefault) }));
      if (editor.published) return validatedRows;
      return validatedRows.map((r, idx) => ({ ...r, isDefault: idx === 0 }));
    })();

    if (editor.pricingVariesByMileageBand) {
      const groups = new Map<string, ValidatedRow[]>();
      for (const r of rowsWithDefault) {
        const key = `${r.termMonths ?? ""}|${r.termKm ?? ""}|${(r.vehicleClass ?? "").trim()}|${r.deductibleCents}|${r.claimLimitCents ?? ""}`;
        const arr = groups.get(key) ?? [];
        arr.push(r);
        groups.set(key, arr);
      }

      for (const [, groupRows] of groups) {
        const bands = groupRows
          .map((r) => {
            const min = typeof r.vehicleMileageMinKm === "number" ? r.vehicleMileageMinKm : null;
            const max = r.vehicleMileageMaxKm === null ? null : typeof r.vehicleMileageMaxKm === "number" ? r.vehicleMileageMaxKm : null;
            return { min, max };
          })
          .filter((b) => typeof b.min === "number");

        for (let i = 0; i < bands.length; i++) {
          for (let j = i + 1; j < bands.length; j++) {
            const a = bands[i]!;
            const b = bands[j]!;
            const aMax = a.max === null ? Number.POSITIVE_INFINITY : (a.max as number);
            const bMax = b.max === null ? Number.POSITIVE_INFINITY : (b.max as number);
            if ((a.min as number) <= bMax && (b.min as number) <= aMax) {
              setError("Overlapping mileage bands detected for the same term and vehicle class.");
              setActiveTab("PRICING");
              return;
            }
          }
        }
      }
    }

    const seen = new Set<string>();
    for (const r of rowsWithDefault) {
      const key = `${r.termMonths}|${r.termKm}|${r.vehicleMileageMinKm ?? ""}|${r.vehicleMileageMaxKm ?? ""}|${r.vehicleClass ?? ""}|${r.deductibleCents}|${r.claimLimitCents ?? ""}`;
      if (seen.has(key)) {
        setError("Duplicate pricing variants detected.");
        setActiveTab("PRICING");
        return;
      }
      seen.add(key);
    }

    const primary = defaultPricingRow(rowsWithDefault);

    if (editor.published && !primary) {
      setError("To publish, set a default pricing row.");
      setActiveTab("PRICING");
      return;
    }

    const input: CreateProductInput = {
      name,
      productType: editor.productType,
      coverageDetails: editor.coverageDetails.trim() || undefined,
      exclusions: editor.exclusions.trim() || undefined,
      termMonths: primary && typeof primary.termMonths === "number" ? primary.termMonths : undefined,
      termKm: primary && typeof primary.termKm === "number" ? primary.termKm : undefined,
      deductibleCents: primary ? primary.deductibleCents : undefined,
      eligibilityMaxVehicleAgeYears: parseOptionalInt(editor.eligibilityMaxVehicleAgeYears),
      eligibilityMaxMileageKm: parseOptionalInt(editor.eligibilityMaxMileageKm),
      eligibilityMakeAllowlist: parseAllowlist(editor.eligibilityMakeAllowlist),
      eligibilityModelAllowlist: parseAllowlist(editor.eligibilityModelAllowlist),
      eligibilityTrimAllowlist: parseAllowlist(editor.eligibilityTrimAllowlist),
      basePriceCents: primary ? primary.providerCostCents : undefined,
      dealerCostCents: primary ? primary.providerCostCents : undefined,
    };

    const overviewExtrasPatch = {
      programCode: editor.programCode.trim() || "",
      internalNotes: editor.internalNotes.trim() || "",
    };

    const allowlistsForUpdate = {
      eligibilityMakeAllowlist: parseAllowlist(editor.eligibilityMakeAllowlist) ?? [],
      eligibilityModelAllowlist: parseAllowlist(editor.eligibilityModelAllowlist) ?? [],
      eligibilityTrimAllowlist: parseAllowlist(editor.eligibilityTrimAllowlist) ?? [],
    };

    const normalizedAddons = pendingAddons
      .map((r) => ({
        key: r.key,
        name: r.name.trim(),
        description: r.description.trim(),
        pricingType: r.pricingType,
        priceRaw: r.price,
      }))
      .filter((r) => !!r.name);

    for (const r of normalizedAddons) {
      const price = dollarsToCents(r.priceRaw);
      if (typeof price !== "number" || price <= 0) {
        setError(`Add-on price is required for "${r.name}".`);
        setActiveTab("ADDONS");
        return;
      }
    }

    {
      const seenNames = new Set<string>();
      for (const r of normalizedAddons) {
        const k = r.name.toLowerCase();
        if (seenNames.has(k)) {
          setError(`Duplicate add-on name detected: "${r.name}".`);
          setActiveTab("ADDONS");
          return;
        }
        seenNames.add(k);
      }
    }

    try {
      let savedProduct: Product | null = null;
      if (!editor.id) {
        savedProduct = (await createMutation.mutateAsync(input)) as Product;

        savedProduct = (await updateMutation.mutateAsync({
          id: savedProduct.id,
          patch: overviewExtrasPatch,
        })) as Product;

        if (editor.published) {
          savedProduct = (await updateMutation.mutateAsync({
            id: savedProduct.id,
            patch: {
              published: true,
            },
          })) as Product;
        }
      } else {
        savedProduct = (await updateMutation.mutateAsync({
          id: editor.id,
          patch: {
            name: input.name,
            productType: input.productType,
            coverageDetails: input.coverageDetails ?? "",
            exclusions: input.exclusions ?? "",
            ...overviewExtrasPatch,
            ...(typeof input.termMonths === "number" ? { termMonths: input.termMonths } : {}),
            ...(typeof input.termKm === "number" ? { termKm: input.termKm } : {}),
            ...(typeof input.deductibleCents === "number" ? { deductibleCents: input.deductibleCents } : {}),
            eligibilityMaxVehicleAgeYears: input.eligibilityMaxVehicleAgeYears,
            eligibilityMaxMileageKm: input.eligibilityMaxMileageKm,
            ...allowlistsForUpdate,
            basePriceCents: input.basePriceCents,
            dealerCostCents: input.dealerCostCents,
            published: editor.published,
          },
        })) as Product;
      }

      const productId = (savedProduct?.id ?? editor.id ?? "").trim();
      if (productId) {
        const existing = await pricingApi.list({ productId });

        const chunk = <T,>(arr: T[], size: number) => {
          if (!Array.isArray(arr) || arr.length === 0) return [] as T[][];
          const s = Math.max(1, Math.floor(size));
          const out: T[][] = [];
          for (let i = 0; i < arr.length; i += s) out.push(arr.slice(i, i + s));
          return out;
        };

        for (const batch of chunk(existing, 25)) {
          await Promise.all(batch.map((r) => pricingApi.remove(r.id)));
        }

        for (const batch of chunk(rowsWithDefault, 25)) {
          await Promise.all(
            batch.map((r) =>
              pricingApi.create({
                productId,
                isDefault: r.isDefault === true,
                termMonths: r.termMonths,
                termKm: r.termKm,
                vehicleMileageMinKm: r.vehicleMileageMinKm,
                vehicleMileageMaxKm: r.vehicleMileageMaxKm,
                vehicleClass: r.vehicleClass,
                claimLimitCents: r.claimLimitCents,
                ...(typeof r.claimLimitType === "string" ? { claimLimitType: r.claimLimitType } : {}),
                ...(typeof r.claimLimitAmountCents === "number" ? { claimLimitAmountCents: r.claimLimitAmountCents } : {}),
                deductibleCents: r.deductibleCents,
                basePriceCents: r.providerCostCents,
                dealerCostCents: r.providerCostCents,
              }),
            ),
          );
        }
        await qc.invalidateQueries({ queryKey: ["product-pricing", productId] });
      }

      if (productId) {
        try {
          const existingAddons = await addonsApi.list({ productId });
          for (const a of existingAddons) {
            await addonsApi.remove(a.id);
          }

          for (const row of normalizedAddons) {
            const price = dollarsToCents(row.priceRaw) as number;
            await addonsApi.create({
              productId,
              name: row.name,
              description: row.description || undefined,
              pricingType: row.pricingType,
              basePriceCents: price,
              minPriceCents: undefined,
              maxPriceCents: undefined,
              dealerCostCents: price,
              active: true,
            });
          }
          await qc.invalidateQueries({ queryKey: ["product-addons", productId] });
        } catch (e) {
          setActiveTab("ADDONS");
          throw new Error(`Failed to save add-ons: ${formatUnknownError(e)}`);
        }
      }

      await qc.invalidateQueries({ queryKey: ["marketplace-products"] });

      setShowEditor(false);
      setEditor(emptyEditor());
      setPendingAddons([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to save product: ${formatUnknownError(e)}`);
    }
  };

  const busy = createMutation.isPending || updateMutation.isPending || removeMutation.isPending;

  const onDelete = (p: Product) => {
    void (async () => {
      const id = (p?.id ?? "").trim();
      if (!id) return;

      const confirmed = window.confirm(`Delete "${p.name}"? This cannot be undone.`);
      if (!confirmed) return;

      setError(null);
      try {
        await removeMutation.mutateAsync(id);

        if ((editor.id ?? "").trim() === id) {
          setShowEditor(false);
          setEditor(emptyEditor());
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete product");
      }
    })();
  };

  return (
    <PageShell
      badge="Provider Portal"
      title="Products"
      subtitle="Manage and publish offerings into the marketplace."
      actions={
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <Link to="/provider-dashboard">Back to dashboard</Link>
          </Button>
          <Button onClick={beginNew} disabled={busy}>
            New Product
          </Button>
        </div>
      }
    >
      {error ? <div className="text-sm text-destructive">{error}</div> : null}

      {showEditor ? (
        <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden">

          <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold">{editor.id ? "Edit Product" : "New Product"}</div>
              <div className="text-sm text-muted-foreground mt-1">Create and publish offerings into the marketplace.</div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowEditor(false);
                  setEditor(emptyEditor());
                }}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button onClick={() => void onSubmit()} disabled={busy}>
                Save
              </Button>
            </div>
          </div>

          <div className="px-6 pt-4">
            <div className="inline-flex rounded-lg border bg-background p-1 gap-1">
              <button
                type="button"
                onClick={() => setActiveTab("OVERVIEW")}
                className={
                  "px-3 py-1.5 text-sm rounded-md " +
                  (activeTab === "OVERVIEW" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")
                }
                disabled={busy}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("ELIGIBILITY")}
                className={
                  "px-3 py-1.5 text-sm rounded-md " +
                  (activeTab === "ELIGIBILITY" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")
                }
                disabled={busy}
              >
                Eligibility
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("PRICING")}
                className={
                  "px-3 py-1.5 text-sm rounded-md " +
                  (activeTab === "PRICING" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")
                }
                disabled={busy}
              >
                Pricing
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("DOCUMENTS")}
                className={
                  "px-3 py-1.5 text-sm rounded-md " +
                  (activeTab === "DOCUMENTS" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")
                }
                disabled={busy}
              >
                Documents
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("ADDONS")}
                className={
                  "px-3 py-1.5 text-sm rounded-md " +
                  (activeTab === "ADDONS" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")
                }
                disabled={busy}
              >
                Add-ons
              </button>
            </div>
          </div>

          <div className="p-6">
            {activeTab === "OVERVIEW" ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    value={editor.name}
                    onChange={(e) => setEditor((s) => ({ ...s, name: sanitizeWordsOnly(e.target.value) }))}
                    placeholder="Product name"
                    disabled={busy}
                  />

                  <select
                    value={editor.productType}
                    onChange={(e) => setEditor((s) => ({ ...s, productType: e.target.value as ProductType }))}
                    className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                    disabled={busy}
                  >
                    <option value="EXTENDED_WARRANTY">Extended Warranty</option>
                    <option value="GAP">GAP Insurance</option>
                    <option value="TIRE_RIM">Tire & Rim</option>
                    <option value="APPEARANCE">Appearance / Rust / Key</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <Input
                  value={editor.programCode}
                  onChange={(e) => setEditor((s) => ({ ...s, programCode: e.target.value }))}
                  placeholder="Program code (optional). Example: AX1, Elite Plus, Bronze"
                  disabled={busy}
                />

                <textarea
                  value={editor.coverageDetails}
                  onChange={(e) => setEditor((s) => ({ ...s, coverageDetails: e.target.value }))}
                  placeholder="Coverage summary"
                  className={textareaClassName()}
                  disabled={busy}
                />

                <textarea
                  value={editor.exclusions}
                  onChange={(e) => setEditor((s) => ({ ...s, exclusions: e.target.value }))}
                  placeholder="Exclusions"
                  className={textareaClassName()}
                  disabled={busy}
                />

                <textarea
                  value={editor.internalNotes}
                  onChange={(e) => setEditor((s) => ({ ...s, internalNotes: e.target.value }))}
                  placeholder="Internal notes (provider-only)"
                  className={textareaClassName()}
                  disabled={busy}
                />
              </div>
            ) : null}

            {activeTab === "ELIGIBILITY" ? (
              <div className="space-y-4">
                <div className="rounded-xl border p-4">
                  <div className="font-semibold">Outer Eligibility Rules</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    These rules only control whether a product appears. Pricing differences (mileage bands / classes / terms) belong in Pricing Rows.
                  </div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input
                      value={editor.eligibilityMaxVehicleAgeYears}
                      onChange={(e) =>
                        setEditor((s) => ({ ...s, eligibilityMaxVehicleAgeYears: sanitizeDigitsOnly(e.target.value) }))
                      }
                      placeholder="Max age (years)"
                      inputMode="numeric"
                      disabled={busy}
                    />
                    <Input
                      value={editor.eligibilityMaxMileageKm}
                      onChange={(e) => setEditor((s) => ({ ...s, eligibilityMaxMileageKm: sanitizeDigitsOnly(e.target.value) }))}
                      placeholder="Max mileage (km)"
                      inputMode="numeric"
                      disabled={busy}
                    />
                  </div>
                </div>

                <div className="rounded-xl border p-4">
                  <div className="font-semibold">Make / Model / Trim</div>
                  <div className="text-sm text-muted-foreground mt-1">Optional allowlists. Leave blank to allow all.</div>

                  <div className="mt-3 grid grid-cols-1 gap-3">
                    <Input
                      value={editor.eligibilityMakeAllowlist}
                      onChange={(e) => setEditor((s) => ({ ...s, eligibilityMakeAllowlist: e.target.value }))}
                      placeholder="Allowed makes (comma-separated). Example: Toyota, Honda"
                      disabled={busy}
                    />
                    <Input
                      value={editor.eligibilityModelAllowlist}
                      onChange={(e) => setEditor((s) => ({ ...s, eligibilityModelAllowlist: e.target.value }))}
                      placeholder="Allowed models (comma-separated). Example: Camry, Civic"
                      disabled={busy}
                    />
                    <Input
                      value={editor.eligibilityTrimAllowlist}
                      onChange={(e) => setEditor((s) => ({ ...s, eligibilityTrimAllowlist: e.target.value }))}
                      placeholder="Allowed trims (comma-separated). Example: XLE, Touring"
                      disabled={busy}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "ADDONS" ? (
              <div className="space-y-4">
                <div className="rounded-xl border p-4">
                  <div className="font-semibold">Add-ons</div>
                  <div className="text-xs text-muted-foreground mt-1">Add-ons are saved when you click the main Save button.</div>

                  {editorProductId ? (
                    <div className="mt-3">
                      {addonsQuery.isLoading ? <div className="text-sm text-muted-foreground">Loading add-ons…</div> : null}
                      {addonsQuery.isError ? <div className="text-sm text-destructive">Failed to load add-ons.</div> : null}
                    </div>
                  ) : null}

                  <div className="mt-4 space-y-3">
                    {pendingAddons.map((row, idx) => (
                      <div key={row.key} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium">Row {idx + 1}</div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy || pendingAddons.length <= 1}
                            onClick={() => setPendingAddons((s) => s.filter((x) => x.key !== row.key))}
                          >
                            Remove
                          </Button>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-3">
                          <Input
                            value={row.name}
                            onChange={(e) =>
                              setPendingAddons((s) => s.map((x) => (x.key === row.key ? { ...x, name: e.target.value } : x)))
                            }
                            placeholder="Add-on name"
                            disabled={busy}
                          />
                          <Input
                            value={row.description}
                            onChange={(e) =>
                              setPendingAddons((s) => s.map((x) => (x.key === row.key ? { ...x, description: e.target.value } : x)))
                            }
                            placeholder="Description (optional)"
                            disabled={busy}
                          />
                          <select
                            value={row.pricingType}
                            onChange={(e) =>
                              setPendingAddons((s) => s.map((x) => (x.key === row.key ? { ...x, pricingType: e.target.value as any } : x)))
                            }
                            className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                            disabled={busy}
                          >
                            <option value="FIXED">Fixed (1x per contract)</option>
                            <option value="PER_TERM">Per term (1x for now)</option>
                            <option value="PER_CLAIM">Per claim (1x for now)</option>
                          </select>
                          <Input
                            value={row.price}
                            onChange={(e) =>
                              setPendingAddons((s) => s.map((x) => (x.key === row.key ? { ...x, price: sanitizeMoney(e.target.value) } : x)))
                            }
                            placeholder="Price"
                            inputMode="decimal"
                            disabled={busy}
                          />
                        </div>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        setPendingAddons((s) => [
                          ...s,
                          { key: crypto.randomUUID(), name: "", description: "", pricingType: "FIXED", price: "" },
                        ])
                      }
                    >
                      Add row
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "PRICING" ? (
              <div className="space-y-4">
                <div className="rounded-xl border p-4">
                  <div className="font-semibold">Pricing</div>

                  {(() => {
                    type PricingStructure = "FLAT" | "MILEAGE" | "CLASS" | "MILEAGE_CLASS";
                    const structure: PricingStructure = editor.pricingVariesByMileageBand
                      ? editor.pricingVariesByVehicleClass
                        ? "MILEAGE_CLASS"
                        : "MILEAGE"
                      : editor.pricingVariesByVehicleClass
                        ? "CLASS"
                        : "FLAT";

                    const setStructure = (next: PricingStructure) => {
                      const wantsMileage = next === "MILEAGE" || next === "MILEAGE_CLASS";
                      const wantsClass = next === "CLASS" || next === "MILEAGE_CLASS";

                      setEditor((s) => ({
                        ...s,
                        pricingVariesByMileageBand: wantsMileage,
                        pricingVariesByVehicleClass: wantsClass,
                        pricingRows: s.pricingRows.map((r) => ({
                          ...r,
                          ...(wantsMileage
                            ? null
                            : {
                                vehicleMileageMinKm: "",
                                vehicleMileageMaxKm: "",
                                vehicleMileageMaxUnlimited: false,
                              }),
                          ...(wantsClass ? null : { vehicleClass: "ALL" }),
                        })),
                      }));
                    };

                    return (
                      <div className="mt-3">
                        <div className="text-sm font-medium">Pricing Structure</div>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input
                              type="radio"
                              name="pricing-structure"
                              checked={structure === "FLAT"}
                              onChange={() => setStructure("FLAT")}
                              disabled={busy}
                            />
                            Flat Pricing
                          </label>
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input
                              type="radio"
                              name="pricing-structure"
                              checked={structure === "MILEAGE"}
                              onChange={() => setStructure("MILEAGE")}
                              disabled={busy}
                            />
                            Mileage-Based Pricing
                          </label>
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input
                              type="radio"
                              name="pricing-structure"
                              checked={structure === "CLASS"}
                              onChange={() => setStructure("CLASS")}
                              disabled={busy}
                            />
                            Class-Based Pricing
                          </label>
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input
                              type="radio"
                              name="pricing-structure"
                              checked={structure === "MILEAGE_CLASS"}
                              onChange={() => setStructure("MILEAGE_CLASS")}
                              disabled={busy}
                            />
                            Mileage + Class Pricing
                          </label>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="mt-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setPastePricingOpen((v) => !v)}
                    >
                      Paste Pricing Table
                    </Button>
                  </div>

                  {pastePricingOpen ? (
                    <div className="mt-3 rounded-lg border p-3 space-y-3">
                      <textarea
                        value={pastePricingText}
                        onChange={(e) => setPastePricingText(e.target.value)}
                        className={textareaClassName()}
                        placeholder={
                          "Paste from Excel (tab-separated) or CSV. Columns (with optional header):\n" +
                          "termMonths, termKm, vehicleMileageMinKm, vehicleMileageMaxKm, vehicleClass, claimLimitType, claimLimitAmount, deductible, providerCost"
                        }
                        disabled={busy}
                      />

                      <div className="flex gap-2 flex-wrap">
                        <Button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setError(null);
                            try {
                              const raw = (pastePricingText ?? "").trim();
                              if (!raw) {
                                setError("Paste table text first.");
                                return;
                              }

                              const lines = raw
                                .split(/\r?\n/g)
                                .map((l) => l.trim())
                                .filter(Boolean);

                              if (lines.length === 0) {
                                setError("Paste table text first.");
                                return;
                              }

                              const first = splitTableRow(lines[0]!);
                              const header = first.map((h) => h.replace(/\s+/g, "").toLowerCase());
                              const hasHeader = header.some((h) =>
                                [
                                  "termmonths",
                                  "termkm",
                                  "vehiclemileageminkm",
                                  "vehiclemileagemaxkm",
                                  "vehicleclass",
                                  "claimlimittype",
                                  "claimlimitamount",
                                  "deductible",
                                  "providercost",
                                ].includes(h),
                              );

                              const colIndex = (name: string) => {
                                const idx = header.findIndex((h) => h === name);
                                return idx >= 0 ? idx : null;
                              };

                              const idxTermMonths = hasHeader ? colIndex("termmonths") : 0;
                              const idxTermKm = hasHeader ? colIndex("termkm") : 1;
                              const idxMin = hasHeader ? colIndex("vehiclemileageminkm") : 2;
                              const idxMax = hasHeader ? colIndex("vehiclemileagemaxkm") : 3;
                              const idxClass = hasHeader ? colIndex("vehicleclass") : 4;
                              const idxClaimType = hasHeader ? colIndex("claimlimittype") : 5;
                              const idxClaimAmt = hasHeader ? colIndex("claimlimitamount") : 6;
                              const idxDed = hasHeader ? colIndex("deductible") : 7;
                              const idxCost = hasHeader ? colIndex("providercost") : 8;

                              const dataLines = hasHeader ? lines.slice(1) : lines;
                              const parsedRows: EditorState["pricingRows"][number][] = [];

                              for (const line of dataLines) {
                                const cols = splitTableRow(line);
                                const get = (idx: number | null) => (idx === null ? "" : (cols[idx] ?? "").trim());

                                const rawMonths = get(idxTermMonths);
                                const rawKm = get(idxTermKm);
                                const rawMin = get(idxMin);
                                const rawMax = get(idxMax);
                                const rawClass = get(idxClass);
                                const rawClaimType = get(idxClaimType);
                                const rawClaimAmt = get(idxClaimAmt);
                                const rawDed = get(idxDed);
                                const rawCost = get(idxCost);

                                if (!rawMonths && !rawKm && !rawCost && !rawDed) continue;

                                const monthsUnlimited = /^unlimited$/i.test(rawMonths);
                                const kmUnlimited = /^unlimited$/i.test(rawKm);
                                const maxUnlimited = /^unlimited$/i.test(rawMax);

                                const vehicleClass = normalizeVehicleClassLabel(rawClass);
                                const claimLimitType = normalizeClaimLimitTypeLabel(rawClaimType);

                                parsedRows.push({
                                  key: crypto.randomUUID(),
                                  isDefault: false,
                                  termMonths: monthsUnlimited ? "" : sanitizeDigitsOnly(rawMonths),
                                  termMonthsUnlimited: monthsUnlimited,
                                  termKm: kmUnlimited ? "" : sanitizeDigitsOnly(rawKm),
                                  termKmUnlimited: kmUnlimited,
                                  vehicleMileageMinKm: sanitizeDigitsOnly(rawMin),
                                  vehicleMileageMaxKm: maxUnlimited ? "" : sanitizeDigitsOnly(rawMax),
                                  vehicleMileageMaxUnlimited: maxUnlimited,
                                  vehicleClass,
                                  claimLimitType: claimLimitType ?? "",
                                  claimLimitAmount: sanitizeMoney(rawClaimAmt),
                                  deductible: sanitizeMoney(rawDed),
                                  providerCost: sanitizeMoney(rawCost),
                                });
                              }

                              if (parsedRows.length === 0) {
                                setError("No pricing rows found in pasted table.");
                                return;
                              }

                              const anyMileage = parsedRows.some((r) => r.vehicleMileageMinKm.trim() || r.vehicleMileageMaxUnlimited || r.vehicleMileageMaxKm.trim());
                              const anyClass = parsedRows.some((r) => r.vehicleClass !== "ALL");
                              const existingHasDefault = editor.pricingRows.some((r) => r.isDefault === true);

                              setEditor((s) => {
                                const nextRows = [...s.pricingRows, ...parsedRows];
                                const withDefault =
                                  existingHasDefault || nextRows.some((r) => r.isDefault)
                                    ? nextRows
                                    : nextRows.map((r, i) => ({ ...r, isDefault: i === 0 }));

                                return {
                                  ...s,
                                  pricingRows: withDefault,
                                  pricingVariesByMileageBand: s.pricingVariesByMileageBand || anyMileage,
                                  pricingVariesByVehicleClass: s.pricingVariesByVehicleClass || anyClass,
                                };
                              });
                              setPastePricingText("");
                              setPastePricingOpen(false);
                            } catch (e) {
                              setError(e instanceof Error ? e.message : "Failed to parse pricing table");
                            }
                          }}
                        >
                          Parse & Add Rows
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setPastePricingText("");
                            setPastePricingOpen(false);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 space-y-3">
                    {(() => {
                      const parsed = editor.pricingRows.map((row, idx) => {
                        const termMonths = row.termMonthsUnlimited ? null : parseOptionalInt(row.termMonths);
                        const termKm = row.termKmUnlimited ? null : parseOptionalInt(row.termKm);
                        const mileageMin = editor.pricingVariesByMileageBand ? parseOptionalInt(row.vehicleMileageMinKm) : 0;
                        const mileageMax = editor.pricingVariesByMileageBand ? (row.vehicleMileageMaxUnlimited ? null : parseOptionalInt(row.vehicleMileageMaxKm)) : null;
                        const vehicleClass = editor.pricingVariesByVehicleClass ? (row.vehicleClass ?? "ALL") : "ALL";
                        const providerCostCents = dollarsToCents(row.providerCost);
                        const deductibleCents = dollarsToCents(row.deductible);

                        return { row, idx, termMonths, termKm, mileageMin, mileageMax, vehicleClass, providerCostCents, deductibleCents };
                      });

                      const uniqKeyForEditorRow = (r: (typeof parsed)[number]) =>
                        JSON.stringify([
                          r.termMonths,
                          r.termKm,
                          typeof r.mileageMin === "number" ? r.mileageMin : null,
                          r.mileageMax,
                          typeof r.vehicleClass === "string" && r.vehicleClass.trim() ? r.vehicleClass.trim() : null,
                          typeof r.deductibleCents === "number" ? r.deductibleCents : null,
                          r.row.claimLimitType || null,
                          r.row.claimLimitType && r.row.claimLimitType !== "FMV" ? dollarsToCents(r.row.claimLimitAmount) ?? null : null,
                        ]);

                      const duplicateGroups = new Map<string, number[]>();
                      for (const p of parsed) {
                        const k = uniqKeyForEditorRow(p);
                        const arr = duplicateGroups.get(k) ?? [];
                        arr.push(p.idx);
                        duplicateGroups.set(k, arr);
                      }
                      const duplicateOf = new Map<number, number[]>();
                      for (const arr of duplicateGroups.values()) {
                        if (arr.length <= 1) continue;
                        for (const i of arr) duplicateOf.set(i, arr.filter((x) => x !== i));
                      }

                      const overlapOf = new Map<number, number[]>();
                      if (editor.pricingVariesByMileageBand) {
                        const groups = new Map<string, (typeof parsed)[number][]>();
                        for (const p of parsed) {
                          const groupKey = JSON.stringify([
                            p.termMonths,
                            p.termKm,
                            typeof p.vehicleClass === "string" ? p.vehicleClass.trim() : "",
                            p.deductibleCents,
                            p.row.claimLimitType || null,
                            p.row.claimLimitType && p.row.claimLimitType !== "FMV" ? dollarsToCents(p.row.claimLimitAmount) ?? null : null,
                          ]);
                          const arr = groups.get(groupKey) ?? [];
                          arr.push(p);
                          groups.set(groupKey, arr);
                        }
                        for (const arr of groups.values()) {
                          const sorted = arr
                            .slice()
                            .sort((a, b) => ((a.mileageMin ?? 0) - (b.mileageMin ?? 0)) || (a.idx - b.idx));
                          for (let i = 0; i < sorted.length; i++) {
                            const a = sorted[i]!;
                            const aMin = a.mileageMin ?? 0;
                            const aMax = a.mileageMax;
                            if (typeof aMin !== "number") continue;
                            for (let j = i + 1; j < sorted.length; j++) {
                              const b = sorted[j]!;
                              const bMin = b.mileageMin ?? 0;
                              const bMax = b.mileageMax;
                              if (typeof bMin !== "number") continue;
                              const aMaxNum = aMax === null ? Number.POSITIVE_INFINITY : typeof aMax === "number" ? aMax : Number.NaN;
                              if (!Number.isFinite(aMaxNum) && aMax !== null) continue;
                              if (bMin > aMaxNum) break;
                              const bMaxNum = bMax === null ? Number.POSITIVE_INFINITY : typeof bMax === "number" ? bMax : Number.NaN;
                              if (!Number.isFinite(bMaxNum) && bMax !== null) continue;
                              const overlaps = Math.max(aMin, bMin) <= Math.min(aMaxNum, bMaxNum);
                              if (!overlaps) continue;
                              overlapOf.set(a.idx, Array.from(new Set([...(overlapOf.get(a.idx) ?? []), b.idx])));
                              overlapOf.set(b.idx, Array.from(new Set([...(overlapOf.get(b.idx) ?? []), a.idx])));
                            }
                          }
                        }
                      }

                      const fieldIssuesByIdx = new Map<number, string[]>();
                      const defaultRowCount = editor.pricingRows.filter((r) => r.isDefault === true).length;
                      for (const p of parsed) {
                        const issues: string[] = [];
                        if (p.termMonths !== null && (typeof p.termMonths !== "number" || p.termMonths <= 0)) issues.push("⚠ Missing Term (Months)");
                        if (p.termKm !== null && (typeof p.termKm !== "number" || p.termKm <= 0)) issues.push("⚠ Missing Term (KM)");
                        if (typeof p.providerCostCents !== "number" || p.providerCostCents <= 0) issues.push("⚠ Missing Provider Cost");
                        if (typeof p.deductibleCents !== "number" || p.deductibleCents < 0) issues.push("⚠ Invalid Deductible");

                        if (editor.pricingVariesByMileageBand) {
                          if (typeof p.mileageMin !== "number" || p.mileageMin < 0) issues.push("⚠ Missing Mileage Min");
                          const max = p.mileageMax;
                          if (max !== null && typeof max !== "number") issues.push("⚠ Invalid Mileage Max");
                          if (typeof max === "number" && max < 0) issues.push("⚠ Invalid Mileage Max");
                          if (typeof p.mileageMin === "number" && typeof max === "number" && max < p.mileageMin) issues.push("⚠ Invalid Mileage Band");
                        }

                        if (p.row.claimLimitType && p.row.claimLimitType !== "FMV") {
                          const amt = dollarsToCents(p.row.claimLimitAmount);
                          if (typeof amt !== "number" || amt <= 0) issues.push("⚠ Missing Claim Limit Amount");
                        }

                        const dups = duplicateOf.get(p.idx);
                        if (dups && dups.length > 0) issues.push(`Duplicate of row ${dups.map((x) => x + 1).join(", ")}`);

                        const ovs = overlapOf.get(p.idx);
                        if (ovs && ovs.length > 0) issues.push(`Overlaps row ${ovs.map((x) => x + 1).join(", ")}`);

                        fieldIssuesByIdx.set(p.idx, issues);
                      }

                      const hasIssues = (idx: number) => (fieldIssuesByIdx.get(idx) ?? []).length > 0;
                      const cellErrorClass = (_bad: boolean) => "";

                      return (
                    <div className="rounded-lg border overflow-x-auto">
                      {defaultRowCount > 1 ? (
                        <div className="border-b bg-rose-50/50 px-3 py-2 text-xs text-rose-700">
                          ⚠ Multiple DEFAULT rows selected. Marketplace & summaries should have exactly one.
                        </div>
                      ) : null}
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/20">
                            <th className="text-left px-3 py-1 text-xs text-muted-foreground">Default</th>
                            <th className="text-left px-3 py-1 text-xs text-muted-foreground">Term (Months)</th>
                            <th className="text-left px-3 py-1 text-xs text-muted-foreground">Term (KM)</th>
                            {editor.pricingVariesByMileageBand ? (
                              <>
                                <th className="text-left px-3 py-1 text-xs text-muted-foreground">Mileage min</th>
                                <th className="text-left px-3 py-1 text-xs text-muted-foreground">Mileage max</th>
                              </>
                            ) : null}
                            {editor.pricingVariesByVehicleClass ? (
                              <th className="text-left px-3 py-1 text-xs text-muted-foreground">Class</th>
                            ) : null}
                            <th className="text-left px-3 py-1 text-xs text-muted-foreground">Claim Limit</th>
                            <th className="text-left px-3 py-1 text-xs text-muted-foreground">Provider Net Cost</th>
                            <th className="text-left px-3 py-1 text-xs text-muted-foreground">Deductible</th>
                            <th className="text-left px-3 py-1 text-xs text-muted-foreground">Issues</th>
                            <th className="text-right px-3 py-1 text-xs text-muted-foreground">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {editor.pricingRows.map((row) => (
                            <tr
                              key={row.key}
                              className={
                                (row.isDefault ? "bg-emerald-50/40 " : "") +
                                (hasIssues(editor.pricingRows.findIndex((r) => r.key === row.key)) ? "bg-rose-50/20" : "")
                              }
                            >
                              <td className="px-3 py-1 align-top">
                                <div className="flex items-center gap-2">
                                  <label
                                    className="flex items-center gap-2 text-xs text-muted-foreground"
                                    title="Marketplace & summaries use this row when multiple variants match"
                                  >
                                    <input
                                      type="radio"
                                      name="default-pricing-row"
                                      checked={row.isDefault === true}
                                      onChange={() =>
                                        setEditor((s) => ({
                                          ...s,
                                          pricingRows: s.pricingRows.map((r) =>
                                            r.key === row.key ? { ...r, isDefault: true } : { ...r, isDefault: false },
                                          ),
                                        }))
                                      }
                                      disabled={busy}
                                    />
                                  </label>

                                  {row.isDefault ? (
                                    <div
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700"
                                      title="Marketplace & summaries use this row when multiple variants match"
                                    >
                                      <span className="text-emerald-600">●</span>
                                      DEFAULT
                                    </div>
                                  ) : null}
                                </div>
                              </td>

                              <td className="px-3 py-1 align-top min-w-[160px]">
                                <div className="space-y-1">
                                  <div className="relative">
                                    <Input
                                      value={row.termMonths}
                                      onChange={(e) =>
                                        setEditor((s) => ({
                                          ...s,
                                          pricingRows: s.pricingRows.map((r) =>
                                            r.key === row.key ? { ...r, termMonths: sanitizeDigitsOnly(e.target.value) } : r,
                                          ),
                                        }))
                                      }
                                      placeholder={row.termMonthsUnlimited ? "" : "Months"}
                                      inputMode="numeric"
                                      disabled={busy || row.termMonthsUnlimited}
                                      className={
                                        "h-8 " +
                                        (row.termMonthsUnlimited ? "bg-muted/40 " : "") +
                                        cellErrorClass((() => {
                                          const idx = editor.pricingRows.findIndex((r) => r.key === row.key);
                                          const p = parsed[idx];
                                          if (!p) return false;
                                          return p.termMonths !== null && (typeof p.termMonths !== "number" || p.termMonths <= 0);
                                        })())
                                      }
                                    />
                                    {row.termMonthsUnlimited ? (
                                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                        ∞ Unlimited
                                      </span>
                                    ) : null}
                                  </div>
                                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <input
                                      type="checkbox"
                                      checked={row.termMonthsUnlimited === true}
                                      onChange={(e) =>
                                        setEditor((s) => ({
                                          ...s,
                                          pricingRows: s.pricingRows.map((r) =>
                                            r.key === row.key
                                              ? {
                                                  ...r,
                                                  termMonthsUnlimited: e.target.checked,
                                                  termMonths: e.target.checked ? "" : r.termMonths,
                                                }
                                              : r,
                                          ),
                                        }))
                                      }
                                      disabled={busy}
                                    />
                                    Unlimited
                                  </label>
                                </div>
                              </td>

                              <td className="px-3 py-1 align-top min-w-[160px]">
                                <div className="space-y-1">
                                  <div className="relative">
                                    <Input
                                      value={row.termKm}
                                      onChange={(e) =>
                                        setEditor((s) => ({
                                          ...s,
                                          pricingRows: s.pricingRows.map((r) =>
                                            r.key === row.key ? { ...r, termKm: sanitizeDigitsOnly(e.target.value) } : r,
                                          ),
                                        }))
                                      }
                                      placeholder={row.termKmUnlimited ? "" : "KM"}
                                      inputMode="numeric"
                                      disabled={busy || row.termKmUnlimited}
                                      className={
                                        "h-8 " +
                                        (row.termKmUnlimited ? "bg-muted/40 " : "") +
                                        cellErrorClass((() => {
                                          const idx = editor.pricingRows.findIndex((r) => r.key === row.key);
                                          const p = parsed[idx];
                                          if (!p) return false;
                                          return p.termKm !== null && (typeof p.termKm !== "number" || p.termKm <= 0);
                                        })())
                                      }
                                    />
                                    {row.termKmUnlimited ? (
                                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                        ∞ Unlimited
                                      </span>
                                    ) : null}
                                  </div>
                                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <input
                                      type="checkbox"
                                      checked={row.termKmUnlimited === true}
                                      onChange={(e) =>
                                        setEditor((s) => ({
                                          ...s,
                                          pricingRows: s.pricingRows.map((r) =>
                                            r.key === row.key
                                              ? {
                                                  ...r,
                                                  termKmUnlimited: e.target.checked,
                                                  termKm: e.target.checked ? "" : r.termKm,
                                                }
                                              : r,
                                          ),
                                        }))
                                      }
                                      disabled={busy}
                                    />
                                    Unlimited
                                  </label>
                                </div>
                              </td>

                              {editor.pricingVariesByMileageBand ? (
                                <>
                                  <td className="px-3 py-1 align-top min-w-[140px]">
                                    <Input
                                      value={row.vehicleMileageMinKm}
                                      onChange={(e) =>
                                        setEditor((s) => ({
                                          ...s,
                                          pricingRows: s.pricingRows.map((r) =>
                                            r.key === row.key ? { ...r, vehicleMileageMinKm: sanitizeDigitsOnly(e.target.value) } : r,
                                          ),
                                        }))
                                      }
                                      placeholder="Min"
                                      inputMode="numeric"
                                      disabled={busy}
                                      className={
                                        "h-8 " +
                                        cellErrorClass((() => {
                                          const idx = editor.pricingRows.findIndex((r) => r.key === row.key);
                                          const p = parsed[idx];
                                          if (!p) return false;
                                          return typeof p.mileageMin !== "number" || p.mileageMin < 0;
                                        })())
                                      }
                                    />
                                  </td>
                                  <td className="px-3 py-1 align-top min-w-[170px]">
                                    <div className="space-y-1">
                                      <div className="relative">
                                        <Input
                                          value={row.vehicleMileageMaxKm}
                                          onChange={(e) =>
                                            setEditor((s) => ({
                                              ...s,
                                              pricingRows: s.pricingRows.map((r) =>
                                                r.key === row.key ? { ...r, vehicleMileageMaxKm: sanitizeDigitsOnly(e.target.value) } : r,
                                              ),
                                            }))
                                          }
                                          placeholder={row.vehicleMileageMaxUnlimited ? "" : "Max"}
                                          inputMode="numeric"
                                          disabled={busy || row.vehicleMileageMaxUnlimited}
                                          className={
                                            "h-8 " +
                                            (row.vehicleMileageMaxUnlimited ? "bg-muted/40 " : "") +
                                            cellErrorClass((() => {
                                              const idx = editor.pricingRows.findIndex((r) => r.key === row.key);
                                              const p = parsed[idx];
                                              if (!p) return false;
                                              if (p.mileageMax === null) return false;
                                              if (typeof p.mileageMax !== "number") return true;
                                              if (p.mileageMax < 0) return true;
                                              if (typeof p.mileageMin === "number" && p.mileageMax < p.mileageMin) return true;
                                              return false;
                                            })())
                                          }
                                        />
                                        {row.vehicleMileageMaxUnlimited ? (
                                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                            ∞ Unlimited
                                          </span>
                                        ) : null}
                                      </div>
                                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <input
                                          type="checkbox"
                                          checked={row.vehicleMileageMaxUnlimited === true}
                                          onChange={(e) =>
                                            setEditor((s) => ({
                                              ...s,
                                              pricingRows: s.pricingRows.map((r) =>
                                                r.key === row.key
                                                  ? {
                                                      ...r,
                                                      vehicleMileageMaxUnlimited: e.target.checked,
                                                      vehicleMileageMaxKm: e.target.checked ? "" : r.vehicleMileageMaxKm,
                                                    }
                                                  : r,
                                              ),
                                            }))
                                          }
                                          disabled={busy}
                                        />
                                        Unlimited
                                      </label>
                                    </div>
                                  </td>
                                </>
                              ) : null}

                              {editor.pricingVariesByVehicleClass ? (
                                <td className="px-3 py-1 align-top min-w-[150px]">
                                  <select
                                    value={row.vehicleClass}
                                    onChange={(e) =>
                                      setEditor((s) => ({
                                        ...s,
                                        pricingRows: s.pricingRows.map((r) => (r.key === row.key ? { ...r, vehicleClass: e.target.value } : r)),
                                      }))
                                    }
                                    className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
                                    disabled={busy}
                                  >
                                    <option value="ALL">All Classes</option>
                                    <option value="CLASS_1">Class 1</option>
                                    <option value="CLASS_2">Class 2</option>
                                    <option value="CLASS_3">Class 3</option>
                                  </select>
                                </td>
                              ) : null}

                              <td className="px-3 py-1 align-top min-w-[260px]">
                                <div className="grid grid-cols-1 gap-1">
                                  <select
                                    value={row.claimLimitType}
                                    onChange={(e) =>
                                      setEditor((s) => ({
                                        ...s,
                                        pricingRows: s.pricingRows.map((r) =>
                                          r.key === row.key
                                            ? {
                                                ...r,
                                                claimLimitType: e.target.value as any,
                                                claimLimitAmount: e.target.value === "FMV" || !e.target.value ? "" : r.claimLimitAmount,
                                              }
                                            : r,
                                        ),
                                      }))
                                    }
                                    className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
                                    disabled={busy}
                                  >
                                    <option value="">None</option>
                                    <option value="PER_CLAIM">Per Claim</option>
                                    <option value="TOTAL_COVERAGE">Total Coverage</option>
                                    <option value="FMV">FMV</option>
                                    <option value="MAX_RETAIL">Max Retail</option>
                                  </select>

                                  {row.claimLimitType && row.claimLimitType !== "FMV" ? (
                                    <Input
                                      value={row.claimLimitAmount}
                                      onChange={(e) =>
                                        setEditor((s) => ({
                                          ...s,
                                          pricingRows: s.pricingRows.map((r) =>
                                            r.key === row.key ? { ...r, claimLimitAmount: sanitizeMoney(e.target.value) } : r,
                                          ),
                                        }))
                                      }
                                      placeholder="Amount"
                                      inputMode="decimal"
                                      disabled={busy}
                                      className="h-8"
                                    />
                                  ) : (
                                    <div className="h-8 flex items-center px-2 text-xs text-muted-foreground">—</div>
                                  )}
                                </div>
                              </td>

                              <td className="px-3 py-1 align-top min-w-[180px]">
                                <Input
                                  value={row.providerCost}
                                  onChange={(e) =>
                                    setEditor((s) => ({
                                      ...s,
                                      pricingRows: s.pricingRows.map((r) => (r.key === row.key ? { ...r, providerCost: sanitizeMoney(e.target.value) } : r)),
                                    }))
                                  }
                                  placeholder="Net cost"
                                  inputMode="decimal"
                                  disabled={busy}
                                  className={
                                    "h-8 " +
                                    cellErrorClass((() => {
                                      const c = dollarsToCents(row.providerCost);
                                      return typeof c !== "number" || c <= 0;
                                    })())
                                  }
                                />
                              </td>

                              <td className="px-3 py-1 align-top min-w-[160px]">
                                <Input
                                  value={row.deductible}
                                  onChange={(e) =>
                                    setEditor((s) => ({
                                      ...s,
                                      pricingRows: s.pricingRows.map((r) => (r.key === row.key ? { ...r, deductible: sanitizeMoney(e.target.value) } : r)),
                                    }))
                                  }
                                  placeholder="Deductible"
                                  inputMode="decimal"
                                  disabled={busy}
                                  className={
                                    "h-8 " +
                                    cellErrorClass((() => {
                                      const c = dollarsToCents(row.deductible);
                                      return typeof c !== "number" || c < 0;
                                    })())
                                  }
                                />
                              </td>

                              <td className="px-3 py-1 align-top min-w-[240px]">
                                {(() => {
                                  const idx = editor.pricingRows.findIndex((r) => r.key === row.key);
                                  const issues = fieldIssuesByIdx.get(idx) ?? [];
                                  if (issues.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
                                  return <div className="text-xs text-rose-700">{issues.join(" • ")}</div>;
                                })()}
                              </td>

                              <td className="px-3 py-1 align-top text-right min-w-[110px]">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setEditor((s) => {
                                      const next = s.pricingRows.filter((r) => r.key !== row.key);
                                      if (next.length === 0) return { ...s, pricingRows: s.pricingRows };
                                      const stillHasDefault = next.some((r) => r.isDefault === true);
                                      if (stillHasDefault) return { ...s, pricingRows: next };
                                      return { ...s, pricingRows: next.map((r, i) => ({ ...r, isDefault: i === next.length - 1 })) };
                                    })
                                  }
                                  disabled={busy || editor.pricingRows.length <= 1}
                                  className="h-7"
                                >
                                  Remove
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                      );
                    })()}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setEditor((s) => ({
                          ...s,
                          pricingRows: [
                            ...s.pricingRows,
                            {
                              key: crypto.randomUUID(),
                              isDefault: false,
                              termMonths: "",
                              termMonthsUnlimited: false,
                              termKm: "",
                              termKmUnlimited: false,
                              vehicleMileageMinKm: "",
                              vehicleMileageMaxKm: "",
                              vehicleMileageMaxUnlimited: false,
                              vehicleClass: "ALL",
                              claimLimitType: "",
                              claimLimitAmount: "",
                              deductible: "",
                              providerCost: "",
                            },
                          ],
                        }))
                      }
                      disabled={busy}
                    >
                      Add Pricing Row
                    </Button>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-sm text-muted-foreground">Published</div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={editor.published ? "default" : "outline"}
                        onClick={() => setEditor((s) => ({ ...s, published: true }))}
                        disabled={busy}
                      >
                        Published
                      </Button>
                      <Button
                        type="button"
                        variant={!editor.published ? "default" : "outline"}
                        onClick={() => setEditor((s) => ({ ...s, published: false }))}
                        disabled={busy}
                      >
                        Draft
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "DOCUMENTS" ? (
              <div className="space-y-4">
                <div className="rounded-xl border p-4">
                  <div className="font-semibold">Documents</div>
                  <div className="text-sm text-muted-foreground mt-1">Upload disclosures and PDFs in Documents, then link them to this product.</div>
                  <Button variant="outline" asChild>
                    <Link to="/provider-documents">Manage documents</Link>
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-10 rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold">Your Products</div>
            <div className="text-sm text-muted-foreground mt-1">Draft and published offerings.</div>
          </div>
          <div className="flex items-center gap-3">
            <Input
              value={search}
              onChange={(e) => setSearch(sanitizeWordsOnly(e.target.value))}
              placeholder="Search…"
              className="w-[220px]"
              disabled={busy}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ALL" | "DRAFT" | "PUBLISHED")}
              className="h-10 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              disabled={busy}
            >
              <option value="ALL">All</option>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
            </select>
            <div className="text-sm text-muted-foreground whitespace-nowrap">
              {publishedCount} published • {draftCount} draft
            </div>
          </div>
        </div>

        <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 border-b text-xs text-muted-foreground">
          <div className="col-span-3">Product</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-3">Coverage</div>
          <div className="col-span-2">Terms</div>
          <div className="col-span-1">Cost</div>
          <div className="col-span-1">Eligibility</div>
          <div className="col-span-1 text-right">Action</div>
        </div>

        <div className="divide-y">
          {filteredProducts.map((p) => {
            const health = pricingHealthByProductId.get(p.id);
            const primary = health?.primary ?? null;
            const months = primary
              ? primary.termMonths === null
                ? "Unlimited"
                : `${primary.termMonths} mo`
              : "—";
            const km = primary
              ? primary.termKm === null
                ? "Unlimited"
                : `${primary.termKm} km`
              : "—";

            const primaryClass = primary && typeof primary.vehicleClass === "string" && primary.vehicleClass.trim() ? primary.vehicleClass.trim() : "";
            const primaryMileageMin = primary && typeof primary.vehicleMileageMinKm === "number" ? primary.vehicleMileageMinKm : 0;
            const primaryMileageMax =
              primary && primary.vehicleMileageMaxKm !== undefined
                ? primary.vehicleMileageMaxKm === null
                  ? null
                  : typeof primary.vehicleMileageMaxKm === "number"
                    ? primary.vehicleMileageMaxKm
                    : undefined
                : undefined;
            const primaryMileageLabel = primary
              ? `${primaryMileageMin.toLocaleString()} - ${primaryMileageMax === null ? "Unlimited" : typeof primaryMileageMax === "number" ? primaryMileageMax.toLocaleString() : "—"} km`
              : "";
            const primaryClaimLimit = primary && typeof primary.claimLimitCents === "number" ? money(primary.claimLimitCents) : "";

            const pricingBadgeClass = health?.ok
              ? "text-[10px] px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200"
              : "text-[10px] px-2 py-0.5 rounded-md border bg-rose-50 text-rose-700 border-rose-200";

            return (
              <div key={p.id} className="px-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  <div className="md:col-span-3">
                    <div className="text-sm font-medium text-foreground">{p.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{productTypeLabel(p.productType)}</div>
                  </div>
                  <div className="md:col-span-1">
                    <div className="space-y-1">
                      <span className={statusBadge(p.published)}>{p.published ? "Published" : "Draft"}</span>
                      {health ? (
                        <div className="flex items-center gap-2">
                          <div className={pricingBadgeClass}>{health.ok ? "Pricing OK" : health.reason}</div>
                          {!health.ok ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => beginEditTab(p, "PRICING")}
                              disabled={busy}
                            >
                              Fix
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="md:col-span-3 text-sm text-muted-foreground">
                    {(p.coverageDetails ?? "").trim() || (p.exclusions ?? "").trim() ? (
                      <div className="line-clamp-2">{(p.coverageDetails ?? "").trim() || (p.exclusions ?? "").trim()}</div>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div className="md:col-span-2 text-sm text-muted-foreground">
                    <div>{months} / {km}</div>
                    {primary ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {(primaryClass ? `Class ${primaryClass.replace(/^CLASS_/, "")}` : "Any class")}
                        {primaryMileageLabel ? ` • ${primaryMileageLabel}` : ""}
                        {primaryClaimLimit ? ` • Limit ${primaryClaimLimit}` : ""}
                      </div>
                    ) : null}
                  </div>
                  <div className="md:col-span-1 text-sm text-muted-foreground">{money(primary?.basePriceCents ?? undefined)}</div>
                  <div className="md:col-span-1 text-xs text-muted-foreground">{eligibilitySummary(p)}</div>
                  <div className="md:col-span-1 flex md:justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => beginEdit(p)} disabled={busy}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-rose-200 text-rose-700 hover:bg-rose-50"
                      onClick={() => onDelete(p)}
                      disabled={busy}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {productsQuery.isLoading ? <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div> : null}
          {productsQuery.isError ? <div className="px-6 py-6 text-sm text-destructive">Failed to load products.</div> : null}
          {!productsQuery.isLoading && !productsQuery.isError && filteredProducts.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">
              No products yet. Click <span className="font-medium">New Product</span> to create your first offering.
            </div>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
