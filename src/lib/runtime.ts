export function hasSupabaseEnv() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return Boolean(url && anonKey);
}

export type AppMode = "supabase" | "local";

export function getAppMode(): AppMode {
  return hasSupabaseEnv() ? "supabase" : "local";
}
