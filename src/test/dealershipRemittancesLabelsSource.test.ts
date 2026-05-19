import { describe, expect, it } from "vitest";

import remittancesSource from "../pages/dealership/DealershipRemittancesPage.tsx?raw";

describe("DealershipRemittancesPage labels", () => {
  it("labels remittance totals as provider cost instead of generic submit dollars", () => {
    expect(remittancesSource).toContain("Provider Cost");
    expect(remittancesSource).toContain("Provider cost");
    expect(remittancesSource).toContain("Submit Remittance");
  });

  it("includes legacy required remittance fields when inserting rows", () => {
    expect(remittancesSource).toContain("remittance_number");
    expect(remittancesSource).toContain("amount_cents");
  });

  it("lets the database choose a compatible initial remittance status", () => {
    expect(remittancesSource).toContain("remittanceStatus");
    expect(remittancesSource).not.toContain('status: "pending",');
  });

  it("shows only the supported remittance history status tabs", () => {
    expect(remittancesSource).toContain('const TABS = ["all", "pending", "paid"]');
    expect(remittancesSource).not.toContain('"submitted", "approved"');
    expect(remittancesSource).toContain("Submit Remittance");
  });

  it("uses a readable high-contrast pending badge", () => {
    expect(remittancesSource).toContain('pending: "bg-amber-100 text-amber-900');
    expect(remittancesSource).not.toContain("text-amber-400");
  });
});
