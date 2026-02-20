export function hasSupabaseEnv() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return Boolean(url && anonKey);
}

export type AppMode = "supabase" | "local";

export function getAppMode(): AppMode {
  const forced = (import.meta.env.VITE_APP_MODE as string | undefined)?.trim().toLowerCase();
  if (forced === "local") return "local";
  if (forced === "supabase") return hasSupabaseEnv() ? "supabase" : "local";
  return hasSupabaseEnv() ? "supabase" : "local";
}
