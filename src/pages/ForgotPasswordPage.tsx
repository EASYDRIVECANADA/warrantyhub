import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Shield } from "lucide-react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { getAuthApi } from "../lib/auth/auth";

const whiteLogoUrl = new URL("../../images/warrantyhubwhite.png", import.meta.url).href;

export function ForgotPasswordPage() {
  const api = useMemo(() => getAuthApi(), []);
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSent(false);

    setIsLoading(true);
    try {
      await api.requestPasswordReset(email, `${window.location.origin}/reset-password`);
      setSent(true);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else if (typeof err === "string") {
        setError(err);
      } else {
        setError("Failed to send reset email");
      }
    } finally {
      setIsLoading(false);
    }
  };

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
              Reset your <span className="text-yellow-300">password</span>
            </h1>
            <p className="mt-4 text-white/85 max-w-md text-sm">We’ll email you a link to reset your password.</p>

            <div className="mt-auto text-xs text-white/70 pt-10">Secure reset link · Sent by email</div>
          </div>
        </div>

        <div className="flex items-center justify-center px-6 py-12 lg:py-0 bg-slate-50">
          <div className="w-full max-w-md">
            <div className="flex flex-col space-y-1.5">
              <h1 className="text-3xl font-semibold leading-none tracking-tight font-display">Forgot password</h1>
              <p className="text-sm text-muted-foreground">We’ll email you a link to reset your password.</p>
            </div>

            <div className="mt-8">
              <form className="space-y-4" onSubmit={onSubmit}>
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

                {error ? <div className="text-sm text-destructive">{error}</div> : null}
                {sent ? (
                  <div className="text-sm text-muted-foreground">
                    If an account exists for <span className="font-medium">{email.trim()}</span>, we sent a password reset link.
                  </div>
                ) : null}

                <Button
                  type="submit"
                  className="w-full bg-yellow-300 text-slate-900 hover:bg-yellow-200"
                  disabled={isLoading}
                >
                  Send reset link
                </Button>

                <div className="text-sm text-muted-foreground text-center">
                  <Link to="/sign-in" className="text-primary underline underline-offset-4">
                    Back to sign in
                  </Link>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    navigate("/sign-in");
                  }}
                >
                  Cancel
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
