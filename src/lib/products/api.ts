import type { CreateProductInput, Product } from "./types";

export type ProductsApi = {
  list(): Promise<Product[]>;
  get(id: string): Promise<Product | null>;
  create(input: CreateProductInput): Promise<Product>;
  update(id: string, patch: Partial<Omit<Product, "id" | "providerId" | "createdAt" | "updatedAt">>): Promise<Product>;
  remove(id: string): Promise<void>;
};
