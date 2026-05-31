import { describe, expect, it } from "vitest";

import router from "../app/AppRouter.tsx?raw";
import adminDealerTools from "../../supabase/functions/admin-dealer-tools/index.ts?raw";
import dealerCreateContract from "../../supabase/functions/dealer-create-contract/index.ts?raw";
import easyDriveBootstrap from "../../supabase/migrations/20260518010000_bootstrap_easydrive_super_admin.sql?raw";
import schema from "../../supabase/schema.sql?raw";
import adminDashboardPage from "../pages/AdminDashboardPage.tsx?raw";
import legacyAdminProvidersPage from "../pages/AdminProvidersPage.tsx?raw";
import adminUsersPage from "../pages/AdminUsersPage.tsx?raw";
import superAdminPlatformPage from "../pages/SuperAdminPlatformPage.tsx?raw";
import dealerConfiguration from "../pages/dealership/settings/ConfigurationPage.tsx?raw";
import protectedRoute from "../components/ProtectedRoute.tsx?raw";
import protectedRouteV2 from "../components/auth/ProtectedRouteV2.tsx?raw";
import dashboardLayout from "../components/dashboard/DashboardLayout.tsx?raw";
import navbar from "../components/Navbar.tsx?raw";
import useDealership from "../hooks/useDealership.ts?raw";
import rootLayout from "../layouts/RootLayout.tsx?raw";

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
    expect(easyDriveBootstrap).toContain("'dealership_admin'::public.app_role");
    expect(easyDriveBootstrap).toContain("public.dealer_members");
    expect(easyDriveBootstrap).toContain("public.dealership_members");
  });

  it("keeps schema constraint blocks as valid anonymous do blocks", () => {
    expect(schema).not.toMatch(/do\s+\$\$[a-z_]/i);
  });

  it("does not leave dangling schema constraint declarations before control blocks", () => {
    expect(schema).not.toMatch(/add constraint\s+[a-z_]*\s*\r?\nbegin/i);
  });

  it("does not try to alter Supabase-managed storage object RLS", () => {
    expect(schema).not.toMatch(/alter table storage\.objects enable row level security/i);
  });

  it("avoids self-referential dealer member RLS policies", () => {
    expect(schema).not.toContain("from public.dealer_members dm_admin");
    expect(schema).toContain("public.is_active_dealer_admin_member");
  });

  it("keeps dealer cost editing limited to the EasyDrive super admin exception", () => {
    expect(dealerConfiguration).toContain('EASYDRIVE_ADMIN_EMAIL = "info@easydrivecanada.com"');
    expect(dealerConfiguration).toContain("canEditDealerCost");
    expect(dealerConfiguration).toContain('editingCell?.kind === "cost"');
    expect(dealerConfiguration).toContain("!canEditDealerCost");
    expect(dealerConfiguration).not.toContain("Click either pencil to edit dealer cost");
  });

  it("blocks dealer-side dealership product cost writes at the database boundary", () => {
    expect(schema).toContain("prevent_dealer_cost_write_from_dealer_admin");
    expect(schema).toContain("new.dealer_cost is distinct from old.dealer_cost");
    expect(schema).toContain("Only providers or platform admins can change dealer cost");
  });

  it("treats super admin as an override for legacy role-protected admin portals", () => {
    expect(protectedRoute).toContain('if (user.role === "SUPER_ADMIN") return true;');
    expect(protectedRoute).toContain("canAccessAllowedRoles");
  });

  it("treats super admin as an override for V2 admin, provider, and dealership routes", () => {
    expect(protectedRouteV2).toContain('if (userRole === "SUPER_ADMIN") return true;');
  });

  it("shows super admin role-gated dashboard navigation across admin portals", () => {
    expect(dashboardLayout).toContain('if (role === "SUPER_ADMIN") return true;');
    expect(dashboardLayout).toContain("superAdminDealerNavItems");
    expect(dashboardLayout).toContain("navItems === dealershipNavItems");
  });

  it("exposes provider account management from the platform admin sidebar", () => {
    const navStart = dashboardLayout.indexOf("export const platformAdminNavItems");
    const navEnd = dashboardLayout.indexOf("export const dealershipNavItems", navStart);
    const navSource = dashboardLayout.slice(navStart, navEnd);

    expect(navSource).toContain('label: "Providers"');
    expect(navSource).toContain('href: "/admin/providers"');
    expect(navSource).not.toContain('label: "Companies"');
    expect(navSource).not.toContain('href: "/admin-companies"');
  });

  it("does not expose the legacy company registry in top-level super admin navigation", () => {
    const navStart = navbar.indexOf('user.role === "SUPER_ADMIN"');
    const navEnd = navbar.indexOf(": []", navStart);
    const navSource = navbar.slice(navStart, navEnd);

    expect(navSource).toContain('label: "Providers"');
    expect(navSource).toContain('to: "/admin/providers"');
    expect(navSource).not.toContain('label: "Companies"');
    expect(navSource).not.toContain('to: "/admin-companies"');
  });

  it("routes visible provider shortcuts to current provider account management", () => {
    const visibleProviderEntrypoints = [
      superAdminPlatformPage,
      adminDashboardPage,
      legacyAdminProvidersPage,
      adminUsersPage,
    ].join("\n");

    expect(visibleProviderEntrypoints).toContain('to="/admin/providers"');
    expect(visibleProviderEntrypoints).toContain('href: "/admin/providers"');
    expect(visibleProviderEntrypoints).not.toContain('to="/superadmin-companies"');
    expect(visibleProviderEntrypoints).not.toContain('href: "/admin-providers"');
    expect(visibleProviderEntrypoints).not.toContain("Company Management");
    expect(visibleProviderEntrypoints).not.toContain("Manage Companies");
  });

  it("keeps provider account management inside the shared super admin shell", () => {
    expect(router).toContain('path="admin/providers" element={<AdminProvidersPage2 />}');
    expect(router).not.toContain('path="/admin/providers"');
  });

  it("resolves EasyDrive super admin dealership membership as dealership admin", () => {
    expect(useDealership).toContain('user.role === "SUPER_ADMIN" ? "admin"');
    expect(useDealership).toContain("ilike(\"name\", \"%easy%drive%canada%\")");
  });

  it("uses DashboardLayout as the single sidebar implementation for super admin pages", () => {
    expect(rootLayout).toContain("DashboardLayout");
    expect(rootLayout).toContain("superAdminDealerNavItems");
    expect(rootLayout).toContain("<Outlet />");
    expect(rootLayout).not.toContain("superAdminUnifiedNavItems");
    expect(rootLayout).not.toContain("superAdminDealerSettingsItems");
    expect(rootLayout).not.toContain("superAdminPortalGroups");
  });

  it("does not keep a second hand-built super admin sidebar in RootLayout", () => {
    const shellStart = rootLayout.indexOf(") : showSuperAdminShell ? (");
    const shellEnd = rootLayout.indexOf(") : showProviderShell", shellStart);
    const superAdminShell = rootLayout.slice(shellStart, shellEnd);

    expect(superAdminShell).toContain("<DashboardLayout");
    expect(superAdminShell).toContain("navItems={superAdminDealerNavItems}");
    expect(superAdminShell).toContain("<Outlet />");
    expect(superAdminShell).not.toContain("<aside");
    expect(superAdminShell).not.toContain("superAdminNavLinkClass");
    expect(superAdminShell).not.toContain("Platform Admin");
    expect(superAdminShell).not.toContain("Dealer Portal");
    expect(superAdminShell).not.toContain("All portals");
    expect(superAdminShell).not.toContain("hero-gradient");
    expect(superAdminShell).not.toContain("text-white/85");
  });
});
