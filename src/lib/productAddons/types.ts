export type ProductAddon = {
  id: string;
  providerId: string;
  productId: string;
  name: string;
  description?: string;
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
  basePriceCents: number;
  minPriceCents?: number;
  maxPriceCents?: number;
  dealerCostCents?: number;
  active?: boolean;
};
