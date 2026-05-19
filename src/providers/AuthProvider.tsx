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
import type { AuthUser } from "../lib/auth/types";
import { syncDealerRetailOverridesFromSupabase } from "../lib/dealerProductRetail";

type AuthContextValue = {
  mode: AppMode;
  user: AuthUser | null;
  isLoading: boolean;
  refreshUser(): Promise<AuthUser | null>;
  signInWithGoogle(): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mode = useMemo(() => getAppMode(), []);

  const api = useMemo(() => getAuthApi(), []);

  const refreshUser = useCallback(async () => {
    setIsLoading(true);
    try {
      const u = await api.getCurrentUser();
      setUser(u);

      if (mode === "supabase" && u?.dealerId) {
        try {
          await syncDealerRetailOverridesFromSupabase(u.dealerId);
        } catch {
        }
      }

      return u;
    } finally {
      setIsLoading(false);
    }
  }, [api, mode]);

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

  const updatePassword = useCallback(
    async (newPassword: string) => {
      setIsLoading(true);
      try {
        await api.updatePassword(newPassword);
        await refreshUser();
      } finally {
        setIsLoading(false);
      }
    },
    [api, refreshUser],
  );

  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      setUser(null);
      try {
        await Promise.race([
          api.signOut(),
          new Promise<void>((resolve) => {
            window.setTimeout(() => resolve(), 2500);
          }),
        ]);
      } catch {
      }
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const value: AuthContextValue = {
    mode,
    user,
    isLoading,
    refreshUser,
    signInWithGoogle,
    signIn,
    signUp,
    updatePassword,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
