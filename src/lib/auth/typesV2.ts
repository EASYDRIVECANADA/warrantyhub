import type { AppRole } from "../../integrations/supabase/types";

export type AuthUserV2 = {
  id: string;
  email: string;
  role: AppRole | null;
  dealershipId?: string;
  dealershipName?: string;
  dealershipRole?: "admin" | "employee";
  providerId?: string;
  providerName?: string;
  providerRole?: "admin" | "member";
};

export type AuthStateV2 = {
  user: AuthUserV2 | null;
  isLoading: boolean;
};
