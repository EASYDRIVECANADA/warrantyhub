export type DealerPricingSettings = {
  dealerId: string;
  markupPct: number;
  updatedAt: string;
};

const STORAGE_KEY = "warrantyhub.local.dealer_pricing";

function clampMarkupPct(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(200, v));
}

function readAll(): Record<string, DealerPricingSettings> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<DealerPricingSettings>>;
    const out: Record<string, DealerPricingSettings> = {};
    for (const [dealerId, v] of Object.entries(parsed ?? {})) {
      const pctRaw = Number((v as any)?.markupPct);
      const markupPct = clampMarkupPct(pctRaw);
      out[dealerId] = {
        dealerId,
        markupPct,
        updatedAt: typeof (v as any)?.updatedAt === "string" ? (v as any).updatedAt : new Date().toISOString(),
      };
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(next: Record<string, DealerPricingSettings>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function getDealerMarkupPct(dealerId: string): number {
  const did = dealerId.trim();
  if (!did) return 0;
  const all = readAll();
  const v = all[did];
  return typeof v?.markupPct === "number" ? clampMarkupPct(v.markupPct) : 0;
}

export function setDealerMarkupPct(dealerId: string, markupPct: number) {
  const did = dealerId.trim();
  if (!did) throw new Error("dealerId is required");
  const pct = clampMarkupPct(markupPct);
  const all = readAll();
  writeAll({
    ...all,
    [did]: {
      dealerId: did,
      markupPct: pct,
      updatedAt: new Date().toISOString(),
    },
  });
}

export function costFromProductOrPricing(input: { dealerCostCents?: number; basePriceCents?: number }) {
  if (typeof input.dealerCostCents === "number") return input.dealerCostCents;
  if (typeof input.basePriceCents === "number") return input.basePriceCents;
  return undefined;
}

export function retailFromCost(costCents: number | undefined, markupPct: number) {
  if (typeof costCents !== "number") return undefined;
  const pct = clampMarkupPct(markupPct);
  return Math.round(costCents * (1 + pct / 100));
}

export function marginFromCostAndRetail(costCents: number | undefined, retailCents: number | undefined) {
  if (typeof costCents !== "number" || typeof retailCents !== "number") return undefined;
  return retailCents - costCents;
}

export function marginPctFromCostAndRetail(costCents: number | undefined, retailCents: number | undefined) {
  if (typeof costCents !== "number" || typeof retailCents !== "number") return undefined;
  if (costCents <= 0) return undefined;
  return ((retailCents - costCents) / costCents) * 100;
}
