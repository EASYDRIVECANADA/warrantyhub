export type ProductType = "EXTENDED_WARRANTY" | "GAP" | "TIRE_RIM" | "APPEARANCE" | "OTHER";

export type Product = {
  id: string;
  providerId: string;
  name: string;
  productType: ProductType;
  programCode?: string;
  coverageDetails?: string;
  exclusions?: string;
  internalNotes?: string;
  termMonths?: number;
  termKm?: number;
  deductibleCents?: number;
  eligibilityMaxVehicleAgeYears?: number | null;
  eligibilityMaxMileageKm?: number | null;
  eligibilityMakeAllowlist?: string[];
  eligibilityModelAllowlist?: string[];
  eligibilityTrimAllowlist?: string[];
  basePriceCents?: number;
  dealerCostCents?: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateProductInput = {
  name: string;
  productType: ProductType;
  coverageDetails?: string;
  exclusions?: string;
  termMonths?: number;
  termKm?: number;
  deductibleCents?: number;
  eligibilityMaxVehicleAgeYears?: number | null;
  eligibilityMaxMileageKm?: number | null;
  eligibilityMakeAllowlist?: string[];
  eligibilityModelAllowlist?: string[];
  eligibilityTrimAllowlist?: string[];
  basePriceCents?: number;
  dealerCostCents?: number;
};
