import type { CreateRemittanceInput, Remittance } from "./types";

export type RemittancesApi = {
  list(): Promise<Remittance[]>;
  create(input: CreateRemittanceInput): Promise<Remittance>;
  update(id: string, patch: Partial<Pick<Remittance, "status">>): Promise<Remittance>;
};
