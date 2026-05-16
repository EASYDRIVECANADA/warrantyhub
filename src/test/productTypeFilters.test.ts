import { describe, expect, it } from "vitest";

import { PRODUCT_TYPE_FILTERS, matchesProductTypeFilter } from "../lib/products/productTypeFilters";

describe("dealer product type filters", () => {
  it("includes PPF as a visible product type filter", () => {
    expect(PRODUCT_TYPE_FILTERS.map((filter) => filter.label)).toContain("PPF");
    expect(matchesProductTypeFilter("PPF", "PPF")).toBe(true);
  });

  it("keeps existing aliases for core product types", () => {
    expect(matchesProductTypeFilter("EXTENDED_WARRANTY", "VSC")).toBe(true);
    expect(matchesProductTypeFilter("warranty", "VSC")).toBe(true);
    expect(matchesProductTypeFilter("GAP", "GAP")).toBe(true);
    expect(matchesProductTypeFilter("TIRE_RIM", "Tire & Rim")).toBe(true);
  });

  it("does not match unrelated product types", () => {
    expect(matchesProductTypeFilter("GAP", "PPF")).toBe(false);
    expect(matchesProductTypeFilter("PPF", "GAP")).toBe(false);
  });
});
