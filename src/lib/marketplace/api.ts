import type { Product } from "../products/types";

export type MarketplaceProduct = Product & {
  pricingDefault?: {
    productPricingId?: string;
    termMonths?: number | null;
    termKm?: number | null;
    vehicleMileageMinKm?: number;
    vehicleMileageMaxKm?: number | null;
    vehicleClass?: string;
    claimLimitCents?: number;
    deductibleCents?: number;
    basePriceCents?: number;
    dealerCostCents?: number;
  };
};

export interface MarketplaceApi {
  listPublishedProducts(): Promise<MarketplaceProduct[]>;
}
