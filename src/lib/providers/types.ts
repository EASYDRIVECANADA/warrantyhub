export type ProviderPublic = {
  id: string;
  displayName?: string;
  companyName?: string;
};

export type UpdateMyProviderProfileInput = {
  displayName?: string;
  companyName?: string;
};
