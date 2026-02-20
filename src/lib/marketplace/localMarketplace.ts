import type { MarketplaceApi, MarketplaceProduct } from "./api";
import type { Product, ProductType } from "../products/types";

import type { ProductPricing } from "../productPricing/types";

const PRODUCTS_KEY = "warrantyhub.local.products";
const PRICING_KEY = "warrantyhub.local.product_pricing";

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

function readPricing(): ProductPricing[] {
  const raw = localStorage.getItem(PRICING_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<ProductPricing>[];
    return parsed
      .map((r): ProductPricing => {
        const createdAt = r.createdAt ?? new Date().toISOString();
        const id = r.id ?? crypto.randomUUID();
        const providerId = r.providerId ?? "";
        const productId = r.productId ?? "";

        return {
          id,
          providerId,
          productId,
          termMonths: typeof r.termMonths === "number" ? r.termMonths : null,
          termKm: typeof r.termKm === "number" ? r.termKm : null,
          isDefault: (r as any).isDefault === true,
          vehicleMileageMinKm: typeof r.vehicleMileageMinKm === "number" ? r.vehicleMileageMinKm : undefined,
          vehicleMileageMaxKm:
            typeof r.vehicleMileageMaxKm === "number" ? r.vehicleMileageMaxKm : r.vehicleMileageMaxKm === null ? null : undefined,
          vehicleClass: typeof r.vehicleClass === "string" ? r.vehicleClass : undefined,
          claimLimitCents: typeof (r as any).claimLimitCents === "number" ? (r as any).claimLimitCents : undefined,
          deductibleCents: typeof r.deductibleCents === "number" ? r.deductibleCents : 0,
          basePriceCents: typeof r.basePriceCents === "number" ? r.basePriceCents : 0,
          dealerCostCents: typeof r.dealerCostCents === "number" ? r.dealerCostCents : undefined,
          createdAt,
        };
      })
      .filter((r) => r.productId.trim() && r.basePriceCents > 0);
  } catch {
    return [];
  }
}

export const localMarketplaceApi: MarketplaceApi = {
  async listPublishedProducts() {
    const products = readProducts().filter((p) => p.published);
    const pricing = readPricing();
    const pricingByProductId = new Map<string, ProductPricing[]>();
    for (const r of pricing) {
      const list = pricingByProductId.get(r.productId) ?? [];
      list.push(r);
      pricingByProductId.set(r.productId, list);
    }

    const withSummary: MarketplaceProduct[] = products.map((p) => {
      const rows = (pricingByProductId.get(p.id) ?? []).slice().sort((a, b) => {
        const ad = a.isDefault ? 1 : 0;
        const bd = b.isDefault ? 1 : 0;
        const diff = bd - ad;
        if (diff) return diff;
        return b.createdAt.localeCompare(a.createdAt);
      });

      const d = rows[0];
      if (!d) return p as MarketplaceProduct;

      return {
        ...p,
        termMonths: d.termMonths === null ? undefined : d.termMonths,
        termKm: d.termKm === null ? undefined : d.termKm,
        deductibleCents: d.deductibleCents,
        basePriceCents: d.basePriceCents,
        dealerCostCents: typeof d.dealerCostCents === "number" ? d.dealerCostCents : p.dealerCostCents,
        pricingDefault: {
          productPricingId: d.id,
          termMonths: d.termMonths,
          termKm: d.termKm,
          vehicleMileageMinKm: typeof d.vehicleMileageMinKm === "number" ? d.vehicleMileageMinKm : undefined,
          vehicleMileageMaxKm:
            d.vehicleMileageMaxKm === undefined
              ? undefined
              : d.vehicleMileageMaxKm === null
                ? null
                : typeof d.vehicleMileageMaxKm === "number"
                  ? d.vehicleMileageMaxKm
                  : undefined,
          vehicleClass: typeof d.vehicleClass === "string" ? d.vehicleClass : undefined,
          claimLimitCents: typeof (d as any).claimLimitCents === "number" ? (d as any).claimLimitCents : undefined,
          deductibleCents: d.deductibleCents,
          basePriceCents: d.basePriceCents,
          dealerCostCents: d.dealerCostCents,
        },
      };
    });

    return withSummary.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};
