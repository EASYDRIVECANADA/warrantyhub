export type DealershipProductPricing = {
  id: string;
  dealershipId: string;
  productId: string;
  dealerCost: Record<string, unknown>;
  retailPrice: Record<string, unknown>;
  confidentialityEnabled: boolean;
  sellingEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UpsertDealershipPricingInput = {
  dealershipId: string;
  productId: string;
  retailPrice: Record<string, unknown>;
  confidentialityEnabled?: boolean;
  sellingEnabled?: boolean;
};
