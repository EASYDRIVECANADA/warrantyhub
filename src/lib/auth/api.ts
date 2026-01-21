import type { AuthUser } from "./types";

export type AuthUnsubscribe = () => void;

export type AuthApi = {
  getCurrentUser(): Promise<AuthUser | null>;
  signInWithGoogle(): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<AuthUser>;
  signUpWithPassword(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  onAuthStateChange(cb: () => void): AuthUnsubscribe;
};
