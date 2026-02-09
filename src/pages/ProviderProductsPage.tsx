import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { getProductsApi } from "../lib/products/products";
import { getProductPricingApi } from "../lib/productPricing/productPricing";
import { getProductAddonsApi } from "../lib/productAddons/productAddons";
import { sanitizeDigitsOnly, sanitizeMoney, sanitizeWordsOnly } from "../lib/utils";
import type { CreateProductInput, Product, ProductType } from "../lib/products/types";
import type { ProductPricing } from "../lib/productPricing/types";
import type { ProductAddon } from "../lib/productAddons/types";

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

function parsePriceRangeToCents(raw: string): { min: number; max: number } | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const cleaned = t.replace(/\$/g, "");
  const parts = cleaned
    .split(/\s*-\s*/g)
    .map((x) => x.trim())
    .filter(Boolean);

  if (parts.length === 1) {
    const n = dollarsToCents(parts[0]!);
    if (typeof n !== "number" || n <= 0) return null;
    return { min: n, max: n };
  }
  if (parts.length === 2) {
    const a = dollarsToCents(parts[0]!);
    const b = dollarsToCents(parts[1]!);
    if (typeof a !== "number" || typeof b !== "number" || a <= 0 || b <= 0) return null;
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  return null;
}

function sanitizePriceRangeInput(raw: string) {
  return (raw ?? "").replace(/[^0-9.\-\s$]/g, "");
}

function centsToDollars(cents?: number) {
  if (typeof cents !== "number") return "";
  return (cents / 100).toFixed(2);
}

function money(cents?: number) {
  if (typeof cents !== "number") return "—";
  return `$${(cents / 100).toFixed(2)}`;
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

type EditorState = {
  id?: string;
  name: string;
  productType: ProductType;
  pricingRows: Array<{
    key: string;
    termMonths: string;
    termKm: string;
    vehicleMileageMinKm: string;
    vehicleMileageMaxKm: string;
    vehicleClass: string;
    claimLimit: string;
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
  published: boolean;
};

type ProductEditorTab = "OVERVIEW" | "ELIGIBILITY" | "PRICING" | "ADDONS" | "DOCUMENTS";

type PendingAddon = {
  key: string;
  name: string;
  description: string;
  basePrice: string;
};

function emptyEditor(): EditorState {
  return {
    name: "",
    productType: "EXTENDED_WARRANTY",
    pricingRows: [
      {
        key: crypto.randomUUID(),
        termMonths: "",
        termKm: "",
        vehicleMileageMinKm: "",
        vehicleMileageMaxKm: "",
        vehicleClass: "",
        claimLimit: "",
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
    published: false,
  };
}

function editorFromProduct(p: Product): EditorState {
  const fallbackRow = {
    key: crypto.randomUUID(),
    termMonths: typeof p.termMonths === "number" ? String(p.termMonths) : "",
    termKm: typeof p.termKm === "number" ? String(p.termKm) : "",
    vehicleMileageMinKm: "",
    vehicleMileageMaxKm: "",
    vehicleClass: "",
    claimLimit: "",
    deductible: centsToDollars(p.deductibleCents),
    providerCost: centsToDollars(p.dealerCostCents),
  };
  return {
    id: p.id,
    name: p.name,
    productType: p.productType,
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
    published: p.published,
  };
}

function textareaClassName() {
  return "flex min-h-[90px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
}

function parseUnlimitedInt(v: string) {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  if (/^unlimited$/i.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
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

  const [addonEditor, setAddonEditor] = useState<{
    id?: string;
    name: string;
    description: string;
    basePrice: string;
    active: boolean;
  }>(() => ({
    name: "",
    description: "",
    basePrice: "",
    active: true,
  }));

  useEffect(() => {
    if (!showEditor) return;
    setAddonEditor({ name: "", description: "", basePrice: "", active: true });
    setPendingAddons([]);
  }, [editorProductId, showEditor]);

  const saveAddonMutation = useMutation({
    mutationFn: async () => {
      const productId = editorProductId;
      if (!productId) throw new Error("Select a product first");

      const name = addonEditor.name.trim();
      if (!name) throw new Error("Add-on name is required");

      const range = parsePriceRangeToCents(addonEditor.basePrice);
      if (!range) throw new Error("Add-on price is required");

      if (addonEditor.id) {
        return addonsApi.update(addonEditor.id, {
          name,
          description: addonEditor.description.trim() || undefined,
          basePriceCents: range.min,
          minPriceCents: range.min,
          maxPriceCents: range.max,
          active: addonEditor.active,
        });
      }

      return addonsApi.create({
        productId,
        name,
        description: addonEditor.description.trim() || undefined,
        basePriceCents: range.min,
        minPriceCents: range.min,
        maxPriceCents: range.max,
        active: true,
      });
    },
    onSuccess: async () => {
      setAddonEditor({ name: "", description: "", basePrice: "", active: true });
      await qc.invalidateQueries({ queryKey: ["product-addons", editorProductId] });
    },
  });

  const removeAddonMutation = useMutation({
    mutationFn: async (id: string) => {
      await addonsApi.remove(id);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["product-addons", editorProductId] });
      setAddonEditor({ name: "", description: "", basePrice: "", active: true });
    },
  });

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
        .map((r) => ({
          key: r.id,
          termMonths: r.termMonths === null ? "Unlimited" : String(r.termMonths),
          termKm: r.termKm === null ? "Unlimited" : String(r.termKm),
          vehicleMileageMinKm: typeof r.vehicleMileageMinKm === "number" ? String(r.vehicleMileageMinKm) : "",
          vehicleMileageMaxKm: r.vehicleMileageMaxKm === null ? "Unlimited" : typeof r.vehicleMileageMaxKm === "number" ? String(r.vehicleMileageMaxKm) : "",
          vehicleClass: typeof r.vehicleClass === "string" ? r.vehicleClass : "",
          claimLimit: typeof r.claimLimitCents === "number" ? centsToDollars(r.claimLimitCents) : "",
          deductible: centsToDollars(r.deductibleCents),
          providerCost: centsToDollars(r.dealerCostCents),
        }));

      if (mapped.length === 0) return s;
      const same =
        s.pricingRows.length === mapped.length &&
        s.pricingRows.every((row, idx) => {
          const next = mapped[idx]!;
          return (
            row.key === next.key &&
            row.termMonths === next.termMonths &&
            row.termKm === next.termKm &&
            row.vehicleMileageMinKm === next.vehicleMileageMinKm &&
            row.vehicleMileageMaxKm === next.vehicleMileageMaxKm &&
            row.vehicleClass === next.vehicleClass &&
            row.claimLimit === next.claimLimit &&
            row.deductible === next.deductible &&
            row.providerCost === next.providerCost
          );
        });

      if (same) return s;
      return { ...s, pricingRows: mapped };
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
      termMonths: number | null;
      termKm: number | null;
      vehicleMileageMinKm?: number;
      vehicleMileageMaxKm?: number | null;
      vehicleClass?: string;
      claimLimitCents?: number;
      deductibleCents: number;
      providerCostCents: number;
    };

    const normalizedRows = editor.pricingRows
      .map((r) => ({
        key: r.key,
        termMonths: parseUnlimitedInt(r.termMonths),
        termKm: parseUnlimitedInt(r.termKm),
        vehicleMileageMinKm: parseOptionalInt(r.vehicleMileageMinKm),
        vehicleMileageMaxKm: parseUnlimitedInt(r.vehicleMileageMaxKm),
        vehicleClass: r.vehicleClass.trim() || undefined,
        claimLimitCents: dollarsToCents(r.claimLimit),
        deductibleCents: dollarsToCents(r.deductible) ?? 0,
        providerCostCents: dollarsToCents(r.providerCost),
      }))
      .filter((r) => r.termMonths !== undefined || r.termKm !== undefined || r.providerCostCents || r.deductibleCents);

    const validatedRows: ValidatedRow[] = normalizedRows.map((r) => {
      if (r.termMonths !== null && (typeof r.termMonths !== "number" || r.termMonths <= 0)) {
        throw new Error("Each pricing row requires term months (number or Unlimited).");
      }
      if (r.termKm !== null && (typeof r.termKm !== "number" || r.termKm <= 0)) {
        throw new Error("Each pricing row requires term km (number or Unlimited).");
      }
      if (typeof r.providerCostCents !== "number" || r.providerCostCents <= 0) {
        throw new Error("Each pricing row requires provider cost.");
      }
      if (!Number.isFinite(r.deductibleCents) || r.deductibleCents < 0) throw new Error("Deductible must be a number >= 0.");

      if (typeof r.vehicleMileageMinKm === "number" && r.vehicleMileageMinKm < 0) throw new Error("Mileage min must be >= 0.");
      if (typeof r.vehicleMileageMaxKm === "number" && r.vehicleMileageMaxKm <= 0) throw new Error("Mileage max must be > 0.");
      if (typeof r.vehicleMileageMinKm === "number" && typeof r.vehicleMileageMaxKm === "number" && r.vehicleMileageMaxKm < r.vehicleMileageMinKm) {
        throw new Error("Mileage max must be >= mileage min.");
      }

      return {
        key: r.key,
        termMonths: r.termMonths,
        termKm: r.termKm,
        vehicleMileageMinKm: typeof r.vehicleMileageMinKm === "number" ? r.vehicleMileageMinKm : undefined,
        vehicleMileageMaxKm: r.vehicleMileageMaxKm === null ? null : typeof r.vehicleMileageMaxKm === "number" ? r.vehicleMileageMaxKm : undefined,
        vehicleClass: typeof r.vehicleClass === "string" ? r.vehicleClass : undefined,
        claimLimitCents: typeof r.claimLimitCents === "number" && r.claimLimitCents > 0 ? r.claimLimitCents : undefined,
        deductibleCents: r.deductibleCents,
        providerCostCents: r.providerCostCents,
      };
    });

    if (editor.published && validatedRows.length === 0) {
      setError("To publish, add at least one pricing row.");
      setActiveTab("PRICING");
      return;
    }

    const seen = new Set<string>();
    for (const r of validatedRows) {
      const key = `${r.termMonths}|${r.termKm}|${r.vehicleMileageMinKm ?? ""}|${r.vehicleMileageMaxKm ?? ""}|${r.vehicleClass ?? ""}|${r.deductibleCents}`;
      if (seen.has(key)) {
        setError("Duplicate pricing rows found (same term months / km / deductible).");
        setActiveTab("PRICING");
        return;
      }
      seen.add(key);
    }

    const primary = validatedRows[0];

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

    const allowlistsForUpdate = {
      eligibilityMakeAllowlist: parseAllowlist(editor.eligibilityMakeAllowlist) ?? [],
      eligibilityModelAllowlist: parseAllowlist(editor.eligibilityModelAllowlist) ?? [],
      eligibilityTrimAllowlist: parseAllowlist(editor.eligibilityTrimAllowlist) ?? [],
    };

    try {
      let savedProduct: Product | null = null;
      if (!editor.id) {
        savedProduct = (await createMutation.mutateAsync(input)) as Product;

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
            ...(typeof input.termMonths === "number" ? { termMonths: input.termMonths } : {}),
            ...(typeof input.termKm === "number" ? { termKm: input.termKm } : {}),
            ...(typeof input.deductibleCents === "number" ? { deductibleCents: input.deductibleCents } : {}),
            eligibilityMaxVehicleAgeYears: input.eligibilityMaxVehicleAgeYears,
            eligibilityMaxMileageKm: input.eligibilityMaxMileageKm,
            eligibilityMakeAllowlist: allowlistsForUpdate.eligibilityMakeAllowlist,
            eligibilityModelAllowlist: allowlistsForUpdate.eligibilityModelAllowlist,
            eligibilityTrimAllowlist: allowlistsForUpdate.eligibilityTrimAllowlist,
            ...(typeof input.basePriceCents === "number" ? { basePriceCents: input.basePriceCents } : {}),
            ...(typeof input.dealerCostCents === "number" ? { dealerCostCents: input.dealerCostCents } : {}),
            published: editor.published,
          },
        })) as Product;
      }

      const productId = (savedProduct?.id ?? editor.id ?? "").trim();
      if (productId) {
        const existing = await pricingApi.list({ productId });
        for (const r of existing) {
          await pricingApi.remove(r.id);
        }
        for (const r of validatedRows) {
          await pricingApi.create({
            productId,
            termMonths: r.termMonths,
            termKm: r.termKm,
            vehicleMileageMinKm: r.vehicleMileageMinKm,
            vehicleMileageMaxKm: r.vehicleMileageMaxKm,
            vehicleClass: r.vehicleClass,
            claimLimitCents: r.claimLimitCents,
            deductibleCents: r.deductibleCents,
            basePriceCents: r.providerCostCents,
            dealerCostCents: r.providerCostCents,
          });
        }
        await qc.invalidateQueries({ queryKey: ["product-pricing", productId] });
      }

      if (productId && pendingAddons.length > 0) {
        for (const a of pendingAddons) {
          const name = a.name.trim();
          if (!name) continue;

          const range = parsePriceRangeToCents(a.basePrice);
          if (!range) continue;

          await addonsApi.create({
            productId,
            name,
            description: a.description.trim() || undefined,
            basePriceCents: range.min,
            minPriceCents: range.min,
            maxPriceCents: range.max,
            active: true,
          });
        }
        await qc.invalidateQueries({ queryKey: ["product-addons", productId] });
      }

      await qc.invalidateQueries({ queryKey: ["marketplace-products"] });

      setShowEditor(false);
      setEditor(emptyEditor());
      setPendingAddons([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save product");
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

                <textarea
                  value={editor.coverageDetails}
                  onChange={(e) => setEditor((s) => ({ ...s, coverageDetails: e.target.value }))}
                  placeholder="Coverage details"
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
              </div>
            ) : null}

            {activeTab === "ELIGIBILITY" ? (
              <div className="space-y-4">
                <div className="rounded-xl border p-4">
                  <div className="font-semibold">Age & Mileage</div>
                  <div className="text-sm text-muted-foreground mt-1">Vehicle age + mileage limits.</div>
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
                {editorProductId ? (
                  <div className="rounded-xl border p-4">
                    <div className="font-semibold">Add-ons</div>

                    <div className="mt-4">
                      {addonsQuery.isLoading ? <div className="text-sm text-muted-foreground">Loading add-ons…</div> : null}
                      {addonsQuery.isError ? <div className="text-sm text-destructive">Failed to load add-ons.</div> : null}

                      <div className="divide-y rounded-xl border">
                        {addons.map((a) => (
                          <div key={a.id} className="p-4 flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="font-medium text-foreground truncate">{a.name}</div>
                              {a.description ? <div className="text-xs text-muted-foreground mt-1">{a.description}</div> : null}
                              <div className="text-xs text-muted-foreground mt-2">
                                Price {(() => {
                                  const min = typeof (a as any).minPriceCents === "number" ? (a as any).minPriceCents : a.basePriceCents;
                                  const max = typeof (a as any).maxPriceCents === "number" ? (a as any).maxPriceCents : min;
                                  return min !== max ? `${money(min)} - ${money(max)}` : money(min);
                                })()}
                                {a.active ? " • Active" : " • Inactive"}
                              </div>
                            </div>

                            <div className="flex gap-2 shrink-0">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setAddonEditor({
                                    id: a.id,
                                    name: a.name,
                                    description: a.description ?? "",
                                    basePrice:
                                      typeof (a as any).minPriceCents === "number" && typeof (a as any).maxPriceCents === "number" && (a as any).minPriceCents !== (a as any).maxPriceCents
                                        ? `${centsToDollars((a as any).minPriceCents)} - ${centsToDollars((a as any).maxPriceCents)}`
                                        : centsToDollars(a.basePriceCents),
                                    active: a.active,
                                  });
                                }}
                                disabled={busy}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="border-rose-200 text-rose-700 hover:bg-rose-50"
                                disabled={busy || removeAddonMutation.isPending}
                                onClick={() => {
                                  const ok = window.confirm(`Delete add-on "${a.name}"? This cannot be undone.`);
                                  if (!ok) return;
                                  removeAddonMutation.mutate(a.id);
                                }}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {!editorProductId ? (
                  <div className="rounded-xl border p-4">
                    <div className="font-semibold">Add-on rows</div>

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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <Input
                                value={row.basePrice}
                                onChange={(e) =>
                                  setPendingAddons((s) => s.map((x) => (x.key === row.key ? { ...x, basePrice: sanitizePriceRangeInput(e.target.value) } : x)))
                                }
                                placeholder='Price (e.g. 499.00 or "499 - 599")'
                                inputMode="decimal"
                                disabled={busy}
                              />
                            </div>
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
                            {
                              key: crypto.randomUUID(),
                              name: "",
                              description: "",
                              basePrice: "",
                            },
                          ])
                        }
                      >
                        Add row
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border p-4">
                    <div className="font-semibold">{addonEditor.id ? "Edit add-on" : "New add-on"}</div>
                    <div className="mt-4 grid grid-cols-1 gap-3">
                      <Input
                        value={addonEditor.name}
                        onChange={(e) => setAddonEditor((s) => ({ ...s, name: e.target.value }))}
                        placeholder="Add-on name"
                        disabled={busy}
                      />
                      <Input
                        value={addonEditor.description}
                        onChange={(e) => setAddonEditor((s) => ({ ...s, description: e.target.value }))}
                        placeholder="Description (optional)"
                        disabled={busy}
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Input
                          value={addonEditor.basePrice}
                          onChange={(e) => setAddonEditor((s) => ({ ...s, basePrice: sanitizePriceRangeInput(e.target.value) }))}
                          placeholder='Price (e.g. 499.00 or "499 - 599")'
                          inputMode="decimal"
                          disabled={busy}
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          disabled={busy || saveAddonMutation.isPending}
                          onClick={async () => {
                            setError(null);
                            try {
                              await saveAddonMutation.mutateAsync();
                            } catch (e) {
                              setError(e instanceof Error ? e.message : "Failed to save add-on");
                            }
                          }}
                        >
                          {addonEditor.id ? "Save" : "Add"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() => setAddonEditor({ name: "", description: "", basePrice: "", active: true })}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {activeTab === "PRICING" ? (
              <div className="space-y-4">
                <div className="rounded-xl border p-4">
                  <div className="font-semibold">Pricing</div>

                  <div className="mt-3 space-y-3">
                    {editor.pricingRows.map((row, idx) => (
                      <div key={row.key} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium">Row {idx + 1}</div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEditor((s) => ({ ...s, pricingRows: s.pricingRows.filter((r) => r.key !== row.key) }))}
                            disabled={busy || editor.pricingRows.length <= 1}
                          >
                            Remove
                          </Button>
                        </div>

                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input
                            value={row.termMonths}
                            onChange={(e) =>
                              setEditor((s) => ({
                                ...s,
                                pricingRows: s.pricingRows.map((r) =>
                                  r.key === row.key ? { ...r, termMonths: e.target.value.replace(/[^0-9a-z]/gi, "") } : r,
                                ),
                              }))
                            }
                            placeholder='Term months (e.g. 36 or "Unlimited")'
                            disabled={busy}
                          />
                          <Input
                            value={row.termKm}
                            onChange={(e) =>
                              setEditor((s) => ({
                                ...s,
                                pricingRows: s.pricingRows.map((r) => (r.key === row.key ? { ...r, termKm: e.target.value.replace(/[^0-9a-z]/gi, "") } : r)),
                              }))
                            }
                            placeholder='Term km (e.g. 60000 or "Unlimited")'
                            disabled={busy}
                          />
                          <Input
                            value={row.vehicleMileageMinKm}
                            onChange={(e) =>
                              setEditor((s) => ({
                                ...s,
                                pricingRows: s.pricingRows.map((r) => (r.key === row.key ? { ...r, vehicleMileageMinKm: sanitizeDigitsOnly(e.target.value) } : r)),
                              }))
                            }
                            placeholder="Mileage min km (optional)"
                            inputMode="numeric"
                            disabled={busy}
                          />
                          <Input
                            value={row.vehicleMileageMaxKm}
                            onChange={(e) =>
                              setEditor((s) => ({
                                ...s,
                                pricingRows: s.pricingRows.map((r) => (r.key === row.key ? { ...r, vehicleMileageMaxKm: e.target.value.replace(/[^0-9a-z]/gi, "") } : r)),
                              }))
                            }
                            placeholder='Mileage max km (optional or "Unlimited")'
                            disabled={busy}
                          />
                          <select
                            value={row.vehicleClass}
                            onChange={(e) =>
                              setEditor((s) => ({
                                ...s,
                                pricingRows: s.pricingRows.map((r) => (r.key === row.key ? { ...r, vehicleClass: e.target.value } : r)),
                              }))
                            }
                            className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                            disabled={busy}
                          >
                            <option value="">Vehicle class (optional)</option>
                            <option value="CLASS_1">Class 1</option>
                            <option value="CLASS_2">Class 2</option>
                            <option value="CLASS_3">Class 3</option>
                          </select>
                          <Input
                            value={row.claimLimit}
                            onChange={(e) =>
                              setEditor((s) => ({
                                ...s,
                                pricingRows: s.pricingRows.map((r) => (r.key === row.key ? { ...r, claimLimit: sanitizeMoney(e.target.value) } : r)),
                              }))
                            }
                            placeholder="Claim limit (e.g. 2500.00)"
                            inputMode="decimal"
                            disabled={busy}
                          />
                          <Input
                            value={row.providerCost}
                            onChange={(e) =>
                              setEditor((s) => ({
                                ...s,
                                pricingRows: s.pricingRows.map((r) => (r.key === row.key ? { ...r, providerCost: sanitizeMoney(e.target.value) } : r)),
                              }))
                            }
                            placeholder="Provider cost (e.g. 799.00)"
                            inputMode="decimal"
                            disabled={busy}
                          />
                          <Input
                            value={row.deductible}
                            onChange={(e) =>
                              setEditor((s) => ({
                                ...s,
                                pricingRows: s.pricingRows.map((r) => (r.key === row.key ? { ...r, deductible: sanitizeMoney(e.target.value) } : r)),
                              }))
                            }
                            placeholder="Deductible (e.g. 100.00)"
                            inputMode="decimal"
                            disabled={busy}
                          />
                        </div>
                      </div>
                    ))}

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
                              termMonths: "",
                              termKm: "",
                              vehicleMileageMinKm: "",
                              vehicleMileageMaxKm: "",
                              vehicleClass: "",
                              claimLimit: "",
                              deductible: "",
                              providerCost: "",
                              basePrice: "",
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
            {filteredProducts.map((p) => (
              <div key={p.id} className="px-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  <div className="md:col-span-3">
                    <div className="text-sm font-medium text-foreground">{p.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{productTypeLabel(p.productType)}</div>
                  </div>
                  <div className="md:col-span-1">
                    <span className={statusBadge(p.published)}>{p.published ? "Published" : "Draft"}</span>
                  </div>
                  <div className="md:col-span-3 text-sm text-muted-foreground">
                    {(p.coverageDetails ?? "").trim() || (p.exclusions ?? "").trim() ? (
                      <div className="line-clamp-2">{(p.coverageDetails ?? "").trim() || (p.exclusions ?? "").trim()}</div>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div className="md:col-span-2 text-sm text-muted-foreground">
                    {typeof p.termMonths === "number" ? `${p.termMonths} mo` : "—"} / {typeof p.termKm === "number" ? `${p.termKm} km` : "—"}
                  </div>
                  <div className="md:col-span-1 text-sm text-muted-foreground">{money(p.basePriceCents)}</div>
                  <div className="md:col-span-1 text-xs text-muted-foreground">{eligibilitySummary(p)}</div>
                  <div className="md:col-span-1 flex md:justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => beginEdit(p)} disabled={busy}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDelete(p)}
                      disabled={busy}
                      className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {productsQuery.isLoading ? <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div> : null}
            {productsQuery.isError ? (
              <div className="px-6 py-6 text-sm text-destructive">Failed to load products.</div>
            ) : null}
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
