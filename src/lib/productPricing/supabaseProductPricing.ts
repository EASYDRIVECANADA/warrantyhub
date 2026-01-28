import { getSupabaseClient } from "../supabase/client";

import type { ProductPricingApi, ListProductPricingOptions } from "./api";
import type { CreateProductPricingInput, ProductPricing } from "./types";

type ProductPricingRow = {
  id: string;
  provider_id: string;
  product_id: string;
  term_months: number;
  term_km: number;
  deductible_cents: number;
  base_price_cents: number;
  dealer_cost_cents?: number | null;
  created_at: string;
};

function toPricing(r: ProductPricingRow): ProductPricing {
  return {
    id: r.id,
    providerId: r.provider_id,
    productId: r.product_id,
    termMonths: r.term_months,
    termKm: r.term_km,
    deductibleCents: r.deductible_cents,
    basePriceCents: r.base_price_cents,
    dealerCostCents: r.dealer_cost_cents ?? undefined,
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

  const profile = await supabase.from("profiles").select("role, is_active").eq("id", id).maybeSingle();
  if (profile.error) throw profile.error;
  const active = (profile.data as any)?.is_active !== false;
  const role = ((profile.data as any)?.role ?? "UNASSIGNED") as string;
  if (!active || role !== "PROVIDER") {
    throw new Error("Provider access is not approved yet.");
  }
  return id;
}

export const supabaseProductPricingApi: ProductPricingApi = {
  async list(options: ListProductPricingOptions) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("product_pricing")
      .select("*")
      .eq("product_id", options.productId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data as ProductPricingRow[]).map(toPricing);
  },

  async create(input: CreateProductPricingInput) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    if (!input.productId.trim()) throw new Error("productId is required");
    if (!Number.isFinite(input.termMonths) || input.termMonths <= 0) throw new Error("termMonths must be a positive number");
    if (!Number.isFinite(input.termKm) || input.termKm <= 0) throw new Error("termKm must be a positive number");
    if (!Number.isFinite(input.deductibleCents) || input.deductibleCents < 0)
      throw new Error("deductibleCents must be a number >= 0");
    if (!Number.isFinite(input.basePriceCents) || input.basePriceCents <= 0) throw new Error("basePriceCents must be a positive number");

    const providerId = await currentUserId();

    const insertRow = {
      provider_id: providerId,
      product_id: input.productId,
      term_months: input.termMonths,
      term_km: input.termKm,
      deductible_cents: input.deductibleCents,
      base_price_cents: input.basePriceCents,
      dealer_cost_cents: typeof input.dealerCostCents === "number" ? input.dealerCostCents : null,
    };

    const { data, error } = await supabase.from("product_pricing").insert(insertRow).select("*").single();
    if (error) throw error;
    return toPricing(data as ProductPricingRow);
  },

  async remove(id: string) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { error } = await supabase.from("product_pricing").delete().eq("id", id);
    if (error) throw error;
  },
};
