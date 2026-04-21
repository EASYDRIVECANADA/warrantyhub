import type { ContractV2, CreateContractV2Input, ContractStatusV2 } from "./typesV2";

export type ContractsV2Api = {
  list(): Promise<ContractV2[]>;
  listByDealership(dealershipId: string): Promise<ContractV2[]>;
  listByProvider(providerEntityId: string): Promise<ContractV2[]>;
  get(id: string): Promise<ContractV2 | null>;
  create(input: CreateContractV2Input): Promise<ContractV2>;
  updateStatus(id: string, status: ContractStatusV2): Promise<ContractV2>;
};
