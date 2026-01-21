export type TeamMemberRole = "ADMIN" | "PRODUCT_MANAGER" | "SUPPORT";

export type TeamMemberStatus = "INVITED" | "ACTIVE" | "DISABLED";

export type ProviderTeamMember = {
  id: string;
  providerId: string;
  email: string;
  role: TeamMemberRole;
  status: TeamMemberStatus;
  createdAt: string;
};

export type InviteTeamMemberInput = {
  email: string;
  role: TeamMemberRole;
};
