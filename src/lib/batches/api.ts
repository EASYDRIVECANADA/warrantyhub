import type { Batch, CreateBatchInput, CreateRemittanceBatchInput } from "./types";

export type BatchesApi = {
  list(): Promise<Batch[]>;
  create(input: CreateBatchInput): Promise<Batch>;
  createRemittanceBatch(input: CreateRemittanceBatchInput): Promise<Batch>;
  update(
    id: string,
    patch: Partial<
      Pick<
        Batch,
        | "status"
        | "contractIds"
        | "totalCents"
        | "paymentStatus"
        | "paidAt"
        | "remittanceStatus"
        | "dealerUserId"
        | "dealerEmail"
        | "providerId"
        | "submittedAt"
        | "reviewedAt"
        | "reviewedByUserId"
        | "reviewedByEmail"
        | "rejectionReason"
        | "adminNotes"
        | "paymentMethod"
        | "paymentReference"
        | "paymentDate"
        | "paidByUserId"
        | "paidByEmail"
      >
    >,
  ): Promise<Batch>;
};
