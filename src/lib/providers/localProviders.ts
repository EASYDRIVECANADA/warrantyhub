import type { ProvidersApi } from "./api";
import type { ProviderPublic, UpdateMyProviderProfileInput } from "./types";

const STORAGE_KEY = "warrantyhub.local.provider_profiles";
const DEV_BYPASS_KEY = "warrantyhub.dev.bypass_user";

type StoredProfile = {
  id: string;
  displayName?: string;
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

function writeProfiles(items: StoredProfile[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function toPublic(p: StoredProfile): ProviderPublic {
  return { id: p.id, displayName: p.displayName, companyName: p.companyName };
}

export const localProvidersApi: ProvidersApi = {
  async listByIds(ids) {
    const wanted = new Set(ids.filter(Boolean));
    const items = readProfiles().filter((p) => wanted.has(p.id));
    return items.map(toPublic);
  },

  async getMyProfile() {
    const uid = currentUserId();
    const found = readProfiles().find((p) => p.id === uid);
    return found ? toPublic(found) : { id: uid };
  },

  async updateMyProfile(patch: UpdateMyProviderProfileInput) {
    const uid = currentUserId();
    const items = readProfiles();
    const idx = items.findIndex((p) => p.id === uid);

    const next: StoredProfile = {
      id: uid,
      displayName: typeof patch.displayName === "string" ? patch.displayName : idx >= 0 ? items[idx]!.displayName : undefined,
      companyName: typeof patch.companyName === "string" ? patch.companyName : idx >= 0 ? items[idx]!.companyName : undefined,
    };

    const updated = [...items];
    if (idx >= 0) updated[idx] = next;
    else updated.unshift(next);

    writeProfiles(updated);
    return toPublic(next);
  },
};
