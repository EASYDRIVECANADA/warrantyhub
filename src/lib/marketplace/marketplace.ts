import { getAppMode } from "../runtime";

import type { MarketplaceApi } from "./api";
import { localMarketplaceApi } from "./localMarketplace";
import { supabaseMarketplaceApi } from "./supabaseMarketplace";

export function getMarketplaceApi(): MarketplaceApi {
  return getAppMode() === "supabase" ? supabaseMarketplaceApi : localMarketplaceApi;
}
