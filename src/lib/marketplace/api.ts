import type { Product } from "../products/types";

export interface MarketplaceApi {
  listPublishedProducts(): Promise<Product[]>;
}
