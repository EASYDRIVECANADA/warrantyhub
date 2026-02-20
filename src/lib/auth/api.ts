import type { AuthUser } from "./types";

export type AuthUnsubscribe = () => void;

export type AuthApi = {
  getCurrentUser(): Promise<AuthUser | null>;
  signInWithGoogle(): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<AuthUser>;
  signUpWithPassword(email: string, password: string): Promise<AuthUser>;
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;
  signOut(): Promise<void>;
  onAuthStateChange(cb: () => void): AuthUnsubscribe;
};
