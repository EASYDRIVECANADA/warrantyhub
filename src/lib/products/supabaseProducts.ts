import { getSupabaseClient } from "../supabase/client";

import type { ProductsApi } from "./api";
import type { CreateProductInput, CoverageDetails, Product, ProductType, PricingStructure } from "./types";

type ProductsRow = {
  id: string;
  provider_id: string;
  name: string;
  product_type: string;
  powertrain_eligibility?: string | null;
  pricing_structure?: string | null;
  coverage_details?: CoverageDetails | string | null;
  coverage_details_json?: CoverageDetails | string | null;
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
  is_most_popular?: boolean | null;
  is_top_pick?: boolean | null;
  short_description?: string | null;
  display_order?: number | null;
  published: boolean;
  created_at: string;
  updated_at: string;
};

function toProduct(r: ProductsRow): Product {
  const pricing = (r.pricing_structure ?? "").toString().trim();
  const pricingStructure = pricing ? (pricing as PricingStructure) : undefined;
  return {
    id: r.id,
    providerId: r.provider_id,
    name: r.name,
    productType: r.product_type as ProductType,
    pricingStructure,
    powertrainEligibility: typeof r.powertrain_eligibility === "string" ? (r.powertrain_eligibility as any) : undefined,
    programCode: undefined,
    keyBenefits: (r as any).key_benefits ?? undefined,
    coverageMaxLtvPercent: (r as any).coverage_max_ltv_percent ?? undefined,
    coverageDetails: (() => {
      const raw = r.coverage_details_json ?? r.coverage_details;
      if (!raw) return null;
      if (typeof raw === "object") return raw as CoverageDetails;
      try { return JSON.parse(raw as string) as CoverageDetails; } catch { return null; }
    })(),
    internalNotes: undefined,
    classVehicleTypes:
      r.class_vehicle_types && typeof r.class_vehicle_types === "object" && !Array.isArray(r.class_vehicle_types)
        ? (r.class_vehicle_types as Record<string, string>)
        : undefined,
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
    isMostPopular: r.is_most_popular ?? undefined,
    isTopPick: r.is_top_pick ?? undefined,
    shortDescription: r.short_description ?? undefined,
    displayOrder: r.display_order ?? undefined,
    published: r.published,
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

  const profile = await supabase.from("profiles").select("role, is_active").eq("id", id).maybeSingle();
  if (profile.error) throw profile.error;
  const active = (profile.data as any)?.is_active !== false;
  const role = ((profile.data as any)?.role ?? "UNASSIGNED") as string;
  if (!active || role !== "PROVIDER") {
    throw new Error("Provider access is not approved yet.");
  }
  return id;
}

export const supabaseProductsApi: ProductsApi = {
  async list() {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data as ProductsRow[]).map(toProduct);
  },

  async get(id: string) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return toProduct(data as ProductsRow);
  },

  async create(input: CreateProductInput) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const providerId = await currentUserId();
    const now = new Date().toISOString();

    const insertRow = {
      provider_id: providerId,
      name: input.name,
      product_type: input.productType,
      powertrain_eligibility: input.powertrainEligibility,
      pricing_structure: input.pricingStructure,
      key_benefits: input.keyBenefits,
      coverage_max_ltv_percent: input.coverageMaxLtvPercent,
      coverage_details: input.coverageDetails ? JSON.stringify(input.coverageDetails) : null,
      coverage_details_json: input.coverageDetails ?? null,
      class_vehicle_types: input.classVehicleTypes,
      term_months: input.termMonths,
      term_km: input.termKm,
      deductible_cents: input.deductibleCents,
      eligibility_max_vehicle_age_years: input.eligibilityMaxVehicleAgeYears,
      eligibility_max_mileage_km: input.eligibilityMaxMileageKm,
      eligibility_make_allowlist: input.eligibilityMakeAllowlist,
      eligibility_model_allowlist: input.eligibilityModelAllowlist,
      eligibility_trim_allowlist: input.eligibilityTrimAllowlist,
      base_price_cents: input.basePriceCents,
      dealer_cost_cents: input.dealerCostCents,
      is_most_popular: input.isMostPopular ?? null,
      is_top_pick: input.isTopPick ?? null,
      short_description: input.shortDescription ?? null,
      display_order: input.displayOrder ?? null,
      published: false,
      updated_at: now,
    };

    const { data, error } = await supabase.from("products").insert(insertRow).select("*").single();
    if (error) throw error;
    return toProduct(data as ProductsRow);
  },

  async update(id: string, patch) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const now = new Date().toISOString();

    const updateRow: Record<string, unknown> = { updated_at: now };
    if (typeof patch.name === "string") updateRow.name = patch.name;
    if (typeof patch.productType === "string") updateRow.product_type = patch.productType;
    if (typeof (patch as any).powertrainEligibility === "string") updateRow.powertrain_eligibility = (patch as any).powertrainEligibility;
    if (typeof (patch as any).pricingStructure === "string") updateRow.pricing_structure = (patch as any).pricingStructure;
    if (typeof (patch as any).keyBenefits === "string") updateRow.key_benefits = (patch as any).keyBenefits;
    if ((patch as any).coverageMaxLtvPercent === null || typeof (patch as any).coverageMaxLtvPercent === "number") {
      updateRow.coverage_max_ltv_percent = (patch as any).coverageMaxLtvPercent;
    }
    if (patch.coverageDetails !== undefined) {
      updateRow.coverage_details = patch.coverageDetails ? JSON.stringify(patch.coverageDetails) : null;
      updateRow.coverage_details_json = patch.coverageDetails ?? null;
    }
    if ((patch as any).classVehicleTypes && typeof (patch as any).classVehicleTypes === "object") {
      updateRow.class_vehicle_types = (patch as any).classVehicleTypes;
    }
    if (typeof patch.termMonths === "number") updateRow.term_months = patch.termMonths;
    if (typeof patch.termKm === "number") updateRow.term_km = patch.termKm;
    if (typeof patch.deductibleCents === "number") updateRow.deductible_cents = patch.deductibleCents;
    if (patch.eligibilityMaxVehicleAgeYears === null || typeof patch.eligibilityMaxVehicleAgeYears === "number") {
      updateRow.eligibility_max_vehicle_age_years = patch.eligibilityMaxVehicleAgeYears;
    }
    if (patch.eligibilityMaxMileageKm === null || typeof patch.eligibilityMaxMileageKm === "number") {
      updateRow.eligibility_max_mileage_km = patch.eligibilityMaxMileageKm;
    }
    if (Array.isArray(patch.eligibilityMakeAllowlist)) updateRow.eligibility_make_allowlist = patch.eligibilityMakeAllowlist;
    if (Array.isArray(patch.eligibilityModelAllowlist)) updateRow.eligibility_model_allowlist = patch.eligibilityModelAllowlist;
    if (Array.isArray(patch.eligibilityTrimAllowlist)) updateRow.eligibility_trim_allowlist = patch.eligibilityTrimAllowlist;
    if (typeof patch.basePriceCents === "number") updateRow.base_price_cents = patch.basePriceCents;
    if (typeof patch.dealerCostCents === "number") updateRow.dealer_cost_cents = patch.dealerCostCents;
    if (typeof patch.isMostPopular === "boolean") updateRow.is_most_popular = patch.isMostPopular;
    if (typeof patch.isTopPick === "boolean") updateRow.is_top_pick = patch.isTopPick;
    if (typeof patch.shortDescription === "string") updateRow.short_description = patch.shortDescription;
    if (typeof patch.displayOrder === "number") updateRow.display_order = patch.displayOrder;
    if (typeof patch.published === "boolean") updateRow.published = patch.published;

    const { data, error } = await supabase.from("products").update(updateRow).eq("id", id).select("*").single();
    if (error) throw error;
    return toProduct(data as ProductsRow);
  },

  async remove(id: string) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw error;
  },
};
