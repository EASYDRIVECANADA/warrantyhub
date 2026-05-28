import { describe, expect, it } from "vitest";

import appRouterSource from "../app/AppRouter.tsx?raw";
import dashboardLayoutSource from "../components/dashboard/DashboardLayout.tsx?raw";

describe("dealership team route source", () => {
  it("lets employees view the read-only team page but keeps configuration admin-only", () => {
    expect(appRouterSource).toContain('path="/dealership/settings/team"');
    expect(appRouterSource).toContain('<ProtectedRouteV2 allowedRoles={["dealership_admin", "dealership_employee"]}>');
    expect(dashboardLayoutSource).toContain('{ label: "Configuration", href: "/dealership/settings/configuration", icon: Settings, allowedRoles: ["dealership_admin"] }');
    expect(dashboardLayoutSource).toContain('{ label: "Team", href: "/dealership/settings/team", icon: Users, allowedRoles: ["dealership_admin", "dealership_employee"] }');
  });
});
