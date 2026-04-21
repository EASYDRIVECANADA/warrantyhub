import type { AppRole } from "../../integrations/supabase/types";
import { getSupabaseClient } from "../supabase/client";

import type { AuthUserV2 } from "./typesV2";

type DealershipInfo = {
  dealershipId: string;
  dealershipName: string;
  dealershipRole: "admin" | "employee";
};

type ProviderInfo = {
  providerId: string;
  providerName: string;
  providerRole: "admin" | "member";
};

async function getUserRole(userId: string): Promise<AppRole | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("Failed to read user_roles, falling back to profiles.role:", error.message);
    return getUserRoleFallback(userId);
  }

  return data ? (data as any).role as AppRole : null;
}

async function getUserRoleFallback(userId: string): Promise<AppRole | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const role = ((data as any).role ?? "").toString().toUpperCase();
  const map: Record<string, AppRole> = {
    SUPER_ADMIN: "super_admin",
    ADMIN: "super_admin",
    DEALER_ADMIN: "dealership_admin",
    DEALER: "dealership_admin",
    DEALER_EMPLOYEE: "dealership_employee",
    PROVIDER: "provider",
  };
  return map[role] ?? null;
}

async function getDealershipInfo(userId: string): Promise<DealershipInfo | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data: membership, error: memErr } = await supabase
    .from("dealership_members")
    .select("dealership_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (memErr || !membership) return null;

  const { data: dealership, error: dErr } = await supabase
    .from("dealerships")
    .select("id, name")
    .eq("id", (membership as any).dealership_id)
    .maybeSingle();

  if (dErr || !dealership) return null;

  return {
    dealershipId: (dealership as any).id,
    dealershipName: (dealership as any).name,
    dealershipRole: (membership as any).role as "admin" | "employee",
  };
}

async function getProviderInfo(userId: string): Promise<ProviderInfo | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data: membership, error: memErr } = await supabase
    .from("provider_members")
    .select("provider_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (memErr || !membership) return null;

  const { data: provider, error: pErr } = await supabase
    .from("providers")
    .select("id, company_name")
    .eq("id", (membership as any).provider_id)
    .maybeSingle();

  if (pErr || !provider) return null;

  return {
    providerId: (provider as any).id,
    providerName: (provider as any).company_name,
    providerRole: (membership as any).role as "admin" | "member",
  };
}

export async function getCurrentUserV2(): Promise<AuthUserV2 | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const user = data.session?.user;
  if (!user?.email) return null;

  const role = await getUserRole(user.id);

  const base: AuthUserV2 = {
    id: user.id,
    email: user.email,
    role,
  };

  if (role === "dealership_admin" || role === "dealership_employee") {
    const info = await getDealershipInfo(user.id);
    if (info) {
      base.dealershipId = info.dealershipId;
      base.dealershipName = info.dealershipName;
      base.dealershipRole = info.dealershipRole;
    }
  }

  if (role === "provider") {
    const info = await getProviderInfo(user.id);
    if (info) {
      base.providerId = info.providerId;
      base.providerName = info.providerName;
      base.providerRole = info.providerRole;
    }
  }

  if (role === "super_admin") {
    const dealerInfo = await getDealershipInfo(user.id);
    if (dealerInfo) {
      base.dealershipId = dealerInfo.dealershipId;
      base.dealershipName = dealerInfo.dealershipName;
      base.dealershipRole = dealerInfo.dealershipRole;
    }
  }

  return base;
}
