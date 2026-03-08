type DealerProductRetailOverrides = {
  dealerId: string;
  productOverrides: Record<string, number>;
  pricingOverrides: Record<string, number>;
  addonOverrides: Record<string, number>;
  updatedAt: string;
};

const STORAGE_KEY = "warrantyhub.local.dealer_product_retail";

type Listener = () => void;
const listeners = new Set<Listener>();

function emitChange() {
  for (const l of listeners) l();
}

export function getDealerProductAddonRetailCents(dealerId: string, productId: string, addonId: string) {
  const did = dealerId.trim();
  const pid = productId.trim();
  const aid = addonId.trim();
  if (!did || !pid || !aid) return null;
  const all = readAll();
  const entry = all[did];
  const key = `${pid}:${aid}`;
  const raw = entry?.addonOverrides?.[key];
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
}

export function subscribeDealerProductRetail(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function clampRetailCents(v: number | null) {
  if (v === null) return null;
  if (!Number.isFinite(v)) return null;
  if (v <= 0) return null;
  return Math.round(v);
}

function readAll(): Record<string, DealerProductRetailOverrides> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<DealerProductRetailOverrides>>;
    const out: Record<string, DealerProductRetailOverrides> = {};
    for (const [dealerId, v] of Object.entries(parsed ?? {})) {
      const did = (dealerId ?? "").toString().trim();
      if (!did) continue;

      const legacyOverridesRaw = v && typeof v === "object" ? ((v as any).overrides as unknown) : undefined;
      const productOverridesRaw = v && typeof v === "object" ? ((v as any).productOverrides as unknown) : undefined;
      const pricingOverridesRaw = v && typeof v === "object" ? ((v as any).pricingOverrides as unknown) : undefined;
      const addonOverridesRaw = v && typeof v === "object" ? ((v as any).addonOverrides as unknown) : undefined;

      const productOverrides: Record<string, number> = {};
      const coerceRecord = (rawObj: unknown) => (rawObj && typeof rawObj === "object" ? (rawObj as Record<string, unknown>) : null);

      const prodSource = coerceRecord(productOverridesRaw) ?? coerceRecord(legacyOverridesRaw);
      if (prodSource) {
        for (const [productId, centsRaw] of Object.entries(prodSource)) {
          const pid = (productId ?? "").toString().trim();
          if (!pid) continue;
          const cents = clampRetailCents(Number(centsRaw));
          if (typeof cents === "number") productOverrides[pid] = cents;
        }
      }

      const pricingOverrides: Record<string, number> = {};
      const pricingSource = coerceRecord(pricingOverridesRaw);
      if (pricingSource) {
        for (const [key, centsRaw] of Object.entries(pricingSource)) {
          const k = (key ?? "").toString().trim();
          if (!k) continue;
          const cents = clampRetailCents(Number(centsRaw));
          if (typeof cents === "number") pricingOverrides[k] = cents;
        }
      }

      const addonOverrides: Record<string, number> = {};
      const addonSource = coerceRecord(addonOverridesRaw);
      if (addonSource) {
        for (const [key, centsRaw] of Object.entries(addonSource)) {
          const k = (key ?? "").toString().trim();
          if (!k) continue;
          const cents = clampRetailCents(Number(centsRaw));
          if (typeof cents === "number") addonOverrides[k] = cents;
        }
      }

      out[did] = {
        dealerId: did,
        productOverrides,
        pricingOverrides,
        addonOverrides,
        updatedAt: typeof (v as any)?.updatedAt === "string" ? String((v as any).updatedAt) : new Date().toISOString(),
      };
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(next: Record<string, DealerProductRetailOverrides>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emitChange();
}

export function getDealerProductRetailCents(dealerId: string, productId: string) {
  const did = dealerId.trim();
  const pid = productId.trim();
  if (!did || !pid) return null;
  const all = readAll();
  const entry = all[did];
  const raw = entry?.productOverrides?.[pid];
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
}

export function getDealerProductPricingRetailCents(dealerId: string, productId: string, pricingId: string) {
  const did = dealerId.trim();
  const pid = productId.trim();
  const rid = pricingId.trim();
  if (!did || !pid || !rid) return null;
  const all = readAll();
  const entry = all[did];
  const key = `${pid}:${rid}`;
  const raw = entry?.pricingOverrides?.[key];
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
}

export function getDealerProductRetailOverrides(dealerId: string) {
  const did = dealerId.trim();
  if (!did) return {} as Record<string, number>;
  const all = readAll();
  const entry = all[did];
  return entry?.productOverrides ?? {};
}

export function getDealerProductPricingRetailOverrides(dealerId: string) {
  const did = dealerId.trim();
  if (!did) return {} as Record<string, number>;
  const all = readAll();
  const entry = all[did];
  return entry?.pricingOverrides ?? {};
}

export function setDealerProductRetailCents(dealerId: string, productId: string, retailCents: number | null) {
  const did = dealerId.trim();
  const pid = productId.trim();
  if (!did) throw new Error("dealerId is required");
  if (!pid) throw new Error("productId is required");

  const all = readAll();
  const current = all[did]?.productOverrides ?? {};
  const nextOverrides = { ...current };

  const cents = clampRetailCents(retailCents);
  if (typeof cents === "number") {
    nextOverrides[pid] = cents;
  } else {
    delete nextOverrides[pid];
  }

  writeAll({
    ...all,
    [did]: {
      dealerId: did,
      productOverrides: nextOverrides,
      pricingOverrides: all[did]?.pricingOverrides ?? {},
      addonOverrides: all[did]?.addonOverrides ?? {},
      updatedAt: new Date().toISOString(),
    },
  });
}

export function setDealerProductPricingRetailCents(dealerId: string, productId: string, pricingId: string, retailCents: number | null) {
  const did = dealerId.trim();
  const pid = productId.trim();
  const rid = pricingId.trim();
  if (!did) throw new Error("dealerId is required");
  if (!pid) throw new Error("productId is required");
  if (!rid) throw new Error("pricingId is required");

  const all = readAll();
  const current = all[did]?.pricingOverrides ?? {};
  const nextOverrides = { ...current };

  const key = `${pid}:${rid}`;
  const cents = clampRetailCents(retailCents);
  if (typeof cents === "number") {
    nextOverrides[key] = cents;
  } else {
    delete nextOverrides[key];
  }

  writeAll({
    ...all,
    [did]: {
      dealerId: did,
      productOverrides: all[did]?.productOverrides ?? {},
      pricingOverrides: nextOverrides,
      addonOverrides: all[did]?.addonOverrides ?? {},
      updatedAt: new Date().toISOString(),
    },
  });
}

export function setDealerProductAddonRetailCents(dealerId: string, productId: string, addonId: string, retailCents: number | null) {
  const did = dealerId.trim();
  const pid = productId.trim();
  const aid = addonId.trim();
  if (!did) throw new Error("dealerId is required");
  if (!pid) throw new Error("productId is required");
  if (!aid) throw new Error("addonId is required");

  const all = readAll();
  const current = all[did]?.addonOverrides ?? {};
  const nextOverrides = { ...current };

  const key = `${pid}:${aid}`;
  const cents = clampRetailCents(retailCents);
  if (typeof cents === "number") {
    nextOverrides[key] = cents;
  } else {
    delete nextOverrides[key];
  }

  writeAll({
    ...all,
    [did]: {
      dealerId: did,
      productOverrides: all[did]?.productOverrides ?? {},
      pricingOverrides: all[did]?.pricingOverrides ?? {},
      addonOverrides: nextOverrides,
      updatedAt: new Date().toISOString(),
    },
  });
}
