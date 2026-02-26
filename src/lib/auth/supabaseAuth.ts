import type { AuthApi } from "./api";
import type { Role } from "./types";

import { getSupabaseClient } from "../supabase/client";

const AUTH_NOTICE_KEY = "warrantyhub.local.auth_notice";

function writeAuthNotice(message: string) {
  const m = message.trim();
  if (!m) return;
  localStorage.setItem(AUTH_NOTICE_KEY, m);
}

type ProfileAuthState = {
  effectiveRole: Role;
  rawRole: unknown;
  isActive: boolean;
};

type DealerMembershipInfo = {
  dealerId?: string;
  dealerName?: string;
};

async function getActiveDealerMembershipInfo(userId: string): Promise<DealerMembershipInfo> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const { data: membership, error: membershipError } = await supabase
    .from("dealer_members")
    .select("dealer_id, role, status, created_at")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membershipError) throw new Error(membershipError.message);
  const dealerId = ((membership as any)?.dealer_id ?? "").toString().trim();
  if (!dealerId) return {};

  const { data: dealerRow, error: dealerError } = await supabase.from("dealers").select("name").eq("id", dealerId).maybeSingle();
  if (dealerError) throw new Error(dealerError.message);
  const dealerName = ((dealerRow as any)?.name ?? "").toString().trim() || undefined;

  return { dealerId, dealerName };
}

async function getProfileAuthState(userId: string, email: string): Promise<ProfileAuthState> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (data) {
    const rawRole = (data as any).role ?? "UNASSIGNED";
    const isActive = (data as any).is_active !== false;
    const normalized = rawRole === "DEALER" ? "DEALER_ADMIN" : rawRole;
    const effectiveRole = (isActive ? (normalized ?? "UNASSIGNED") : "UNASSIGNED") as Role;
    return { effectiveRole, rawRole, isActive };
  }

  const insertRes = await supabase.from("profiles").insert({ id: userId, role: "UNASSIGNED", email, is_active: false });
  if (insertRes.error && (insertRes.error as any).code !== "23505") throw new Error(insertRes.error.message);
  return { effectiveRole: "UNASSIGNED", rawRole: "UNASSIGNED", isActive: false };
}

export const supabaseAuthApi: AuthApi = {
  async getCurrentUser() {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const user = data.session?.user;
    if (!user?.email) return null;

    const state = await getProfileAuthState(user.id, user.email);

    if (!state.isActive && state.rawRole !== "UNASSIGNED") {
      writeAuthNotice("Account disabled");
      try {
        await supabase.auth.signOut();
      } catch {
      }
      return null;
    }

    if (state.isActive && state.effectiveRole === "UNASSIGNED" && state.rawRole !== "UNASSIGNED") {
      writeAuthNotice("Access revoked");
      try {
        await supabase.auth.signOut();
      } catch {
      }
      return null;
    }

    const base = { id: user.id, email: user.email, role: state.effectiveRole };
    if (state.effectiveRole !== "DEALER_ADMIN" && state.effectiveRole !== "DEALER_EMPLOYEE") return base;

    const membership = await getActiveDealerMembershipInfo(user.id);
    return {
      ...base,
      dealerId: membership.dealerId,
      companyName: membership.dealerName,
    };
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

    if (error) throw new Error(error.message);
  },

  async signInWithPassword(email, password) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);

    const user = data.user;
    if (!user?.email) throw new Error("No user returned");

    const state = await getProfileAuthState(user.id, user.email);
    if (!state.isActive && state.rawRole !== "UNASSIGNED") {
      writeAuthNotice("Account disabled");
      try {
        await supabase.auth.signOut();
      } catch {
      }
      throw new Error("Account disabled");
    }
    if (state.isActive && state.effectiveRole === "UNASSIGNED" && state.rawRole !== "UNASSIGNED") {
      writeAuthNotice("Access revoked");
      try {
        await supabase.auth.signOut();
      } catch {
      }
      throw new Error("Access revoked");
    }

    const base = { id: user.id, email: user.email, role: state.effectiveRole };
    if (state.effectiveRole !== "DEALER_ADMIN" && state.effectiveRole !== "DEALER_EMPLOYEE") return base;

    const membership = await getActiveDealerMembershipInfo(user.id);
    return {
      ...base,
      dealerId: membership.dealerId,
      companyName: membership.dealerName,
    };
  },

  async signUpWithPassword(email, password) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/sign-in`,
      },
    });
    if (error) {
      const msg = (error.message ?? "").toString();
      const normalized = msg.trim().toLowerCase();
      if (normalized.includes("already registered") || normalized.includes("already been registered")) {
        throw new Error("Email already exists. Please sign in or reset your password.");
      }
      throw new Error(msg || "Sign up failed");
    }

    const user = data.user;
    if (!user?.email) throw new Error("No user returned");

    if (!data.session) {
      const identities = Array.isArray((user as any).identities) ? ((user as any).identities as unknown[]) : null;
      if (identities && identities.length === 0) {
        throw new Error("Email already exists. Please sign in or reset your password.");
      }
      throw new Error("Account created. Please confirm your email, then sign in.");
    }

    const insertRes = await supabase
      .from("profiles")
      .insert({ id: user.id, role: "UNASSIGNED", email: user.email, is_active: false });

    if (insertRes.error && (insertRes.error as any).code !== "23505") {
      throw new Error(insertRes.error.message);
    }

    return { id: user.id, email: user.email, role: "UNASSIGNED" };
  },

  async requestPasswordReset(email, redirectTo) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const e = email.trim();
    if (!e) throw new Error("Email is required");

    const { error } = await supabase.auth.resetPasswordForEmail(e, { redirectTo });
    if (error) throw new Error(error.message);
  },

  async updatePassword(newPassword) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const p = newPassword.trim();
    if (!p) throw new Error("Password is required");

    const { error } = await supabase.auth.updateUser({ password: p });
    if (error) throw new Error(error.message);
  },

  async signOut() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
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
