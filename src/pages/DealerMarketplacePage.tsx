import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { getMarketplaceApi } from "../lib/marketplace/marketplace";
import type { Product, ProductType } from "../lib/products/types";
import { getProvidersApi } from "../lib/providers/providers";
import type { ProviderPublic } from "../lib/providers/types";

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

export function DealerMarketplacePage() {
  const marketplaceApi = useMemo(() => getMarketplaceApi(), []);
  const providersApi = useMemo(() => getProvidersApi(), []);

  const [search, setSearch] = useState("");
  const [providerId, setProviderId] = useState("");
  const [productType, setProductType] = useState<string>("");

  const productsQuery = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: () => marketplaceApi.listPublishedProducts(),
  });

  const products = (productsQuery.data ?? []) as Product[];

  const providerOptions = Array.from(new Set(products.map((p) => p.providerId).filter(Boolean))).sort();
  const productTypeOptions = Array.from(new Set(products.map((p) => p.productType))).sort();

  const providersQuery = useQuery({
    queryKey: ["providers", providerOptions.join(",")],
    queryFn: () => providersApi.listByIds(providerOptions),
    enabled: providerOptions.length > 0,
  });

  const providerById = new Map(((providersQuery.data ?? []) as ProviderPublic[]).map((p) => [p.id, p] as const));

  const q = norm(search);
  const filtered = products
    .filter((p) => (!providerId.trim() ? true : p.providerId === providerId.trim()))
    .filter((p) => (!productType.trim() ? true : p.productType === (productType.trim() as ProductType)))
    .filter((p) => {
      if (!q) return true;
      const hay = norm(`${p.name} ${p.coverageDetails ?? ""} ${p.exclusions ?? ""}`);
      return hay.includes(q);
    });

  return (
    <PageShell
      badge="Dealer Portal"
      title="Marketplace"
      subtitle="Browse published provider products. Dealers sell products through contracts."
      actions={
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <Link to="/dealer-dashboard">Back to dashboard</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/dealer-marketplace/compare">Compare plans</Link>
          </Button>
          <Button asChild>
            <Link to="/dealer-contracts">Start a contract</Link>
          </Button>
        </div>
      }
    >
      <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b">
          <div className="font-semibold">Find Products</div>
          <div className="text-sm text-muted-foreground mt-1">Filter by provider and product type. No product creation tools exist in Dealer Portal.</div>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-6">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" />
          </div>

          <div className="lg:col-span-3">
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
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

          <div className="lg:col-span-3">
            <select
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
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
        </div>
      </div>

      <div className="mt-10 rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold">Published Products</div>
            <div className="text-sm text-muted-foreground mt-1">View details, compare, then select a product to start a contract.</div>
          </div>
          <div className="text-sm text-muted-foreground">{filtered.length} shown</div>
        </div>

        <div className="divide-y">
          {filtered.map((p) => (
            <div key={p.id} className="px-6 py-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-medium text-foreground">
                    <Link to={`/dealer-marketplace/products/${p.id}`} className="hover:underline">
                      {p.name}
                    </Link>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {providerDisplayName(providerById.get(p.providerId), p.providerId)} • {productTypeLabel(p.productType)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    Term: {typeof p.termMonths === "number" ? `${p.termMonths} mo` : "—"} / {typeof p.termKm === "number" ? `${p.termKm} km` : "—"} • Deductible: {money(p.deductibleCents)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Eligibility caps: Age {typeof p.eligibilityMaxVehicleAgeYears === "number" ? `${p.eligibilityMaxVehicleAgeYears}y` : "—"} • Mileage {typeof p.eligibilityMaxMileageKm === "number" ? `${p.eligibilityMaxMileageKm.toLocaleString()} km` : "—"}
                  </div>
                </div>

                <div className="flex items-start gap-4 flex-wrap justify-end">
                  <div className="text-right">
                    <div className="text-sm font-semibold">{money(p.basePriceCents)}</div>
                    <div className="text-xs text-muted-foreground mt-1">Retail</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/dealer-marketplace/products/${p.id}`}>View</Link>
                    </Button>
                    <Button size="sm" asChild>
                      <Link to={`/dealer-contracts?productId=${encodeURIComponent(p.id)}`}>Select product</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {productsQuery.isLoading ? <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div> : null}
          {productsQuery.isError ? <div className="px-6 py-6 text-sm text-destructive">Failed to load products.</div> : null}
          {!productsQuery.isLoading && !productsQuery.isError && filtered.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">No published products yet.</div>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
