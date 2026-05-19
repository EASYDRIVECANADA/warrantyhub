import { useState } from "react";

import { Button } from "../ui/button";
import { useAuth } from "../../providers/AuthProvider";

export function ForcePasswordChangeDialog() {
  const { user, updatePassword, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  if (!user?.mustChangePassword) return null;

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextPassword = password.trim();
    setError("");

    if (nextPassword.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (nextPassword !== confirmPassword.trim()) {
      setError("Passwords do not match.");
      return;
    }

    setIsSaving(true);
    try {
      await updatePassword(nextPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="force-password-change-title"
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="space-y-1">
          <h2 id="force-password-change-title" className="text-xl font-semibold text-slate-950">
            Change your password
          </h2>
          <p className="text-sm text-slate-600">
            You signed in with a temporary password. Choose a new password to continue.
          </p>
        </div>

        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-800" htmlFor="temporary-new-password">
              New password
            </label>
            <input
              id="temporary-new-password"
              type="password"
              autoComplete="new-password"
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-800" htmlFor="temporary-confirm-password">
              Confirm password
            </label>
            <input
              id="temporary-confirm-password"
              type="password"
              autoComplete="new-password"
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>

          {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</div> : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => void signOut()} disabled={isSaving}>
              Sign out
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Changing..." : "Change password"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
