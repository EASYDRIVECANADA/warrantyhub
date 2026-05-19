import { buildBasePricingRows, numericPrice, type NormalizedPricingRow } from "./pricing/dealerPricing";

export type DealerProductAccessConfig = {
  dealer_cost?: Record<string, number>;
  retail_price?: Record<string, unknown>;
  confidentiality_enabled?: boolean;
  selling_enabled?: boolean;
  sellingEnabled?: boolean;
};

function sellingEnabled(config: DealerProductAccessConfig | null | undefined): boolean {
  return Boolean(config?.selling_enabled ?? config?.sellingEnabled ?? false);
}

function configuredRetailForKey(config: DealerProductAccessConfig | null | undefined, key: string): number {
  if (!key) return 0;
  const value = config?.retail_price?.[key];
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function hasConfiguredBaseRetail(pricing: unknown, config: DealerProductAccessConfig | null | undefined): boolean {
  return buildBasePricingRows(pricing).some((row) => configuredRetailForKey(config, row.retailKey) > 0);
}

export function canSellDealerProduct(pricing: unknown, config: DealerProductAccessConfig | null | undefined): boolean {
  return sellingEnabled(config) && hasConfiguredBaseRetail(pricing, config);
}

export function canSellDealerProductPricingRow(
  row: Pick<NormalizedPricingRow, "retailKey"> | null | undefined,
  config: DealerProductAccessConfig | null | undefined,
): boolean {
  return Boolean(row && sellingEnabled(config) && numericPrice(configuredRetailForKey(config, row.retailKey)) > 0);
}
