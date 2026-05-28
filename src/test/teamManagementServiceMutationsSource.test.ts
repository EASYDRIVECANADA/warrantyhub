import { describe, expect, it } from "vitest";

import teamPageSource from "../pages/dealership/settings/TeamManagementPage.tsx?raw";
import dealerTeamToolsSource from "../../supabase/functions/dealer-team-tools/index.ts?raw";

describe("team management service mutations source", () => {
  it("uses dealer-team-tools for linking existing users and changing roles", () => {
    expect(dealerTeamToolsSource).toContain('"link_existing_member"');
    expect(dealerTeamToolsSource).toContain("syncDealershipUserRole");
    expect(dealerTeamToolsSource).toContain("dealershipMemberId");

    expect(teamPageSource).toContain('action: "link_existing_member"');
    expect(teamPageSource).toContain('action: "update_employee"');
    expect(teamPageSource).toContain("dealershipMemberId");
    expect(teamPageSource).not.toContain('supabase.from("user_roles").delete()');
    expect(teamPageSource).not.toContain('supabase.from("profiles").update({ role');
  });

  it("does not leave the team page loading forever when no dealership is resolved", () => {
    expect(teamPageSource).toContain("if (!dealershipId) {");
    expect(teamPageSource).toContain("setLoading(false)");
  });
});
