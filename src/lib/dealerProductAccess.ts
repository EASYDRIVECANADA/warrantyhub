import { buildBasePricingRows, numericPrice, standardRetailFromDealerCost, type NormalizedPricingRow } from "./pricing/dealerPricing";

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

function hasStandardBaseRetail(pricing: unknown): boolean {
  return buildBasePricingRows(pricing).some((row) => numericPrice(row.suggestedRetail) > 0 || standardRetailFromDealerCost(row) > 0);
}

function standardRetailForRow(row: (Pick<NormalizedPricingRow, "suggestedRetail"> & { retail?: unknown } & Partial<NormalizedPricingRow>) | null | undefined): number {
  const value = row?.suggestedRetail ?? row?.retail ?? 0;
  return numericPrice(value as number | string) || (row ? standardRetailFromDealerCost(row) : 0);
}

export function canSellDealerProduct(pricing: unknown, config: DealerProductAccessConfig | null | undefined): boolean {
  return hasStandardBaseRetail(pricing) || (sellingEnabled(config) && hasConfiguredBaseRetail(pricing, config));
}

export function canSellDealerProductPricingRow(
  row: Pick<NormalizedPricingRow, "retailKey" | "suggestedRetail"> | null | undefined,
  config: DealerProductAccessConfig | null | undefined,
): boolean {
  return Boolean(row && (standardRetailForRow(row) > 0 || (sellingEnabled(config) && configuredRetailForKey(config, row.retailKey) > 0)));
}
