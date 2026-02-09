import type { ProductAddonsApi, ListProductAddonsOptions } from "./api";
import type { CreateProductAddonInput, ProductAddon } from "./types";

const STORAGE_KEY = "warrantyhub.local.product_addons";
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

function read(): ProductAddon[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<ProductAddon>[];
    return parsed
      .map((a): ProductAddon => {
        const createdAt = a.createdAt ?? new Date().toISOString();
        const updatedAt = a.updatedAt ?? createdAt;
        const id = a.id ?? crypto.randomUUID();
        const providerId = a.providerId ?? "";
        const productId = a.productId ?? "";
        const name = (a.name ?? "").toString();
        const active = typeof (a as any).active === "boolean" ? Boolean((a as any).active) : true;

        return {
          id,
          providerId,
          productId,
          name,
          description: typeof a.description === "string" ? a.description : undefined,
          basePriceCents: typeof a.basePriceCents === "number" ? a.basePriceCents : 0,
          minPriceCents: typeof (a as any).minPriceCents === "number" ? (a as any).minPriceCents : undefined,
          maxPriceCents: typeof (a as any).maxPriceCents === "number" ? (a as any).maxPriceCents : undefined,
          dealerCostCents: typeof a.dealerCostCents === "number" ? a.dealerCostCents : undefined,
          active,
          createdAt,
          updatedAt,
        };
      })
      .filter((a) => a.providerId.trim() && a.productId.trim() && a.name.trim() && a.basePriceCents > 0);
  } catch {
    return [];
  }
}

function write(items: ProductAddon[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export const localProductAddonsApi: ProductAddonsApi = {
  async list(options: ListProductAddonsOptions) {
    const uid = currentUserId();
    const role = (currentUserRole() ?? "").toString().trim().toUpperCase();
    const productId = options.productId;

    return read()
      .filter((a) => a.productId === productId)
      .filter((a) => (role === "PROVIDER" ? a.providerId === uid : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async create(input: CreateProductAddonInput) {
    const uid = currentUserId();
    const now = new Date().toISOString();

    if (!input.productId.trim()) throw new Error("productId is required");
    if (!input.name.trim()) throw new Error("name is required");
    if (!Number.isFinite(input.basePriceCents) || input.basePriceCents <= 0) {
      throw new Error("basePriceCents must be a positive number");
    }

    if (typeof input.minPriceCents === "number" && (!Number.isFinite(input.minPriceCents) || input.minPriceCents < 0)) {
      throw new Error("minPriceCents must be a non-negative number");
    }
    if (typeof input.maxPriceCents === "number" && (!Number.isFinite(input.maxPriceCents) || input.maxPriceCents < 0)) {
      throw new Error("maxPriceCents must be a non-negative number");
    }
    if (typeof input.minPriceCents === "number" && typeof input.maxPriceCents === "number" && input.maxPriceCents < input.minPriceCents) {
      throw new Error("maxPriceCents must be >= minPriceCents");
    }
    if (typeof input.dealerCostCents === "number" && (!Number.isFinite(input.dealerCostCents) || input.dealerCostCents < 0)) {
      throw new Error("dealerCostCents must be a non-negative number");
    }

    const item: ProductAddon = {
      id: crypto.randomUUID(),
      providerId: uid,
      productId: input.productId,
      name: input.name,
      description: input.description,
      basePriceCents: input.basePriceCents,
      minPriceCents: typeof input.minPriceCents === "number" ? input.minPriceCents : undefined,
      maxPriceCents: typeof input.maxPriceCents === "number" ? input.maxPriceCents : undefined,
      dealerCostCents: input.dealerCostCents,
      active: typeof input.active === "boolean" ? input.active : true,
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
    const idx = items.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error("Add-on not found");

    const current = items[idx]!;
    if (current.providerId !== uid) throw new Error("Not authorized");

    const next: ProductAddon = {
      ...current,
      ...patch,
      updatedAt: now,
    };

    if (!next.name.trim()) throw new Error("name is required");
    if (!Number.isFinite(next.basePriceCents) || next.basePriceCents <= 0) throw new Error("basePriceCents must be a positive number");

    if (typeof next.minPriceCents === "number" && (!Number.isFinite(next.minPriceCents) || next.minPriceCents < 0)) {
      throw new Error("minPriceCents must be a non-negative number");
    }
    if (typeof next.maxPriceCents === "number" && (!Number.isFinite(next.maxPriceCents) || next.maxPriceCents < 0)) {
      throw new Error("maxPriceCents must be a non-negative number");
    }
    if (typeof next.minPriceCents === "number" && typeof next.maxPriceCents === "number" && next.maxPriceCents < next.minPriceCents) {
      throw new Error("maxPriceCents must be >= minPriceCents");
    }

    const updated = [...items];
    updated[idx] = next;
    write(updated);
    return next;
  },

  async remove(id: string) {
    const uid = currentUserId();
    const items = read();
    const current = items.find((a) => a.id === id);
    if (!current) return;
    if (current.providerId !== uid) throw new Error("Not authorized");

    write(items.filter((a) => a.id !== id));
  },
};
