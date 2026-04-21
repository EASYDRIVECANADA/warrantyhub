import type { ProductV2, CreateProductV2Input, UpdateProductV2Input } from "./typesV2";

export type ProductsV2Api = {
  list(): Promise<ProductV2[]>;
  listByProvider(providerEntityId: string): Promise<ProductV2[]>;
  listActive(): Promise<ProductV2[]>;
  get(id: string): Promise<ProductV2 | null>;
  create(input: CreateProductV2Input): Promise<ProductV2>;
  update(id: string, patch: UpdateProductV2Input): Promise<ProductV2>;
  remove(id: string): Promise<void>;
};
