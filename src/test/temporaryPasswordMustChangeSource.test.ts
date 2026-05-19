import { describe, expect, it } from "vitest";

import adminDealerTools from "../../supabase/functions/admin-dealer-tools/index.ts?raw";
import companyAccessTools from "../../supabase/functions/company-access-tools/index.ts?raw";
import dealerTeamTools from "../../supabase/functions/dealer-team-tools/index.ts?raw";

function mustChangePasswordMarks(source: string) {
  return source.match(/mustChangePassword:\s*true/g)?.length ?? 0;
}

function profileMustChangePasswordMarks(source: string) {
  return source.match(/must_change_password:\s*true/g)?.length ?? 0;
}

describe("temporary password account metadata", () => {
  it("marks company access temporary-password users as requiring a password change", () => {
    expect(mustChangePasswordMarks(companyAccessTools)).toBeGreaterThanOrEqual(3);
    expect(profileMustChangePasswordMarks(companyAccessTools)).toBeGreaterThanOrEqual(2);
  });

  it("marks dealer team temporary-password users as requiring a password change", () => {
    expect(mustChangePasswordMarks(dealerTeamTools)).toBeGreaterThanOrEqual(2);
    expect(profileMustChangePasswordMarks(dealerTeamTools)).toBeGreaterThanOrEqual(2);
  });

  it("marks admin dealer temporary-password users as requiring a password change", () => {
    expect(mustChangePasswordMarks(adminDealerTools)).toBeGreaterThanOrEqual(2);
    expect(profileMustChangePasswordMarks(adminDealerTools)).toBeGreaterThanOrEqual(2);
  });
});
