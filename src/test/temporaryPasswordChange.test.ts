import { beforeEach, describe, expect, it } from "vitest";

import {
  clearTemporaryPasswordEmail,
  isTemporaryPasswordEmailMarked,
  markTemporaryPasswordEmail,
} from "../lib/auth/temporaryPasswordChange";

describe("temporary password change marker", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("marks emails case-insensitively and clears them after password change", () => {
    markTemporaryPasswordEmail("User@Example.com");

    expect(isTemporaryPasswordEmailMarked("user@example.com")).toBe(true);

    clearTemporaryPasswordEmail("USER@example.com");

    expect(isTemporaryPasswordEmailMarked("user@example.com")).toBe(false);
  });
});
