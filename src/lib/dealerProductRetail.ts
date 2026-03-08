import { getAppMode } from "./runtime";
import { getSupabaseClient } from "./supabase/client";

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

async function listSupabaseOverrides(dealerId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const did = dealerId.trim();
  if (!did) throw new Error("dealerId is required");

  const { data, error } = await supabase
    .from("dealer_retail_overrides")
    .select("product_id, pricing_id, addon_id, retail_cents")
    .eq("dealer_id", did);
  if (error) throw error;
  return (data ?? []) as Array<{
    product_id: string | null;
    pricing_id: string | null;
    addon_id: string | null;
    retail_cents: number | null;
  }>;
}

export async function syncDealerRetailOverridesFromSupabase(dealerId: string) {
  if (getAppMode() !== "supabase") return;
  const did = dealerId.trim();
  if (!did) return;

  const rows = await listSupabaseOverrides(did);

  const productOverrides: Record<string, number> = {};
  const pricingOverrides: Record<string, number> = {};
  const addonOverrides: Record<string, number> = {};

  for (const r of rows) {
    const pid = (r.product_id ?? "").toString().trim();
    if (!pid) continue;
    const cents = clampRetailCents(typeof r.retail_cents === "number" ? r.retail_cents : Number(r.retail_cents));
    if (typeof cents !== "number") continue;

    const pricingId = (r.pricing_id ?? "").toString().trim();
    const addonId = (r.addon_id ?? "").toString().trim();

    if (pricingId) pricingOverrides[`${pid}:${pricingId}`] = cents;
    if (addonId) addonOverrides[`${pid}:${addonId}`] = cents;
  }

  const all = readAll();
  writeAll({
    ...all,
    [did]: {
      dealerId: did,
      productOverrides: all[did]?.productOverrides ?? productOverrides,
      pricingOverrides,
      addonOverrides,
      updatedAt: new Date().toISOString(),
    },
  });
}

async function upsertSupabasePricingOverride(args: {
  dealerId: string;
  productId: string;
  pricingId: string;
  retailCents: number;
}) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase
    .from("dealer_retail_overrides")
    .upsert(
      {
        dealer_id: args.dealerId,
        product_id: args.productId,
        pricing_id: args.pricingId,
        addon_id: null,
        retail_cents: args.retailCents,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "dealer_id,product_id,pricing_id" },
    );
  if (error) throw error;
}

async function deleteSupabasePricingOverride(args: { dealerId: string; productId: string; pricingId: string }) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase
    .from("dealer_retail_overrides")
    .delete()
    .eq("dealer_id", args.dealerId)
    .eq("product_id", args.productId)
    .eq("pricing_id", args.pricingId);
  if (error) throw error;
}

async function upsertSupabaseAddonOverride(args: {
  dealerId: string;
  productId: string;
  addonId: string;
  retailCents: number;
}) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase
    .from("dealer_retail_overrides")
    .upsert(
      {
        dealer_id: args.dealerId,
        product_id: args.productId,
        pricing_id: null,
        addon_id: args.addonId,
        retail_cents: args.retailCents,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "dealer_id,product_id,addon_id" },
    );
  if (error) throw error;
}

async function deleteSupabaseAddonOverride(args: { dealerId: string; productId: string; addonId: string }) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase
    .from("dealer_retail_overrides")
    .delete()
    .eq("dealer_id", args.dealerId)
    .eq("product_id", args.productId)
    .eq("addon_id", args.addonId);
  if (error) throw error;
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

  if (getAppMode() === "supabase") {
    if (typeof cents === "number") {
      void upsertSupabasePricingOverride({ dealerId: did, productId: pid, pricingId: rid, retailCents: cents });
    } else {
      void deleteSupabasePricingOverride({ dealerId: did, productId: pid, pricingId: rid });
    }
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

  if (getAppMode() === "supabase") {
    if (typeof cents === "number") {
      void upsertSupabaseAddonOverride({ dealerId: did, productId: pid, addonId: aid, retailCents: cents });
    } else {
      void deleteSupabaseAddonOverride({ dealerId: did, productId: pid, addonId: aid });
    }
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
