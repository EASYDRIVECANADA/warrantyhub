import type { InviteTeamMemberInput, ProviderTeamMember, TeamMemberRole, TeamMemberStatus } from "./types";

export interface ProviderTeamApi {
  list(): Promise<ProviderTeamMember[]>;
  invite(input: InviteTeamMemberInput): Promise<ProviderTeamMember>;
  update(
    id: string,
    patch: Partial<Pick<ProviderTeamMember, "role" | "status">>,
  ): Promise<ProviderTeamMember>;
  remove(id: string): Promise<void>;
}

export type { InviteTeamMemberInput, ProviderTeamMember, TeamMemberRole, TeamMemberStatus };
