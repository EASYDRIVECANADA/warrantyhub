import { getSupabaseClient } from "../supabase/client";

import type { MarketplaceApi } from "./api";
import type { Product, ProductType } from "../products/types";

type ProductsRow = {
  id: string;
  provider_id: string;
  name: string;
  product_type: string;
  coverage_details?: string | null;
  exclusions?: string | null;
  term_months?: number | null;
  term_km?: number | null;
  deductible_cents?: number | null;
  eligibility_max_vehicle_age_years?: number | null;
  eligibility_max_mileage_km?: number | null;
  eligibility_make_allowlist?: string[] | null;
  eligibility_model_allowlist?: string[] | null;
  eligibility_trim_allowlist?: string[] | null;
  base_price_cents?: number | null;
  dealer_cost_cents?: number | null;
  published: boolean;
  created_at: string;
  updated_at: string;
};

function toProduct(r: ProductsRow): Product {
  return {
    id: r.id,
    providerId: r.provider_id,
    name: r.name,
    productType: r.product_type as ProductType,
    coverageDetails: r.coverage_details ?? undefined,
    exclusions: r.exclusions ?? undefined,
    termMonths: r.term_months ?? undefined,
    termKm: r.term_km ?? undefined,
    deductibleCents: r.deductible_cents ?? undefined,
    eligibilityMaxVehicleAgeYears: r.eligibility_max_vehicle_age_years ?? undefined,
    eligibilityMaxMileageKm: r.eligibility_max_mileage_km ?? undefined,
    eligibilityMakeAllowlist: r.eligibility_make_allowlist ?? undefined,
    eligibilityModelAllowlist: r.eligibility_model_allowlist ?? undefined,
    eligibilityTrimAllowlist: r.eligibility_trim_allowlist ?? undefined,
    basePriceCents: r.base_price_cents ?? undefined,
    dealerCostCents: r.dealer_cost_cents ?? undefined,
    published: r.published,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const supabaseMarketplaceApi: MarketplaceApi = {
  async listPublishedProducts() {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("published", true)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data as ProductsRow[]).map(toProduct);
  },
};
