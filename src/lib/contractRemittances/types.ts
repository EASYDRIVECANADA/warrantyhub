export type ContractRemittanceStatus = "pending" | "paid" | "overdue";

export type ContractRemittance = {
  id: string;
  contractId: string;
  amount: number;
  status: ContractRemittanceStatus;
  dueDate: string;
  paidDate?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateContractRemittanceInput = {
  contractId: string;
  amount: number;
  dueDate: string;
};
