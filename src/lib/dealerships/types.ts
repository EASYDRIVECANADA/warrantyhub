export type DealershipStatus = "pending" | "approved" | "suspended";

export type Dealership = {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  province?: string;
  licenseNumber?: string;
  adminCode: string;
  complianceInfo?: Record<string, unknown>;
  status: DealershipStatus;
  subscriptionStatus?: string;
  subscriptionPlanKey?: string;
  createdAt: string;
  updatedAt: string;
};

export type DealershipMember = {
  id: string;
  userId: string;
  dealershipId: string;
  role: "admin" | "employee";
  createdAt: string;
};

export type CreateDealershipInput = {
  name: string;
  phone?: string;
  address?: string;
  province?: string;
  licenseNumber?: string;
};

export type UpdateDealershipInput = Partial<
  Pick<Dealership, "name" | "phone" | "address" | "province" | "licenseNumber"> & {
    complianceInfo?: Record<string, unknown>;
  }
>;
