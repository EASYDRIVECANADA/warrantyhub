export type ProductTypeV2 =
  | "VSC"
  | "GAP"
  | "Tire & Rim"
  | "PPF"
  | "Ceramic Coating"
  | "Undercoating"
  | "Key Replacement"
  | "Dent Repair"
  | "Other";

export type ProductStatusV2 = "active" | "inactive" | "draft";

export type CoverageCategory = {
  name: string;
  parts: string[];
};

export type PricingRow = {
  term: string;
  mileageBracket: string;
  vehicleClass: string;
  dealerCost: number;
  suggestedRetail: number;
};

export type Benefit = {
  name: string;
  included: boolean;
};

export type TermsSection = {
  title: string;
  content: string;
};

export type ProductCoverageDetails = {
  categories?: CoverageCategory[];
};

export type ProductPricing = {
  rows?: PricingRow[];
  deductible?: string;
  perClaim?: string;
};

export type ProductEligibilityRules = {
  maxAge?: string;
  maxMileage?: string;
  makes?: string[];
  models?: string[];
};

export type ProductV2 = {
  id: string;
  providerEntityId: string;
  name: string;
  type: ProductTypeV2;
  description?: string;
  coverageDetails?: ProductCoverageDetails;
  pricing?: ProductPricing;
  eligibilityRules?: ProductEligibilityRules;
  benefits?: Benefit[];
  termsSections?: TermsSection[];
  exclusions?: string;
  status: ProductStatusV2;
  createdAt: string;
  updatedAt: string;
};

export type CreateProductV2Input = {
  name: string;
  type: ProductTypeV2;
  description?: string;
  status?: ProductStatusV2;
  coverageDetails?: ProductCoverageDetails;
  pricing?: ProductPricing;
  eligibilityRules?: ProductEligibilityRules;
  benefits?: Benefit[];
  termsSections?: TermsSection[];
  exclusions?: string;
};

export type UpdateProductV2Input = Partial<Omit<ProductV2, "id" | "providerEntityId" | "createdAt" | "updatedAt">>;
