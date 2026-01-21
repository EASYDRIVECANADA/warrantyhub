import type { MarketplaceApi } from "./api";
import type { Product, ProductType } from "../products/types";

const PRODUCTS_KEY = "warrantyhub.local.products";

function readProducts(): Product[] {
  const raw = localStorage.getItem(PRODUCTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<Product>[];
    return parsed
      .map((p): Product => {
        const createdAt = p.createdAt ?? new Date().toISOString();
        const updatedAt = p.updatedAt ?? createdAt;
        const id = p.id ?? crypto.randomUUID();
        const providerId = p.providerId ?? "";
        return {
          id,
          providerId,
          name: p.name ?? "",
          productType: (p.productType ?? "OTHER") as ProductType,
          coverageDetails: p.coverageDetails,
          exclusions: p.exclusions,
          termMonths: typeof p.termMonths === "number" ? p.termMonths : undefined,
          termKm: typeof p.termKm === "number" ? p.termKm : undefined,
          deductibleCents: typeof p.deductibleCents === "number" ? p.deductibleCents : undefined,
          eligibilityMaxVehicleAgeYears:
            typeof p.eligibilityMaxVehicleAgeYears === "number" ? p.eligibilityMaxVehicleAgeYears : undefined,
          eligibilityMaxMileageKm:
            typeof p.eligibilityMaxMileageKm === "number" ? p.eligibilityMaxMileageKm : undefined,
          eligibilityMakeAllowlist: Array.isArray(p.eligibilityMakeAllowlist)
            ? (p.eligibilityMakeAllowlist.filter((x) => typeof x === "string") as string[])
            : undefined,
          eligibilityModelAllowlist: Array.isArray(p.eligibilityModelAllowlist)
            ? (p.eligibilityModelAllowlist.filter((x) => typeof x === "string") as string[])
            : undefined,
          eligibilityTrimAllowlist: Array.isArray(p.eligibilityTrimAllowlist)
            ? (p.eligibilityTrimAllowlist.filter((x) => typeof x === "string") as string[])
            : undefined,
          basePriceCents: typeof p.basePriceCents === "number" ? p.basePriceCents : undefined,
          dealerCostCents: typeof p.dealerCostCents === "number" ? p.dealerCostCents : undefined,
          published: Boolean(p.published),
          createdAt,
          updatedAt,
        };
      })
      .filter((p) => p.providerId.trim() && p.name.trim());
  } catch {
    return [];
  }
}

export const localMarketplaceApi: MarketplaceApi = {
  async listPublishedProducts() {
    return readProducts()
      .filter((p) => p.published)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};
