import { describe, expect, it } from "vitest";

import adminProvidersSource from "../pages/admin/AdminProvidersPage2.tsx?raw";
import adminUsersSource from "../pages/admin/AdminUsersPage2.tsx?raw";
import providerSettingsSource from "../pages/provider/ProviderSettingsPage.tsx?raw";
import dealershipProfileSource from "../pages/dealership/settings/ProfilePage.tsx?raw";

const filesThatQueryProfiles = [
  ["src/pages/admin/AdminProvidersPage2.tsx", adminProvidersSource],
  ["src/pages/admin/AdminUsersPage2.tsx", adminUsersSource],
  ["src/pages/provider/ProviderSettingsPage.tsx", providerSettingsSource],
  ["src/pages/dealership/settings/ProfilePage.tsx", dealershipProfileSource],
];

describe("profile schema compatibility", () => {
  it("does not query or update the removed profiles.full_name column", () => {
    for (const [file, source] of filesThatQueryProfiles) {
      expect(source, file).not.toMatch(/\.select\([^)]*full_name/s);
      expect(source, file).not.toMatch(/\.update\([^)]*full_name/s);
    }
  });
});
