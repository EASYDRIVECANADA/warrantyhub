export type ProductPricing = {
  id: string;
  providerId: string;
  productId: string;
  termMonths: number | null;
  termKm: number | null;
  isDefault: boolean;
  vehicleMileageMinKm?: number;
  vehicleMileageMaxKm?: number | null;
  vehicleClass?: string;
  claimLimitCents?: number;
  claimLimitType?: ClaimLimitType;
  claimLimitAmountCents?: number;
  deductibleCents: number;
  basePriceCents: number;
  dealerCostCents?: number;
  createdAt: string;
};

export type ClaimLimitType = "PER_CLAIM" | "TOTAL_COVERAGE" | "FMV" | "MAX_RETAIL";

export type CreateProductPricingInput = {
  productId: string;
  termMonths: number | null;
  termKm: number | null;
  isDefault?: boolean;
  vehicleMileageMinKm?: number;
  vehicleMileageMaxKm?: number | null;
  vehicleClass?: string;
  claimLimitCents?: number;
  claimLimitType?: ClaimLimitType;
  claimLimitAmountCents?: number;
  deductibleCents: number;
  basePriceCents: number;
  dealerCostCents?: number;
};
