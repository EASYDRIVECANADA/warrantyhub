import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { getContractsApi } from "../lib/contracts/contracts";
import type { Contract } from "../lib/contracts/types";
import { getMarketplaceApi } from "../lib/marketplace/marketplace";
import type { Product, ProductType } from "../lib/products/types";
import { getProvidersApi } from "../lib/providers/providers";
import type { ProviderPublic } from "../lib/providers/types";
import { alertMissing, confirmProceed } from "../lib/utils";
import { BRAND } from "../lib/brand";
import { PageShell } from "../components/PageShell";

function toIsoDateInput(iso: string | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function parseDateInput(v: string) {
  const t = v.trim();
  if (!t) return null;
  const d = new Date(`${t}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function withinDateRange(iso: string, start: Date | null, end: Date | null) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return true;
  if (start && d < start) return false;
  if (end) {
    const inclusiveEnd = new Date(end);
    inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() + 1);
    if (d >= inclusiveEnd) return false;
  }
  return true;
}

function matchText(haystack: string | undefined, q: string) {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(q);
}

function productTypeLabel(t: ProductType) {
  if (t === "EXTENDED_WARRANTY") return "Extended Warranty";
  if (t === "TIRE_RIM") return "Tire & Rim";
  if (t === "APPEARANCE") return "Appearance";
  if (t === "GAP") return "GAP";
  return "Other";
}

function providerLabel(id: string) {
  const trimmed = id.trim();
  if (!trimmed) return "—";
  return `Provider ${trimmed.slice(0, 8)}`;
}

function providerDisplayName(p: ProviderPublic | undefined, id: string) {
  const company = (p?.companyName ?? "").trim();
  if (company) return company;
  const display = (p?.displayName ?? "").trim();
  if (display) return display;
  return providerLabel(id);
}

type SavedSearch = {
  id: string;
  name: string;
  query: string;
  startDate: string;
  endDate: string;
  providerId: string;
  productType: string;
  productId: string;
};

const SAVED_SEARCHES_KEY = "warrantyhub.local.saved_searches.dealer_search";

function readSavedSearches(): SavedSearch[] {
  const raw = localStorage.getItem(SAVED_SEARCHES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SavedSearch[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSavedSearches(items: SavedSearch[]) {
  localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(items));
}

function csvEscape(v: string) {
  const needs = /[",\n\r]/.test(v);
  const escaped = v.replace(/"/g, '""');
  return needs ? `"${escaped}"` : escaped;
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function DealerSearchPage() {
  const api = useMemo(() => getContractsApi(), []);
  const marketplaceApi = useMemo(() => getMarketplaceApi(), []);
  const providersApi = useMemo(() => getProvidersApi(), []);

  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [providerId, setProviderId] = useState("");
  const [productType, setProductType] = useState<string>("");
  const [productId, setProductId] = useState("");

  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() => readSavedSearches());
  const [savedSearchId, setSavedSearchId] = useState("");

  useEffect(() => {
    writeSavedSearches(savedSearches);
  }, [savedSearches]);

  const contractsQuery = useQuery({
    queryKey: ["contracts"],
    queryFn: () => api.list(),
  });

  const productsQuery = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: () => marketplaceApi.listPublishedProducts(),
  });

  const contracts = (contractsQuery.data ?? []) as Contract[];
  const products = (productsQuery.data ?? []) as Product[];

  const q = query.trim().toLowerCase();
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);

  const providerFilter = providerId.trim();
  const productFilter = productId.trim();
  const productTypeFilter = productType.trim();

  const productById = new Map(products.map((p) => [p.id, p] as const));

  const providerOptions = Array.from(new Set(products.map((p) => p.providerId).filter(Boolean))).sort();
  const productTypeOptions = Array.from(new Set(products.map((p) => p.productType))).sort();

  const providersQuery = useQuery({
    queryKey: ["providers", providerOptions.join(",")],
    queryFn: () => providersApi.listByIds(providerOptions),
    enabled: providerOptions.length > 0,
  });

  const providerById = new Map(((providersQuery.data ?? []) as ProviderPublic[]).map((p) => [p.id, p] as const));

  const applySavedSearch = (s: SavedSearch) => {
    setQuery(s.query);
    setStartDate(s.startDate);
    setEndDate(s.endDate);
    setProviderId(s.providerId);
    setProductType(s.productType);
    setProductId(s.productId);
  };

  const filtered = contracts
    .filter((c) => {
      const dateValue = c.updatedAt ?? c.createdAt;
      return withinDateRange(dateValue, start, end);
    })
    .filter((c) => {
      if (!providerFilter && !productFilter && !productTypeFilter) return true;

      const selectedProduct = c.productId ? productById.get(c.productId) : undefined;
      const effectiveProvider = c.providerId ?? selectedProduct?.providerId;
      const effectiveType = selectedProduct?.productType;

      if (providerFilter && effectiveProvider !== providerFilter) return false;
      if (productFilter && c.productId !== productFilter) return false;
      if (productTypeFilter && effectiveType !== (productTypeFilter as ProductType)) return false;

      return true;
    })
    .filter((c) => {
      if (!q) return true;
      return (
        matchText(c.warrantyId, q) ||
        matchText(c.contractNumber, q) ||
        matchText(c.vin, q) ||
        matchText(c.customerName, q) ||
        matchText(c.customerEmail, q) ||
        matchText(c.customerPhone, q)
      );
    })
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));

  const exportCsv = () => {
    const rows = filtered.map((c) => {
      const selectedProduct = c.productId ? productById.get(c.productId) : undefined;
      const effectiveProvider = c.providerId ?? selectedProduct?.providerId;
      const providerName = effectiveProvider ? providerDisplayName(providerById.get(effectiveProvider), effectiveProvider) : "";
      const productName = selectedProduct?.name ?? "";

      return {
        warrantyId: c.warrantyId ?? "",
        contractNumber: c.contractNumber ?? "",
        status: c.status ?? "",
        customerName: c.customerName ?? "",
        customerEmail: c.customerEmail ?? "",
        customerPhone: c.customerPhone ?? "",
        vin: c.vin ?? "",
        provider: providerName,
        product: productName,
        updatedAt: c.updatedAt ?? c.createdAt ?? "",
      };
    });

    const header = [
      "warranty_id",
      "contract_number",
      "status",
      "customer_name",
      "customer_email",
      "customer_phone",
      "vin",
      "provider",
      "product",
      "updated_at",
    ];

    const lines = [
      header.join(","),
      ...rows.map((r) =>
        [
          csvEscape(r.warrantyId),
          csvEscape(r.contractNumber),
          csvEscape(r.status),
          csvEscape(r.customerName),
          csvEscape(r.customerEmail),
          csvEscape(r.customerPhone),
          csvEscape(r.vin),
          csvEscape(r.provider),
          csvEscape(r.product),
          csvEscape(r.updatedAt),
        ].join(","),
      ),
    ].join("\n");

    const filename = `${BRAND.slug}-search-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadTextFile(filename, lines, "text/csv;charset=utf-8");
  };

  const anyFilter = Boolean(q || startDate || endDate || providerFilter || productFilter || productTypeFilter);

  return (
    <PageShell
      badge="Dealer Portal"
      title="Search & Lookup"
      subtitle="Find any contract/customer record instantly by Warranty ID, VIN, or customer details."
      actions={
        <Button variant="outline" asChild>
          <Link to="/dealer-dashboard">Back to dashboard</Link>
        </Button>
      }
    >
      <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b">
            <div className="font-semibold">Search</div>
            <div className="text-sm text-muted-foreground mt-1">Use text search + optional date range.</div>
          </div>

          <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-6">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Warranty ID, Contract #, VIN, customer name, phone, email"
              />
            </div>

            <div className="lg:col-span-3">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="Start date" />
            </div>

            <div className="lg:col-span-3">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="End date" />
            </div>

            <div className="lg:col-span-4">
              <select
                value={providerId}
                onChange={(e) => {
                  setProviderId(e.target.value);
                  setProductId("");
                }}
                className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="">All providers</option>
                {providerOptions.map((pid) => (
                  <option key={pid} value={pid}>
                    {providerDisplayName(providerById.get(pid), pid)}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-4">
              <select
                value={productType}
                onChange={(e) => {
                  setProductType(e.target.value);
                  setProductId("");
                }}
                className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="">All product types</option>
                {productTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    {productTypeLabel(t)}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-4">
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="">All products</option>
                {products
                  .filter((p) => (!providerFilter ? true : p.providerId === providerFilter))
                  .filter((p) => (!productTypeFilter ? true : p.productType === (productTypeFilter as ProductType)))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="lg:col-span-12 flex gap-2 flex-wrap">
              <select
                value={savedSearchId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSavedSearchId(id);
                  const s = savedSearches.find((x) => x.id === id);
                  if (s) applySavedSearch(s);
                }}
                className="h-10 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="">Saved searches</option>
                {savedSearches.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <Button
                variant="outline"
                onClick={() => {
                  const name = window.prompt("Name this saved search:");
                  if (!name) return;
                  const trimmed = name.trim();
                  if (!trimmed) return;
                  const item: SavedSearch = {
                    id: crypto.randomUUID(),
                    name: trimmed,
                    query,
                    startDate,
                    endDate,
                    providerId,
                    productType,
                    productId,
                  };
                  setSavedSearches((prev) => [item, ...prev]);
                  setSavedSearchId(item.id);
                }}
              >
                Save search
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  void (async () => {
                    if (!savedSearchId) return;
                    const s = savedSearches.find((x) => x.id === savedSearchId);
                    if (!s) return;
                    if (!(await confirmProceed(`Delete saved search "${s.name}"?`))) return;
                    setSavedSearches((prev) => prev.filter((x) => x.id !== savedSearchId));
                    setSavedSearchId("");
                  })();
                }}
                disabled={!savedSearchId}
              >
                Delete saved
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setStartDate("");
                  setEndDate("");
                  setProviderId("");
                  setProductType("");
                  setProductId("");
                  setSavedSearchId("");
                }}
                disabled={!anyFilter}
              >
                Clear filters
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  void (async () => {
                    if (filtered.length === 0) {
                      return alertMissing("No results to export.");
                    }
                    if (!(await confirmProceed(`Export ${filtered.length} results to CSV?`))) return;
                    exportCsv();
                  })();
                }}
              >
                Export CSV
              </Button>
            </div>
          </div>

          <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 border-b text-xs text-muted-foreground">
            <div className="col-span-2">Warranty ID</div>
            <div className="col-span-2">Contract #</div>
            <div className="col-span-2">Customer</div>
            <div className="col-span-2">Product</div>
            <div className="col-span-2">Provider</div>
            <div className="col-span-1">Updated</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>

          <div className="divide-y">
            {filtered.map((c) => {
              const selectedProduct = c.productId ? productById.get(c.productId) : undefined;
              const effectiveProvider = c.providerId ?? selectedProduct?.providerId;
              const providerName = effectiveProvider ? providerDisplayName(providerById.get(effectiveProvider), effectiveProvider) : "—";
              const productName = selectedProduct?.name ?? "—";

              return (
                <div key={c.id} className="px-6 py-4 hover:bg-muted/40">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                    <div className="md:col-span-2">
                      <div className="text-sm font-medium text-foreground">{c.warrantyId}</div>
                      <div className="text-xs text-muted-foreground mt-1">{c.status}</div>
                    </div>

                    <div className="md:col-span-2 text-sm text-foreground">{c.contractNumber}</div>

                    <div className="md:col-span-2">
                      <div className="text-sm text-foreground">{c.customerName}</div>
                      <div className="text-xs text-muted-foreground mt-1 truncate">{c.customerEmail ?? c.customerPhone ?? c.vin ?? ""}</div>
                    </div>

                    <div className="md:col-span-2 text-sm text-muted-foreground truncate">{productName}</div>

                    <div className="md:col-span-2 text-sm text-muted-foreground truncate">{providerName}</div>

                    <div className="md:col-span-1 text-xs text-muted-foreground">{toIsoDateInput(c.updatedAt ?? c.createdAt) || "—"}</div>

                    <div className="md:col-span-1 flex md:justify-end gap-2 flex-wrap">
                      <Button size="sm" variant="outline" asChild>
                        <Link to={`/dealer-contracts/${c.id}`}>Open</Link>
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link to={`/dealer-contracts/${c.id}/print/dealer`}>Dealer</Link>
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link to={`/dealer-contracts/${c.id}/print/provider`}>Provider</Link>
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link to={`/dealer-contracts/${c.id}/print/customer`}>Customer</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {contractsQuery.isLoading ? <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div> : null}
            {contractsQuery.isError ? <div className="px-6 py-6 text-sm text-destructive">Failed to load contracts.</div> : null}
            {!contractsQuery.isLoading && !contractsQuery.isError && filtered.length === 0 ? (
              <div className="px-6 py-10 text-sm text-muted-foreground">No matches found.</div>
            ) : null}
          </div>
        </div>
    </PageShell>
  );
}
