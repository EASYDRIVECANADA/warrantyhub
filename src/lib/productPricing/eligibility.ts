import type { ProductPricing } from "./types";

type VehicleClass = string | null | undefined;

export function isPricingEligibleForVehicle(input: {
  pricing: ProductPricing;
  vehicleMileageKm: number | null | undefined;
  vehicleClass: VehicleClass;
}): boolean {
  const mileage = input.vehicleMileageKm;
  if (typeof mileage !== "number" || !Number.isFinite(mileage) || mileage < 0) return false;

  const min = typeof input.pricing.vehicleMileageMinKm === "number" ? input.pricing.vehicleMileageMinKm : 0;
  const max = input.pricing.vehicleMileageMaxKm;

  if (mileage < min) return false;
  if (typeof max === "number" && mileage > max) return false;

  const reqClass = (input.pricing.vehicleClass ?? "").trim();
  if (reqClass) {
    const vClass = (input.vehicleClass ?? "").trim();
    if (!vClass) return false;
    if (vClass !== reqClass) return false;
  }

  return true;
}
