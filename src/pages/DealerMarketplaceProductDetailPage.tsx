import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { PageShell } from "../components/PageShell";
import { getDocumentsApi } from "../lib/documents/documents";
import type { ProductDocument } from "../lib/documents/types";
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

function allowListLabel(items?: string[]) {
  const list = (items ?? []).map((x) => x.trim()).filter(Boolean);
  if (list.length === 0) return "All";
  return list.slice(0, 6).join(", ") + (list.length > 6 ? "…" : "");
}

export function DealerMarketplaceProductDetailPage() {
  const { id } = useParams();
  const productId = id ?? "";

  const marketplaceApi = useMemo(() => getMarketplaceApi(), []);
  const providersApi = useMemo(() => getProvidersApi(), []);
  const documentsApi = useMemo(() => getDocumentsApi(), []);

  const productsQuery = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: () => marketplaceApi.listPublishedProducts(),
  });

  const product = ((productsQuery.data ?? []) as Product[]).find((p) => p.id === productId);

  const providersQuery = useQuery({
    queryKey: ["providers", product?.providerId ?? ""],
    enabled: Boolean(product?.providerId),
    queryFn: async () => {
      if (!product?.providerId) return [];
      return providersApi.listByIds([product.providerId]);
    },
  });

  const provider = ((providersQuery.data ?? []) as ProviderPublic[])[0];

  const docsQuery = useQuery({
    queryKey: ["dealer-product-documents", productId],
    enabled: Boolean(productId),
    queryFn: () => documentsApi.list({ productId }),
  });

  const docs = (docsQuery.data ?? []) as ProductDocument[];

  return (
    <PageShell
      badge="Dealer Portal"
      title={product ? product.name : "Product"}
      subtitle={product ? `${providerDisplayName(provider, product.providerId)} • ${productTypeLabel(product.productType)}` : ""}
      actions={
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <Link to="/dealer-marketplace">Back to marketplace</Link>
          </Button>
          <Button asChild>
            <Link to={`/dealer-contracts?productId=${encodeURIComponent(productId)}`}>Select product</Link>
          </Button>
        </div>
      }
    >
      {!productsQuery.isLoading && !product ? <div className="text-sm text-muted-foreground">Product not found.</div> : null}

      {product ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-6">
            <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b">
                <div className="font-semibold">Overview</div>
                <div className="text-sm text-muted-foreground mt-1">Published product • dealer-facing view.</div>
              </div>
              <div className="px-6 py-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-muted-foreground">Provider</div>
                  <div className="font-medium mt-1">{providerDisplayName(provider, product.providerId)}</div>
                  <div className="text-xs text-muted-foreground mt-3">Type</div>
                  <div className="font-medium mt-1">{productTypeLabel(product.productType)}</div>
                </div>

                <div className="rounded-xl border p-4">
                  <div className="text-xs text-muted-foreground">Retail price</div>
                  <div className="font-semibold mt-1">{money(product.basePriceCents)}</div>
                  <div className="text-xs text-muted-foreground mt-3">Deductible</div>
                  <div className="font-medium mt-1">{money(product.deductibleCents)}</div>
                </div>

                <div className="rounded-xl border p-4">
                  <div className="text-xs text-muted-foreground">Term</div>
                  <div className="font-medium mt-1">
                    {typeof product.termMonths === "number" ? `${product.termMonths} months` : "—"} / {typeof product.termKm === "number" ? `${product.termKm} km` : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-3">Published</div>
                  <div className="font-medium mt-1">Yes</div>
                </div>

                <div className="rounded-xl border p-4">
                  <div className="text-xs text-muted-foreground">Eligibility caps</div>
                  <div className="font-medium mt-1">
                    Max age: {typeof product.eligibilityMaxVehicleAgeYears === "number" ? `${product.eligibilityMaxVehicleAgeYears} years` : "—"}
                    <br />
                    Max mileage: {typeof product.eligibilityMaxMileageKm === "number" ? `${product.eligibilityMaxMileageKm.toLocaleString()} km` : "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b">
                <div className="font-semibold">Coverage</div>
                <div className="text-sm text-muted-foreground mt-1">Use this for customer conversations.</div>
              </div>
              <div className="px-6 py-6 text-sm whitespace-pre-wrap text-muted-foreground">
                {(product.coverageDetails ?? "").trim() || "—"}
              </div>
            </div>

            <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b">
                <div className="font-semibold">Exclusions</div>
                <div className="text-sm text-muted-foreground mt-1">Summarized provider exclusions (dealer-facing).</div>
              </div>
              <div className="px-6 py-6 text-sm whitespace-pre-wrap text-muted-foreground">
                {(product.exclusions ?? "").trim() || "—"}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b">
                <div className="font-semibold">Eligibility</div>
                <div className="text-sm text-muted-foreground mt-1">High-level allowlists.</div>
              </div>
              <div className="px-6 py-6 text-sm text-muted-foreground space-y-3">
                <div>
                  <div className="text-xs text-muted-foreground">Make</div>
                  <div className="font-medium text-foreground">{allowListLabel(product.eligibilityMakeAllowlist)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Model</div>
                  <div className="font-medium text-foreground">{allowListLabel(product.eligibilityModelAllowlist)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Trim</div>
                  <div className="font-medium text-foreground">{allowListLabel(product.eligibilityTrimAllowlist)}</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b">
                <div className="font-semibold">Documents (PDF)</div>
                <div className="text-sm text-muted-foreground mt-1">Provider-linked brochures and disclosures.</div>
              </div>

              <div className="divide-y">
                {docs.map((d) => (
                  <div key={d.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-foreground">{d.title}</div>
                        <div className="text-xs text-muted-foreground mt-1">{d.fileName}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void (async () => {
                            const url = await documentsApi.getDownloadUrl(d);
                            window.open(url, "_blank", "noopener,noreferrer");
                          })();
                        }}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                ))}

                {docsQuery.isLoading ? <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div> : null}
                {docsQuery.isError ? <div className="px-6 py-6 text-sm text-destructive">Failed to load documents.</div> : null}
                {!docsQuery.isLoading && !docsQuery.isError && docs.length === 0 ? (
                  <div className="px-6 py-10 text-sm text-muted-foreground">No documents linked to this product.</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
