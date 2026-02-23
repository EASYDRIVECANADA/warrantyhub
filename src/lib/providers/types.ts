export type ProviderPublic = {
  id: string;
  displayName?: string;
  companyName?: string;
  logoUrl?: string;
  termsText?: string;
};

export type UpdateMyProviderProfileInput = {
  displayName?: string;
  companyName?: string;
  logoUrl?: string | null;
  termsText?: string | null;
};
