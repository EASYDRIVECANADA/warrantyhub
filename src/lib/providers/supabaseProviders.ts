import { getSupabaseClient } from "../supabase/client";

import type { ProvidersApi } from "./api";
import type { ProviderPublic, UpdateMyProviderProfileInput } from "./types";

type ProfilesRow = {
  id: string;
  role: string;
  display_name?: string | null;
  company_name?: string | null;
  provider_logo_url?: string | null;
  provider_terms_text?: string | null;
  provider_terms_conditions_text?: string | null;
  provider_claims_repairs_text?: string | null;
  provider_responsibility_text?: string | null;
  provider_limitation_liability_text?: string | null;
  provider_customer_ack_text?: string | null;
};

function missingColumnFromSchemaCacheError(e: unknown): string | null {
  const msg = typeof (e as any)?.message === "string" ? String((e as any).message) : "";
  if (!msg) return null;

  // Supabase schema cache error
  const a = msg.match(/Could not find the '([^']+)' column/i);
  if (a && typeof a[1] === "string" && a[1].trim()) return a[1].trim();

  // Postgres missing column error
  // Examples:
  // - column profiles.provider_logo_url does not exist
  // - column "provider_logo_url" does not exist
  const b = msg.match(/column\s+([a-zA-Z0-9_]+\.)?"?([a-zA-Z0-9_]+)"?\s+does\s+not\s+exist/i);
  if (b && typeof b[2] === "string" && b[2].trim()) return b[2].trim();

  return null;
}

async function selectProfilesWithFallback(
  supabase: any,
  select: string,
  build: (q: any) => any,
): Promise<{ data: any; error: any }>{
  let currentSelect = select;
  for (let i = 0; i < 5; i += 1) {
    const attempt = await build(supabase.from("profiles").select(currentSelect));
    if (!attempt?.error) return attempt;

    const col = missingColumnFromSchemaCacheError(attempt.error);
    if (!col) return attempt;

    const next = currentSelect
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && s !== col)
      .join(", ");

    if (!next || next === currentSelect) return attempt;
    currentSelect = next;
  }

  return build(supabase.from("profiles").select(currentSelect));
}

async function updateProfilesWithFallback(
  supabase: any,
  uid: string,
  updateRow: Record<string, unknown>,
  select: string,
): Promise<{ data: any; error: any }>{
  let currentUpdate = { ...updateRow };
  let currentSelect = select;

  for (let i = 0; i < 5; i += 1) {
    const attempt = await supabase.from("profiles").update(currentUpdate).eq("id", uid).select(currentSelect).single();
    if (!attempt?.error) return attempt;

    const col = missingColumnFromSchemaCacheError(attempt.error);
    if (!col) return attempt;

    if (col in currentUpdate) delete (currentUpdate as any)[col];

    const nextSelect = currentSelect
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && s !== col)
      .join(", ");
    if (nextSelect && nextSelect !== currentSelect) currentSelect = nextSelect;
  }

  return supabase.from("profiles").update(currentUpdate).eq("id", uid).select(currentSelect).single();
}

function toProviderPublic(r: ProfilesRow): ProviderPublic {
  return {
    id: r.id,
    displayName: r.display_name ?? undefined,
    companyName: r.company_name ?? undefined,
    logoUrl: r.provider_logo_url ?? undefined,
    termsText: r.provider_terms_text ?? undefined,
    termsConditionsText: r.provider_terms_conditions_text ?? undefined,
    claimsRepairsText: r.provider_claims_repairs_text ?? undefined,
    providerResponsibilityText: r.provider_responsibility_text ?? undefined,
    limitationLiabilityText: r.provider_limitation_liability_text ?? undefined,
    customerAcknowledgementText: r.provider_customer_ack_text ?? undefined,
  };
}

async function currentUserId(): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const id = data.session?.user?.id;
  if (!id) throw new Error("Not authenticated");
  return id;
}

export const supabaseProvidersApi: ProvidersApi = {
  async listByIds(ids) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const wanted = Array.from(new Set(ids.map((x) => x.trim()).filter(Boolean)));
    if (wanted.length === 0) return [];

    const { data, error } = await selectProfilesWithFallback(
      supabase,
      "id, role, display_name, company_name, provider_logo_url, provider_terms_text, provider_terms_conditions_text, provider_claims_repairs_text, provider_responsibility_text, provider_limitation_liability_text, provider_customer_ack_text",
      (q) => q.in("id", wanted).eq("role", "PROVIDER"),
    );

    if (error) throw error;
    return (data as ProfilesRow[]).map(toProviderPublic);
  },

  async getMyProfile() {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const uid = await currentUserId();

    const { data, error } = await selectProfilesWithFallback(
      supabase,
      "id, role, display_name, company_name, provider_logo_url, provider_terms_text, provider_terms_conditions_text, provider_claims_repairs_text, provider_responsibility_text, provider_limitation_liability_text, provider_customer_ack_text",
      (q) => q.eq("id", uid).maybeSingle(),
    );

    if (error) throw error;
    if (!data) return null;
    return toProviderPublic(data as ProfilesRow);
  },

  async updateMyProfile(patch: UpdateMyProviderProfileInput) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const uid = await currentUserId();

    const updateRow: Record<string, unknown> = {};
    if (typeof patch.displayName === "string") updateRow.display_name = patch.displayName.trim() || null;
    if (typeof patch.companyName === "string") updateRow.company_name = patch.companyName.trim() || null;
    if (typeof patch.logoUrl === "string") updateRow.provider_logo_url = patch.logoUrl.trim() || null;
    if (patch.logoUrl === null) updateRow.provider_logo_url = null;
    if (typeof patch.termsText === "string") updateRow.provider_terms_text = patch.termsText.trim() || null;
    if (patch.termsText === null) updateRow.provider_terms_text = null;

    if (typeof patch.termsConditionsText === "string") updateRow.provider_terms_conditions_text = patch.termsConditionsText.trim() || null;
    if (patch.termsConditionsText === null) updateRow.provider_terms_conditions_text = null;

    if (typeof patch.claimsRepairsText === "string") updateRow.provider_claims_repairs_text = patch.claimsRepairsText.trim() || null;
    if (patch.claimsRepairsText === null) updateRow.provider_claims_repairs_text = null;

    if (typeof patch.providerResponsibilityText === "string") updateRow.provider_responsibility_text = patch.providerResponsibilityText.trim() || null;
    if (patch.providerResponsibilityText === null) updateRow.provider_responsibility_text = null;

    if (typeof patch.limitationLiabilityText === "string") updateRow.provider_limitation_liability_text = patch.limitationLiabilityText.trim() || null;
    if (patch.limitationLiabilityText === null) updateRow.provider_limitation_liability_text = null;

    if (typeof patch.customerAcknowledgementText === "string") updateRow.provider_customer_ack_text = patch.customerAcknowledgementText.trim() || null;
    if (patch.customerAcknowledgementText === null) updateRow.provider_customer_ack_text = null;

    const { data, error } = await updateProfilesWithFallback(
      supabase,
      uid,
      updateRow,
      "id, role, display_name, company_name, provider_logo_url, provider_terms_text, provider_terms_conditions_text, provider_claims_repairs_text, provider_responsibility_text, provider_limitation_liability_text, provider_customer_ack_text",
    );

    if (error) throw error;
    return toProviderPublic(data as ProfilesRow);
  },
};
