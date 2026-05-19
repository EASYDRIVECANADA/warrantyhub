import { describe, expect, it } from "vitest";

import {
  canSellDealerProduct,
  canSellDealerProductPricingRow,
  hasConfiguredBaseRetail,
} from "../lib/dealerProductAccess";
import { buildBasePricingRows } from "../lib/pricing/dealerPricing";

const pricing = {
  rows: [
    {
      label: "12 Months / 20,000 km",
      vehicleClass: "$1,000 Per Claim",
      dealerCost: 189,
      suggestedRetail: 889,
    },
  ],
};

const [baseRow] = buildBasePricingRows(pricing);

describe("dealer product access", () => {
  it("does not treat provider suggested retail as dealership configuration", () => {
    expect(
      canSellDealerProduct(pricing, {
        selling_enabled: true,
        retail_price: {},
        confidentiality_enabled: true,
      }),
    ).toBe(false);
  });

  it("allows selling when the dealership enabled the product and saved base retail", () => {
    expect(
      canSellDealerProduct(pricing, {
        selling_enabled: true,
        retail_price: { [baseRow.retailKey]: 999 },
        confidentiality_enabled: true,
      }),
    ).toBe(true);
  });

  it("requires the selected base quote row to have configured retail", () => {
    expect(
      canSellDealerProductPricingRow(baseRow, {
        selling_enabled: false,
        retail_price: { [baseRow.retailKey]: 999 },
        confidentiality_enabled: true,
      }),
    ).toBe(false);

    expect(
      canSellDealerProductPricingRow(baseRow, {
        selling_enabled: true,
        retail_price: { [baseRow.retailKey]: 999 },
        confidentiality_enabled: true,
      }),
    ).toBe(true);
  });

  it("reports whether any base retail has been configured before enabling selling", () => {
    expect(hasConfiguredBaseRetail(pricing, { retail_price: {} })).toBe(false);
    expect(hasConfiguredBaseRetail(pricing, { retail_price: { [baseRow.retailKey]: 999 } })).toBe(true);
  });
});
