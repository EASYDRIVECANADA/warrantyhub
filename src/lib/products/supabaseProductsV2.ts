import { getSupabaseClient } from "../supabase/client";

import type { ProductsV2Api } from "./apiV2";
import type {
  ProductV2,
  ProductTypeV2,
  ProductStatusV2,
  ProductCoverageDetails,
  ProductPricing,
  ProductEligibilityRules,
  CreateProductV2Input,
  UpdateProductV2Input,
} from "./typesV2";

function parseJson<T>(val: unknown): T | undefined {
  if (!val) return undefined;
  if (typeof val === "object") return val as T;
  if (typeof val === "string") {
    try { return JSON.parse(val) as T; } catch { return undefined; }
  }
  return undefined;
}

function toProduct(r: any): ProductV2 {
  const coverageRaw = r.coverage_details_json ?? r.coverage_details;
  const pricingRaw = r.pricing_json ?? r.pricing;
  const eligibilityRaw = r.eligibility_rules;

  const coverage = parseJson<ProductCoverageDetails>(coverageRaw);
  const pricing = parseJson<ProductPricing>(pricingRaw);
  const eligibility = parseJson<ProductEligibilityRules>(eligibilityRaw);

  return {
    id: r.id,
    providerEntityId: r.provider_entity_id ?? r.provider_id,
    name: r.name,
    type: (r.product_type ?? r.type ?? "Other") as ProductTypeV2,
    description: (r.description ?? (coverage as any)?.description) ?? undefined,
    coverageDetails: coverage,
    pricing,
    eligibilityRules: eligibility,
    benefits: pricing && (pricing as any).benefits ? (pricing as any).benefits : undefined,
    termsSections: pricing && (pricing as any).termsSections ? (pricing as any).termsSections : undefined,
    exclusions: r.exclusions ?? undefined,
    status: (r.published ? "active" : "draft") as ProductStatusV2,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function getMyProviderEntityId(): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const { data: session, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  const uid = session.session?.user?.id;
  if (!uid) throw new Error("Not authenticated");

  const { data: membership, error: memErr } = await supabase
    .from("provider_members")
    .select("provider_id")
    .eq("user_id", uid)
    .limit(1)
    .maybeSingle();

  if (memErr) throw memErr;
  if (!membership) throw new Error("You are not a member of any provider");

  return (membership as any).provider_id;
}

export const supabaseProductsV2Api: ProductsV2Api = {
  async list() {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const providerEntityId = await getMyProviderEntityId();

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("provider_entity_id", providerEntityId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map(toProduct);
  },

  async listByProvider(providerEntityId) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("provider_entity_id", providerEntityId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map(toProduct);
  },

  async listActive() {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    // Return any product that is published=true regardless of whether it came
    // from the V2 editor (provider_entity_id set) or the legacy flow.
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("published", true)
      .order("name");

    if (error) throw error;
    return (data ?? []).map(toProduct);
  },

  async get(id) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data ? toProduct(data) : null;
  },

  async create(input: CreateProductV2Input) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const providerEntityId = await getMyProviderEntityId();

    const { data: providerRow } = await supabase
      .from("providers")
      .select("legacy_profile_id")
      .eq("id", providerEntityId)
      .maybeSingle();

    const legacyProviderId = (providerRow as any)?.legacy_profile_id;

    // provider_id must equal auth.uid() to satisfy the old RLS policy
    // "products_provider_own" (provider_id = auth.uid()).
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;

    const insertRow: Record<string, unknown> = {
      provider_entity_id: providerEntityId,
      provider_id: legacyProviderId ?? uid ?? providerEntityId,
      name: input.name,
      product_type: input.type,
      coverage_details_json: input.coverageDetails
        ? { ...input.coverageDetails, description: input.description }
        : { description: input.description },
      pricing_json: input.pricing ?? {},
      eligibility_rules: input.eligibilityRules ?? {},
      published: input.status === "active",
    };

    const { data, error } = await supabase
      .from("products")
      .insert(insertRow)
      .select("*")
      .single();

    if (error) throw error;
    return toProduct(data);
  },

  async update(id, patch: UpdateProductV2Input) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    // Get the current user's UID so we can satisfy the old RLS policy
    // (products_provider_own: provider_id = auth.uid()) by also writing provider_id.
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;

    const updateRow: Record<string, unknown> = {};

    // Always write provider_id = auth.uid() so the old RLS policy
    // "products_provider_own" (provider_id = auth.uid()) allows the update.
    if (uid) updateRow.provider_id = uid;

    if (typeof patch.name === "string") updateRow.name = patch.name;
    if (typeof patch.type === "string") updateRow.product_type = patch.type;
    if (typeof patch.description === "string" || patch.coverageDetails !== undefined) {
      const base = patch.coverageDetails ?? {};
      updateRow.coverage_details_json = typeof patch.description === "string"
        ? { ...base, description: patch.description }
        : base;
    }
    if (patch.pricing !== undefined) updateRow.pricing_json = patch.pricing ?? {};
    if (patch.eligibilityRules !== undefined) updateRow.eligibility_rules = patch.eligibilityRules ?? {};
    if (typeof patch.exclusions === "string") updateRow.exclusions = patch.exclusions;
    if (typeof patch.status === "string") {
      updateRow.published = patch.status === "active";
    }
    // Top-level benefits/termsSections — embed into existing JSON blobs if provided standalone
    if (patch.benefits !== undefined && updateRow.pricing_json === undefined) {
      const supabase2 = getSupabaseClient()!;
      const { data: existing } = await supabase2.from("products").select("pricing_json").eq("id", id).maybeSingle();
      const pj = (existing as any)?.pricing_json ?? {};
      updateRow.pricing_json = { ...pj, benefits: patch.benefits };
    }
    if (patch.termsSections !== undefined && updateRow.coverage_details_json === undefined) {
      const supabase2 = getSupabaseClient()!;
      const { data: existing } = await supabase2.from("products").select("coverage_details_json").eq("id", id).maybeSingle();
      const cdj = (existing as any)?.coverage_details_json ?? {};
      updateRow.coverage_details_json = { ...cdj, termsSections: patch.termsSections };
    }

    const { data, error } = await supabase
      .from("products")
      .update(updateRow)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Permission denied — check that your provider account is set up correctly in Supabase.");
    return toProduct(data);
  },

  async remove(id) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw error;
  },
};
