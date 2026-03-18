export type Role = "UNASSIGNED" | "ADMIN" | "SUPER_ADMIN" | "DEALER_ADMIN" | "DEALER_EMPLOYEE" | "PROVIDER";

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  dealerId?: string;
  companyName?: string;
  dealerSubscriptionStatus?: string;
  dealerSubscriptionPlanKey?: "STANDARD" | "EARLY_ADOPTER" | null;
  dealerSubscriptionCurrentPeriodEnd?: string | null;
  dealerSubscriptionTrialEnd?: string | null;
  dealerContractFeeCents?: number | null;
};

export type AuthState = {
  user: AuthUser | null;
  isLoading: boolean;
};
