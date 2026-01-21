import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { getProductsApi } from "../lib/products/products";
import { sanitizeDigitsOnly, sanitizeMoney, sanitizeWordsOnly } from "../lib/utils";
import type { CreateProductInput, Product, ProductType } from "../lib/products/types";

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
  basePrice: string;
  termMonths: string;
  termKm: string;
  deductible: string;
  eligibilityMaxVehicleAgeYears: string;
  eligibilityMaxMileageKm: string;
  eligibilityMakeAllowlist: string;
  eligibilityModelAllowlist: string;
  eligibilityTrimAllowlist: string;
  coverageDetails: string;
  exclusions: string;
  published: boolean;
};

type ProductEditorTab = "OVERVIEW" | "ELIGIBILITY" | "PRICING" | "DOCUMENTS";

function emptyEditor(): EditorState {
  return {
    name: "",
    productType: "EXTENDED_WARRANTY",
    basePrice: "",
    termMonths: "",
    termKm: "",
    deductible: "",
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
  return {
    id: p.id,
    name: p.name,
    productType: p.productType,
    basePrice: centsToDollars(p.basePriceCents),
    termMonths: typeof p.termMonths === "number" ? String(p.termMonths) : "",
    termKm: typeof p.termKm === "number" ? String(p.termKm) : "",
    deductible: centsToDollars(p.deductibleCents),
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

export function ProviderProductsPage() {
  const api = useMemo(() => getProductsApi(), []);
  const qc = useQueryClient();

  const [showEditor, setShowEditor] = useState(false);
  const [editor, setEditor] = useState<EditorState>(() => emptyEditor());
  const [activeTab, setActiveTab] = useState<ProductEditorTab>("OVERVIEW");
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "PUBLISHED">("ALL");

  const productsQuery = useQuery({
    queryKey: ["provider-products"],
    queryFn: () => api.list(),
  });

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
    setShowEditor(true);
  };

  const beginEdit = (p: Product) => {
    setError(null);
    setEditor(editorFromProduct(p));
    setActiveTab("OVERVIEW");
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

    if (editor.published) {
      const base = dollarsToCents(editor.basePrice);
      if (typeof base !== "number" || base <= 0) {
        setError("To publish, a valid base price is required.");
        setActiveTab("PRICING");
        return;
      }
    }

    const input: CreateProductInput = {
      name,
      productType: editor.productType,
      coverageDetails: editor.coverageDetails.trim() || undefined,
      exclusions: editor.exclusions.trim() || undefined,
      termMonths: parseOptionalInt(editor.termMonths),
      termKm: parseOptionalInt(editor.termKm),
      deductibleCents: dollarsToCents(editor.deductible),
      eligibilityMaxVehicleAgeYears: parseOptionalInt(editor.eligibilityMaxVehicleAgeYears),
      eligibilityMaxMileageKm: parseOptionalInt(editor.eligibilityMaxMileageKm),
      eligibilityMakeAllowlist: parseAllowlist(editor.eligibilityMakeAllowlist),
      eligibilityModelAllowlist: parseAllowlist(editor.eligibilityModelAllowlist),
      eligibilityTrimAllowlist: parseAllowlist(editor.eligibilityTrimAllowlist),
      basePriceCents: dollarsToCents(editor.basePrice),
    };

    const allowlistsForUpdate = {
      eligibilityMakeAllowlist: parseAllowlist(editor.eligibilityMakeAllowlist) ?? [],
      eligibilityModelAllowlist: parseAllowlist(editor.eligibilityModelAllowlist) ?? [],
      eligibilityTrimAllowlist: parseAllowlist(editor.eligibilityTrimAllowlist) ?? [],
    };

    try {
      if (!editor.id) {
        await createMutation.mutateAsync(input);
      } else {
        await updateMutation.mutateAsync({
          id: editor.id,
          patch: {
            name: input.name,
            productType: input.productType,
            coverageDetails: input.coverageDetails ?? "",
            exclusions: input.exclusions ?? "",
            termMonths: input.termMonths,
            termKm: input.termKm,
            deductibleCents: input.deductibleCents,
            eligibilityMaxVehicleAgeYears: input.eligibilityMaxVehicleAgeYears,
            eligibilityMaxMileageKm: input.eligibilityMaxMileageKm,
            eligibilityMakeAllowlist: allowlistsForUpdate.eligibilityMakeAllowlist,
            eligibilityModelAllowlist: allowlistsForUpdate.eligibilityModelAllowlist,
            eligibilityTrimAllowlist: allowlistsForUpdate.eligibilityTrimAllowlist,
            basePriceCents: input.basePriceCents,
            published: editor.published,
          },
        });
      }

      setShowEditor(false);
      setEditor(emptyEditor());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save product");
    }
  };

  const busy = createMutation.isPending || updateMutation.isPending;

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

            {activeTab === "PRICING" ? (
              <div className="space-y-4">
                <div className="rounded-xl border p-4">
                  <div className="font-semibold">Pricing</div>
                  <div className="text-sm text-muted-foreground mt-1">Retail price only (dealer pricing comes later).</div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input
                      value={editor.basePrice}
                      onChange={(e) => setEditor((s) => ({ ...s, basePrice: sanitizeMoney(e.target.value) }))}
                      placeholder="Retail price (e.g. 799.00)"
                      inputMode="decimal"
                      disabled={busy}
                    />
                    <Input
                      value={editor.deductible}
                      onChange={(e) => setEditor((s) => ({ ...s, deductible: sanitizeMoney(e.target.value) }))}
                      placeholder="Deductible (e.g. 100.00)"
                      inputMode="decimal"
                      disabled={busy}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-sm text-muted-foreground">Published</div>
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editor.published}
                        onChange={(e) => setEditor((s) => ({ ...s, published: e.target.checked }))}
                        disabled={busy}
                      />
                      {editor.published ? "Yes" : "No"}
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border p-4">
                  <div className="font-semibold">Terms</div>
                  <div className="text-sm text-muted-foreground mt-1">Months + km.</div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input
                      value={editor.termMonths}
                      onChange={(e) => setEditor((s) => ({ ...s, termMonths: sanitizeDigitsOnly(e.target.value) }))}
                      placeholder="Term months"
                      inputMode="numeric"
                      disabled={busy}
                    />
                    <Input
                      value={editor.termKm}
                      onChange={(e) => setEditor((s) => ({ ...s, termKm: sanitizeDigitsOnly(e.target.value) }))}
                      placeholder="Term km"
                      inputMode="numeric"
                      disabled={busy}
                    />
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
            <div className="col-span-1">Retail</div>
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
                  <div className="md:col-span-1 flex md:justify-end">
                    <Button size="sm" variant="outline" onClick={() => beginEdit(p)} disabled={busy}>
                      Edit
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
