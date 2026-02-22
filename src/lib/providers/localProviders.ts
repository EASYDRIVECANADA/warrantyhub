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
};

type LocalUserRecord = {
  id: string;
  role?: string;
  isActive?: boolean;
  companyName?: string;
};

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

function toPublic(p: StoredProfile): ProviderPublic {
  return { id: p.id, displayName: p.displayName, companyName: p.companyName, logoUrl: p.logoUrl };
}

export const localProvidersApi: ProvidersApi = {
  async listByIds(ids) {
    const wanted = new Set(ids.filter(Boolean));

    const items = readProfiles().filter((p) => wanted.has(p.id));
    const byId = new Map(items.map((p) => [p.id, p] as const));

    const userById = new Map(readUsers().map((u) => [u.id, u] as const));

    return Array.from(wanted)
      .map((id) => {
        const p = byId.get(id);
        if (p) return toPublic(p);

        const u = userById.get(id);
        const active = u?.isActive !== false;
        const role = (u?.role ?? "").toString();
        if (!u || !active || role !== "PROVIDER") return null;
        return { id, companyName: u.companyName };
      })
      .filter(Boolean) as ProviderPublic[];
  },

  async getMyProfile() {
    const uid = currentUserId();
    const found = readProfiles().find((p) => p.id === uid);
    if (found) return toPublic(found);

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
    };

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
    return toPublic(next);
  },
};
