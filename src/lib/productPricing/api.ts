import type { CreateProductPricingInput, ProductPricing } from "./types";

export type ListProductPricingOptions = {
  productId: string;
};

export interface ProductPricingApi {
  list(options: ListProductPricingOptions): Promise<ProductPricing[]>;
  create(input: CreateProductPricingInput): Promise<ProductPricing>;
  remove(id: string): Promise<void>;
}

export type { CreateProductPricingInput, ProductPricing };
