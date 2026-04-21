import { getSupabaseClient } from "../supabase/client";

import type { ContractsV2Api } from "./apiV2";
import type { ContractV2, ContractStatusV2, CreateContractV2Input } from "./typesV2";

function toContract(r: any): ContractV2 {
  return {
    id: r.id,
    dealershipId: r.dealership_id,
    providerEntityId: r.provider_entity_id ?? undefined,
    productId: r.product_id,
    createdBy: r.created_by_user_id ?? undefined,
    customerFirstName: r.customer_first_name ?? "",
    customerLastName: r.customer_last_name ?? "",
    customerEmail: r.customer_email ?? undefined,
    customerPhone: r.customer_phone ?? undefined,
    vehicleVin: r.vin ?? "",
    vehicleMake: r.vehicle_make ?? "",
    vehicleModel: r.vehicle_model ?? "",
    vehicleYear: typeof r.vehicle_year === "string" ? parseInt(r.vehicle_year) || 0 : (r.vehicle_year ?? 0),
    vehicleMileage: r.vehicle_mileage_km ?? undefined,
    contractPrice: r.contract_price != null ? Number(r.contract_price) : undefined,
    dealerCost: r.dealer_cost_dollars != null ? Number(r.dealer_cost_dollars) : undefined,
    status: (r.status_new ?? "draft") as ContractStatusV2,
    startDate: r.start_date ?? undefined,
    endDate: r.end_date ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
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

export const supabaseContractsV2Api: ContractsV2Api = {
  async list() {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("contracts")
      .select("*")
      .not("dealership_id", "is", null)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map(toContract);
  },

  async listByDealership(dealershipId) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("contracts")
      .select("*")
      .eq("dealership_id", dealershipId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map(toContract);
  },

  async listByProvider(providerEntityId) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("contracts")
      .select("*")
      .eq("provider_entity_id", providerEntityId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map(toContract);
  },

  async get(id) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("contracts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data ? toContract(data) : null;
  },

  async create(input: CreateContractV2Input) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const uid = await currentUserId();
    const contractNumber = `WH-${Date.now().toString(36).toUpperCase()}`;

    const { data, error } = await supabase
      .from("contracts")
      .insert({
        contract_number: contractNumber,
        customer_name: `${input.customerFirstName} ${input.customerLastName}`.trim(),
        customer_first_name: input.customerFirstName,
        customer_last_name: input.customerLastName,
        customer_email: input.customerEmail ?? null,
        customer_phone: input.customerPhone ?? null,
        dealership_id: input.dealershipId,
        provider_entity_id: input.providerEntityId,
        product_id: input.productId,
        vin: input.vehicleVin,
        vehicle_make: input.vehicleMake,
        vehicle_model: input.vehicleModel,
        vehicle_year: String(input.vehicleYear),
        vehicle_mileage_km: input.vehicleMileage ?? null,
        contract_price: input.contractPrice ?? null,
        dealer_cost_dollars: input.dealerCost ?? null,
        status: "DRAFT",
        status_new: "draft",
        start_date: input.startDate ?? null,
        end_date: input.endDate ?? null,
        created_by_user_id: uid,
      })
      .select("*")
      .single();

    if (error) throw error;
    return toContract(data);
  },

  async updateStatus(id, status: ContractStatusV2) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const legacyMap: Record<ContractStatusV2, string> = {
      draft: "DRAFT",
      submitted: "SOLD",
      active: "REMITTED",
      cancelled: "DRAFT",
      expired: "DRAFT",
    };

    const { data, error } = await supabase
      .from("contracts")
      .update({
        status_new: status,
        status: legacyMap[status],
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return toContract(data);
  },
};
