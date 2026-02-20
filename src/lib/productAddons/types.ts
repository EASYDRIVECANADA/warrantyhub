export type AddonPricingType = "FIXED" | "PER_TERM" | "PER_CLAIM";

export type ProductAddon = {
  id: string;
  providerId: string;
  productId: string;
  name: string;
  description?: string;
  pricingType?: AddonPricingType;
  appliesToAllPricingRows?: boolean;
  applicablePricingRowIds?: string[];
  basePriceCents: number;
  minPriceCents?: number;
  maxPriceCents?: number;
  dealerCostCents?: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateProductAddonInput = {
  productId: string;
  name: string;
  description?: string;
  pricingType?: AddonPricingType;
  appliesToAllPricingRows?: boolean;
  applicablePricingRowIds?: string[];
  basePriceCents: number;
  minPriceCents?: number;
  maxPriceCents?: number;
  dealerCostCents?: number;
  active?: boolean;
};
