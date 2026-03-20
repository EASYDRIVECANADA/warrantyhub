export type ProductType = "EXTENDED_WARRANTY" | "GAP" | "TIRE_RIM" | "APPEARANCE" | "OTHER";

export type PricingStructure = "FLAT" | "MILEAGE" | "CLASS" | "MILEAGE_CLASS" | "FINANCE_MATRIX";

export type PowertrainEligibility = "ALL" | "ICE" | "ELECTRIFIED" | "HEV" | "PHEV" | "BEV";

export type Product = {
  id: string;
  providerId: string;
  name: string;
  productType: ProductType;
  pricingStructure?: PricingStructure;
  powertrainEligibility?: PowertrainEligibility;
  programCode?: string;
  keyBenefits?: string;
  coverageMaxLtvPercent?: number | null;
  coverageDetails?: string;
  exclusions?: string;
  internalNotes?: string;
  class1VehicleTypes?: string;
  class2VehicleTypes?: string;
  class3VehicleTypes?: string;
  classVehicleTypes?: Record<string, string>;
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
  pricingStructure?: PricingStructure;
  powertrainEligibility?: PowertrainEligibility;
  keyBenefits?: string;
  coverageMaxLtvPercent?: number | null;
  coverageDetails?: string;
  exclusions?: string;
  class1VehicleTypes?: string;
  class2VehicleTypes?: string;
  class3VehicleTypes?: string;
  classVehicleTypes?: Record<string, string>;
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
