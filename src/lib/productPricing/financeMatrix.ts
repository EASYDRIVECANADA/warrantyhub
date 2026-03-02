import type { ProductPricing } from "./types";

export type ResolveFinanceMatrixPricingRowResult =
  | { ok: true; row: ProductPricing; reason: null }
  | { ok: false; row: null; reason: string };

function asFiniteNonNegativeInt(v: unknown) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && Number.isInteger(v) ? v : null;
}

export function resolveFinanceMatrixPricingRow(input: {
  rows: ProductPricing[];
  loanAmountCents: number | null | undefined;
  financeTermMonths: number | null | undefined;
}): ResolveFinanceMatrixPricingRowResult {
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const term = asFiniteNonNegativeInt(input.financeTermMonths);
  if (term === null) return { ok: false, row: null, reason: "Finance term is required." };

  const loan = asFiniteNonNegativeInt(input.loanAmountCents);
  if (loan === null) return { ok: false, row: null, reason: "Loan amount is required." };

  const candidates = rows
    .filter((r) => asFiniteNonNegativeInt(r.financeTermMonths) === term)
    .filter((r) => {
      const min = asFiniteNonNegativeInt(r.loanAmountMinCents);
      const max = asFiniteNonNegativeInt(r.loanAmountMaxCents);
      if (min === null || max === null) return false;
      if (max < min) return false;
      return loan >= min && loan <= max;
    });

  if (candidates.length === 0) {
    return { ok: false, row: null, reason: "No matching finance matrix pricing found for this loan amount and term." };
  }

  const scored = candidates
    .map((r) => {
      const min = asFiniteNonNegativeInt(r.loanAmountMinCents) ?? 0;
      const max = asFiniteNonNegativeInt(r.loanAmountMaxCents) ?? 0;
      return { r, range: max - min };
    })
    .sort((a, b) => {
      if (a.range !== b.range) return a.range - b.range;
      if (a.r.isDefault !== b.r.isDefault) return a.r.isDefault ? -1 : 1;
      return (a.r.id ?? "").localeCompare(b.r.id ?? "");
    });

  return { ok: true, row: scored[0]!.r, reason: null };
}
