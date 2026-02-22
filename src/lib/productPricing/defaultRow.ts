export function defaultPricingRow<T extends { isDefault?: boolean }>(rows: T[]): T | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.find((r) => r.isDefault) ?? rows[0] ?? null;
}

export function bestPricingRowForVehicleMileage<T extends { isDefault?: boolean; vehicleMileageMaxKm?: number | null }>(
  rows: T[],
): T | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const finiteMaxes = rows.filter((r) => typeof r.vehicleMileageMaxKm === "number" && Number.isFinite(r.vehicleMileageMaxKm));
  if (finiteMaxes.length === 0) return defaultPricingRow(rows);

  const minMax = Math.min(...finiteMaxes.map((r) => r.vehicleMileageMaxKm as number));
  const tightest = rows.filter((r) => (typeof r.vehicleMileageMaxKm === "number" ? r.vehicleMileageMaxKm === minMax : false));
  return defaultPricingRow(tightest) ?? defaultPricingRow(rows);
}
