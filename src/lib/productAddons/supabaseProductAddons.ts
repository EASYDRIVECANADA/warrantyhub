import { getSupabaseClient } from "../supabase/client";

import type { ProductAddonsApi } from "./api";
import type { CreateProductAddonInput, ProductAddon } from "./types";

type ProductAddonsRow = {
  id: string;
  provider_id: string;
  product_id: string;
  name: string;
  description?: string | null;
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
  return {
    id: r.id,
    providerId: r.provider_id,
    productId: r.product_id,
    name: r.name,
    description: r.description ?? undefined,
    basePriceCents: r.base_price_cents,
    minPriceCents: min,
    maxPriceCents: max,
    dealerCostCents: typeof r.dealer_cost_cents === "number" ? r.dealer_cost_cents : undefined,
    active: r.active,
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
      base_price_cents: input.basePriceCents,
      min_price_cents: typeof input.minPriceCents === "number" ? input.minPriceCents : undefined,
      max_price_cents: typeof input.maxPriceCents === "number" ? input.maxPriceCents : undefined,
      dealer_cost_cents: typeof input.dealerCostCents === "number" ? input.dealerCostCents : undefined,
      active: typeof input.active === "boolean" ? input.active : true,
      updated_at: now,
    };

    const { data, error } = await supabase.from("product_addons").insert(insertRow).select("*").single();
    if (error) throw error;
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
    if (typeof patch.basePriceCents === "number") updateRow.base_price_cents = patch.basePriceCents;
    if (typeof patch.minPriceCents === "number") updateRow.min_price_cents = patch.minPriceCents;
    if (typeof patch.maxPriceCents === "number") updateRow.max_price_cents = patch.maxPriceCents;
    if (typeof patch.dealerCostCents === "number") updateRow.dealer_cost_cents = patch.dealerCostCents;
    if (typeof patch.active === "boolean") updateRow.active = patch.active;

    const { data, error } = await supabase.from("product_addons").update(updateRow).eq("id", id).select("*").single();
    if (error) throw error;
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
