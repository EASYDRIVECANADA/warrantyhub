export type ContractStatus = "DRAFT" | "SOLD" | "REMITTED" | "PAID";

export function warrantyIdFromContractId(id: string) {
  const compact = id.replace(/-/g, "").toUpperCase();
  return `WH-${compact.slice(0, 12)}`;
}

export type Contract = {
  id: string;
  warrantyId: string;
  contractNumber: string;
  customerName: string;
  providerId?: string;
  productId?: string;
  createdByUserId?: string;
  createdByEmail?: string;
  soldByUserId?: string;
  soldByEmail?: string;
  soldAt?: string;
  remittedByUserId?: string;
  remittedByEmail?: string;
  remittedAt?: string;
  paidByUserId?: string;
  paidByEmail?: string;
  paidAt?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerCity?: string;
  customerProvince?: string;
  customerPostalCode?: string;
  vin?: string;
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleTrim?: string;
  vehicleMileageKm?: number;
  vehicleBodyClass?: string;
  vehicleEngine?: string;
  vehicleTransmission?: string;
  createdAt: string;
  status: ContractStatus;
  updatedAt: string;
};

export type CreateContractInput = {
  contractNumber: string;
  customerName: string;
  providerId?: string;
  productId?: string;
  createdByUserId?: string;
  createdByEmail?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerCity?: string;
  customerProvince?: string;
  customerPostalCode?: string;
  vin?: string;
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleTrim?: string;
  vehicleMileageKm?: number;
  vehicleBodyClass?: string;
  vehicleEngine?: string;
  vehicleTransmission?: string;
};
