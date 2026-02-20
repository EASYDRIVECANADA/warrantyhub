import type { ProductPricing } from "./types";

type VehicleClass = string | null | undefined;

function asFiniteNonNegativeNumber(v: unknown) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

function matchesMinMax(input: { value: number; min?: number | null; max?: number | null }) {
  const min = typeof input.min === "number" && Number.isFinite(input.min) ? input.min : 0;
  const max = typeof input.max === "number" && Number.isFinite(input.max) ? input.max : null;
  if (input.value < min) return false;
  if (typeof max === "number" && input.value > max) return false;
  return true;
}

function matchesMin(input: { value: number | null; min?: number | null }) {
  const min = typeof input.min === "number" && Number.isFinite(input.min) ? input.min : null;
  if (typeof min !== "number") return true;
  if (input.value === null) return true;
  return input.value >= min;
}

function matchesMax(input: { value: number; max?: number | null }) {
  const max = typeof input.max === "number" && Number.isFinite(input.max) ? input.max : null;
  if (typeof max !== "number") return true;
  return input.value <= max;
}

export function isPricingEligibleForVehicle(input: {
  pricing: ProductPricing;
  vehicleMileageKm: number | null | undefined;
  vehicleClass: VehicleClass;
}): boolean {
  const mileage = asFiniteNonNegativeNumber(input.vehicleMileageKm);
  if (mileage === null) return false;

  if (
    !matchesMinMax({
      value: mileage,
      min: typeof input.pricing.vehicleMileageMinKm === "number" ? input.pricing.vehicleMileageMinKm : 0,
      max: input.pricing.vehicleMileageMaxKm ?? null,
    })
  ) {
    return false;
  }

  const reqClass = (input.pricing.vehicleClass ?? "").trim();
  if (reqClass) {
    const vClass = (input.vehicleClass ?? "").trim();
    if (!vClass) return false;
    if (vClass !== reqClass) return false;
  }

  return true;
}

export function isPricingEligibleForVehicleWithConstraints(input: {
  pricing: ProductPricing;
  vehicleMileageKm: number | null | undefined;
  vehicleClass: VehicleClass;
  minTermMonths?: number | null;
  minTermKm?: number | null;
  maxDeductibleCents?: number | null;
}): boolean {
  if (!isPricingEligibleForVehicle({ pricing: input.pricing, vehicleMileageKm: input.vehicleMileageKm, vehicleClass: input.vehicleClass })) {
    return false;
  }

  const termMonths = typeof input.pricing.termMonths === "number" && Number.isFinite(input.pricing.termMonths) ? input.pricing.termMonths : null;
  const termKm = typeof input.pricing.termKm === "number" && Number.isFinite(input.pricing.termKm) ? input.pricing.termKm : null;

  if (!matchesMin({ value: termMonths, min: input.minTermMonths ?? null })) return false;
  if (!matchesMin({ value: termKm, min: input.minTermKm ?? null })) return false;

  const deductible = typeof input.pricing.deductibleCents === "number" && Number.isFinite(input.pricing.deductibleCents)
    ? input.pricing.deductibleCents
    : 0;
  if (!matchesMax({ value: deductible, max: input.maxDeductibleCents ?? null })) return false;

  return true;
}
