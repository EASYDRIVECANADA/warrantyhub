import type { ContractRemittance, ContractRemittanceStatus, CreateContractRemittanceInput } from "./types";

export type ContractRemittancesApi = {
  listByContract(contractId: string): Promise<ContractRemittance[]>;
  listByDealership(dealershipId: string): Promise<ContractRemittance[]>;
  listByProvider(providerEntityId: string): Promise<ContractRemittance[]>;
  create(input: CreateContractRemittanceInput): Promise<ContractRemittance>;
  updateStatus(id: string, status: ContractRemittanceStatus, paidDate?: string): Promise<ContractRemittance>;
};
