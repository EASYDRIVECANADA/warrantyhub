import { getAppMode } from "../runtime";

import type { ContractsV2Api } from "./apiV2";
import { supabaseContractsV2Api } from "./supabaseContractsV2";

export function getContractsV2Api(): ContractsV2Api {
  if (getAppMode() !== "supabase") {
    throw new Error("Contracts V2 API requires Supabase mode");
  }
  return supabaseContractsV2Api;
}
