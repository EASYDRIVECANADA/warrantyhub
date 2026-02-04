export type Role = "UNASSIGNED" | "ADMIN" | "SUPER_ADMIN" | "DEALER_ADMIN" | "DEALER_EMPLOYEE" | "PROVIDER";

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  dealerId?: string;
  companyName?: string;
};

export type AuthState = {
  user: AuthUser | null;
  isLoading: boolean;
};
