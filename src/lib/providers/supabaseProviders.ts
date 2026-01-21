import { getSupabaseClient } from "../supabase/client";

import type { ProvidersApi } from "./api";
import type { ProviderPublic, UpdateMyProviderProfileInput } from "./types";

type ProfilesRow = {
  id: string;
  role: string;
  display_name?: string | null;
  company_name?: string | null;
};

function toProviderPublic(r: ProfilesRow): ProviderPublic {
  return {
    id: r.id,
    displayName: r.display_name ?? undefined,
    companyName: r.company_name ?? undefined,
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

export const supabaseProvidersApi: ProvidersApi = {
  async listByIds(ids) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const wanted = Array.from(new Set(ids.map((x) => x.trim()).filter(Boolean)));
    if (wanted.length === 0) return [];

    const { data, error } = await supabase
      .from("profiles")
      .select("id, role, display_name, company_name")
      .in("id", wanted)
      .eq("role", "PROVIDER");

    if (error) throw error;
    return (data as ProfilesRow[]).map(toProviderPublic);
  },

  async getMyProfile() {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const uid = await currentUserId();

    const { data, error } = await supabase
      .from("profiles")
      .select("id, role, display_name, company_name")
      .eq("id", uid)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return toProviderPublic(data as ProfilesRow);
  },

  async updateMyProfile(patch: UpdateMyProviderProfileInput) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const uid = await currentUserId();

    const updateRow: Record<string, unknown> = {};
    if (typeof patch.displayName === "string") updateRow.display_name = patch.displayName.trim() || null;
    if (typeof patch.companyName === "string") updateRow.company_name = patch.companyName.trim() || null;

    const { data, error } = await supabase
      .from("profiles")
      .update(updateRow)
      .eq("id", uid)
      .select("id, role, display_name, company_name")
      .single();

    if (error) throw error;
    return toProviderPublic(data as ProfilesRow);
  },
};
