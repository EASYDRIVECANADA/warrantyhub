import type { AuthApi } from "./api";
import type { AuthUser, Role } from "./types";

const STORAGE_USERS = "warrantyhub.local.users";
const STORAGE_SESSION = "warrantyhub.local.session";

type LocalUserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
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

function toAuthUser(u: LocalUserRecord): AuthUser {
  const active = u.isActive !== false;
  return { id: u.id, email: u.email, role: active ? u.role : "UNASSIGNED" };
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
    return u ? toAuthUser(u) : null;
  },

  async signInWithGoogle() {
    throw new Error("Google sign-in requires Supabase configuration");
  },

  async signInWithPassword(email, password) {
    const users = readUsers();
    const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    if (!u) throw new Error("Invalid email or password");

    const passwordHash = await sha256(password);
    if (u.passwordHash !== passwordHash) throw new Error("Invalid email or password");

    writeSession({ userId: u.id });
    notify();
    return toAuthUser(u);
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
