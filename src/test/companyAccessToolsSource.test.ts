import { describe, expect, it } from "vitest";

import companyAccessTools from "../../supabase/functions/company-access-tools/index.ts?raw";
import hardeningMigration from "../../supabase/migrations/20260519010000_company_access_tools_rls.sql?raw";

describe("company access tools source", () => {
  it("is self-contained for dashboard edge function deployment", () => {
    expect(companyAccessTools).not.toContain("../_shared/");
    expect(companyAccessTools).toContain("npm:@supabase/supabase-js");
    expect(companyAccessTools).toContain("Access-Control-Allow-Origin");
  });

  it("defines the shared onboarding and team actions", () => {
    for (const action of [
      "approve_access_request",
      "reject_access_request",
      "create_provider_account",
      "create_company_member",
      "update_company_member_role",
      "generate_temporary_password",
      "remove_company_member",
    ]) {
      expect(companyAccessTools).toContain(action);
    }
  });

  it("keeps dealership approval synchronized across legacy and V2 tenancy tables", () => {
    expect(companyAccessTools).toContain(".from(\"dealers\")");
    expect(companyAccessTools).toContain(".from(\"dealerships\")");
    expect(companyAccessTools).toContain(".from(\"dealer_members\")");
    expect(companyAccessTools).toContain(".from(\"dealership_members\")");
    expect(companyAccessTools).toContain("DEALER_ADMIN");
    expect(companyAccessTools).toContain("dealership_admin");
  });

  it("keeps provider approval synchronized across provider membership and roles", () => {
    expect(companyAccessTools).toContain(".from(\"providers\")");
    expect(companyAccessTools).toContain(".from(\"provider_members\")");
    expect(companyAccessTools).toContain("PROVIDER");
    expect(companyAccessTools).toContain("provider");
  });

  it("lets super admins create provider accounts without an existing provider admin", () => {
    expect(companyAccessTools).toContain('action === "create_provider_account"');
    expect(companyAccessTools).toContain("assertSuperAdmin(jwt)");
    expect(companyAccessTools).toContain("createProviderAccount");
  });

  it("removes broad authenticated insert policies for tenant tables", () => {
    expect(hardeningMigration).toContain("drop policy if exists \"Authenticated can insert dealerships\"");
    expect(hardeningMigration).toContain("drop policy if exists \"Authenticated can insert dealership members\"");
    expect(hardeningMigration).toContain("drop policy if exists \"Authenticated can insert providers\"");
    expect(hardeningMigration).toContain("drop policy if exists \"Authenticated can insert provider members\"");
    expect(hardeningMigration).not.toContain("create policy \"Authenticated can insert providers\"");
    expect(hardeningMigration).not.toContain("create policy \"Authenticated can insert provider members\"");
  });

  it("checks remaining company memberships before removing portal roles", () => {
    expect(companyAccessTools).toContain("remainingMemberships");
    expect(companyAccessTools).toContain(".from(\"provider_members\").select(\"id\").eq(\"user_id\", targetUserId)");
    expect(companyAccessTools).toContain(".from(\"dealership_members\").select(\"id\").eq(\"user_id\", targetUserId)");
  });
});
