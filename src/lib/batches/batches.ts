import { getAppMode } from "../runtime";

import type { BatchesApi } from "./api";
import { localBatchesApi } from "./localBatches";
import { supabaseBatchesApi } from "./supabaseBatches";

export function getBatchesApi(): BatchesApi {
  return getAppMode() === "supabase" ? supabaseBatchesApi : localBatchesApi;
}
