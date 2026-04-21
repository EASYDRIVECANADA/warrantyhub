import type { DealershipProductPricing, UpsertDealershipPricingInput } from "./types";

export type DealershipPricingApi = {
  listByDealership(dealershipId: string): Promise<DealershipProductPricing[]>;
  getForProduct(dealershipId: string, productId: string): Promise<DealershipProductPricing | null>;
  upsert(input: UpsertDealershipPricingInput): Promise<DealershipProductPricing>;
  remove(id: string): Promise<void>;
};
