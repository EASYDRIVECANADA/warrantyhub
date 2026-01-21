import { getAppMode } from "../runtime";

import type { ProviderTeamApi } from "./api";
import { localProviderTeamApi } from "./localTeam";
import { supabaseProviderTeamApi } from "./supabaseTeam";

export function getProviderTeamApi(): ProviderTeamApi {
  return getAppMode() === "supabase" ? supabaseProviderTeamApi : localProviderTeamApi;
}
