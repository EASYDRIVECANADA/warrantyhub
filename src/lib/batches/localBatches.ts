import type { BatchesApi } from "./api";
import type { Batch, CreateBatchInput, CreateRemittanceBatchInput } from "./types";

const STORAGE_KEY = "warrantyhub.local.batches";

function read(): Batch[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<Batch>[];
    return parsed
      .map((b): Batch => {
        const createdAt = b.createdAt ?? new Date().toISOString();
        const derivedStatus = (b.status ?? "OPEN") as Batch["status"];
        const derivedPaymentStatus = (b.paymentStatus ?? "UNPAID") as Batch["paymentStatus"];
        const derivedRemittanceStatus = (() => {
          const s = (b.remittanceStatus ?? "").toString();
          if (s === "DRAFT" || s === "SUBMITTED" || s === "APPROVED" || s === "REJECTED" || s === "PAID") return s as Batch["remittanceStatus"];
          if (derivedPaymentStatus === "PAID") return "PAID";
          if (derivedStatus === "CLOSED") return "SUBMITTED";
          return "DRAFT";
        })();
        return {
          id: b.id ?? crypto.randomUUID(),
          batchNumber: b.batchNumber ?? "",
          status: derivedStatus,
          paymentStatus: derivedPaymentStatus,
          remittanceStatus: derivedRemittanceStatus,
          contractIds: Array.isArray(b.contractIds) ? (b.contractIds as string[]) : [],
          subtotalCents: typeof b.subtotalCents === "number" ? b.subtotalCents : 0,
          taxRate: typeof b.taxRate === "number" ? b.taxRate : 0,
          taxCents: typeof b.taxCents === "number" ? b.taxCents : 0,
          totalCents: typeof b.totalCents === "number" ? b.totalCents : 0,
          paidAt: typeof b.paidAt === "string" ? b.paidAt : undefined,
          dealerUserId: typeof b.dealerUserId === "string" ? b.dealerUserId : undefined,
          dealerEmail: typeof b.dealerEmail === "string" ? b.dealerEmail : undefined,
          providerId: typeof b.providerId === "string" ? b.providerId : undefined,
          submittedAt: typeof b.submittedAt === "string" ? b.submittedAt : undefined,
          reviewedAt: typeof b.reviewedAt === "string" ? b.reviewedAt : undefined,
          reviewedByUserId: typeof b.reviewedByUserId === "string" ? b.reviewedByUserId : undefined,
          reviewedByEmail: typeof b.reviewedByEmail === "string" ? b.reviewedByEmail : undefined,
          rejectionReason: typeof b.rejectionReason === "string" ? b.rejectionReason : undefined,
          adminNotes: typeof b.adminNotes === "string" ? b.adminNotes : undefined,
          paymentMethod: typeof (b as any).paymentMethod === "string" ? ((b as any).paymentMethod as any) : undefined,
          paymentReference: typeof b.paymentReference === "string" ? b.paymentReference : undefined,
          paymentDate: typeof b.paymentDate === "string" ? b.paymentDate : undefined,
          paidByUserId: typeof b.paidByUserId === "string" ? b.paidByUserId : undefined,
          paidByEmail: typeof b.paidByEmail === "string" ? b.paidByEmail : undefined,
          createdAt,
        };
      })
      .filter((b) => b.batchNumber.trim());
  } catch {
    return [];
  }
}

function write(items: Batch[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export const localBatchesApi: BatchesApi = {
  async list() {
    return read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async create(input: CreateBatchInput) {
    const now = new Date().toISOString();
    const item: Batch = {
      id: crypto.randomUUID(),
      batchNumber: input.batchNumber,
      status: "OPEN",
      paymentStatus: "UNPAID",
      remittanceStatus: "DRAFT",
      contractIds: [],
      subtotalCents: 0,
      taxRate: 0,
      taxCents: 0,
      totalCents: 0,
      createdAt: now,
    };

    const next = [item, ...read()];
    write(next);
    return item;
  },

  async createRemittanceBatch(input: CreateRemittanceBatchInput) {
    const now = new Date().toISOString();
    const item: Batch = {
      id: crypto.randomUUID(),
      batchNumber: input.batchNumber,
      status: "CLOSED",
      paymentStatus: "UNPAID",
      remittanceStatus: "SUBMITTED",
      submittedAt: now,
      contractIds: input.contractIds,
      subtotalCents: input.subtotalCents,
      taxRate: input.taxRate,
      taxCents: input.taxCents,
      totalCents: input.totalCents,
      createdAt: now,
    };

    const next = [item, ...read()];
    write(next);
    return item;
  },

  async update(id: string, patch) {
    const current = read();
    const idx = current.findIndex((b) => b.id === id);
    if (idx === -1) throw new Error("Batch not found");

    const existing = current[idx]!;
    const nonEditableWhenSubmitted = new Set(["contractIds", "totalCents", "taxRate", "taxCents", "subtotalCents"]);
    const hasDealerEdits = Object.keys(patch).some((k) => nonEditableWhenSubmitted.has(k));
    const currentWorkflow = (existing.remittanceStatus ?? (existing.status === "CLOSED" ? "SUBMITTED" : "DRAFT")) as string;
    if (hasDealerEdits && (currentWorkflow === "SUBMITTED" || currentWorkflow === "APPROVED" || currentWorkflow === "PAID")) {
      throw new Error("Remittance is locked (submitted remittances cannot be edited)");
    }

    const hasPaymentEdits = Object.keys(patch).some((k) => k === "paymentMethod" || k === "paymentReference" || k === "paymentDate" || k === "paidAt");
    if (hasPaymentEdits && currentWorkflow === "PAID") {
      throw new Error("Remittance is locked (paid remittances cannot be edited)");
    }

    const nextItem: Batch = {
      ...existing,
      ...patch,
    };

    const next = [...current];
    next[idx] = nextItem;
    write(next);
    return nextItem;
  },
};
