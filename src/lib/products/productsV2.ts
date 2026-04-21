import { getAppMode } from "../runtime";

import type { ProductsV2Api } from "./apiV2";
import { supabaseProductsV2Api } from "./supabaseProductsV2";

export function getProductsV2Api(): ProductsV2Api {
  if (getAppMode() !== "supabase") {
    throw new Error("Products V2 API requires Supabase mode");
  }
  return supabaseProductsV2Api;
}
