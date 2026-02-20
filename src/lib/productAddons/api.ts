import type { CreateProductAddonInput, ProductAddon } from "./types";

export type ListProductAddonsOptions = {
  productId: string;
};

export type ProductAddonsApi = {
  list(options: ListProductAddonsOptions): Promise<ProductAddon[]>;
  create(input: CreateProductAddonInput): Promise<ProductAddon>;
  update(
    id: string,
    patch: Partial<
      Pick<
        ProductAddon,
        | "name"
        | "description"
        | "pricingType"
        | "appliesToAllPricingRows"
        | "applicablePricingRowIds"
        | "basePriceCents"
        | "minPriceCents"
        | "maxPriceCents"
        | "dealerCostCents"
        | "active"
      >
    >,
  ): Promise<ProductAddon>;
  remove(id: string): Promise<void>;
};
