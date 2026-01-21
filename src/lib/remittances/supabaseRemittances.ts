import { getSupabaseClient } from "../supabase/client";

import type { RemittancesApi } from "./api";
import type { CreateRemittanceInput, Remittance, RemittanceStatus } from "./types";

type RemittancesRow = {
  id: string;
  remittance_number: string;
  amount_cents: number;
  created_at: string;
  status?: string | null;
  updated_at?: string | null;
};

function toRemittance(r: RemittancesRow): Remittance {
  const createdAt = r.created_at;
  return {
    id: r.id,
    remittanceNumber: r.remittance_number,
    amountCents: r.amount_cents,
    createdAt,
    status: (r.status ?? "DUE") as RemittanceStatus,
    updatedAt: r.updated_at ?? createdAt,
  };
}

function nextStatus(current: RemittanceStatus): RemittanceStatus | null {
  if (current === "DUE") return "PAID";
  return null;
}

export const supabaseRemittancesApi: RemittancesApi = {
  async list() {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("remittances")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data as RemittancesRow[]).map(toRemittance);
  },

  async create(input: CreateRemittanceInput) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const now = new Date().toISOString();

    const baseInsert = {
      remittance_number: input.remittanceNumber,
      amount_cents: input.amountCents,
    };

    const extendedInsert = {
      ...baseInsert,
      status: "DUE",
      updated_at: now,
    };

    const attempt = await supabase.from("remittances").insert(extendedInsert).select("*").single();
    if (!attempt.error) return toRemittance(attempt.data as RemittancesRow);

    const fallback = await supabase.from("remittances").insert(baseInsert).select("*").single();
    if (fallback.error) throw fallback.error;
    return toRemittance(fallback.data as RemittancesRow);
  },

  async update(id: string, patch: Partial<Pick<Remittance, "status">>) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const now = new Date().toISOString();

    const currentRes = await supabase
      .from("remittances")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (currentRes.error) throw currentRes.error;
    if (!currentRes.data) throw new Error("Remittance not found");
    const current = toRemittance(currentRes.data as RemittancesRow);

    if (typeof patch.status === "string") {
      const desired = patch.status as RemittanceStatus;
      if (desired !== current.status) {
        const allowed = nextStatus(current.status);
        if (allowed !== desired) throw new Error("Invalid status transition");
      }
    }

    const updateRow: Record<string, unknown> = { updated_at: now };
    if (typeof patch.status === "string") updateRow.status = patch.status;

    const attempt = await supabase.from("remittances").update(updateRow).eq("id", id).select("*").single();
    if (!attempt.error) return toRemittance(attempt.data as RemittancesRow);

    if (typeof patch.status === "string") {
      return { ...current, status: patch.status as RemittanceStatus, updatedAt: now };
    }
    return { ...current, updatedAt: now };
  },
};
