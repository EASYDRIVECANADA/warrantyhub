import { getAppMode } from "../runtime";

import type { ProvidersV2Api } from "./apiV2";
import { supabaseProvidersV2Api } from "./supabaseProvidersV2";

export function getProvidersV2Api(): ProvidersV2Api {
  if (getAppMode() !== "supabase") {
    throw new Error("Providers V2 API requires Supabase mode");
  }
  return supabaseProvidersV2Api;
}
