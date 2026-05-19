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
});
