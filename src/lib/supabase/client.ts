import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { hasSupabaseEnv } from "../runtime";

let supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!hasSupabaseEnv()) return null;
  if (supabase) return supabase;

  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  supabase = createClient(url, anonKey, {
    auth: {
      detectSessionInUrl: true,
    },
  });

  return supabase;
}
