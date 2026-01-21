import { getAppMode } from "../runtime";

import type { ProductPricingApi } from "./api";
import { localProductPricingApi } from "./localProductPricing";
import { supabaseProductPricingApi } from "./supabaseProductPricing";

export function getProductPricingApi(): ProductPricingApi {
  return getAppMode() === "supabase" ? supabaseProductPricingApi : localProductPricingApi;
}
