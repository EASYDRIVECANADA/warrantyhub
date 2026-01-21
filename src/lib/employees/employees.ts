import { getAppMode } from "../runtime";

import type { EmployeesApi } from "./api";
import { localEmployeesApi } from "./localEmployees";
import { supabaseEmployeesApi } from "./supabaseEmployees";

export function getEmployeesApi(): EmployeesApi {
  return getAppMode() === "supabase" ? supabaseEmployeesApi : localEmployeesApi;
}
