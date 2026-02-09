import type { ProductPricingApi, ListProductPricingOptions } from "./api";
import type { CreateProductPricingInput, ProductPricing } from "./types";

const STORAGE_KEY = "warrantyhub.local.product_pricing";
const DEV_BYPASS_KEY = "warrantyhub.dev.bypass_user";
const USERS_KEY = "warrantyhub.local.users";

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

function currentUserRole(): string | null {
  const uid = currentUserId();
  const raw = localStorage.getItem(USERS_KEY);
  if (!raw) return null;
  try {
    const users = JSON.parse(raw) as { id?: string; role?: string }[];
    const u = users.find((x) => x?.id === uid);
    return typeof u?.role === "string" ? u.role : null;
  } catch {
    return null;
  }
}

function read(): ProductPricing[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<ProductPricing>[];
    return parsed
      .map((r): ProductPricing => {
        const createdAt = r.createdAt ?? new Date().toISOString();
        const id = r.id ?? crypto.randomUUID();
        const providerId = r.providerId ?? "";
        const productId = r.productId ?? "";

        return {
          id,
          providerId,
          productId,
          termMonths: typeof r.termMonths === "number" ? r.termMonths : null,
          termKm: typeof r.termKm === "number" ? r.termKm : null,
          vehicleMileageMinKm: typeof r.vehicleMileageMinKm === "number" ? r.vehicleMileageMinKm : undefined,
          vehicleMileageMaxKm:
            typeof r.vehicleMileageMaxKm === "number" ? r.vehicleMileageMaxKm : r.vehicleMileageMaxKm === null ? null : undefined,
          vehicleClass: typeof r.vehicleClass === "string" ? r.vehicleClass : undefined,
          claimLimitCents: typeof (r as any).claimLimitCents === "number" ? (r as any).claimLimitCents : undefined,
          deductibleCents: typeof r.deductibleCents === "number" ? r.deductibleCents : 0,
          basePriceCents: typeof r.basePriceCents === "number" ? r.basePriceCents : 0,
          dealerCostCents: typeof r.dealerCostCents === "number" ? r.dealerCostCents : undefined,
          createdAt,
        };
      })
      .filter((r) => {
        const monthsOk = r.termMonths === null ? true : r.termMonths > 0;
        const kmOk = r.termKm === null ? true : r.termKm > 0;
        return r.providerId.trim() && r.productId.trim() && monthsOk && kmOk && r.basePriceCents > 0;
      });
  } catch {
    return [];
  }
}

function write(items: ProductPricing[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export const localProductPricingApi: ProductPricingApi = {
  async list(options: ListProductPricingOptions) {
    const uid = currentUserId();
    const role = (currentUserRole() ?? "").toString().trim().toUpperCase();
    const productId = options.productId;

    return read()
      .filter((r) => r.productId === productId)
      .filter((r) => (role === "PROVIDER" ? r.providerId === uid : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async create(input: CreateProductPricingInput) {
    const uid = currentUserId();
    const now = new Date().toISOString();

    if (!input.productId.trim()) throw new Error("productId is required");
    if (input.termMonths !== null && (!Number.isFinite(input.termMonths) || input.termMonths <= 0)) {
      throw new Error("termMonths must be null (Unlimited) or a positive number");
    }
    if (input.termKm !== null && (!Number.isFinite(input.termKm) || input.termKm <= 0)) {
      throw new Error("termKm must be null (Unlimited) or a positive number");
    }
    if (!Number.isFinite(input.deductibleCents) || input.deductibleCents < 0)
      throw new Error("deductibleCents must be a number >= 0");
    if (!Number.isFinite(input.basePriceCents) || input.basePriceCents <= 0) throw new Error("basePriceCents must be a positive number");

    if (typeof input.vehicleMileageMinKm === "number" && (!Number.isFinite(input.vehicleMileageMinKm) || input.vehicleMileageMinKm < 0)) {
      throw new Error("vehicleMileageMinKm must be a number >= 0");
    }
    if (
      input.vehicleMileageMaxKm !== undefined &&
      input.vehicleMileageMaxKm !== null &&
      (!Number.isFinite(input.vehicleMileageMaxKm) || input.vehicleMileageMaxKm < 0)
    ) {
      throw new Error("vehicleMileageMaxKm must be null (Unlimited) or a number >= 0");
    }
    if (
      typeof input.vehicleMileageMinKm === "number" &&
      typeof input.vehicleMileageMaxKm === "number" &&
      input.vehicleMileageMaxKm < input.vehicleMileageMinKm
    ) {
      throw new Error("vehicleMileageMaxKm must be >= vehicleMileageMinKm");
    }

    const item: ProductPricing = {
      id: crypto.randomUUID(),
      providerId: uid,
      productId: input.productId,
      termMonths: input.termMonths,
      termKm: input.termKm,
      vehicleMileageMinKm: typeof input.vehicleMileageMinKm === "number" ? input.vehicleMileageMinKm : undefined,
      vehicleMileageMaxKm:
        input.vehicleMileageMaxKm === undefined
          ? undefined
          : input.vehicleMileageMaxKm === null
            ? null
            : input.vehicleMileageMaxKm,
      vehicleClass: typeof input.vehicleClass === "string" ? input.vehicleClass : undefined,
      claimLimitCents: typeof input.claimLimitCents === "number" ? input.claimLimitCents : undefined,
      deductibleCents: input.deductibleCents,
      basePriceCents: input.basePriceCents,
      dealerCostCents: typeof input.dealerCostCents === "number" ? input.dealerCostCents : undefined,
      createdAt: now,
    };

    write([item, ...read()]);
    return item;
  },

  async remove(id: string) {
    const uid = currentUserId();
    const items = read();
    const current = items.find((r) => r.id === id);
    if (!current) return;
    if (current.providerId !== uid) throw new Error("Not authorized");

    write(items.filter((r) => r.id !== id));
  },
};
