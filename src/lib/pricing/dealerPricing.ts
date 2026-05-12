export type PricingValue = number | string;

export type DealerPricingConfig = {
  dealer_cost?: Record<string, number>;
  retail_price?: Record<string, number>;
  confidentiality_enabled?: boolean;
} | null | undefined;

export type NormalizedPricingRow = {
  term: string;
  label: string;
  vehicleClass: string;
  tierKey: string;
  bandKey: string | null;
  dealerCost: number;
  suggestedRetail: number;
  retailKey: string;
};

export type NormalizedAddOnRow = {
  name: string;
  term: string;
  label: string;
  vehicleClass: string;
  tierKey: string;
  dealerCost: PricingValue;
  suggestedRetail: PricingValue;
  retailKey: string;
};

export type ContractAddonSnapshot = {
  name: string;
  term: string;
  vehicleClass: string;
  dealerCost: number;
  retail: number;
  retailDisplay?: string;
  retailKey: string;
};

export type QuoteMatrixTerm = {
  label: string;
  months?: number;
  km?: number | null;
};

export type QuoteMatrixCell = {
  kind: "base" | "addon";
  label: string;
  term: string;
  vehicleClass: string;
  tierKey: string;
  bandKey: string | null;
  dealerCost: PricingValue;
  suggestedRetail: PricingValue;
  retailKey: string;
};

export type QuoteMatrixRow = {
  label: string;
  isBase: boolean;
  rowIdx: number;
  bandIdx: number | null;
  values: Array<QuoteMatrixCell | null>;
};

export type QuoteMatrixTier = {
  label: string;
  perClaimAmount?: number;
  terms: QuoteMatrixTerm[];
  mileageBands?: Array<{ label: string; bandIdx: number; baseValues: Array<QuoteMatrixCell | null> }>;
  rows: QuoteMatrixRow[];
};

export type QuotePricingMatrix = {
  tiers: QuoteMatrixTier[];
};

export function isAddonPricingRow(row: any): boolean {
  return row?.kind === "addon" || row?.type === "addon" || !!row?.addonName;
}

export function cellKey(tierIdx: number, bandIdx: number | null, rowIdx: number, termIdx: number): string {
  return `t${tierIdx}|m${bandIdx == null ? "-" : bandIdx}|r${rowIdx}|term${termIdx}`;
}

function normalizePricingText(value: string): string {
  return value
    .replace(/\u00c2\u00b7/g, "\u00b7")
    .replace(/Ã‚Â·/g, "\u00b7")
    .replace(/Â·/g, "\u00b7")
    .replace(/â€¢/g, "\u2022")
    .replace(/â€“/g, "\u2013")
    .replace(/â€”/g, "\u2014")
    .replace(/Ã¢â‚¬â€œ/g, "\u2013")
    .replace(/Ã¢â‚¬â€/g, "\u2014")
    .trim();
}

export function parseVehicleClass(vcRaw: string): { tierKey: string; bandKey: string | null } {
  vcRaw = normalizePricingText(vcRaw || "");
  const vc = (vcRaw || "").replace(/\u00c2\u00b7/g, "\u00b7").replace(/Â·/g, "\u00b7").trim();
  if (vc.includes("\u00b7")) {
    const [band = "", tier = ""] = vc.split("\u00b7").map((s) => s.trim());
    return { tierKey: normalizeTierKey(tier), bandKey: band || null };
  }

  const classMatch = vc.match(/^(.+?)\s*-\s*(Class \d+)$/i);
  if (classMatch) {
    return { tierKey: classMatch[1].trim(), bandKey: classMatch[2].trim() };
  }

  return { tierKey: vc || "Standard", bandKey: null };
}

export function coercePrice(value: any): PricingValue {
  if (typeof value === "number") return Number.isFinite(value) ? value : "n/a";
  if (typeof value === "string") {
    value = normalizePricingText(value);
    const trimmed = value.trim();
    if (!trimmed) return "n/a";
    const lower = trimmed.toLowerCase();
    if (lower === "included") return "Included";
    if (["n/a", "na", "-", "\u2014", "\u2013"].includes(lower)) return "n/a";
    if (["n/a", "na", "-", "—", "â€”"].includes(lower)) return "n/a";
    const numeric = Number(trimmed.replace(/[$,]/g, ""));
    return Number.isFinite(numeric) ? numeric : trimmed;
  }
  return "n/a";
}

export function isDisplayableAddOnPrice(value: PricingValue): boolean {
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return value.trim().toLowerCase() === "included";
}

export function numericPrice(value: PricingValue): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function resolveCustomerRetail(row: { retailKey?: string; suggestedRetail?: PricingValue; retail?: PricingValue }, config: DealerPricingConfig): PricingValue {
  const key = row.retailKey;
  const retailMap = config?.retail_price ?? {};
  if (config?.confidentiality_enabled && key && retailMap[key] !== undefined) {
    return Number(retailMap[key]);
  }
  return row.suggestedRetail ?? row.retail ?? 0;
}

export function resolveCustomerRetailNumber(row: { retailKey?: string; suggestedRetail?: PricingValue; retail?: PricingValue }, config: DealerPricingConfig): number {
  return numericPrice(resolveCustomerRetail(row, config));
}

export function resolveDealerCost(row: { retailKey?: string; dealerCost?: PricingValue; dealer_cost?: PricingValue; cost?: PricingValue }, config: DealerPricingConfig): PricingValue {
  const key = row.retailKey;
  const costMap = config?.dealer_cost ?? {};
  if (key && costMap[key] !== undefined) {
    return Number(costMap[key]);
  }
  return row.dealerCost ?? row.dealer_cost ?? row.cost ?? 0;
}

export function resolveDealerCostNumber(row: { retailKey?: string; dealerCost?: PricingValue; dealer_cost?: PricingValue; cost?: PricingValue }, config: DealerPricingConfig): number {
  return numericPrice(resolveDealerCost(row, config));
}

export function buildBasePricingRows(pricing: any): NormalizedPricingRow[] {
  const rawRows = getRawPricingRows(pricing).filter((row) => !isAddonPricingRow(row));
  const keys = buildRetailKeys(rawRows);

  return rawRows
    .map((row, index) => {
      const term = (row.label || row.term || "Standard").toString().trim();
      const vehicleClass = (row.vehicleClass || row.vehicle_class || "").toString().trim();
      const parsed = parseVehicleClass(vehicleClass);
      return {
        term,
        label: term,
        vehicleClass,
        tierKey: parsed.tierKey,
        bandKey: parsed.bandKey,
        dealerCost: numericPrice(coercePrice(row.dealerCost ?? row.dealer_cost ?? 0)),
        suggestedRetail: numericPrice(coercePrice(row.suggestedRetail ?? row.suggested_retail ?? row.retail ?? 0)),
        retailKey: keys[index] ?? "",
      };
    })
    .filter((row) => row.dealerCost > 0 || row.suggestedRetail > 0);
}

export function buildAddOnPricingRows(pricing: any, activeTier?: string | null): NormalizedAddOnRow[] {
  const allRows = getRawPricingRows(pricing);
  const baseRows = allRows.filter((row) => !isAddonPricingRow(row));
  const addonRows = allRows.filter(isAddonPricingRow);
  return buildAddOnPricingRowsFromRaw(baseRows, addonRows, activeTier);
}

export function buildAddOnPricingRowsFromRaw(baseRows: any[], addonRows: any[], activeTier?: string | null): NormalizedAddOnRow[] {
  const { tierOrder, bandOrder, termOrder } = buildPricingOrders(baseRows);
  const activeTierKey = activeTier ? parseVehicleClass(activeTier).tierKey : null;
  const addonOrder = new Map<string, string[]>();
  const rows: NormalizedAddOnRow[] = [];

  addonRows.forEach((row) => {
    const name = (row.addonName || row.name || "Add-on").toString().trim();
    const termLabel = (row.label || row.term || "").toString().trim();
    const vehicleClass = (row.vehicleClass || row.vehicle_class || "Standard").toString().trim();
    const { tierKey } = parseVehicleClass(vehicleClass);
    if (activeTierKey && tierKey !== activeTierKey) return;

    const tierIdx = tierOrder.indexOf(tierKey);
    const terms = termOrder.get(tierKey) ?? [];
    const termIdx = terms.indexOf(termLabel);
    if (tierIdx < 0 || termIdx < 0) return;

    const labels = addonOrder.get(tierKey) ?? [];
    if (!labels.includes(name)) labels.push(name);
    addonOrder.set(tierKey, labels);

    const bands = bandOrder.get(tierKey) ?? [];
    const hasBands = bands.length > 1 || (bands.length === 1 && bands[0] !== "-");
    const addonIdx = labels.indexOf(name);
    const rowIdx = hasBands ? addonIdx : addonIdx + 1;
    const suggestedRetail = coercePrice(row.suggestedRetail ?? row.suggested_retail ?? row.retail ?? row.price ?? "n/a");
    if (!isDisplayableAddOnPrice(suggestedRetail)) return;

    rows.push({
      name,
      term: termLabel,
      label: termLabel,
      vehicleClass,
      tierKey,
      dealerCost: coercePrice(row.dealerCost ?? row.dealer_cost ?? row.price ?? 0),
      suggestedRetail,
      retailKey: cellKey(tierIdx, null, rowIdx, termIdx),
    });
  });

  return rows;
}

export function buildQuotePricingMatrix(pricing: any): QuotePricingMatrix {
  const rawRows = getRawPricingRows(pricing);
  const baseRawRows = rawRows.filter((row) => !isAddonPricingRow(row));
  const addonRawRows = rawRows.filter(isAddonPricingRow);
  if (baseRawRows.length === 0) return { tiers: [] };

  const { tierOrder, bandOrder, termOrder } = buildPricingOrders(baseRawRows);
  const baseRetailKeys = buildRetailKeys(baseRawRows);
  const baseCellsByTier = new Map<string, Map<string, Map<string, QuoteMatrixCell>>>();

  baseRawRows.forEach((row, index) => {
    const term = (row.label || row.term || "Standard").toString().trim();
    const vehicleClass = (row.vehicleClass || row.vehicle_class || "Standard").toString().trim();
    const { tierKey, bandKey } = parseVehicleClass(vehicleClass);
    const normalizedBandKey = bandKey ?? "-";
    if (!baseCellsByTier.has(tierKey)) baseCellsByTier.set(tierKey, new Map());
    const tierCells = baseCellsByTier.get(tierKey)!;
    if (!tierCells.has(normalizedBandKey)) tierCells.set(normalizedBandKey, new Map());
    tierCells.get(normalizedBandKey)!.set(term, {
      kind: "base",
      label: "Base Price",
      term,
      vehicleClass,
      tierKey,
      bandKey,
      dealerCost: numericPrice(coercePrice(row.dealerCost ?? row.dealer_cost ?? 0)),
      suggestedRetail: numericPrice(coercePrice(row.suggestedRetail ?? row.suggested_retail ?? row.retail ?? 0)),
      retailKey: baseRetailKeys[index] ?? "",
    });
  });

  const addonCellsByTier = new Map<string, Map<string, Map<string, QuoteMatrixCell>>>();
  const addonOrderByTier = new Map<string, string[]>();

  addonRawRows.forEach((row) => {
    const label = (row.addonName || row.name || "Add-on").toString().trim();
    const term = (row.label || row.term || "").toString().trim();
    const vehicleClass = (row.vehicleClass || row.vehicle_class || "Standard").toString().trim();
    const { tierKey } = parseVehicleClass(vehicleClass);
    const tierIdx = tierOrder.indexOf(tierKey);
    const terms = termOrder.get(tierKey) ?? [];
    const termIdx = terms.indexOf(term);
    if (tierIdx < 0 || termIdx < 0) return;

    const suggestedRetail = coercePrice(row.suggestedRetail ?? row.suggested_retail ?? row.retail ?? row.price ?? "n/a");
    if (!isDisplayableAddOnPrice(suggestedRetail)) return;

    const labels = addonOrderByTier.get(tierKey) ?? [];
    if (!labels.includes(label)) labels.push(label);
    addonOrderByTier.set(tierKey, labels);

    const bands = bandOrder.get(tierKey) ?? [];
    const hasBands = bands.length > 1 || (bands.length === 1 && bands[0] !== "-");
    const rowIdx = hasBands ? labels.indexOf(label) : labels.indexOf(label) + 1;

    if (!addonCellsByTier.has(tierKey)) addonCellsByTier.set(tierKey, new Map());
    const tierCells = addonCellsByTier.get(tierKey)!;
    if (!tierCells.has(label)) tierCells.set(label, new Map());
    tierCells.get(label)!.set(term, {
      kind: "addon",
      label,
      term,
      vehicleClass,
      tierKey,
      bandKey: null,
      dealerCost: coercePrice(row.dealerCost ?? row.dealer_cost ?? row.price ?? 0),
      suggestedRetail,
      retailKey: cellKey(tierIdx, null, rowIdx, termIdx),
    });
  });

  return {
    tiers: tierOrder.map((tierKey) => {
      const bands = bandOrder.get(tierKey) ?? [];
      const terms = (termOrder.get(tierKey) ?? []).map(parseQuoteMatrixTerm);
      const hasBands = bands.length > 1 || (bands.length === 1 && bands[0] !== "-");
      const baseCellsForTier = baseCellsByTier.get(tierKey) ?? new Map();
      const addonCellsForTier = addonCellsByTier.get(tierKey) ?? new Map();
      const addonRows: QuoteMatrixRow[] = (addonOrderByTier.get(tierKey) ?? []).map((label, index) => ({
        label,
        isBase: false,
        rowIdx: hasBands ? index : index + 1,
        bandIdx: null,
        values: terms.map((term) => addonCellsForTier.get(label)?.get(term.label) ?? null),
      }));

      const tier: QuoteMatrixTier = {
        label: tierKey,
        perClaimAmount: parsePerClaimAmount(tierKey),
        terms,
        rows: addonRows,
      };

      if (hasBands) {
        tier.mileageBands = bands.map((bandLabel, bandIdx) => ({
          label: bandLabel,
          bandIdx,
          baseValues: terms.map((term) => baseCellsForTier.get(bandLabel)?.get(term.label) ?? null),
        }));
      } else {
        tier.rows = [
          {
            label: "Base Price",
            isBase: true,
            rowIdx: 0,
            bandIdx: null,
            values: terms.map((term) => baseCellsForTier.get("-")?.get(term.label) ?? null),
          },
          ...addonRows,
        ];
      }

      return tier;
    }),
  };
}

export function pricingRowKey(row: { term?: string; label?: string; vehicleClass?: string }): string {
  return `${row.term || row.label || ""}|${row.vehicleClass || ""}`;
}

function getRawPricingRows(pricing: any): any[] {
  if (!pricing) return [];
  return Array.isArray(pricing.rows) ? pricing.rows : Array.isArray(pricing.tiers) ? pricing.tiers : [];
}

function normalizeTierKey(value: string): string {
  return normalizePricingText(value).replace(/\/claim/i, " / claim").replace(/\s+\/\s+/g, " / ").trim();
}

function parseQuoteMatrixTerm(label: string): QuoteMatrixTerm {
  const monthsMatch = label.match(/(\d+)\s*Months?/i);
  const kmMatch = label.match(/\/\s*([\d,]+|Unlimited)\s*km/i);
  return {
    label,
    months: monthsMatch ? Number(monthsMatch[1]) : undefined,
    km: kmMatch ? (kmMatch[1].toLowerCase() === "unlimited" ? null : Number(kmMatch[1].replace(/,/g, ""))) : undefined,
  };
}

function parsePerClaimAmount(label: string): number | undefined {
  const match = label.match(/\$([0-9,]+)/);
  return match ? Number(match[1].replace(/,/g, "")) : undefined;
}

function buildPricingOrders(rows: any[]) {
  const tierOrder: string[] = [];
  const bandOrder = new Map<string, string[]>();
  const termOrder = new Map<string, string[]>();

  rows.forEach((row) => {
    const termLabel = (row.label || row.term || "").toString().trim();
    const { tierKey, bandKey } = parseVehicleClass((row.vehicleClass || row.vehicle_class || "Standard").toString());
    const normalizedBandKey = bandKey ?? "-";

    if (!tierOrder.includes(tierKey)) {
      tierOrder.push(tierKey);
      bandOrder.set(tierKey, []);
      termOrder.set(tierKey, []);
    }

    const bands = bandOrder.get(tierKey)!;
    if (!bands.includes(normalizedBandKey)) bands.push(normalizedBandKey);

    const terms = termOrder.get(tierKey)!;
    if (!terms.includes(termLabel)) terms.push(termLabel);
  });

  return { tierOrder, bandOrder, termOrder };
}

function buildRetailKeys(rows: any[]): string[] {
  const { tierOrder, bandOrder, termOrder } = buildPricingOrders(rows);

  return rows.map((row) => {
    const termLabel = (row.label || row.term || "").toString().trim();
    const { tierKey, bandKey } = parseVehicleClass((row.vehicleClass || row.vehicle_class || "Standard").toString());
    const normalizedBandKey = bandKey ?? "-";
    const tierIdx = tierOrder.indexOf(tierKey);
    const bands = bandOrder.get(tierKey) ?? [];
    const terms = termOrder.get(tierKey) ?? [];
    const termIdx = Math.max(terms.indexOf(termLabel), 0);
    const hasBands = bands.length > 1 || (bands.length === 1 && bands[0] !== "-");

    if (hasBands) {
      return cellKey(tierIdx, Math.max(bands.indexOf(normalizedBandKey), 0), -1, termIdx);
    }

    return cellKey(tierIdx, null, 0, termIdx);
  });
}
