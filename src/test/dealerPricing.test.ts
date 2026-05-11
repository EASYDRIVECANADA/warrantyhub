import { describe, expect, it } from "vitest";

import {
  buildAddOnPricingRows,
  buildBasePricingRows,
  buildQuotePricingMatrix,
  isDisplayableAddOnPrice,
  numericPrice,
  parseVehicleClass,
  resolveCustomerRetail,
} from "../lib/pricing/dealerPricing";

describe("dealer pricing parser", () => {
  it("separates A-Protect base rows from add-on rows", () => {
    const pricing = {
      rows: [
        {
          label: "12 Months / 12,000 km",
          term: "12 Months / 12,000 km",
          vehicleClass: "Bronze - $750 Per Claim",
          dealerCost: 89,
          suggestedRetail: 589,
        },
        {
          kind: "addon",
          addonName: "Zero Deductible",
          label: "12 Months / 12,000 km",
          term: "12 Months / 12,000 km",
          vehicleClass: "Bronze - $750 Per Claim",
          dealerCost: 35,
          suggestedRetail: 135,
        },
      ],
    };

    const baseRows = buildBasePricingRows(pricing);
    const addOnRows = buildAddOnPricingRows(pricing, "Bronze - $750 Per Claim");

    expect(baseRows).toHaveLength(1);
    expect(baseRows[0]).toMatchObject({
      term: "12 Months / 12,000 km",
      tierKey: "Bronze - $750 Per Claim",
      dealerCost: 89,
      suggestedRetail: 589,
    });
    expect(addOnRows).toHaveLength(1);
    expect(addOnRows[0]).toMatchObject({
      name: "Zero Deductible",
      term: "12 Months / 12,000 km",
      tierKey: "Bronze - $750 Per Claim",
      dealerCost: 35,
      suggestedRetail: 135,
    });
  });

  it("normalizes Diamond Plus mileage bands and claim tiers", () => {
    expect(parseVehicleClass("0\u201360,000 km \u00b7 $5,000/claim")).toEqual({
      bandKey: "0\u201360,000 km",
      tierKey: "$5,000 / claim",
    });

    expect(parseVehicleClass("0\u201360,000 km \u00c2\u00b7 $5,000/claim")).toEqual({
      bandKey: "0\u201360,000 km",
      tierKey: "$5,000 / claim",
    });
  });

  it("matches Diamond Plus add-ons by selected tier and term", () => {
    const pricing = {
      rows: [
        {
          label: "12 Months / Unlimited km",
          term: "12 Months / Unlimited km",
          vehicleClass: "0\u201360,000 km \u00b7 $5,000/claim",
          dealerCost: 819,
          suggestedRetail: 3279,
        },
        {
          label: "24 Months / Unlimited km",
          term: "24 Months / Unlimited km",
          vehicleClass: "0\u201360,000 km \u00b7 $5,000/claim",
          dealerCost: 919,
          suggestedRetail: 3379,
        },
        {
          kind: "addon",
          addonName: "Powertrain Plus",
          label: "12 Months / Unlimited km",
          term: "12 Months / Unlimited km",
          vehicleClass: "$5,000 / claim",
          dealerCost: 295,
          suggestedRetail: 395,
        },
        {
          kind: "addon",
          addonName: "Powertrain Plus",
          label: "24 Months / Unlimited km",
          term: "24 Months / Unlimited km",
          vehicleClass: "$7,500 / claim",
          dealerCost: 295,
          suggestedRetail: 395,
        },
      ],
    };

    const addOns = buildAddOnPricingRows(pricing, "0\u201360,000 km \u00b7 $5,000/claim");

    expect(addOns).toHaveLength(1);
    expect(addOns[0]).toMatchObject({
      name: "Powertrain Plus",
      term: "12 Months / Unlimited km",
      tierKey: "$5,000 / claim",
      retailKey: "t0|m-|r0|term0",
    });
  });

  it("keeps Included add-ons displayable while numeric totals remain zero", () => {
    expect(isDisplayableAddOnPrice("Included")).toBe(true);
    expect(numericPrice("Included")).toBe(0);
  });

  it("uses confidentiality retail overrides by generated retail key", () => {
    const pricing = {
      rows: [
        {
          label: "12 Months / 20,000 km",
          term: "12 Months / 20,000 km",
          vehicleClass: "$3,000 Per Claim",
          dealerCost: 299,
          suggestedRetail: 999,
        },
      ],
    };

    const [row] = buildBasePricingRows(pricing);

    expect(row.retailKey).toBe("t0|m-|r0|term0");
    expect(resolveCustomerRetail(row, {
      confidentiality_enabled: true,
      retail_price: { [row.retailKey]: 1099 },
    })).toBe(1099);
  });

  it("builds a quote matrix with base and add-on retail cells", () => {
    const pricing = {
      rows: [
        {
          label: "12 Months / 12,000 km",
          term: "12 Months / 12,000 km",
          vehicleClass: "Bronze - $750 Per Claim",
          dealerCost: 89,
          suggestedRetail: 589,
        },
        {
          label: "24 Months / 24,000 km",
          term: "24 Months / 24,000 km",
          vehicleClass: "Bronze - $750 Per Claim",
          dealerCost: 109,
          suggestedRetail: 609,
        },
        {
          kind: "addon",
          addonName: "Zero Deductible",
          label: "12 Months / 12,000 km",
          term: "12 Months / 12,000 km",
          vehicleClass: "Bronze - $750 Per Claim",
          dealerCost: 35,
          suggestedRetail: 135,
        },
        {
          kind: "addon",
          addonName: "Roadside",
          label: "24 Months / 24,000 km",
          term: "24 Months / 24,000 km",
          vehicleClass: "Bronze - $750 Per Claim",
          dealerCost: 0,
          suggestedRetail: "Included",
        },
        {
          kind: "addon",
          addonName: "Hidden Option",
          label: "24 Months / 24,000 km",
          term: "24 Months / 24,000 km",
          vehicleClass: "Bronze - $750 Per Claim",
          dealerCost: 0,
          suggestedRetail: "n/a",
        },
      ],
    };

    const matrix = buildQuotePricingMatrix(pricing);

    expect(matrix.tiers).toHaveLength(1);
    expect(matrix.tiers[0].label).toBe("Bronze - $750 Per Claim");
    expect(matrix.tiers[0].terms.map((term) => term.label)).toEqual([
      "12 Months / 12,000 km",
      "24 Months / 24,000 km",
    ]);
    expect(matrix.tiers[0].rows[0]).toMatchObject({ label: "Base Price", isBase: true });
    expect(matrix.tiers[0].rows[0].values[0]).toMatchObject({
      kind: "base",
      suggestedRetail: 589,
      retailKey: "t0|m-|r0|term0",
    });
    expect(matrix.tiers[0].rows[1].values[0]).toMatchObject({
      kind: "addon",
      label: "Zero Deductible",
      suggestedRetail: 135,
      retailKey: "t0|m-|r1|term0",
    });
    expect(matrix.tiers[0].rows[2].values[1]).toMatchObject({
      kind: "addon",
      label: "Roadside",
      suggestedRetail: "Included",
      retailKey: "t0|m-|r2|term1",
    });
    expect(matrix.tiers[0].rows.some((row) => row.label === "Hidden Option")).toBe(false);
  });

  it("builds quote matrix mileage bands with matching retail override keys", () => {
    const pricing = {
      rows: [
        {
          label: "12 Months / Unlimited km",
          term: "12 Months / Unlimited km",
          vehicleClass: "0\u201360,000 km \u00b7 $5,000/claim",
          dealerCost: 819,
          suggestedRetail: 3279,
        },
        {
          label: "12 Months / Unlimited km",
          term: "12 Months / Unlimited km",
          vehicleClass: "60,001\u2013100,000 km \u00b7 $5,000/claim",
          dealerCost: 1129,
          suggestedRetail: 3579,
        },
        {
          kind: "addon",
          addonName: "Powertrain Plus",
          label: "12 Months / Unlimited km",
          term: "12 Months / Unlimited km",
          vehicleClass: "$5,000 / claim",
          dealerCost: 295,
          suggestedRetail: 395,
        },
      ],
    };

    const matrix = buildQuotePricingMatrix(pricing);
    const firstBandCell = matrix.tiers[0].mileageBands?.[0].baseValues[0];

    expect(matrix.tiers[0].mileageBands).toHaveLength(2);
    expect(firstBandCell).toMatchObject({
      kind: "base",
      bandKey: "0\u201360,000 km",
      retailKey: "t0|m0|r-1|term0",
    });
    expect(resolveCustomerRetail(firstBandCell!, {
      confidentiality_enabled: true,
      retail_price: { "t0|m0|r-1|term0": 3399 },
    })).toBe(3399);
    expect(matrix.tiers[0].rows[0].values[0]).toMatchObject({
      kind: "addon",
      label: "Powertrain Plus",
      retailKey: "t0|m-|r0|term0",
    });
  });
});
