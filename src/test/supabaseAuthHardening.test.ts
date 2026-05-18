import { beforeEach, describe, expect, it, vi } from "vitest";

const signOutMock = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
const userRolesLimitMock = vi.hoisted(() => vi.fn());
const profilesMaybeSingleMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: "user-1", email: "disabled@example.com" } } },
        error: null,
      }),
      signOut: signOutMock,
    },
    from: vi.fn((table: string) => {
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: () => ({
              limit: userRolesLimitMock,
            }),
          }),
        };
      }

      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: profilesMaybeSingleMock,
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  }),
}));

import { supabaseAuthApi } from "../lib/auth/supabaseAuth";

describe("supabaseAuthApi V2 role hardening", () => {
  beforeEach(() => {
    signOutMock.mockClear();
    userRolesLimitMock.mockReset();
    profilesMaybeSingleMock.mockReset();
    localStorage.clear();
  });

  it("treats a V2 role user with an inactive profile as disabled", async () => {
    profilesMaybeSingleMock.mockResolvedValue({
      data: { role: "DEALER_ADMIN", is_active: false },
      error: null,
    });
    userRolesLimitMock.mockResolvedValue({
      data: [{ role: "dealership_admin" }],
      error: null,
    });

    await expect(supabaseAuthApi.getCurrentUser()).resolves.toBeNull();
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("warrantyhub.local.auth_notice")).toBe("Account disabled");
  });
});
