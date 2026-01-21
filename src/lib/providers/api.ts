import type { ProviderPublic, UpdateMyProviderProfileInput } from "./types";

export type ProvidersApi = {
  listByIds(ids: string[]): Promise<ProviderPublic[]>;
  getMyProfile(): Promise<ProviderPublic | null>;
  updateMyProfile(patch: UpdateMyProviderProfileInput): Promise<ProviderPublic>;
};
