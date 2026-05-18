import { describe, expect, it } from "vitest";

import router from "../app/AppRouter.tsx?raw";
import adminDealerTools from "../../supabase/functions/admin-dealer-tools/index.ts?raw";
import dealerCreateContract from "../../supabase/functions/dealer-create-contract/index.ts?raw";
import easyDriveBootstrap from "../../supabase/migrations/20260518010000_bootstrap_easydrive_super_admin.sql?raw";

describe("Bridge Warranty platform hardening source checks", () => {
  it("keeps the primary admin dealership route on the full management page", () => {
    const routeStart = router.indexOf('path="/admin/dealerships"');
    const routeEnd = router.indexOf('path="/admin/providers"', routeStart);
    const routeSource = router.slice(routeStart, routeEnd);

    expect(routeSource).toContain("<AdminDealershipsPage />");
    expect(routeSource).not.toContain("<AdminDealershipsPage2 />");
  });

  it("keeps admin dealer member actions synchronized across legacy and V2 tables", () => {
    expect(adminDealerTools).toContain(".from(\"dealerships\")");
    expect(adminDealerTools).toContain(".from(\"dealership_members\")");
    expect(adminDealerTools).toContain(".from(\"user_roles\")");
    expect(adminDealerTools).toContain("dealership_admin");
    expect(adminDealerTools).toContain("dealership_employee");
  });

  it("allows super admin assertions from both legacy profiles and V2 user_roles", () => {
    expect(adminDealerTools).toContain("role === \"SUPER_ADMIN\"");
    expect(adminDealerTools).toContain("userRole === \"super_admin\"");
    expect(adminDealerTools).toContain(".from(\"user_roles\")");
  });

  it("does not read .data from resolved dealer rows in dealer contract creation", () => {
    expect(dealerCreateContract).not.toContain("(dealerRow.data as any)");
  });

  it("bootstraps the Easy Drive account as legacy and V2 super admin", () => {
    expect(easyDriveBootstrap).toContain("info@easydrivecanada.com");
    expect(easyDriveBootstrap).toContain("'SUPER_ADMIN'");
    expect(easyDriveBootstrap).toContain("'super_admin'::public.app_role");
  });
});
