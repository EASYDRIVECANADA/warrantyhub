import { describe, expect, it } from "vitest";

import protectedRouteSource from "../components/auth/ProtectedRouteV2.tsx?raw";

describe("ProtectedRouteV2 dealership role source", () => {
  it("authorizes dealership routes from membership role before stale profile role", () => {
    expect(protectedRouteSource).toContain("useDealership");
    expect(protectedRouteSource).toContain("isDealershipRouteCheck");
    expect(protectedRouteSource).toContain("effectiveDealershipRole");
    expect(protectedRouteSource).toContain("memberRole === \"admin\"");
    expect(protectedRouteSource).toContain("memberRole === \"employee\"");
    expect(protectedRouteSource).toContain("allowedRoles.includes(effectiveDealershipRole)");
  });
});
