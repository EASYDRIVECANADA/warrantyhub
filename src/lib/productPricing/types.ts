export type ProductPricing = {
  id: string;
  providerId: string;
  productId: string;
  termMonths: number;
  termKm: number;
  deductibleCents: number;
  basePriceCents: number;
  dealerCostCents?: number;
  createdAt: string;
};

export type CreateProductPricingInput = {
  productId: string;
  termMonths: number;
  termKm: number;
  deductibleCents: number;
  basePriceCents: number;
  dealerCostCents?: number;
};
