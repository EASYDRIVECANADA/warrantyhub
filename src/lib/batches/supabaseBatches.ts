import { getSupabaseClient } from "../supabase/client";

import type { BatchesApi } from "./api";
import type { Batch, CreateBatchInput, CreateRemittanceBatchInput, BatchPaymentStatus, BatchStatus } from "./types";

type BatchesRow = {
  id: string;
  batch_number: string;
  status: BatchStatus;
  payment_status?: BatchPaymentStatus | null;
  contract_ids?: string[] | null;
  subtotal_cents?: number | null;
  tax_rate?: number | null;
  tax_cents?: number | null;
  total_cents?: number | null;
  paid_at?: string | null;
  created_at: string;
};

function toBatch(r: BatchesRow): Batch {
  return {
    id: r.id,
    batchNumber: r.batch_number,
    status: r.status,
    paymentStatus: (r.payment_status ?? "UNPAID") as BatchPaymentStatus,
    contractIds: (r.contract_ids ?? []) as string[],
    subtotalCents: typeof r.subtotal_cents === "number" ? r.subtotal_cents : 0,
    taxRate: typeof r.tax_rate === "number" ? r.tax_rate : 0,
    taxCents: typeof r.tax_cents === "number" ? r.tax_cents : 0,
    totalCents: typeof r.total_cents === "number" ? r.total_cents : 0,
    paidAt: r.paid_at ?? undefined,
    createdAt: r.created_at,
  };
}

export const supabaseBatchesApi: BatchesApi = {
  async list() {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("batches")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data as BatchesRow[]).map(toBatch);
  },

  async create(input: CreateBatchInput) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("batches")
      .insert({
        batch_number: input.batchNumber,
        status: "OPEN" satisfies BatchStatus,
        payment_status: "UNPAID" satisfies BatchPaymentStatus,
        contract_ids: [],
        subtotal_cents: 0,
        tax_rate: 0,
        tax_cents: 0,
        total_cents: 0,
      })
      .select("*")
      .single();

    if (error) throw error;
    return toBatch(data as BatchesRow);
  },

  async createRemittanceBatch(input: CreateRemittanceBatchInput) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("batches")
      .insert({
        batch_number: input.batchNumber,
        status: "CLOSED" satisfies BatchStatus,
        payment_status: "UNPAID" satisfies BatchPaymentStatus,
        contract_ids: input.contractIds,
        subtotal_cents: input.subtotalCents,
        tax_rate: input.taxRate,
        tax_cents: input.taxCents,
        total_cents: input.totalCents,
      })
      .select("*")
      .single();

    if (error) throw error;
    return toBatch(data as BatchesRow);
  },

  async update(id: string, patch) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const currentRes = await supabase
      .from("batches")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (currentRes.error) throw currentRes.error;
    if (!currentRes.data) throw new Error("Batch not found");
    const current = toBatch(currentRes.data as BatchesRow);

    const hasNonStatusEdits = Object.keys(patch).some((k) => k !== "status");
    if (hasNonStatusEdits && current.status === "CLOSED") {
      throw new Error("Remittance is locked (submitted remittances cannot be edited)");
    }

    const updateRow: Record<string, unknown> = {};
    if (typeof patch.status === "string") updateRow.status = patch.status;
    if (Array.isArray(patch.contractIds)) updateRow.contract_ids = patch.contractIds;
    if (typeof patch.totalCents === "number") updateRow.total_cents = patch.totalCents;
    if (typeof patch.paymentStatus === "string") updateRow.payment_status = patch.paymentStatus;
    if (Object.prototype.hasOwnProperty.call(patch, "paidAt")) {
      if (typeof patch.paidAt === "string") updateRow.paid_at = patch.paidAt;
      else updateRow.paid_at = null;
    }

    const { data, error } = await supabase.from("batches").update(updateRow).eq("id", id).select("*").single();
    if (error) throw error;
    return toBatch(data as BatchesRow);
  },
};
