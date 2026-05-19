import { beforeEach, describe, expect, it, vi } from "vitest";

const signOutMock = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
const userRolesLimitMock = vi.hoisted(() => vi.fn());
const profilesMaybeSingleMock = vi.hoisted(() => vi.fn());
const profilesUpdateEqMock = vi.hoisted(() => vi.fn());
const getSessionMock = vi.hoisted(() => vi.fn());
const getUserMock = vi.hoisted(() => vi.fn());
const updateUserMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: getSessionMock,
      getUser: getUserMock,
      updateUser: updateUserMock,
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
          update: () => ({
            eq: profilesUpdateEqMock,
          }),
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
import { markTemporaryPasswordEmail } from "../lib/auth/temporaryPasswordChange";

describe("supabaseAuthApi V2 role hardening", () => {
  beforeEach(() => {
    signOutMock.mockClear();
    userRolesLimitMock.mockReset();
    profilesMaybeSingleMock.mockReset();
    profilesUpdateEqMock.mockReset();
    profilesUpdateEqMock.mockResolvedValue({ data: null, error: null });
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: "user-1", email: "disabled@example.com", user_metadata: {} } } },
      error: null,
    });
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "disabled@example.com", user_metadata: {} } },
      error: null,
    });
    updateUserMock.mockReset();
    updateUserMock.mockResolvedValue({ data: { user: null }, error: null });
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

  it("prioritizes super admin when a user has both platform and dealership roles", async () => {
    profilesMaybeSingleMock.mockResolvedValue({
      data: { role: "SUPER_ADMIN", is_active: true },
      error: null,
    });
    userRolesLimitMock.mockResolvedValue({
      data: [{ role: "dealership_admin" }, { role: "super_admin" }],
      error: null,
    });

    await expect(supabaseAuthApi.getCurrentUser()).resolves.toMatchObject({
      id: "user-1",
      email: "disabled@example.com",
      role: "SUPER_ADMIN",
    });
  });

  it("exposes the temporary-password change requirement from user metadata", async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "disabled@example.com",
          user_metadata: { mustChangePassword: true },
        },
      },
      error: null,
    });
    profilesMaybeSingleMock.mockResolvedValue({
      data: { role: "SUPER_ADMIN", is_active: true },
      error: null,
    });
    userRolesLimitMock.mockResolvedValue({
      data: [{ role: "super_admin" }],
      error: null,
    });

    await expect(supabaseAuthApi.getCurrentUser()).resolves.toMatchObject({
      mustChangePassword: true,
    });
  });

  it("refreshes current user data from Supabase instead of trusting cached session metadata", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: "user-1", email: "disabled@example.com", user_metadata: {} } } },
      error: null,
    });
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "disabled@example.com",
          user_metadata: { mustChangePassword: true },
        },
      },
      error: null,
    });
    profilesMaybeSingleMock.mockResolvedValue({
      data: { role: "SUPER_ADMIN", is_active: true },
      error: null,
    });
    userRolesLimitMock.mockResolvedValue({
      data: [{ role: "super_admin" }],
      error: null,
    });

    await expect(supabaseAuthApi.getCurrentUser()).resolves.toMatchObject({
      mustChangePassword: true,
    });
    expect(getUserMock).toHaveBeenCalled();
  });

  it("clears the temporary-password change requirement when updating the password", async () => {
    await supabaseAuthApi.updatePassword("new-password-1");

    expect(updateUserMock).toHaveBeenCalledWith({
      password: "new-password-1",
      data: { mustChangePassword: false },
    });
  });

  it("uses the local temporary-password marker when Supabase metadata is delayed", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: "user-1", email: "temp@example.com", user_metadata: {} } } },
      error: null,
    });
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "temp@example.com", user_metadata: {} } },
      error: null,
    });
    profilesMaybeSingleMock.mockResolvedValue({
      data: { role: "SUPER_ADMIN", is_active: true },
      error: null,
    });
    userRolesLimitMock.mockResolvedValue({
      data: [{ role: "super_admin" }],
      error: null,
    });
    markTemporaryPasswordEmail("TEMP@example.com");

    await expect(supabaseAuthApi.getCurrentUser()).resolves.toMatchObject({
      mustChangePassword: true,
    });
  });

  it("uses the profile must-change-password flag when auth metadata is unavailable", async () => {
    profilesMaybeSingleMock.mockResolvedValue({
      data: { role: "SUPER_ADMIN", is_active: true, must_change_password: true },
      error: null,
    });
    userRolesLimitMock.mockResolvedValue({
      data: [{ role: "super_admin" }],
      error: null,
    });

    await expect(supabaseAuthApi.getCurrentUser()).resolves.toMatchObject({
      mustChangePassword: true,
    });
  });
});
