import { getSupabaseClient } from "../supabase/client";

import type { ProductAddonsApi } from "./api";
import type { AddonPricingType, CreateProductAddonInput, ProductAddon } from "./types";

type ProductAddonsRow = {
  id: string;
  provider_id: string;
  product_id: string;
  name: string;
  description?: string | null;
  pricing_type?: string | null;
  applies_to_all_pricing_rows?: boolean | null;
  applicable_pricing_row_ids?: string[] | null;
  base_price_cents: number;
  min_price_cents?: number | null;
  max_price_cents?: number | null;
  dealer_cost_cents?: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

function toAddon(r: ProductAddonsRow): ProductAddon {
  const min = typeof r.min_price_cents === "number" ? r.min_price_cents : r.base_price_cents;
  const max = typeof r.max_price_cents === "number" ? r.max_price_cents : min;
  const raw = typeof (r as any).pricing_type === "string" ? String((r as any).pricing_type) : "";
  const pricingType: AddonPricingType | undefined =
    raw === "PER_TERM" || raw === "PER_CLAIM" || raw === "FIXED" ? (raw as AddonPricingType) : "FIXED";
  return {
    id: r.id,
    providerId: r.provider_id,
    productId: r.product_id,
    name: r.name,
    description: r.description ?? undefined,
    pricingType,
    appliesToAllPricingRows: typeof (r as any).applies_to_all_pricing_rows === "boolean" ? Boolean((r as any).applies_to_all_pricing_rows) : undefined,
    applicablePricingRowIds: Array.isArray((r as any).applicable_pricing_row_ids)
      ? ((r as any).applicable_pricing_row_ids as unknown[]).filter((x) => typeof x === "string")
      : undefined,
    basePriceCents: r.base_price_cents,
    minPriceCents: min,
    maxPriceCents: max,
    dealerCostCents: typeof r.dealer_cost_cents === "number" ? r.dealer_cost_cents : undefined,
    active: r.active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function missingColumnFromSchemaCacheError(e: unknown): string | null {
  const msg = typeof (e as any)?.message === "string" ? String((e as any).message) : "";
  if (!msg) return null;
  const m = msg.match(/Could not find the '([^']+)' column/i);
  return m && typeof m[1] === "string" && m[1].trim() ? m[1].trim() : null;
}

async function insertWithColumnFallback(supabase: any, row: Record<string, unknown>) {
  const { data, error } = await supabase.from("product_addons").insert(row).select("*").single();
  if (!error) return { data, error: null } as const;

  const col = missingColumnFromSchemaCacheError(error);
  if (!col) throw error;
  if (!(col in row)) throw error;

  const retryRow = { ...row };
  delete (retryRow as any)[col];
  const retry = await supabase.from("product_addons").insert(retryRow).select("*").single();
  if (retry.error) throw retry.error;
  return { data: retry.data, error: null } as const;
}

async function updateWithColumnFallback(supabase: any, id: string, row: Record<string, unknown>) {
  const { data, error } = await supabase.from("product_addons").update(row).eq("id", id).select("*").single();
  if (!error) return { data, error: null } as const;

  const col = missingColumnFromSchemaCacheError(error);
  if (!col) throw error;
  if (!(col in row)) throw error;

  const retryRow = { ...row };
  delete (retryRow as any)[col];
  const retry = await supabase.from("product_addons").update(retryRow).eq("id", id).select("*").single();
  if (retry.error) throw retry.error;
  return { data: retry.data, error: null } as const;
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

export const supabaseProductAddonsApi: ProductAddonsApi = {
  async list({ productId }) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("product_addons")
      .select("*")
      .eq("product_id", productId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data as ProductAddonsRow[]).map(toAddon);
  },

  async create(input: CreateProductAddonInput) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const providerId = await currentUserId();
    const now = new Date().toISOString();

    if (!input.productId.trim()) throw new Error("productId is required");

    const insertRow = {
      provider_id: providerId,
      product_id: input.productId,
      name: input.name,
      description: input.description,
      pricing_type: typeof (input as any).pricingType === "string" ? ((input as any).pricingType as string) : undefined,
      applies_to_all_pricing_rows:
        typeof (input as any).appliesToAllPricingRows === "boolean" ? Boolean((input as any).appliesToAllPricingRows) : true,
      applicable_pricing_row_ids: Array.isArray((input as any).applicablePricingRowIds)
        ? ((input as any).applicablePricingRowIds as unknown[]).filter((x) => typeof x === "string")
        : undefined,
      base_price_cents: input.basePriceCents,
      min_price_cents: typeof input.minPriceCents === "number" ? input.minPriceCents : undefined,
      max_price_cents: typeof input.maxPriceCents === "number" ? input.maxPriceCents : undefined,
      dealer_cost_cents: typeof input.dealerCostCents === "number" ? input.dealerCostCents : undefined,
      active: typeof input.active === "boolean" ? input.active : true,
      updated_at: now,
    };

    const { data } = await insertWithColumnFallback(supabase, insertRow);
    return toAddon(data as ProductAddonsRow);
  },

  async update(id: string, patch) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    await currentUserId();
    const now = new Date().toISOString();

    const updateRow: Record<string, unknown> = { updated_at: now };
    if (typeof patch.name === "string") updateRow.name = patch.name;
    if (typeof patch.description === "string") updateRow.description = patch.description;
    if (typeof (patch as any).pricingType === "string") updateRow.pricing_type = (patch as any).pricingType;
    if (typeof (patch as any).appliesToAllPricingRows === "boolean") {
      updateRow.applies_to_all_pricing_rows = Boolean((patch as any).appliesToAllPricingRows);
    }
    if (Array.isArray((patch as any).applicablePricingRowIds)) {
      updateRow.applicable_pricing_row_ids = ((patch as any).applicablePricingRowIds as unknown[]).filter((x) => typeof x === "string");
    }
    if (typeof patch.basePriceCents === "number") updateRow.base_price_cents = patch.basePriceCents;
    if (typeof patch.minPriceCents === "number") updateRow.min_price_cents = patch.minPriceCents;
    if (typeof patch.maxPriceCents === "number") updateRow.max_price_cents = patch.maxPriceCents;
    if (typeof patch.dealerCostCents === "number") updateRow.dealer_cost_cents = patch.dealerCostCents;
    if (typeof patch.active === "boolean") updateRow.active = patch.active;

    const { data } = await updateWithColumnFallback(supabase, id, updateRow);
    return toAddon(data as ProductAddonsRow);
  },

  async remove(id: string) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    await currentUserId();
    const { error } = await supabase.from("product_addons").delete().eq("id", id);
    if (error) throw error;
  },
};
