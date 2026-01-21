import { getAppMode } from "../runtime";

import type { ProductsApi } from "./api";
import { localProductsApi } from "./localProducts";
import { supabaseProductsApi } from "./supabaseProducts";

export function getProductsApi(): ProductsApi {
  return getAppMode() === "supabase" ? supabaseProductsApi : localProductsApi;
}
