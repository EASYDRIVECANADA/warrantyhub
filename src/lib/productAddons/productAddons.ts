import { getAppMode } from "../runtime";

import type { ProductAddonsApi } from "./api";
import { localProductAddonsApi } from "./localProductAddons";
import { supabaseProductAddonsApi } from "./supabaseProductAddons";

export function getProductAddonsApi(): ProductAddonsApi {
  return getAppMode() === "supabase" ? supabaseProductAddonsApi : localProductAddonsApi;
}
