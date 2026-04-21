import { getAppMode } from "../runtime";

import type { DealershipsApi } from "./api";
import { supabaseDealershipsApi } from "./supabaseDealerships";

export function getDealershipsApi(): DealershipsApi {
  if (getAppMode() !== "supabase") {
    throw new Error("Dealerships API requires Supabase mode");
  }
  return supabaseDealershipsApi;
}
