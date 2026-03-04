export type ProviderPublic = {
  id: string;
  displayName?: string;
  companyName?: string;
  logoUrl?: string;
  termsText?: string;
  termsConditionsText?: string;
  claimsRepairsText?: string;
  providerResponsibilityText?: string;
  limitationLiabilityText?: string;
  customerAcknowledgementText?: string;
};

export type UpdateMyProviderProfileInput = {
  displayName?: string;
  companyName?: string;
  logoUrl?: string | null;
  termsText?: string | null;
  termsConditionsText?: string | null;
  claimsRepairsText?: string | null;
  providerResponsibilityText?: string | null;
  limitationLiabilityText?: string | null;
  customerAcknowledgementText?: string | null;
};
