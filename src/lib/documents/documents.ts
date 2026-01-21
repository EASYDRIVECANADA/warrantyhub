import { getAppMode } from "../runtime";

import type { DocumentsApi } from "./api";
import { localDocumentsApi } from "./localDocuments";
import { supabaseDocumentsApi } from "./supabaseDocuments";

export function getDocumentsApi(): DocumentsApi {
  return getAppMode() === "supabase" ? supabaseDocumentsApi : localDocumentsApi;
}
