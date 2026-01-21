export type Role = "UNASSIGNED" | "ADMIN" | "SUPER_ADMIN" | "DEALER" | "DEALER_ADMIN" | "PROVIDER";

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
};

export type AuthState = {
  user: AuthUser | null;
  isLoading: boolean;
};
