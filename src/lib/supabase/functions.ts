import { getSupabaseClient } from "./client";

export async function invokeEdgeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const res = await supabase.functions.invoke(name, {
    body,
  });
  if (res.error) {
    const anyErr = res.error as any;
    const ctxBody = anyErr?.context?.body;
    const bodyError = typeof ctxBody?.error === "string" ? ctxBody.error : null;
    throw new Error(bodyError || res.error.message);
  }
  return res.data as T;
}
