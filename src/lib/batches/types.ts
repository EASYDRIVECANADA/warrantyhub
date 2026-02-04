export type BatchStatus = "OPEN" | "CLOSED";

export type BatchPaymentStatus = "UNPAID" | "PAID";

export type RemittanceWorkflowStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "PAID";

export type PaymentMethod = "EFT" | "CHEQUE";

export type Batch = {
  id: string;
  batchNumber: string;
  status: BatchStatus;
  paymentStatus: BatchPaymentStatus;
  remittanceStatus?: RemittanceWorkflowStatus;
  contractIds: string[];
  subtotalCents: number;
  taxRate: number;
  taxCents: number;
  totalCents: number;
  paidAt?: string;
  dealerUserId?: string;
  dealerEmail?: string;
  providerId?: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedByUserId?: string;
  reviewedByEmail?: string;
  rejectionReason?: string;
  adminNotes?: string;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  paymentDate?: string;
  paidByUserId?: string;
  paidByEmail?: string;
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
