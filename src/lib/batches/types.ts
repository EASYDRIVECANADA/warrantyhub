export type BatchStatus = "OPEN" | "CLOSED";

export type BatchPaymentStatus = "UNPAID" | "PAID";

export type Batch = {
  id: string;
  batchNumber: string;
  status: BatchStatus;
  paymentStatus: BatchPaymentStatus;
  contractIds: string[];
  subtotalCents: number;
  taxRate: number;
  taxCents: number;
  totalCents: number;
  paidAt?: string;
  createdAt: string;
};

export type CreateBatchInput = {
  batchNumber: string;
};

export type CreateRemittanceBatchInput = {
  batchNumber: string;
  contractIds: string[];
  subtotalCents: number;
  taxRate: number;
  taxCents: number;
  totalCents: number;
};
