import type { ProvidersApi } from "./api";
import type { ProviderPublic, UpdateMyProviderProfileInput } from "./types";

const STORAGE_KEY = "warrantyhub.local.provider_profiles";
const DEV_BYPASS_KEY = "warrantyhub.dev.bypass_user";
const LOCAL_USERS_KEY = "warrantyhub.local.users";

type StoredProfile = {
  id: string;
  displayName?: string;
  companyName?: string;
  logoUrl?: string;
  termsText?: string;
};

type LocalUserRecord = {
  id: string;
  role?: string;
  isActive?: boolean;
  companyName?: string;
};

const LOGO_DB_NAME = "warrantyhub";
const LOGO_STORE_NAME = "provider_logos";

const logoObjectUrlByKey = new Map<string, string>();

function openLogoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LOGO_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOGO_STORE_NAME)) {
        db.createObjectStore(LOGO_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

async function putLogoBlob(key: string, blob: Blob): Promise<void> {
  const db = await openLogoDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(LOGO_STORE_NAME, "readwrite");
    const store = tx.objectStore(LOGO_STORE_NAME);
    store.put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to save logo"));
    tx.onabort = () => reject(tx.error ?? new Error("Failed to save logo"));
  });
}

async function getLogoBlob(key: string): Promise<Blob | null> {
  const db = await openLogoDb();
  return await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(LOGO_STORE_NAME, "readonly");
    const store = tx.objectStore(LOGO_STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error("Failed to load logo"));
  });
}

async function deleteLogoBlob(key: string): Promise<void> {
  const db = await openLogoDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(LOGO_STORE_NAME, "readwrite");
    const store = tx.objectStore(LOGO_STORE_NAME);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to delete logo"));
    tx.onabort = () => reject(tx.error ?? new Error("Failed to delete logo"));
  });
}

async function resolveLogoUrl(raw: string | undefined): Promise<string | undefined> {
  const t = (raw ?? "").trim();
  if (!t) return undefined;
  if (!t.startsWith("idb:")) return t;

  const key = t.slice("idb:".length);
  if (!key) return undefined;

  const cached = logoObjectUrlByKey.get(key);
  if (cached) return cached;

  const blob = await getLogoBlob(key);
  if (!blob) return undefined;
  const url = URL.createObjectURL(blob);
  logoObjectUrlByKey.set(key, url);
  return url;
}

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

function readProfiles(): StoredProfile[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as StoredProfile[];
  } catch {
    return [];
  }
}

function readUsers(): LocalUserRecord[] {
  const raw = localStorage.getItem(LOCAL_USERS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LocalUserRecord[];
  } catch {
    return [];
  }
}

function writeUsers(items: LocalUserRecord[]) {
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(items));
}

function writeProfiles(items: StoredProfile[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

async function toPublicAsync(p: StoredProfile): Promise<ProviderPublic> {
  return {
    id: p.id,
    displayName: p.displayName,
    companyName: p.companyName,
    logoUrl: await resolveLogoUrl(p.logoUrl),
    termsText: p.termsText,
  };
}

export const localProvidersApi: ProvidersApi = {
  async listByIds(ids) {
    const wanted = new Set(ids.filter(Boolean));

    const items = readProfiles().filter((p) => wanted.has(p.id));
    const byId = new Map(items.map((p) => [p.id, p] as const));

    const userById = new Map(readUsers().map((u) => [u.id, u] as const));

    const resolved = await Promise.all(
      Array.from(wanted).map(async (id) => {
        const p = byId.get(id);
        if (p) return await toPublicAsync(p);

        const u = userById.get(id);
        const active = u?.isActive !== false;
        const role = (u?.role ?? "").toString();
        if (!u || !active || role !== "PROVIDER") return null;
        return { id, companyName: u.companyName };
      }),
    );

    return resolved.filter(Boolean) as ProviderPublic[];
  },

  async getMyProfile() {
    const uid = currentUserId();
    const found = readProfiles().find((p) => p.id === uid);
    if (found) return await toPublicAsync(found);

    const u = readUsers().find((x) => x.id === uid);
    if (u) return { id: uid, companyName: u.companyName };
    return { id: uid };
  },

  async updateMyProfile(patch: UpdateMyProviderProfileInput) {
    const uid = currentUserId();
    const items = readProfiles();
    const idx = items.findIndex((p) => p.id === uid);

    const next: StoredProfile = {
      id: uid,
      displayName: typeof patch.displayName === "string" ? patch.displayName : idx >= 0 ? items[idx]!.displayName : undefined,
      companyName: typeof patch.companyName === "string" ? patch.companyName : idx >= 0 ? items[idx]!.companyName : undefined,
      logoUrl:
        typeof patch.logoUrl === "string"
          ? patch.logoUrl
          : patch.logoUrl === null
            ? undefined
            : idx >= 0
              ? items[idx]!.logoUrl
              : undefined,
      termsText:
        typeof patch.termsText === "string"
          ? patch.termsText
          : patch.termsText === null
            ? undefined
            : idx >= 0
              ? items[idx]!.termsText
              : undefined,
    };

    if (patch.logoUrl === null) {
      const prev = idx >= 0 ? (items[idx]!.logoUrl ?? "") : "";
      const prevTrim = prev.trim();
      if (prevTrim.startsWith("idb:")) {
        const key = prevTrim.slice("idb:".length);
        if (key) {
          const cached = logoObjectUrlByKey.get(key);
          if (cached) {
            URL.revokeObjectURL(cached);
            logoObjectUrlByKey.delete(key);
          }
          try {
            await deleteLogoBlob(key);
          } catch {
          }
        }
      }
    }

    const updated = [...items];
    if (idx >= 0) updated[idx] = next;
    else updated.unshift(next);

    writeProfiles(updated);

    if (typeof patch.companyName === "string") {
      const users = readUsers();
      const uidx = users.findIndex((u) => u.id === uid);
      if (uidx >= 0) {
        const copy = [...users];
        copy[uidx] = { ...copy[uidx], companyName: patch.companyName };
        writeUsers(copy);
      }
    }
    return await toPublicAsync(next);
  },
};

export async function saveLocalProviderLogo(input: { providerId: string; file: File }): Promise<string> {
  const key = `provider-logo/${input.providerId}`;
  await putLogoBlob(key, input.file);
  const cached = logoObjectUrlByKey.get(key);
  if (cached) {
    URL.revokeObjectURL(cached);
    logoObjectUrlByKey.delete(key);
  }
  return `idb:${key}`;
}
