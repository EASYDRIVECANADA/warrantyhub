export type ProviderStatus = "pending" | "approved" | "suspended";

export type Provider = {
  id: string;
  companyName: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  regionsServed?: string[];
  description?: string;
  logoUrl?: string;
  status: ProviderStatus;
  createdAt: string;
  updatedAt: string;
};

export type ProviderMember = {
  id: string;
  userId: string;
  providerId: string;
  role: "admin" | "member";
  createdAt: string;
};

export type UpdateProviderInput = Partial<
  Pick<Provider, "companyName" | "contactEmail" | "contactPhone" | "address" | "description" | "logoUrl"> & {
    regionsServed?: string[];
  }
>;
