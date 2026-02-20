import { getSupabaseClient } from "../supabase/client";

import type { MarketplaceApi } from "./api";
import type { MarketplaceProduct } from "./api";
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

type ProductPricingDefaultRow = {
  id: string;
  product_id: string;
  term_months: number | null;
  term_km: number | null;
  vehicle_mileage_min_km: number | null;
  vehicle_mileage_max_km: number | null;
  vehicle_class: string | null;
  claim_limit_cents: number | null;
  deductible_cents: number;
  base_price_cents: number;
  dealer_cost_cents: number | null;
  is_default: boolean;
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

    const products = (data as ProductsRow[]).map(toProduct);
    const productIds = products.map((p) => p.id).filter(Boolean);

    let defaultRows: ProductPricingDefaultRow[] = [];
    if (productIds.length > 0) {
      const q = await supabase
        .from("product_pricing")
        .select(
          "id, product_id, term_months, term_km, vehicle_mileage_min_km, vehicle_mileage_max_km, vehicle_class, claim_limit_cents, deductible_cents, base_price_cents, dealer_cost_cents, is_default",
        )
        .in("product_id", productIds)
        .eq("is_default", true);

      if (q.error) throw q.error;
      defaultRows = (q.data ?? []) as ProductPricingDefaultRow[];
    }

    const defaultByProductId = new Map(defaultRows.map((r) => [r.product_id, r] as const));

    return products.map((p) => {
      const d = defaultByProductId.get(p.id);
      if (!d) return p as MarketplaceProduct;

      const merged: MarketplaceProduct = {
        ...p,
        termMonths: d.term_months === null ? undefined : d.term_months,
        termKm: d.term_km === null ? undefined : d.term_km,
        deductibleCents: d.deductible_cents,
        basePriceCents: d.base_price_cents,
        dealerCostCents: d.dealer_cost_cents === null ? undefined : d.dealer_cost_cents,
        pricingDefault: {
          productPricingId: d.id,
          termMonths: d.term_months,
          termKm: d.term_km,
          vehicleMileageMinKm: typeof d.vehicle_mileage_min_km === "number" ? d.vehicle_mileage_min_km : undefined,
          vehicleMileageMaxKm: d.vehicle_mileage_max_km === null ? null : typeof d.vehicle_mileage_max_km === "number" ? d.vehicle_mileage_max_km : undefined,
          vehicleClass: typeof d.vehicle_class === "string" ? d.vehicle_class : undefined,
          claimLimitCents: d.claim_limit_cents === null ? undefined : d.claim_limit_cents,
          deductibleCents: d.deductible_cents,
          basePriceCents: d.base_price_cents,
          dealerCostCents: d.dealer_cost_cents === null ? undefined : d.dealer_cost_cents,
        },
      };

      return merged;
    });
  },
};
