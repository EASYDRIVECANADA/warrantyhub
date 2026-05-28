import { describe, expect, it } from "vitest";

import dashboardLayoutSource from "../components/dashboard/DashboardLayout.tsx?raw";

describe("dashboard layout dealership role source", () => {
  it("uses actual dealership membership role for the dealer portal shell label", () => {
    expect(dashboardLayoutSource).toContain("useDealership");
    expect(dashboardLayoutSource).toContain("dealershipRoleLabel");
    expect(dashboardLayoutSource).toContain("memberRole === \"admin\" || (!memberRole && role === \"DEALER_ADMIN\") ? \"Dealer Admin\" : \"Dealer Staff\"");
    expect(dashboardLayoutSource).toContain("return dealershipRoleLabel");
    expect(dashboardLayoutSource).toContain("effectiveDealerRole");
    expect(dashboardLayoutSource).toContain("memberRole === \"admin\"");
    expect(dashboardLayoutSource).toContain("? \"dealership_admin\"");
    expect(dashboardLayoutSource).toContain("? \"dealership_employee\"");
    expect(dashboardLayoutSource).toContain("allowedRoles.includes(effectiveDealerRole)");
  });
});
