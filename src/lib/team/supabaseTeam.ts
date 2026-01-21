import { getSupabaseClient } from "../supabase/client";

import type { ProviderTeamApi } from "./api";
import type { InviteTeamMemberInput, ProviderTeamMember, TeamMemberRole, TeamMemberStatus } from "./types";

type TeamRow = {
  id: string;
  provider_id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
};

function toMember(r: TeamRow): ProviderTeamMember {
  return {
    id: r.id,
    providerId: r.provider_id,
    email: r.email,
    role: r.role as TeamMemberRole,
    status: r.status as TeamMemberStatus,
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

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export const supabaseProviderTeamApi: ProviderTeamApi = {
  async list() {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase.from("provider_team_members").select("*").order("created_at", { ascending: false });
    if (error) throw error;

    return (data as TeamRow[]).map(toMember);
  },

  async invite(input: InviteTeamMemberInput) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const providerId = await currentUserId();
    const email = normalizeEmail(input.email);
    if (!email) throw new Error("Email is required");

    const insertRow = {
      provider_id: providerId,
      email,
      role: input.role,
      status: "INVITED",
    };

    const { data, error } = await supabase.from("provider_team_members").insert(insertRow).select("*").single();
    if (error) throw error;

    return toMember(data as TeamRow);
  },

  async update(id: string, patch) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const updateRow: Record<string, unknown> = {};
    if (typeof patch.role === "string") updateRow.role = patch.role;
    if (typeof patch.status === "string") updateRow.status = patch.status;

    const { data, error } = await supabase.from("provider_team_members").update(updateRow).eq("id", id).select("*").single();
    if (error) throw error;

    return toMember(data as TeamRow);
  },

  async remove(id: string) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { error } = await supabase.from("provider_team_members").delete().eq("id", id);
    if (error) throw error;
  },
};
