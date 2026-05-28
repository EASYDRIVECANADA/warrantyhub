import { describe, expect, it } from "vitest";

import profilePageSource from "../pages/dealership/settings/ProfilePage.tsx?raw";

describe("dealership profile permissions source", () => {
  it("shows dealership edit controls only to dealership admins", () => {
    expect(profilePageSource).toContain("memberRole");
    expect(profilePageSource).toContain("const isAdmin = memberRole === \"admin\"");
    expect(profilePageSource).toContain("{dealershipId && isAdmin &&");
  });
});
