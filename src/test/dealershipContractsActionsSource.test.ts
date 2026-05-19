import { describe, expect, it } from "vitest";

import contractsSource from "../pages/dealership/DealershipContractsPage.tsx?raw";

describe("DealershipContractsPage actions", () => {
  it("shows submitted contracts with a clear remittance next step", () => {
    expect(contractsSource).toContain("statusLabels");
    expect(contractsSource).toContain("Submitted");
    expect(contractsSource).toContain("Remit");
    expect(contractsSource).toContain('navigate("/dealership/remittances")');
  });
});
