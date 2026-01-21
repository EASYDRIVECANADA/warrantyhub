import { getAppMode } from "../runtime";

import type { RemittancesApi } from "./api";
import { localRemittancesApi } from "./localRemittances";
import { supabaseRemittancesApi } from "./supabaseRemittances";

export function getRemittancesApi(): RemittancesApi {
  return getAppMode() === "supabase" ? supabaseRemittancesApi : localRemittancesApi;
}
