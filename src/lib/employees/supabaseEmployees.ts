import { getSupabaseClient } from "../supabase/client";

import type { EmployeesApi } from "./api";
import type { CreateEmployeeInput, Employee } from "./types";

type EmployeesRow = {
  id: string;
  name: string;
  email: string;
  created_at: string;
};

function toEmployee(r: EmployeesRow): Employee {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    createdAt: r.created_at,
  };
}

export const supabaseEmployeesApi: EmployeesApi = {
  async list() {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("employees")
      .select("id, name, email, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data as EmployeesRow[]).map(toEmployee);
  },

  async create(input: CreateEmployeeInput) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("employees")
      .insert({
        name: input.name,
        email: input.email,
      })
      .select("id, name, email, created_at")
      .single();

    if (error) throw error;
    return toEmployee(data as EmployeesRow);
  },

  async update(id: string, patch) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const updateRow: Record<string, unknown> = {};
    if (typeof patch.name === "string") updateRow.name = patch.name;
    if (typeof patch.email === "string") updateRow.email = patch.email;

    const { data, error } = await supabase
      .from("employees")
      .update(updateRow)
      .eq("id", id)
      .select("id, name, email, created_at")
      .single();

    if (error) throw error;
    return toEmployee(data as EmployeesRow);
  },

  async remove(id: string) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) throw error;
  },
};
