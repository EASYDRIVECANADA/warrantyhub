import { getAppMode } from "../runtime";

import type { ContractsApi } from "./api";
import { localContractsApi } from "./localContracts";
import { supabaseContractsApi } from "./supabaseContracts";

export function getContractsApi(): ContractsApi {
  return getAppMode() === "supabase" ? supabaseContractsApi : localContractsApi;
}
