import { describe, expect, it } from "vitest";

import adminDealerTools from "../../supabase/functions/admin-dealer-tools/index.ts?raw";

describe("admin dealer tools source", () => {
  it("supports super-admin generated dealer member passwords", () => {
    expect(adminDealerTools).toContain('"generate_temporary_password"');
    expect(adminDealerTools).toContain("generateTemporaryPassword");
    expect(adminDealerTools).toContain("svc.auth.admin.createUser");
    expect(adminDealerTools).toContain("password: temporaryPassword");
    expect(adminDealerTools).toContain("svc.auth.admin.updateUserById(targetUserId");
    expect(adminDealerTools).toContain("temporaryPassword");
  });

  it("ensures legacy dealers have V2 dealership bridges before linking team members", () => {
    expect(adminDealerTools).toContain("async function ensureDealershipBridge");
    expect(adminDealerTools).toContain(".from(\"dealerships\")");
    expect(adminDealerTools).toContain("legacy_dealer_id: dealerId");
    expect(adminDealerTools).toContain("{ onConflict: \"legacy_dealer_id\" }");
    expect(adminDealerTools).toContain("dealershipId = await ensureDealershipBridge");
  });

  it("keeps dealership admin and staff roles mutually exclusive when admin changes team access", () => {
    expect(adminDealerTools).toContain("async function syncUserDealershipRole");
    expect(adminDealerTools).toContain("const previousRole = nextRole === \"dealership_admin\" ? \"dealership_employee\" : \"dealership_admin\"");
    expect(adminDealerTools).toContain("await syncUserDealershipRole(svc, userId, role)");
  });

  it("lets super admins manually create dealerships with required admin users", () => {
    expect(adminDealerTools).toContain('"create_dealer"');
    expect(adminDealerTools).toContain('if (action === "create_dealer")');
    expect(adminDealerTools).toContain("const createdDealer = await svc");
    expect(adminDealerTools).toContain(".from(\"dealers\")");
    expect(adminDealerTools).toContain(".from(\"dealerships\")");
    expect(adminDealerTools).toContain("adminEmail");
    expect(adminDealerTools).toContain("temporaryPassword");
    expect(adminDealerTools).toContain("syncUserDealershipRole(svc, adminUserId");
  });

  it("requires an initial admin email when super admins create dealerships", () => {
    expect(adminDealerTools).toContain('if (!adminEmail) return json(400, { error: "adminEmail is required" })');
  });

  it("supports guarded super-admin dealership deletion", () => {
    expect(adminDealerTools).toContain('"delete_dealer"');
    expect(adminDealerTools).toContain('if (action === "delete_dealer")');
    expect(adminDealerTools).toContain("This dealership has contract history and cannot be deleted");
    expect(adminDealerTools).toContain('countRows(svc, "contracts", "dealer_id", dealerId)');
    expect(adminDealerTools).toContain('countRows(svc, "contracts", "dealership_id", dealershipId)');
    expect(adminDealerTools).toContain('countRows(svc, "remittances", "dealer_id", dealerId)');
    expect(adminDealerTools).toContain('countRows(svc, "batches", "dealer_id", dealerId)');
    expect(adminDealerTools).toContain('await cleanupDeletedDealerUsers(svc, userIds)');
    expect(adminDealerTools).toContain('.from("dealerships").delete()');
    expect(adminDealerTools).toContain('.from("dealers").delete()');
  });

  it("stores manual dealership contract fees only on legacy dealers", () => {
    const dealershipInsertStart = adminDealerTools.indexOf("const createdDealership = await svc");
    const adminUserStart = adminDealerTools.indexOf("let adminUserId", dealershipInsertStart);
    const dealershipInsertBlock = adminDealerTools.slice(dealershipInsertStart, adminUserStart);

    expect(dealershipInsertBlock).toContain(".from(\"dealerships\")");
    expect(dealershipInsertBlock).toContain("legacy_dealer_id: dealerId");
    expect(dealershipInsertBlock).not.toContain("contract_fee_cents");
  });
});
