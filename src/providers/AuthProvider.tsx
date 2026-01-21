import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getAppMode, type AppMode } from "../lib/runtime";
import { getAuthApi } from "../lib/auth/auth";
import type { AuthUser, Role } from "../lib/auth/types";

const DEV_BYPASS_KEY = "warrantyhub.dev.bypass_user";

function readDevBypassUser(): AuthUser | null {
  const raw = localStorage.getItem(DEV_BYPASS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

type AuthContextValue = {
  mode: AppMode;
  user: AuthUser | null;
  isLoading: boolean;
  refreshUser(): Promise<AuthUser | null>;
  signInWithGoogle(): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  devSignInAs(role: Role): void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mode = useMemo(() => getAppMode(), []);

  const api = useMemo(() => getAuthApi(), [mode]);

  const refreshUser = useCallback(async () => {
    setIsLoading(true);
    try {
      if (import.meta.env.DEV) {
        const bypass = readDevBypassUser();
        if (bypass) {
          setUser(bypass);
          return bypass;
        }
      }
      const u = await api.getCurrentUser();
      setUser(u);
      return u;
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refreshUser();
    const unsub = api.onAuthStateChange(() => {
      void refreshUser();
    });
    return () => {
      unsub();
    };
  }, [api, refreshUser]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      try {
        const u = await api.signInWithPassword(email, password);
        setUser(u);
      } finally {
        setIsLoading(false);
      }
    },
    [api],
  );

  const signInWithGoogle = useCallback(async () => {
    setIsLoading(true);
    try {
      await api.signInWithGoogle();
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const signUp = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      try {
        const u = await api.signUpWithPassword(email, password);
        setUser(u);
      } finally {
        setIsLoading(false);
      }
    },
    [api],
  );

  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      if (import.meta.env.DEV) {
        localStorage.removeItem(DEV_BYPASS_KEY);
      }
      await api.signOut();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const devSignInAs = useCallback((role: Role) => {
    if (!import.meta.env.DEV) throw new Error("Dev bypass is only available in development");

    const u: AuthUser = {
      id: `dev-${role.toLowerCase()}`,
      email: `${role.toLowerCase()}@dev.local`,
      role,
    };

    localStorage.setItem(DEV_BYPASS_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  const value: AuthContextValue = {
    mode,
    user,
    isLoading,
    refreshUser,
    signInWithGoogle,
    signIn,
    signUp,
    signOut,
    devSignInAs,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
