import { getAppMode } from "../runtime";

import type { DealershipPricingApi } from "./api";
import { supabaseDealershipPricingApi } from "./supabaseDealershipPricing";

export function getDealershipPricingApi(): DealershipPricingApi {
  if (getAppMode() !== "supabase") {
    throw new Error("Dealership Pricing API requires Supabase mode");
  }
  return supabaseDealershipPricingApi;
}
