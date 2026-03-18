import { getSupabaseClient } from "./client";

export async function invokeEdgeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const sessionRes = await supabase.auth.getSession();
  if (sessionRes.data.session?.refresh_token) {
    await supabase.auth.refreshSession();
  }
  const refreshed = await supabase.auth.getSession();
  const accessToken = refreshed.data.session?.access_token ?? "";

  const res = await supabase.functions.invoke(name, {
    body,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
