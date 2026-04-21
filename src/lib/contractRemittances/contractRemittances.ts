import { getAppMode } from "../runtime";

import type { ContractRemittancesApi } from "./api";
import { supabaseContractRemittancesApi } from "./supabaseContractRemittances";

export function getContractRemittancesApi(): ContractRemittancesApi {
  if (getAppMode() !== "supabase") {
    throw new Error("Contract Remittances API requires Supabase mode");
  }
  return supabaseContractRemittancesApi;
}
