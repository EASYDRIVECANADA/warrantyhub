import { getSupabaseClient } from "../supabase/client";

import type { ProvidersV2Api } from "./apiV2";
import type { Provider, ProviderMember, ProviderStatus, UpdateProviderInput } from "./typesV2";

function toProvider(r: any): Provider {
  return {
    id: r.id,
    companyName: r.company_name,
    contactEmail: r.contact_email ?? undefined,
    contactPhone: r.contact_phone ?? undefined,
    address: r.address ?? undefined,
    regionsServed: r.regions_served ?? undefined,
    description: r.description ?? undefined,
    logoUrl: r.logo_url ?? undefined,
    status: (r.status ?? "pending") as ProviderStatus,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toMember(r: any): ProviderMember {
  return {
    id: r.id,
    userId: r.user_id,
    providerId: r.provider_id,
    role: r.role as "admin" | "member",
    createdAt: r.created_at,
  };
}

async function currentUserId(): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const id = data.session?.user?.id;
  if (!id) throw new Error("Not authenticated");
  return id;
}

export const supabaseProvidersV2Api: ProvidersV2Api = {
  async list() {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("providers")
      .select("*")
      .order("company_name");

    if (error) throw error;
    return (data ?? []).map(toProvider);
  },

  async get(id) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("providers")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data ? toProvider(data) : null;
  },

  async getMyProvider() {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const uid = await currentUserId();

    const { data: membership, error: memErr } = await supabase
      .from("provider_members")
      .select("provider_id")
      .eq("user_id", uid)
      .limit(1)
      .maybeSingle();

    if (memErr) throw memErr;
    if (!membership) return null;

    const { data, error } = await supabase
      .from("providers")
      .select("*")
      .eq("id", (membership as any).provider_id)
      .maybeSingle();

    if (error) throw error;
    return data ? toProvider(data) : null;
  },

  async update(id, patch: UpdateProviderInput) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const updateRow: Record<string, unknown> = {};
    if (typeof patch.companyName === "string") updateRow.company_name = patch.companyName;
    if (typeof patch.contactEmail === "string") updateRow.contact_email = patch.contactEmail;
    if (typeof patch.contactPhone === "string") updateRow.contact_phone = patch.contactPhone;
    if (typeof patch.address === "string") updateRow.address = patch.address;
    if (typeof patch.description === "string") updateRow.description = patch.description;
    if (typeof patch.logoUrl === "string") updateRow.logo_url = patch.logoUrl;
    if (patch.logoUrl === null) updateRow.logo_url = null;
    if (Array.isArray(patch.regionsServed)) updateRow.regions_served = patch.regionsServed;

    const { data, error } = await supabase
      .from("providers")
      .update(updateRow)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return toProvider(data);
  },

  async getMembers(providerId) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("provider_members")
      .select("*")
      .eq("provider_id", providerId)
      .order("created_at");

    if (error) throw error;
    return (data ?? []).map(toMember);
  },

  async addMember(providerId, userId, role) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("provider_members")
      .insert({ provider_id: providerId, user_id: userId, role })
      .select("*")
      .single();

    if (error) throw error;
    return toMember(data);
  },

  async removeMember(memberId) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { error } = await supabase
      .from("provider_members")
      .delete()
      .eq("id", memberId);

    if (error) throw error;
  },
};
