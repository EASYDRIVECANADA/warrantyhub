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
  it("allows selling with provider standard retail when dealership setup is missing", () => {
    expect(
      canSellDealerProduct(pricing, undefined),
    ).toBe(true);
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

  it("allows the selected base quote row when provider standard retail exists", () => {
    expect(
      canSellDealerProductPricingRow(baseRow, {
        selling_enabled: false,
        retail_price: {},
        confidentiality_enabled: false,
      }),
    ).toBe(true);
  });

  it("does not allow selling when neither standard nor configured retail exists", () => {
    const pricingWithoutRetail = {
      rows: [
        {
          label: "12 Months / 20,000 km",
          vehicleClass: "$1,000 Per Claim",
          dealerCost: 0,
          suggestedRetail: 0,
        },
      ],
    };
    const [rowWithoutRetail] = buildBasePricingRows(pricingWithoutRetail);

    expect(canSellDealerProduct(pricingWithoutRetail, undefined)).toBe(false);
    expect(canSellDealerProductPricingRow(rowWithoutRetail, undefined)).toBe(false);
  });

  it("allows selling with generated standard retail when provider retail is not supplied", () => {
    const pricingWithoutProviderRetail = {
      rows: [
        {
          label: "12 Months / 20,000 km",
          vehicleClass: "$3,000 Claim Max - Class 1/2/3",
          dealerCost: 325,
          suggestedRetail: "n/a",
        },
      ],
    };
    const [rowWithoutProviderRetail] = buildBasePricingRows(pricingWithoutProviderRetail);

    expect(canSellDealerProduct(pricingWithoutProviderRetail, undefined)).toBe(true);
    expect(canSellDealerProductPricingRow(rowWithoutProviderRetail, undefined)).toBe(true);
  });

  it("reports whether any base retail has been configured before enabling selling", () => {
    expect(hasConfiguredBaseRetail(pricing, { retail_price: {} })).toBe(false);
    expect(hasConfiguredBaseRetail(pricing, { retail_price: { [baseRow.retailKey]: 999 } })).toBe(true);
  });
});
