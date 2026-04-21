import type {
  Dealership,
  DealershipMember,
  CreateDealershipInput,
  UpdateDealershipInput,
} from "./types";

export type DealershipsApi = {
  list(): Promise<Dealership[]>;
  get(id: string): Promise<Dealership | null>;
  create(input: CreateDealershipInput): Promise<Dealership>;
  update(id: string, patch: UpdateDealershipInput): Promise<Dealership>;
  getMembers(dealershipId: string): Promise<DealershipMember[]>;
  addMember(dealershipId: string, userId: string, role: "admin" | "employee"): Promise<DealershipMember>;
  removeMember(memberId: string): Promise<void>;
  joinByAdminCode(adminCode: string): Promise<DealershipMember>;
  getMyDealership(): Promise<Dealership | null>;
};
