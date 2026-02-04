import type { Contract, CreateContractInput } from "./types";

export type ContractsApi = {
  list(): Promise<Contract[]>;
  get(id: string): Promise<Contract | null>;
  create(input: CreateContractInput): Promise<Contract>;
  update(
    id: string,
    patch: Partial<
      Pick<
        Contract,
        | "status"
        | "createdByUserId"
        | "createdByEmail"
        | "soldByUserId"
        | "soldByEmail"
        | "soldAt"
        | "remittedByUserId"
        | "remittedByEmail"
        | "remittedAt"
        | "paidByUserId"
        | "paidByEmail"
        | "paidAt"
        | "providerId"
        | "productId"
        | "customerName"
        | "customerEmail"
        | "customerPhone"
        | "customerAddress"
        | "customerCity"
        | "customerProvince"
        | "customerPostalCode"
        | "vin"
        | "vehicleYear"
        | "vehicleMake"
        | "vehicleModel"
        | "vehicleTrim"
        | "vehicleMileageKm"
        | "vehicleBodyClass"
        | "vehicleEngine"
        | "vehicleTransmission"
      >
    > & {
      productPricingId?: string | null;
      pricingTermMonths?: number | null;
      pricingTermKm?: number | null;
      pricingDeductibleCents?: number | null;
      pricingBasePriceCents?: number | null;
      pricingDealerCostCents?: number | null;
    },
  ): Promise<Contract>;
};
