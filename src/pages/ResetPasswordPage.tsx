import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { getAuthApi } from "../lib/auth/auth";
import { getSupabaseClient } from "../lib/supabase/client";

const LOCAL_AUTH_NOTICE_KEY = "warrantyhub.local.auth_notice";

export function ResetPasswordPage() {
  const api = useMemo(() => getAuthApi(), []);
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecoveryReady, setIsRecoveryReady] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function initRecovery() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        if (isMounted) setIsRecoveryReady(false);
        return;
      }

      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            if (isMounted) setError(exchangeError.message);
          }
        }
      } catch (e) {
        if (isMounted) setError(e instanceof Error ? e.message : "Failed to process reset link");
      }

      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (isMounted) setIsRecoveryReady(!!data.session);
      } catch (e) {
        if (isMounted) {
          setError(e instanceof Error ? e.message : "Failed to verify reset session");
          setIsRecoveryReady(false);
        }
      }
    }

    void initRecovery();
    return () => {
      isMounted = false;
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isRecoveryReady === false) {
      return setError("Please open this page using the reset link from your email.");
    }

    const p = password.trim();
    if (!p) return setError("Password is required");
    if (p.length < 8) return setError("Password must be at least 8 characters");
    if (p !== confirmPassword) return setError("Passwords do not match");

    setIsLoading(true);
    try {
      await api.updatePassword(p);
      setSuccess(true);

      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          await supabase.auth.signOut();
        } catch {
        }
      }

      localStorage.setItem(LOCAL_AUTH_NOTICE_KEY, "Password updated. Please sign in.");
      navigate("/sign-in", { replace: true });
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else if (typeof err === "string") {
        setError(err);
      } else {
        setError("Failed to update password");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 pt-28 pb-16">
        <div className="max-w-md mx-auto">
          <div className="rounded-2xl border bg-card text-card-foreground shadow-card overflow-hidden">
            <div className="flex flex-col space-y-1.5 p-6">
              <h1 className="text-2xl font-semibold leading-none tracking-tight font-display">Reset password</h1>
              <p className="text-sm text-muted-foreground">Choose a new password for your account.</p>
            </div>

            <div className="p-6 pt-0">
              <form className="space-y-4" onSubmit={onSubmit}>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="password">
                    New password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="New password"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="confirmPassword">
                    Confirm new password
                  </label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    required
                  />
                </div>

                {error ? (
                  <div className="text-sm text-destructive">
                    {error}
                    {error.toLowerCase().includes("configured") || error.toLowerCase().includes("supabase") ? (
                      <div className="mt-1">
                        This feature requires Supabase auth to be configured.
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {success ? <div className="text-sm text-muted-foreground">Password updated. Redirecting…</div> : null}

                {isRecoveryReady === false && !error ? (
                  <div className="text-sm text-muted-foreground">
                    Open this page using the password reset link sent to your email.
                  </div>
                ) : null}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  Update password
                </Button>

                <div className="text-sm text-muted-foreground">
                  <Link to="/sign-in" className="text-primary underline underline-offset-4">
                    Back to sign in
                  </Link>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
