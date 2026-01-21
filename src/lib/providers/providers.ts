import { getAppMode } from "../runtime";

import type { ProvidersApi } from "./api";
import { localProvidersApi } from "./localProviders";
import { supabaseProvidersApi } from "./supabaseProviders";

export function getProvidersApi(): ProvidersApi {
  return getAppMode() === "supabase" ? supabaseProvidersApi : localProvidersApi;
}
