import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import type { Role } from "../lib/auth/types";
import { useAuth } from "../providers/AuthProvider";

const LOCAL_AUTH_NOTICE_KEY = "warrantyhub.local.auth_notice";

function roleToDashboardPath(role: string) {
  if (role === "UNASSIGNED") return "/request-access";
  if (role === "SUPER_ADMIN") return "/platform";
  if (role === "ADMIN") return "/company-dashboard";
  if (role === "PROVIDER") return "/provider-dashboard";
  if (role === "DEALER_ADMIN") return "/dealer-admin";
  if (role === "DEALER_EMPLOYEE") return "/dealer-dashboard";
  return "/dealer-dashboard";
}

export function SignInPage() {
  const { signIn, isLoading, user, devSignInAs } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v = (localStorage.getItem(LOCAL_AUTH_NOTICE_KEY) ?? "").trim();
      if (!v) return;
      localStorage.removeItem(LOCAL_AUTH_NOTICE_KEY);
      setNotice((prev) => prev ?? v);
    } catch {
    }
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
        return;
      }
      if (typeof err === "string") {
        setError(err);
        return;
      }
      try {
        setError(JSON.stringify(err));
      } catch {
        setError("Sign in failed");
      }
    }
  };

  useEffect(() => {
    if (!user) return;
    navigate(roleToDashboardPath(user.role), { replace: true });
  }, [navigate, user]);

  useEffect(() => {
    const state = location.state as { fromSignup?: boolean; emailConfirmed?: boolean } | null;
    if (!state) return;
    if (state.fromSignup) {
      setNotice("Account created. Please sign in.");
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    if (state.emailConfirmed) {
      setNotice("Email confirmed. Please sign in.");
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 pt-28 pb-16">
        <div className="max-w-md mx-auto">
          <div className="rounded-2xl border bg-card text-card-foreground shadow-card overflow-hidden">
            <div className="flex flex-col space-y-1.5 p-6">
              <h1 className="text-2xl font-semibold leading-none tracking-tight font-display">Sign In</h1>
              <p className="text-sm text-muted-foreground">Sign in to access your account.</p>
            </div>

            <div className="p-6 pt-0">
              <form className="space-y-4" onSubmit={onSubmit}>
                {notice ? <div className="text-sm text-muted-foreground">{notice}</div> : null}

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="email">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="password">
                    Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                  />
                </div>

                {error ? <div className="text-sm text-destructive">{error}</div> : null}

                <Button type="submit" className="w-full bg-yellow-300 text-slate-900 hover:bg-yellow-200" disabled={isLoading}>
                  Sign In
                </Button>

                <div className="text-sm text-muted-foreground">
                  Don't have an account?{" "}
                  <Link to="/register-dealership" className="text-primary underline underline-offset-4">
                    Register Your Dealership
                  </Link>
                </div>
              </form>

              {import.meta.env.DEV ? (
                <div className="mt-6 rounded-lg border bg-background p-4">
                  <div className="text-sm font-medium">Dev bypass</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Temporarily enter a portal without logging in.
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(["ADMIN", "SUPER_ADMIN", "DEALER_ADMIN", "DEALER_EMPLOYEE", "PROVIDER"] as Role[]).map((r) => (
                      <Button
                        key={r}
                        type="button"
                        variant="outline"
                        onClick={() => {
                          devSignInAs(r);
                          navigate(roleToDashboardPath(r), { replace: true });
                        }}
                      >
                        Enter as {r}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
