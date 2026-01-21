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
        return {
          id: b.id ?? crypto.randomUUID(),
          batchNumber: b.batchNumber ?? "",
          status: (b.status ?? "OPEN") as Batch["status"],
          paymentStatus: (b.paymentStatus ?? "UNPAID") as Batch["paymentStatus"],
          contractIds: Array.isArray(b.contractIds) ? (b.contractIds as string[]) : [],
          subtotalCents: typeof b.subtotalCents === "number" ? b.subtotalCents : 0,
          taxRate: typeof b.taxRate === "number" ? b.taxRate : 0,
          taxCents: typeof b.taxCents === "number" ? b.taxCents : 0,
          totalCents: typeof b.totalCents === "number" ? b.totalCents : 0,
          paidAt: typeof b.paidAt === "string" ? b.paidAt : undefined,
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
    const hasNonStatusEdits = Object.keys(patch).some((k) => k !== "status");
    if (hasNonStatusEdits && existing.status === "CLOSED") {
      throw new Error("Remittance is locked (submitted remittances cannot be edited)");
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
