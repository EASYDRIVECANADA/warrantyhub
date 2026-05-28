import { describe, expect, it } from "vitest";

import useDealershipSource from "../hooks/useDealership.ts?raw";

describe("useDealership source", () => {
  it("resolves duplicate memberships deterministically from the newest active row", () => {
    expect(useDealershipSource).toContain('.eq("status", "ACTIVE")');
    expect(useDealershipSource).toContain('.order("created_at", { ascending: false })');
    expect(useDealershipSource).toContain('user.role !== "DEALER_ADMIN"');
    expect(useDealershipSource).toContain('user.role !== "DEALER_EMPLOYEE"');
    expect(useDealershipSource).toContain("setDealershipId(null)");
    expect(useDealershipSource).toContain("setMemberRole(null)");
  });
});
