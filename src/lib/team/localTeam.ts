import type { ProviderTeamApi } from "./api";
import type { InviteTeamMemberInput, ProviderTeamMember, TeamMemberRole, TeamMemberStatus } from "./types";

const STORAGE_KEY = "warrantyhub.local.provider_team_members";
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

function read(): ProviderTeamMember[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<ProviderTeamMember>[];
    return parsed
      .map((m): ProviderTeamMember => {
        const createdAt = m.createdAt ?? new Date().toISOString();
        const id = m.id ?? crypto.randomUUID();
        const providerId = m.providerId ?? "";
        return {
          id,
          providerId,
          email: m.email ?? "",
          role: (m.role ?? "SUPPORT") as TeamMemberRole,
          status: (m.status ?? "INVITED") as TeamMemberStatus,
          createdAt,
        };
      })
      .filter((m) => m.providerId.trim() && m.email.trim());
  } catch {
    return [];
  }
}

function write(items: ProviderTeamMember[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export const localProviderTeamApi: ProviderTeamApi = {
  async list() {
    const uid = currentUserId();
    return read()
      .filter((m) => m.providerId === uid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async invite(input: InviteTeamMemberInput) {
    const uid = currentUserId();
    const now = new Date().toISOString();

    const email = normalizeEmail(input.email);
    if (!email) throw new Error("Email is required");

    const items = read();
    const exists = items.find((m) => m.providerId === uid && normalizeEmail(m.email) === email);
    if (exists) throw new Error("That email is already in your team list");

    const item: ProviderTeamMember = {
      id: crypto.randomUUID(),
      providerId: uid,
      email,
      role: input.role,
      status: "INVITED",
      createdAt: now,
    };

    write([item, ...items]);
    return item;
  },

  async update(id: string, patch) {
    const uid = currentUserId();
    const items = read();
    const idx = items.findIndex((m) => m.id === id);
    if (idx < 0) throw new Error("Team member not found");

    const current = items[idx]!;
    if (current.providerId !== uid) throw new Error("Not authorized");

    const next: ProviderTeamMember = {
      ...current,
      ...patch,
    };

    const updated = [...items];
    updated[idx] = next;
    write(updated);
    return next;
  },

  async remove(id: string) {
    const uid = currentUserId();
    const items = read();
    const current = items.find((m) => m.id === id);
    if (!current) return;
    if (current.providerId !== uid) throw new Error("Not authorized");

    write(items.filter((m) => m.id !== id));
  },
};
