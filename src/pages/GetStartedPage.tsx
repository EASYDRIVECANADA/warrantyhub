import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import type { Role } from "../lib/auth/types";
import { useAuth } from "../providers/AuthProvider";

function roleToDashboardPath(role: Role) {
  if (role === "UNASSIGNED") return "/request-access";
  if (role === "SUPER_ADMIN") return "/platform";
  if (role === "ADMIN") return "/company-dashboard";
  if (role === "PROVIDER") return "/provider-dashboard";
  if (role === "DEALER_ADMIN") return "/dealer-admin";
  if (role === "DEALER_EMPLOYEE") return "/dealer-dashboard";
  return "/dealer-dashboard";
}

export function GetStartedPage() {
  const { signUp, isLoading, user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await signUp(email, password);
      navigate("/request-access", { replace: true });
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
        setError("Sign up failed");
      }
    }
  };

  useEffect(() => {
    if (!user) return;
    navigate(roleToDashboardPath(user.role), { replace: true });
  }, [navigate, user]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 pt-28 pb-16">
        <div className="max-w-md mx-auto">
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="flex flex-col space-y-1.5 p-6">
              <h1 className="text-2xl font-semibold leading-none tracking-tight font-display">Get Started</h1>
              <p className="text-sm text-muted-foreground">Create your account.</p>
            </div>

            <div className="p-6 pt-0">
              <form className="space-y-4" onSubmit={onSubmit}>
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

                <Button type="submit" className="w-full" disabled={isLoading}>
                  Create Account
                </Button>

                <div className="text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link to="/sign-in" className="text-primary underline underline-offset-4">
                    Sign In
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
