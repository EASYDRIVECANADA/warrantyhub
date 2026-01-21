import type { AuthApi } from "./api";
import type { Role } from "./types";

import { getSupabaseClient } from "../supabase/client";

async function ensureProfileAndGetRole(userId: string, email: string): Promise<Role> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  try {
    const { data, error } = await supabase.from("profiles").select("role, is_active").eq("id", userId).single();

    if (error) throw error;

    const active = (data as any).is_active !== false;
    if (!active) return "UNASSIGNED";
    return ((data as any).role ?? "UNASSIGNED") as Role;
  } catch {
    const upsertRes = await supabase
      .from("profiles")
      .upsert({ id: userId, role: "UNASSIGNED", email, is_active: false }, { onConflict: "id" });

    if (upsertRes.error) throw upsertRes.error;
    return "UNASSIGNED";
  }
}

export const supabaseAuthApi: AuthApi = {
  async getCurrentUser() {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const user = data.session?.user;
    if (!user?.email) return null;

    const role = await ensureProfileAndGetRole(user.id, user.email);
    return { id: user.id, email: user.email, role };
  },

  async signInWithGoogle() {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) throw error;
  },

  async signInWithPassword(email, password) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const user = data.user;
    if (!user?.email) throw new Error("No user returned");

    const role = await ensureProfileAndGetRole(user.id, user.email);
    return { id: user.id, email: user.email, role };
  },

  async signUpWithPassword(email, password) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;

    const user = data.user;
    if (!user?.email) throw new Error("No user returned");

    const upsertRes = await supabase
      .from("profiles")
      .upsert({ id: user.id, role: "UNASSIGNED", email: user.email, is_active: false }, { onConflict: "id" });

    if (upsertRes.error) throw upsertRes.error;

    return { id: user.id, email: user.email, role: "UNASSIGNED" };
  },

  async signOut() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  onAuthStateChange(cb) {
    const supabase = getSupabaseClient();
    if (!supabase) return () => undefined;

    const { data } = supabase.auth.onAuthStateChange(() => {
      cb();
    });

    return () => data.subscription.unsubscribe();
  },
};
