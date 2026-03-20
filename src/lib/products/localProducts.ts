import type { ProductsApi } from "./api";
import type { CreateProductInput, Product, ProductType, PricingStructure, PowertrainEligibility } from "./types";

const STORAGE_KEY = "warrantyhub.local.products";
const DEV_BYPASS_KEY = "warrantyhub.dev.bypass_user";

function readDevBypassUserId(): string | null {
  if (!import.meta.env.DEV) return null;
  const raw = localStorage.getItem(DEV_BYPASS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: string };
    return typeof parsed.id === "string" ? parsed.id : null;
  } catch {
    return null;
  }
}

function readLocalSessionUserId(): string | null {
  const raw = localStorage.getItem("warrantyhub.local.session");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { userId?: string };
    return typeof parsed.userId === "string" ? parsed.userId : null;
  } catch {
    return null;
  }
}

function currentUserId(): string {
  const bypass = readDevBypassUserId();
  if (bypass) return bypass;

  const session = readLocalSessionUserId();
  if (session) return session;

  throw new Error("Not authenticated");
}

function read(): Product[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<Product>[];
    return parsed
      .map((p): Product => {
        const createdAt = p.createdAt ?? new Date().toISOString();
        const updatedAt = p.updatedAt ?? createdAt;
        const id = p.id ?? crypto.randomUUID();
        const providerId = p.providerId ?? "";

        const powertrainEligibilityRaw = (p as any).powertrainEligibility;
        const powertrainEligibility: PowertrainEligibility | undefined =
          typeof powertrainEligibilityRaw === "string" &&
          ["ALL", "ICE", "ELECTRIFIED", "HEV", "PHEV", "BEV"].includes(powertrainEligibilityRaw.toUpperCase())
            ? (powertrainEligibilityRaw.toUpperCase() as PowertrainEligibility)
            : undefined;

        const classVehicleTypesRaw = (p as any).classVehicleTypes;
        const classVehicleTypes: Record<string, string> | undefined =
          classVehicleTypesRaw && typeof classVehicleTypesRaw === "object" && !Array.isArray(classVehicleTypesRaw)
            ? (Object.fromEntries(
                Object.entries(classVehicleTypesRaw as Record<string, unknown>)
                  .filter(([k, v]) => typeof k === "string" && typeof v === "string")
                  .map(([k, v]) => [k, String(v)])
              ) as Record<string, string>)
            : undefined;

        return {
          id,
          providerId,
          name: p.name ?? "",
          productType: (p.productType ?? "OTHER") as ProductType,
          pricingStructure: typeof (p as any).pricingStructure === "string" ? ((p as any).pricingStructure as PricingStructure) : undefined,
          powertrainEligibility,
          programCode: typeof p.programCode === "string" ? p.programCode : undefined,
          keyBenefits: typeof (p as any).keyBenefits === "string" ? (p as any).keyBenefits : undefined,
          coverageMaxLtvPercent:
            (p as any).coverageMaxLtvPercent === null
              ? null
              : typeof (p as any).coverageMaxLtvPercent === "number"
                ? (p as any).coverageMaxLtvPercent
                : undefined,
          coverageDetails: p.coverageDetails,
          exclusions: p.exclusions,
          internalNotes: typeof p.internalNotes === "string" ? p.internalNotes : undefined,
          class1VehicleTypes: typeof (p as any).class1VehicleTypes === "string" ? (p as any).class1VehicleTypes : undefined,
          class2VehicleTypes: typeof (p as any).class2VehicleTypes === "string" ? (p as any).class2VehicleTypes : undefined,
          class3VehicleTypes: typeof (p as any).class3VehicleTypes === "string" ? (p as any).class3VehicleTypes : undefined,
          classVehicleTypes,
          termMonths: typeof p.termMonths === "number" ? p.termMonths : undefined,
          termKm: typeof p.termKm === "number" ? p.termKm : undefined,
          deductibleCents: typeof p.deductibleCents === "number" ? p.deductibleCents : undefined,
          eligibilityMaxVehicleAgeYears:
            p.eligibilityMaxVehicleAgeYears === null
              ? null
              : typeof p.eligibilityMaxVehicleAgeYears === "number"
                ? p.eligibilityMaxVehicleAgeYears
                : undefined,
          eligibilityMaxMileageKm:
            p.eligibilityMaxMileageKm === null
              ? null
              : typeof p.eligibilityMaxMileageKm === "number"
                ? p.eligibilityMaxMileageKm
                : undefined,
          eligibilityMakeAllowlist: Array.isArray(p.eligibilityMakeAllowlist)
            ? (p.eligibilityMakeAllowlist.filter((x) => typeof x === "string") as string[])
            : undefined,
          eligibilityModelAllowlist: Array.isArray(p.eligibilityModelAllowlist)
            ? (p.eligibilityModelAllowlist.filter((x) => typeof x === "string") as string[])
            : undefined,
          eligibilityTrimAllowlist: Array.isArray(p.eligibilityTrimAllowlist)
            ? (p.eligibilityTrimAllowlist.filter((x) => typeof x === "string") as string[])
            : undefined,
          basePriceCents: typeof p.basePriceCents === "number" ? p.basePriceCents : undefined,
          dealerCostCents: typeof p.dealerCostCents === "number" ? p.dealerCostCents : undefined,
          published: Boolean(p.published),
          createdAt,
          updatedAt,
        };
      })
      .filter((p) => p.providerId.trim() && p.name.trim());
  } catch {
    return [];
  }
}

function write(items: Product[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export const localProductsApi: ProductsApi = {
  async list() {
    const uid = currentUserId();
    return read()
      .filter((p) => p.providerId === uid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(id: string) {
    const uid = currentUserId();
    const item = read().find((p) => p.id === id && p.providerId === uid);
    return item ?? null;
  },

  async create(input: CreateProductInput) {
    const uid = currentUserId();
    const now = new Date().toISOString();
    const item: Product = {
      id: crypto.randomUUID(),
      providerId: uid,
      name: input.name,
      productType: input.productType,
      pricingStructure: input.pricingStructure,
      powertrainEligibility: input.powertrainEligibility,
      keyBenefits: input.keyBenefits,
      coverageMaxLtvPercent: input.coverageMaxLtvPercent,
      coverageDetails: input.coverageDetails,
      exclusions: input.exclusions,
      class1VehicleTypes: input.class1VehicleTypes,
      class2VehicleTypes: input.class2VehicleTypes,
      class3VehicleTypes: input.class3VehicleTypes,
      classVehicleTypes: input.classVehicleTypes,
      termMonths: input.termMonths,
      termKm: input.termKm,
      deductibleCents: input.deductibleCents,
      eligibilityMaxVehicleAgeYears: input.eligibilityMaxVehicleAgeYears,
      eligibilityMaxMileageKm: input.eligibilityMaxMileageKm,
      eligibilityMakeAllowlist: input.eligibilityMakeAllowlist,
      eligibilityModelAllowlist: input.eligibilityModelAllowlist,
      eligibilityTrimAllowlist: input.eligibilityTrimAllowlist,
      basePriceCents: input.basePriceCents,
      dealerCostCents: input.dealerCostCents,
      published: false,
      createdAt: now,
      updatedAt: now,
    };

    const next = [item, ...read()];
    write(next);
    return item;
  },

  async update(id: string, patch) {
    const uid = currentUserId();
    const now = new Date().toISOString();

    const items = read();
    const idx = items.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error("Product not found");

    const current = items[idx]!;
    if (current.providerId !== uid) throw new Error("Not authorized");

    const nextAllowlists: Partial<Pick<Product, "eligibilityMakeAllowlist" | "eligibilityModelAllowlist" | "eligibilityTrimAllowlist">> = {};
    if (Array.isArray(patch.eligibilityMakeAllowlist)) {
      nextAllowlists.eligibilityMakeAllowlist = patch.eligibilityMakeAllowlist.length ? patch.eligibilityMakeAllowlist : undefined;
    }
    if (Array.isArray(patch.eligibilityModelAllowlist)) {
      nextAllowlists.eligibilityModelAllowlist = patch.eligibilityModelAllowlist.length ? patch.eligibilityModelAllowlist : undefined;
    }
    if (Array.isArray(patch.eligibilityTrimAllowlist)) {
      nextAllowlists.eligibilityTrimAllowlist = patch.eligibilityTrimAllowlist.length ? patch.eligibilityTrimAllowlist : undefined;
    }

    const nextEligibility: Partial<Pick<Product, "eligibilityMaxVehicleAgeYears" | "eligibilityMaxMileageKm">> = {};
    if (patch.eligibilityMaxVehicleAgeYears === null || typeof patch.eligibilityMaxVehicleAgeYears === "number") {
      nextEligibility.eligibilityMaxVehicleAgeYears = patch.eligibilityMaxVehicleAgeYears;
    }
    if (patch.eligibilityMaxMileageKm === null || typeof patch.eligibilityMaxMileageKm === "number") {
      nextEligibility.eligibilityMaxMileageKm = patch.eligibilityMaxMileageKm;
    }

    const nextPowertrain: Partial<Pick<Product, "powertrainEligibility">> = {};
    if (typeof (patch as any).powertrainEligibility === "string") {
      const t = String((patch as any).powertrainEligibility).trim().toUpperCase();
      if (["ALL", "ICE", "ELECTRIFIED", "HEV", "PHEV", "BEV"].includes(t)) nextPowertrain.powertrainEligibility = t as PowertrainEligibility;
    }

    const next: Product = {
      ...current,
      ...patch,
      ...nextEligibility,
      ...nextPowertrain,
      ...nextAllowlists,
      updatedAt: now,
    };

    const updated = [...items];
    updated[idx] = next;
    write(updated);
    return next;
  },

  async remove(id: string) {
    const uid = currentUserId();
    const items = read();
    const current = items.find((p) => p.id === id);
    if (!current) return;
    if (current.providerId !== uid) throw new Error("Not authorized");

    write(items.filter((p) => p.id !== id));
  },
};
