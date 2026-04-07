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
          isDefault: (r as any).isDefault === true,
          vehicleMileageMinKm: typeof r.vehicleMileageMinKm === "number" ? r.vehicleMileageMinKm : undefined,
          vehicleMileageMaxKm:
            typeof r.vehicleMileageMaxKm === "number" ? r.vehicleMileageMaxKm : r.vehicleMileageMaxKm === null ? null : undefined,
          vehicleClass: typeof r.vehicleClass === "string" ? r.vehicleClass : undefined,
          loanAmountMinCents: typeof (r as any).loanAmountMinCents === "number" ? (r as any).loanAmountMinCents : undefined,
          loanAmountMaxCents: typeof (r as any).loanAmountMaxCents === "number" ? (r as any).loanAmountMaxCents : undefined,
          financeTermMonths: typeof (r as any).financeTermMonths === "number" ? (r as any).financeTermMonths : undefined,
          providerNetCostCents: typeof (r as any).providerNetCostCents === "number" ? (r as any).providerNetCostCents : undefined,
          claimLimitCents: typeof (r as any).claimLimitCents === "number" ? (r as any).claimLimitCents : undefined,
          claimLimitType: typeof (r as any).claimLimitType === "string" ? (r as any).claimLimitType : undefined,
          claimLimitAmountCents: typeof (r as any).claimLimitAmountCents === "number" ? (r as any).claimLimitAmountCents : undefined,
          deductibleCents: typeof r.deductibleCents === "number" ? r.deductibleCents : 0,
          basePriceCents: typeof r.basePriceCents === "number" ? r.basePriceCents : 0,
          dealerCostCents: typeof r.dealerCostCents === "number" ? r.dealerCostCents : undefined,
          suggestedRetailPriceCents: typeof (r as any).suggestedRetailPriceCents === "number" ? (r as any).suggestedRetailPriceCents : undefined,
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
      .sort((a, b) => {
        const ad = a.isDefault ? 1 : 0;
        const bd = b.isDefault ? 1 : 0;
        const diff = bd - ad;
        if (diff) return diff;
        return b.createdAt.localeCompare(a.createdAt);
      });
  },

  async listAll() {
    const uid = currentUserId();
    const role = (currentUserRole() ?? "").toString().trim().toUpperCase();

    return read()
      .filter((r) => (role === "PROVIDER" ? r.providerId === uid : true))
      .sort((a, b) => {
        const ad = a.isDefault ? 1 : 0;
        const bd = b.isDefault ? 1 : 0;
        const diff = bd - ad;
        if (diff) return diff;
        return b.createdAt.localeCompare(a.createdAt);
      });
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

    if (typeof input.financeTermMonths === "number") {
      if (!Number.isFinite(input.financeTermMonths) || input.financeTermMonths <= 0) {
        throw new Error("financeTermMonths must be a positive number");
      }
      if (![24, 36, 48, 60, 72, 84, 96].includes(input.financeTermMonths)) {
        throw new Error("financeTermMonths must be one of: 24, 36, 48, 60, 72, 84, 96");
      }
      if (typeof input.loanAmountMinCents !== "number" || !Number.isFinite(input.loanAmountMinCents) || input.loanAmountMinCents < 0) {
        throw new Error("loanAmountMinCents must be a number >= 0 when financeTermMonths is set");
      }
      if (typeof input.loanAmountMaxCents !== "number" || !Number.isFinite(input.loanAmountMaxCents) || input.loanAmountMaxCents <= 0) {
        throw new Error("loanAmountMaxCents must be a number > 0 when financeTermMonths is set");
      }
      if (input.loanAmountMaxCents <= input.loanAmountMinCents) {
        throw new Error("loanAmountMaxCents must be greater than loanAmountMinCents");
      }
      if (typeof input.providerNetCostCents !== "number" || !Number.isFinite(input.providerNetCostCents) || input.providerNetCostCents <= 0) {
        throw new Error("providerNetCostCents must be a positive number when financeTermMonths is set");
      }
    }

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
      isDefault: input.isDefault === true,
      vehicleMileageMinKm: typeof input.vehicleMileageMinKm === "number" ? input.vehicleMileageMinKm : undefined,
      vehicleMileageMaxKm:
        input.vehicleMileageMaxKm === undefined
          ? undefined
          : input.vehicleMileageMaxKm === null
            ? null
            : input.vehicleMileageMaxKm,
      vehicleClass: typeof input.vehicleClass === "string" ? input.vehicleClass : undefined,
      loanAmountMinCents: typeof input.loanAmountMinCents === "number" ? input.loanAmountMinCents : undefined,
      loanAmountMaxCents: typeof input.loanAmountMaxCents === "number" ? input.loanAmountMaxCents : undefined,
      financeTermMonths: typeof input.financeTermMonths === "number" ? input.financeTermMonths : undefined,
      providerNetCostCents: typeof input.providerNetCostCents === "number" ? input.providerNetCostCents : undefined,
      claimLimitCents: typeof input.claimLimitCents === "number" ? input.claimLimitCents : undefined,
      claimLimitType: typeof (input as any).claimLimitType === "string" ? (input as any).claimLimitType : undefined,
      claimLimitAmountCents: typeof (input as any).claimLimitAmountCents === "number" ? (input as any).claimLimitAmountCents : undefined,
      deductibleCents: input.deductibleCents,
      basePriceCents: typeof input.providerNetCostCents === "number" ? input.providerNetCostCents : input.basePriceCents,
      dealerCostCents: typeof input.dealerCostCents === "number" ? input.dealerCostCents : undefined,
      suggestedRetailPriceCents: typeof input.suggestedRetailPriceCents === "number" ? input.suggestedRetailPriceCents : undefined,
      createdAt: now,
    };

    const existing = read();
    const next =
      item.isDefault === true
        ? existing.map((r) => (r.productId === item.productId && r.providerId === uid ? { ...r, isDefault: false } : r))
        : existing;

    write([item, ...next]);
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
