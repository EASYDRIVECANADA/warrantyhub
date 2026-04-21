import type { Provider, ProviderMember, UpdateProviderInput } from "./typesV2";

export type ProvidersV2Api = {
  list(): Promise<Provider[]>;
  get(id: string): Promise<Provider | null>;
  getMyProvider(): Promise<Provider | null>;
  update(id: string, patch: UpdateProviderInput): Promise<Provider>;
  getMembers(providerId: string): Promise<ProviderMember[]>;
  addMember(providerId: string, userId: string, role: "admin" | "member"): Promise<ProviderMember>;
  removeMember(memberId: string): Promise<void>;
};
