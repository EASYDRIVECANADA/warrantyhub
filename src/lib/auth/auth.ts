import { getAppMode } from "../runtime";

import type { AuthApi } from "./api";
import { localAuthApi } from "./localAuth";
import { supabaseAuthApi } from "./supabaseAuth";

export function getAuthApi(): AuthApi {
  return getAppMode() === "supabase" ? supabaseAuthApi : localAuthApi;
}
