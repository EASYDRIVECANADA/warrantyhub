export type RemittanceStatus = "DUE" | "PAID";

export type Remittance = {
  id: string;
  remittanceNumber: string;
  amountCents: number;
  createdAt: string;
  status: RemittanceStatus;
  updatedAt: string;
};

export type CreateRemittanceInput = {
  remittanceNumber: string;
  amountCents: number;
};
