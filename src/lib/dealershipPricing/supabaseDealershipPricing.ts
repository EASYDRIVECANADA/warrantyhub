import { getSupabaseClient } from "../supabase/client";

import type { DealershipPricingApi } from "./api";
import type { DealershipProductPricing, UpsertDealershipPricingInput } from "./types";

function toPricing(r: any): DealershipProductPricing {
  return {
    id: r.id,
    dealershipId: r.dealership_id,
    productId: r.product_id,
    retailPrice: r.retail_price ?? {},
    confidentialityEnabled: r.confidentiality_enabled ?? false,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const supabaseDealershipPricingApi: DealershipPricingApi = {
  async listByDealership(dealershipId) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("dealership_product_pricing")
      .select("*")
      .eq("dealership_id", dealershipId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map(toPricing);
  },

  async getForProduct(dealershipId, productId) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("dealership_product_pricing")
      .select("*")
      .eq("dealership_id", dealershipId)
      .eq("product_id", productId)
      .maybeSingle();

    if (error) throw error;
    return data ? toPricing(data) : null;
  },

  async upsert(input: UpsertDealershipPricingInput) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("dealership_product_pricing")
      .upsert(
        {
          dealership_id: input.dealershipId,
          product_id: input.productId,
          retail_price: input.retailPrice,
          confidentiality_enabled: input.confidentialityEnabled ?? false,
        },
        { onConflict: "dealership_id,product_id" },
      )
      .select("*")
      .single();

    if (error) throw error;
    return toPricing(data);
  },

  async remove(id) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { error } = await supabase
      .from("dealership_product_pricing")
      .delete()
      .eq("id", id);

    if (error) throw error;
  },
};
