import { getSupabaseClient } from "../supabase/client";

import type { DealershipsApi } from "./api";
import type {
  Dealership,
  DealershipMember,
  DealershipStatus,
  CreateDealershipInput,
  UpdateDealershipInput,
} from "./types";

function toDealership(r: any): Dealership {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? undefined,
    address: r.address ?? undefined,
    province: r.province ?? undefined,
    licenseNumber: r.license_number ?? undefined,
    adminCode: r.admin_code,
    complianceInfo: r.compliance_info ?? undefined,
    status: (r.status ?? "pending") as DealershipStatus,
    subscriptionStatus: r.subscription_status ?? undefined,
    subscriptionPlanKey: r.subscription_plan_key ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toMember(r: any): DealershipMember {
  return {
    id: r.id,
    userId: r.user_id,
    dealershipId: r.dealership_id,
    role: r.role as "admin" | "employee",
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

export const supabaseDealershipsApi: DealershipsApi = {
  async list() {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("dealerships")
      .select("*")
      .order("name");

    if (error) throw error;
    return (data ?? []).map(toDealership);
  },

  async get(id) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("dealerships")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data ? toDealership(data) : null;
  },

  async create(input: CreateDealershipInput) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("dealerships")
      .insert({
        name: input.name,
        phone: input.phone ?? null,
        address: input.address ?? null,
        province: input.province ?? null,
        license_number: input.licenseNumber ?? null,
      })
      .select("*")
      .single();

    if (error) throw error;
    return toDealership(data);
  },

  async update(id, patch: UpdateDealershipInput) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const updateRow: Record<string, unknown> = {};
    if (typeof patch.name === "string") updateRow.name = patch.name;
    if (typeof patch.phone === "string") updateRow.phone = patch.phone;
    if (typeof patch.address === "string") updateRow.address = patch.address;
    if (typeof patch.province === "string") updateRow.province = patch.province;
    if (typeof patch.licenseNumber === "string") updateRow.license_number = patch.licenseNumber;
    if (patch.complianceInfo) updateRow.compliance_info = patch.complianceInfo;

    const { data, error } = await supabase
      .from("dealerships")
      .update(updateRow)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return toDealership(data);
  },

  async getMembers(dealershipId) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("dealership_members")
      .select("*")
      .eq("dealership_id", dealershipId)
      .order("created_at");

    if (error) throw error;
    return (data ?? []).map(toMember);
  },

  async addMember(dealershipId, userId, role) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("dealership_members")
      .insert({ dealership_id: dealershipId, user_id: userId, role })
      .select("*")
      .single();

    if (error) throw error;
    return toMember(data);
  },

  async removeMember(memberId) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { error } = await supabase
      .from("dealership_members")
      .delete()
      .eq("id", memberId);

    if (error) throw error;
  },

  async joinByAdminCode(adminCode) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const uid = await currentUserId();

    const { data: dealership, error: findErr } = await supabase
      .from("dealerships")
      .select("id")
      .eq("admin_code", adminCode.trim())
      .maybeSingle();

    if (findErr) throw findErr;
    if (!dealership) throw new Error("Invalid admin code");

    const { data, error } = await supabase
      .from("dealership_members")
      .insert({
        dealership_id: dealership.id,
        user_id: uid,
        role: "employee",
      })
      .select("*")
      .single();

    if (error) throw error;
    return toMember(data);
  },

  async getMyDealership() {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const uid = await currentUserId();

    const { data: membership, error: memErr } = await supabase
      .from("dealership_members")
      .select("dealership_id")
      .eq("user_id", uid)
      .limit(1)
      .maybeSingle();

    if (memErr) throw memErr;
    if (!membership) return null;

    const { data, error } = await supabase
      .from("dealerships")
      .select("*")
      .eq("id", (membership as any).dealership_id)
      .maybeSingle();

    if (error) throw error;
    return data ? toDealership(data) : null;
  },
};
