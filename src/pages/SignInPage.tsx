import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Shield } from "lucide-react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import type { Role } from "../lib/auth/types";
import { useAuth } from "../providers/AuthProvider";

const LOCAL_AUTH_NOTICE_KEY = "warrantyhub.local.auth_notice";

const whiteLogoUrl = new URL("../../images/warrantyhubwhite.png", import.meta.url).href;

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
      <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
        <div className="relative hidden lg:flex bg-primary text-white">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)",
              backgroundSize: "44px 44px",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white/0 via-white/0 to-black/15" />

          <div className="relative z-10 w-full p-12 flex flex-col">
            <div className="flex items-center gap-3">
              <Link to="/find-insurance" className="inline-flex">
                <img src={whiteLogoUrl} alt="Bridge Warranty" className="h-16 w-auto object-contain" />
              </Link>
            </div>

            <div className="mt-10">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold">
                <Shield className="w-4 h-4 text-yellow-300" />
                Trusted by 50K+ Dealerships
              </span>
            </div>

            <h1 className="mt-8 font-display text-4xl font-bold leading-tight">
              The Warranty
              <span className="block text-yellow-300">Bridge</span>
              for Dealerships
            </h1>

            <p className="mt-4 text-white/85 max-w-md text-sm">
              One platform. Multiple providers. Full transparency.
              <span className="block mt-2">Manage every warranty contract with ease.</span>
            </p>

            <div className="mt-8 space-y-3 text-sm">
              {[
                "Access to top warranty providers nationwide",
                "One-click agreement & simplified contracts",
                "Real-time pricing and online deal structuring",
              ].map((t) => (
                <div key={t} className="flex items-start gap-3">
                  <div className="mt-0.5 h-5 w-5 rounded-full bg-yellow-300/20 border border-yellow-300/30 flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-yellow-300" />
                  </div>
                  <div className="text-white/90">{t}</div>
                </div>
              ))}
            </div>

            <div className="mt-auto grid grid-cols-3 gap-4 pt-10">
              {[{ v: "50K+", l: "Active users" }, { v: "99.9%", l: "Uptime SLA" }, { v: "500+", l: "Dealerships" }].map((s) => (
                <div key={s.l} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                  <div className="text-yellow-300 font-bold">{s.v}</div>
                  <div className="text-[11px] text-white/75 mt-1">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center px-6 py-12 lg:py-0 bg-slate-50">
          <div className="w-full max-w-md">
            <div className="flex flex-col space-y-1.5">
              <h1 className="text-3xl font-semibold leading-none tracking-tight font-display">Welcome back</h1>
              <p className="text-sm text-muted-foreground">Sign in to your dealership account</p>
            </div>

            <div className="mt-8">
              <form className="space-y-4" onSubmit={onSubmit}>
                {notice ? <div className="text-sm text-muted-foreground">{notice}</div> : null}

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="email">
                    Email address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@dealership.com"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-medium" htmlFor="password">
                      Password
                    </label>
                    <Link to="/forgot-password" className="text-xs text-primary underline underline-offset-4">
                      Forgot password?
                    </Link>
                  </div>
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
                  Sign In to Dashboard
                </Button>

                <div className="text-sm text-muted-foreground text-center">
                  Don't have an account?{" "}
                  <Link to="/register-dealership" className="text-primary underline underline-offset-4">
                    Register Your Dealership
                  </Link>
                </div>
              </form>

              {import.meta.env.DEV ? (
                <div className="mt-6 rounded-lg border bg-white p-4">
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
