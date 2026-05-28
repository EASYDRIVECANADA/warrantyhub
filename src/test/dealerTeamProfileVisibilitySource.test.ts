import { describe, expect, it } from "vitest";

import schema from "../../supabase/schema.sql?raw";

describe("dealer team profile visibility source", () => {
  it("allows active dealership teammates, including employees, to read each other's profile contact details", () => {
    const functionStart = schema.indexOf("create or replace function public.can_select_dealer_team_profile");
    const functionEnd = schema.indexOf("create or replace function public.can_update_profile", functionStart);
    const functionSource = schema.slice(functionStart, functionEnd);

    expect(functionStart).toBeGreaterThanOrEqual(0);
    expect(functionSource).toContain("public.dealership_members");
    expect(functionSource).toContain("viewer_dm.dealership_id = target_dm.dealership_id");
    expect(functionSource).toContain("viewer_legacy.dealer_id = target_legacy.dealer_id");
    expect(functionSource).not.toContain("public.is_active_dealer_admin_member");
  });
});
