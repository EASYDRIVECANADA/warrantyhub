import { describe, expect, it } from "vitest";

import dealerTeamToolsSource from "../../supabase/functions/dealer-team-tools/index.ts?raw";

describe("dealer team tools source", () => {
  it("exposes a service-role team listing for active dealership members", () => {
    expect(dealerTeamToolsSource).toContain('"list_members"');
    expect(dealerTeamToolsSource).toContain("async function assertDealerMember");
    expect(dealerTeamToolsSource).toContain("profiles:profiles(email, display_name, first_name, last_name, phone)");
    expect(dealerTeamToolsSource).toContain("return json(200, { members");
  });

  it("does not use single-row membership reads that crash when duplicate memberships exist", () => {
    const assertStart = dealerTeamToolsSource.indexOf("async function assertDealerMember");
    const assertEnd = dealerTeamToolsSource.indexOf("Deno.serve", assertStart);
    const assertSource = dealerTeamToolsSource.slice(assertStart, assertEnd);

    expect(assertSource).toContain(".limit(1)");
    expect(assertSource).not.toContain(".maybeSingle()");
  });
});
