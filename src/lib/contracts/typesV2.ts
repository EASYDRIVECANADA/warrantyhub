export type ContractStatusV2 = "draft" | "submitted" | "active" | "cancelled" | "expired";

export type ContractV2 = {
  id: string;
  dealershipId: string;
  providerEntityId?: string;
  productId: string;
  createdBy?: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail?: string;
  customerPhone?: string;
  vehicleVin: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleMileage?: number;
  contractPrice?: number;
  dealerCost?: number;
  status: ContractStatusV2;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateContractV2Input = {
  dealershipId: string;
  providerEntityId: string;
  productId: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail?: string;
  customerPhone?: string;
  vehicleVin: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleMileage?: number;
  contractPrice?: number;
  dealerCost?: number;
  startDate?: string;
  endDate?: string;
};
