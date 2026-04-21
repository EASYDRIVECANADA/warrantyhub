import { getSupabaseClient } from "../supabase/client";

import type { ContractRemittancesApi } from "./api";
import type { ContractRemittance, ContractRemittanceStatus, CreateContractRemittanceInput } from "./types";

function toRemittance(r: any): ContractRemittance {
  return {
    id: r.id,
    contractId: r.contract_id,
    amount: Number(r.amount),
    status: (r.status ?? "pending") as ContractRemittanceStatus,
    dueDate: r.due_date,
    paidDate: r.paid_date ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const supabaseContractRemittancesApi: ContractRemittancesApi = {
  async listByContract(contractId) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("contract_remittances")
      .select("*")
      .eq("contract_id", contractId)
      .order("due_date");

    if (error) throw error;
    return (data ?? []).map(toRemittance);
  },

  async listByDealership(dealershipId) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data: contracts, error: cErr } = await supabase
      .from("contracts")
      .select("id")
      .eq("dealership_id", dealershipId);

    if (cErr) throw cErr;
    const contractIds = (contracts ?? []).map((c: any) => c.id);
    if (contractIds.length === 0) return [];

    const { data, error } = await supabase
      .from("contract_remittances")
      .select("*")
      .in("contract_id", contractIds)
      .order("due_date");

    if (error) throw error;
    return (data ?? []).map(toRemittance);
  },

  async listByProvider(providerEntityId) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data: contracts, error: cErr } = await supabase
      .from("contracts")
      .select("id")
      .eq("provider_entity_id", providerEntityId);

    if (cErr) throw cErr;
    const contractIds = (contracts ?? []).map((c: any) => c.id);
    if (contractIds.length === 0) return [];

    const { data, error } = await supabase
      .from("contract_remittances")
      .select("*")
      .in("contract_id", contractIds)
      .order("due_date");

    if (error) throw error;
    return (data ?? []).map(toRemittance);
  },

  async create(input: CreateContractRemittanceInput) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("contract_remittances")
      .insert({
        contract_id: input.contractId,
        amount: input.amount,
        due_date: input.dueDate,
      })
      .select("*")
      .single();

    if (error) throw error;
    return toRemittance(data);
  },

  async updateStatus(id, status: ContractRemittanceStatus, paidDate) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const updateRow: Record<string, unknown> = { status };
    if (status === "paid") {
      updateRow.paid_date = paidDate ?? new Date().toISOString().split("T")[0];
    }

    const { data, error } = await supabase
      .from("contract_remittances")
      .update(updateRow)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return toRemittance(data);
  },
};
