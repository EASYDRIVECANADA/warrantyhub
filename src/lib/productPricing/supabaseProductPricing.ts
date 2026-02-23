import { getSupabaseClient } from "../supabase/client";

import type { ProductPricingApi, ListProductPricingOptions } from "./api";
import type { CreateProductPricingInput, ProductPricing } from "./types";

type ProductPricingRow = {
  id: string;
  provider_id: string;
  product_id: string;
  term_months: number | null;
  term_km: number | null;
  is_default?: boolean | null;
  vehicle_mileage_min_km?: number | null;
  vehicle_mileage_max_km?: number | null;
  vehicle_class?: string | null;
  claim_limit_cents?: number | null;
  claim_limit_type?: string | null;
  claim_limit_amount_cents?: number | null;
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
    isDefault: r.is_default === true,
    vehicleMileageMinKm: typeof r.vehicle_mileage_min_km === "number" ? r.vehicle_mileage_min_km : undefined,
    vehicleMileageMaxKm:
      typeof r.vehicle_mileage_max_km === "number" ? r.vehicle_mileage_max_km : r.vehicle_mileage_max_km === null ? null : undefined,
    vehicleClass: typeof r.vehicle_class === "string" ? r.vehicle_class : undefined,
    claimLimitCents: r.claim_limit_cents ?? undefined,
    claimLimitType: typeof r.claim_limit_type === "string" ? (r.claim_limit_type as any) : undefined,
    claimLimitAmountCents: typeof r.claim_limit_amount_cents === "number" ? r.claim_limit_amount_cents : undefined,
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
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data as ProductPricingRow[]).map(toPricing);
  },

  async create(input: CreateProductPricingInput) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    if (!input.productId.trim()) throw new Error("productId is required");
    if (input.termMonths !== null && (!Number.isFinite(input.termMonths) || input.termMonths <= 0)) {
      throw new Error("termMonths must be null (Unlimited) or a positive number");
    }
    if (input.termKm !== null && (!Number.isFinite(input.termKm) || input.termKm <= 0)) {
      throw new Error("termKm must be null (Unlimited) or a positive number");
    }
    if (typeof input.claimLimitCents === "number" && (!Number.isFinite(input.claimLimitCents) || input.claimLimitCents <= 0)) {
      throw new Error("claimLimitCents must be a positive number");
    }
    if (!Number.isFinite(input.deductibleCents) || input.deductibleCents < 0)
      throw new Error("deductibleCents must be a number >= 0");
    if (!Number.isFinite(input.basePriceCents) || input.basePriceCents <= 0) throw new Error("basePriceCents must be a positive number");

    if (typeof input.vehicleMileageMinKm === "number" && (!Number.isFinite(input.vehicleMileageMinKm) || input.vehicleMileageMinKm < 0)) {
      throw new Error("vehicleMileageMinKm must be a number >= 0");
    }
    if (
      input.vehicleMileageMaxKm !== undefined &&
      input.vehicleMileageMaxKm !== null &&
      (!Number.isFinite(input.vehicleMileageMaxKm) || input.vehicleMileageMaxKm < 0)
    ) {
      throw new Error("vehicleMileageMaxKm must be null (Unlimited) or a number >= 0");
    }
    if (
      typeof input.vehicleMileageMinKm === "number" &&
      typeof input.vehicleMileageMaxKm === "number" &&
      input.vehicleMileageMaxKm < input.vehicleMileageMinKm
    ) {
      throw new Error("vehicleMileageMaxKm must be >= vehicleMileageMinKm");
    }

    const providerId = await currentUserId();

    if (input.isDefault === true) {
      const { error: clearError } = await supabase
        .from("product_pricing")
        .update({ is_default: false })
        .eq("product_id", input.productId)
        .eq("provider_id", providerId)
        .eq("is_default", true);
      if (clearError) throw clearError;
    }

    const insertRow: Record<string, unknown> = {
      provider_id: providerId,
      product_id: input.productId,
      term_months: input.termMonths,
      term_km: input.termKm,
      is_default: input.isDefault === true,
      deductible_cents: input.deductibleCents,
      base_price_cents: input.basePriceCents,
      dealer_cost_cents: typeof input.dealerCostCents === "number" ? input.dealerCostCents : null,
    };

    if (typeof input.vehicleMileageMinKm === "number") {
      insertRow.vehicle_mileage_min_km = input.vehicleMileageMinKm;
    }
    if (input.vehicleMileageMaxKm !== undefined) {
      insertRow.vehicle_mileage_max_km = input.vehicleMileageMaxKm;
    }
    if (typeof input.vehicleClass === "string" && input.vehicleClass.trim()) {
      insertRow.vehicle_class = input.vehicleClass.trim();
    }

    if (typeof input.claimLimitCents === "number") {
      insertRow.claim_limit_cents = input.claimLimitCents;
    }

    if (typeof (input as any).claimLimitType === "string" && (input as any).claimLimitType.trim()) {
      insertRow.claim_limit_type = (input as any).claimLimitType.trim();
    }

    if (typeof (input as any).claimLimitAmountCents === "number") {
      insertRow.claim_limit_amount_cents = (input as any).claimLimitAmountCents;
    }

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
