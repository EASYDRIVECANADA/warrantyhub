import type { AuthApi } from "./api";
import type { AuthUser, Role } from "./types";

const STORAGE_USERS = "warrantyhub.local.users";
const STORAGE_SESSION = "warrantyhub.local.session";
const STORAGE_DEALER_MEMBERSHIPS = "warrantyhub.local.dealer_memberships";
const STORAGE_AUTH_NOTICE = "warrantyhub.local.auth_notice";

type LocalUserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role | "DEALER";
  companyName?: string;
  dealerId?: string;
  isActive?: boolean;
};

type LocalSession = {
  userId: string;
};

function uid() {
  return crypto.randomUUID();
}

async function sha256(text: string) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hashBuffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readUsers(): LocalUserRecord[] {
  const raw = localStorage.getItem(STORAGE_USERS);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LocalUserRecord[];
  } catch {
    return [];
  }
}

function writeUsers(users: LocalUserRecord[]) {
  localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
}

function readSession(): LocalSession | null {
  const raw = localStorage.getItem(STORAGE_SESSION);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocalSession;
  } catch {
    return null;
  }
}

function writeSession(session: LocalSession | null) {
  if (!session) {
    localStorage.removeItem(STORAGE_SESSION);
    return;
  }
  localStorage.setItem(STORAGE_SESSION, JSON.stringify(session));
}

function writeAuthNotice(message: string) {
  const m = message.trim();
  if (!m) return;
  localStorage.setItem(STORAGE_AUTH_NOTICE, m);
}

function readDealerMemberships(): any[] {
  const raw = localStorage.getItem(STORAGE_DEALER_MEMBERSHIPS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as any[]) : [];
  } catch {
    return [];
  }
}

function toAuthUser(u: LocalUserRecord): AuthUser {
  const active = u.isActive !== false;
  const rawRole = u.role;
  let effectiveRole: Role = !active
    ? "UNASSIGNED"
    : rawRole === "DEALER"
      ? "DEALER_ADMIN"
      : rawRole;
  let effectiveDealerId =
    effectiveRole === "DEALER_ADMIN" ? (u.dealerId ?? u.id) : effectiveRole === "DEALER_EMPLOYEE" ? u.dealerId : undefined;

  if ((effectiveRole === "DEALER_ADMIN" || effectiveRole === "DEALER_EMPLOYEE") && effectiveDealerId) {
    const memberships = readDealerMemberships();
    const m = memberships.find(
      (x) => (x?.dealerId ?? "").toString().trim() === effectiveDealerId && (x?.userId ?? "").toString().trim() === u.id,
    );
    const status = (m?.status ?? "").toString().trim().toUpperCase();
    if (status && status !== "ACTIVE") {
      effectiveRole = "UNASSIGNED";
      effectiveDealerId = undefined;
    }
    if (effectiveRole === "DEALER_EMPLOYEE" && !m) {
      effectiveRole = "UNASSIGNED";
      effectiveDealerId = undefined;
    }
  }

  return { id: u.id, email: u.email, role: effectiveRole, dealerId: effectiveDealerId, companyName: u.companyName };
}

const listeners = new Set<() => void>();

function notify() {
  for (const cb of listeners) cb();
}

export const localAuthApi: AuthApi = {
  async getCurrentUser() {
    const session = readSession();
    if (!session) return null;
    const users = readUsers();
    const u = users.find((x) => x.id === session.userId);
    if (!u) return null;

    if (u.isActive === false && u.role !== "UNASSIGNED") {
      writeAuthNotice("Account disabled");
      writeSession(null);
      notify();
      return null;
    }

    const mapped = toAuthUser(u);
    if (mapped.role === "UNASSIGNED" && u.role !== "UNASSIGNED") {
      const revokedMessage =
        u.role === "DEALER" || u.role === "DEALER_ADMIN" || u.role === "DEALER_EMPLOYEE" ? "Dealer access revoked" : "Access revoked";
      writeAuthNotice(revokedMessage);
      writeSession(null);
      notify();
      return null;
    }
    return mapped;
  },

  async signInWithGoogle() {
    throw new Error("Google sign-in requires Supabase configuration");
  },

  async signInWithPassword(email, password) {
    const users = readUsers();
    const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    if (!u) throw new Error("Invalid email or password");

    if (u.isActive === false) {
      if (u.role === "UNASSIGNED") throw new Error("Account pending approval");
      throw new Error("Account disabled");
    }

    const passwordHash = await sha256(password);
    if (u.passwordHash !== passwordHash) throw new Error("Invalid email or password");

    const mapped = toAuthUser(u);
    if (mapped.role === "UNASSIGNED" && u.role !== "UNASSIGNED") {
      if (u.role === "DEALER" || u.role === "DEALER_ADMIN" || u.role === "DEALER_EMPLOYEE") {
        throw new Error("Dealer access revoked");
      }
      throw new Error("Access revoked");
    }

    writeSession({ userId: u.id });
    notify();
    return mapped;
  },

  async signUpWithPassword(email, password) {
    const users = readUsers();
    const exists = users.some((x) => x.email.toLowerCase() === email.toLowerCase());
    if (exists) throw new Error("Email already in use");

    const record: LocalUserRecord = {
      id: uid(),
      email,
      passwordHash: await sha256(password),
      role: "UNASSIGNED",
      isActive: false,
    };

    writeUsers([...users, record]);
    writeSession({ userId: record.id });
    notify();
    return toAuthUser(record);
  },

  async signOut() {
    writeSession(null);
    notify();
  },

  onAuthStateChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};
