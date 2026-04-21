import { getSupabaseClient } from "../supabase/client";

import type { MarketplaceApi } from "./api";
import type { MarketplaceProduct } from "./api";
import type { PricingStructure, Product, ProductType } from "../products/types";

type ProductsRow = {
  id: string;
  provider_id: string;
  provider_entity_id?: string | null;
  name: string;
  product_type: string;
  description?: string | null;
  powertrain_eligibility?: string | null;
  pricing_structure?: string | null;
  key_benefits?: string | null;
  coverage_max_ltv_percent?: number | null;
  coverage_details?: string | null;
  coverage_details_json?: any;
  pricing?: any;
  pricing_json?: any;
  eligibility_rules?: any;
  exclusions?: string | null;
  class_vehicle_types?: Record<string, string> | null;
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
  status?: string | null;
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
  claim_limit_type?: string | null;
  claim_limit_amount_cents?: number | null;
  provider_net_cost_cents?: number | null;
  deductible_cents: number;
  base_price_cents: number;
  dealer_cost_cents: number | null;
  is_default: boolean;
};

function parseJson<T>(val: unknown): T | undefined {
  if (!val) return undefined;
  if (typeof val === "object") return val as T;
  if (typeof val === "string") { try { return JSON.parse(val) as T; } catch { return undefined; } }
  return undefined;
}

function toProduct(r: ProductsRow): Product {
  const pricing = (r.pricing_structure ?? "").toString().trim();
  const pricingStructure = pricing ? (pricing as PricingStructure) : undefined;
  const pj = parseJson<any>(r.pricing_json ?? r.pricing);
  const er = parseJson<any>(r.eligibility_rules);
  const cdRaw = r.coverage_details_json ?? r.coverage_details;
  const parsedCoverage = (() => {
    if (!cdRaw) return undefined;
    if (typeof cdRaw === "object") return cdRaw as any;
    try { return JSON.parse(cdRaw as string); } catch { return undefined; }
  })();

  const benefitsFromPricing = pj?.benefits?.map((b: any) => typeof b === "string" ? b : b.name).filter(Boolean).join("\n");

  return {
    id: r.id,
    providerId: r.provider_entity_id ?? r.provider_id,
    name: r.name,
    productType: r.product_type as ProductType,
    pricingStructure,
    powertrainEligibility: typeof r.powertrain_eligibility === "string" ? (r.powertrain_eligibility as any) : undefined,
    programCode: parsedCoverage?.slug ?? undefined,
    keyBenefits: r.key_benefits ?? benefitsFromPricing ?? undefined,
    coverageMaxLtvPercent: r.coverage_max_ltv_percent ?? undefined,
    coverageDetails: parsedCoverage,
    classVehicleTypes:
      r.class_vehicle_types && typeof r.class_vehicle_types === "object" && !Array.isArray(r.class_vehicle_types)
        ? (r.class_vehicle_types as Record<string, string>)
        : undefined,
    termMonths: r.term_months ?? (pj?.rows?.[0]?.term ? parseInt(String(pj.rows[0].term)) : undefined),
    termKm: r.term_km ?? undefined,
    deductibleCents: r.deductible_cents ?? (pj?.deductible ? Math.round(Number(pj.deductible) * 100) : undefined),
    eligibilityMaxVehicleAgeYears: r.eligibility_max_vehicle_age_years ?? (er?.maxAge ? Number(er.maxAge) : undefined),
    eligibilityMaxMileageKm: r.eligibility_max_mileage_km ?? (er?.maxMileage ? Number(er.maxMileage) : undefined),
    eligibilityMakeAllowlist: r.eligibility_make_allowlist ?? (er?.makes ?? undefined),
    eligibilityModelAllowlist: r.eligibility_model_allowlist ?? undefined,
    eligibilityTrimAllowlist: r.eligibility_trim_allowlist ?? undefined,
    basePriceCents: r.base_price_cents ?? (pj?.rows?.[0]?.dealerCost ? Math.round(Number(pj.rows[0].dealerCost) * 100) : undefined),
    dealerCostCents: r.dealer_cost_cents ?? (pj?.rows?.[0]?.dealerCost ? Math.round(Number(pj.rows[0].dealerCost) * 100) : undefined),
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
          "id, product_id, term_months, term_km, vehicle_mileage_min_km, vehicle_mileage_max_km, vehicle_class, claim_limit_cents, claim_limit_type, claim_limit_amount_cents, provider_net_cost_cents, deductible_cents, base_price_cents, dealer_cost_cents, is_default",
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
        basePriceCents: typeof d.provider_net_cost_cents === "number" ? d.provider_net_cost_cents : d.base_price_cents,
        dealerCostCents: d.dealer_cost_cents === null ? undefined : d.dealer_cost_cents,
        pricingDefault: {
          productPricingId: d.id,
          termMonths: d.term_months,
          termKm: d.term_km,
          vehicleMileageMinKm: typeof d.vehicle_mileage_min_km === "number" ? d.vehicle_mileage_min_km : undefined,
          vehicleMileageMaxKm: d.vehicle_mileage_max_km === null ? null : typeof d.vehicle_mileage_max_km === "number" ? d.vehicle_mileage_max_km : undefined,
          vehicleClass: typeof d.vehicle_class === "string" ? d.vehicle_class : undefined,
          claimLimitCents:
            typeof d.claim_limit_amount_cents === "number"
              ? d.claim_limit_amount_cents
              : d.claim_limit_cents === null
                ? undefined
                : d.claim_limit_cents,
          deductibleCents: d.deductible_cents,
          basePriceCents: typeof d.provider_net_cost_cents === "number" ? d.provider_net_cost_cents : d.base_price_cents,
          dealerCostCents: d.dealer_cost_cents === null ? undefined : d.dealer_cost_cents,
        },
      };

      return merged;
    });
  },
};
