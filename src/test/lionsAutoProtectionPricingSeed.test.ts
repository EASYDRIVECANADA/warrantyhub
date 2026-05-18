import { describe, expect, it } from "vitest";

import lionsSeed from "../../supabase/migrations/20260515010000_lions_auto_protection_products.sql?raw";

describe("Lions Auto Protection pricing seed", () => {
  it("uses dealer costs from the supplied dealer price list while leaving retail unavailable", () => {
    expect(lionsSeed).toContain("Dealer Price List PDF supplied May 2026. Suggested retail not supplied.");
    expect(lionsSeed).toContain(
      '{"label": "12 Months / 20,000 km", "vehicleClass": "$3,000 Claim Max - Class 1/2/3", "claimMax": 3000, "dealerCost": 325, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"}',
    );
    expect(lionsSeed).toContain(
      '{"label": "60 Months / Up to 160,000 km", "vehicleClass": "$5,000 Claim Max - Class 2", "claimMax": 5000, "dealerCost": 1804, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"}',
    );
    expect(lionsSeed).toContain(
      '{"label": "Unlimited Time / Up to 200,000 km", "vehicleClass": "$20,000 Claim Max - Class 3", "claimMax": 20000, "dealerCost": 3599, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"}',
    );
    expect(lionsSeed).toContain(
      '{"label": "Unlimited Time / Up to 150,000 km", "vehicleClass": "$5,000 Claim Max - Electric Class 3", "claimMax": 5000, "dealerCost": 2653, "suggestedRetail": "n/a", "priceStatus": "Retail not supplied"}',
    );
    expect(lionsSeed).not.toContain('"source": "Lions Auto Protection warranty list supplied May 2026. Pricing not supplied."');
  });
});
