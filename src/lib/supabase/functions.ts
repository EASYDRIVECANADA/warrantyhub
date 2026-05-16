import { getSupabaseClient } from "./client";

async function readFunctionErrorMessage(error: unknown): Promise<string | null> {
  const anyErr = error as any;
  const ctxBody = anyErr?.context?.body;
  if (typeof ctxBody?.error === "string") return ctxBody.error;
  if (typeof ctxBody === "string" && ctxBody.trim()) return ctxBody;

  const context = anyErr?.context;
  if (context && typeof context === "object" && typeof context.clone === "function") {
    const response = context as Response;
    try {
      const json = await response.clone().json();
      if (typeof json?.error === "string") return json.error;
      if (typeof json?.message === "string") return json.message;
    } catch {
    }

    try {
      const text = await response.clone().text();
      return text.trim() || null;
    } catch {
    }
  }

  return null;
}

export async function invokeEdgeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const res = await supabase.functions.invoke(name, {
    body,
  });
  if (res.error) {
    const bodyError = await readFunctionErrorMessage(res.error);
    throw new Error(bodyError || res.error.message);
  }
  return res.data as T;
}
