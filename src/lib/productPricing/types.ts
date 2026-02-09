export type ProductPricing = {
  id: string;
  providerId: string;
  productId: string;
  termMonths: number | null;
  termKm: number | null;
  vehicleMileageMinKm?: number;
  vehicleMileageMaxKm?: number | null;
  vehicleClass?: string;
  claimLimitCents?: number;
  deductibleCents: number;
  basePriceCents: number;
  dealerCostCents?: number;
  createdAt: string;
};

export type CreateProductPricingInput = {
  productId: string;
  termMonths: number | null;
  termKm: number | null;
  vehicleMileageMinKm?: number;
  vehicleMileageMaxKm?: number | null;
  vehicleClass?: string;
  claimLimitCents?: number;
  deductibleCents: number;
  basePriceCents: number;
  dealerCostCents?: number;
};
