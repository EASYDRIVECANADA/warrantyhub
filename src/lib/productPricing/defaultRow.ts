export function defaultPricingRow<T extends { isDefault?: boolean }>(rows: T[]): T | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.find((r) => r.isDefault) ?? rows[0] ?? null;
}
