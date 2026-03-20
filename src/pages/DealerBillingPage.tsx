import { useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Check, X } from "lucide-react";

import { Button } from "../components/ui/button";
import { PageShell } from "../components/PageShell";
import { useAuth } from "../providers/AuthProvider";
import { invokeEdgeFunction } from "../lib/supabase/functions";

function money(cents: number) {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function subscriptionActive(user: any) {
  const status = (user?.dealerSubscriptionStatus ?? "").toString().toLowerCase();
  if (status === "active" || status === "trialing") return true;
  if (status === "canceled") {
    const endRaw = user?.dealerSubscriptionCurrentPeriodEnd;
    if (!endRaw) return false;
    const t = new Date(endRaw).getTime();
    if (!Number.isFinite(t)) return false;
    return t > Date.now();
  }
  return false;
}

export function DealerBillingPage() {
  const { user, refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const location = useLocation();

  const subscriptionsDisabled = (() => {
    const explicit = (import.meta as any)?.env?.VITE_DISABLE_SUBSCRIPTION;
    const on = (explicit ?? "").toString().trim().toLowerCase();
    return on === "1" || on === "true" || on === "yes" || on === "on";
  })();

  if (!user) return <Navigate to="/sign-in" replace />;
  if (user.role !== "DEALER_ADMIN" && user.role !== "DEALER_EMPLOYEE") return <Navigate to="/" replace />;

  const dealerId = (user.dealerId ?? "").toString().trim();
  if (!dealerId) return <Navigate to="/request-access" replace />;

  if (subscriptionsDisabled) {
    return (
      <PageShell title="Subscription" subtitle="Subscriptions are temporarily disabled for testing.">
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          Your dealership has full access while we finalize billing.
        </div>
      </PageShell>
    );
  }

  const status = (user.dealerSubscriptionStatus ?? "").toString().trim() || "INACTIVE";
  const plan = user.dealerSubscriptionPlanKey ?? null;
  const feeCents = typeof user.dealerContractFeeCents === "number" ? user.dealerContractFeeCents : null;

  const trialBadge = useMemo(() => {
    const s = (user?.dealerSubscriptionStatus ?? "").toString().toLowerCase();
    if (s !== "trialing") return null;
    const raw = user?.dealerSubscriptionTrialEnd;
    if (!raw) return null;
    const t = new Date(raw).getTime();
    if (!Number.isFinite(t)) return null;
    if (t <= Date.now()) return null;
    return "15-day free trial";
  }, [user?.dealerSubscriptionStatus, user?.dealerSubscriptionTrialEnd]);

  const success = location.pathname.endsWith("/success");
  const cancel = location.pathname.endsWith("/cancel");

  const canManage = subscriptionActive(user);
  const hasExistingSubscription = canManage;

  const plans = useMemo(
    () => [
      {
        key: "STANDARD" as const,
        title: "Standard Plan",
        price: "$99 / month",
        description: "For growing teams that need full platform access.",
        badge: "Monthly",
      },
      {
        key: "EARLY_ADOPTER" as const,
        title: "Early Adopter Plan",
        price: "$594 / year",
        description: "Best value for high-volume dealerships.",
        badge: "Yearly",
        featured: true,
      },
    ],
    [],
  );

  const features = useMemo(
    () => [
      {
        label: "Unlimited contract creation",
        STANDARD: true,
        EARLY_ADOPTER: true,
      },
      {
        label: "Access to all participating providers",
        STANDARD: true,
        EARLY_ADOPTER: true,
      },
      {
        label: "Full access to platform tools",
        STANDARD: true,
        EARLY_ADOPTER: true,
      },
      {
        label: "Unlimited dealership users",
        STANDARD: false,
        EARLY_ADOPTER: true,
      },
      {
        label: "Up to 5 dealership users",
        STANDARD: true,
        EARLY_ADOPTER: false,
      },
      {
        label: "No contract processing fees",
        STANDARD: false,
        EARLY_ADOPTER: true,
      },
      {
        label: "$3.99 processing fee per contract",
        STANDARD: true,
        EARLY_ADOPTER: false,
      },
    ],
    [],
  );

  const subscribe = async (planKey: "STANDARD" | "EARLY_ADOPTER") => {
    setError(null);
    setBusy(true);
    try {
      if (user.role !== "DEALER_ADMIN") throw new Error("Only Dealer Admin can subscribe");
      const res = await invokeEdgeFunction<{ url: string }>("stripe-create-checkout-session", { dealerId, planKey });
      if (!res?.url) throw new Error("Stripe checkout URL was not returned");
      window.location.href = res.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const manageBilling = async () => {
    setError(null);
    setBusy(true);
    try {
      if (user.role !== "DEALER_ADMIN") throw new Error("Only Dealer Admin can manage billing");
      const res = await invokeEdgeFunction<{ url: string }>("stripe-create-portal-session", { dealerId });
      if (!res?.url) throw new Error("Billing portal URL was not returned");
      window.location.href = res.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell
      title="Billing"
      subtitle={
        <div className="text-sm text-muted-foreground">
          {user.role === "DEALER_ADMIN" ? "Manage your dealership subscription." : "Ask your Dealer Admin to manage billing."}
        </div>
      }
      subtitleAsChild
      badge={trialBadge ?? undefined}
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              void (async () => {
                await refreshUser();
              })();
            }}
          >
            Refresh
          </Button>
          <Button variant="outline" disabled={busy || !canManage} onClick={() => void manageBilling()}>
            Manage Billing
          </Button>
        </div>
      }
    >
      {success ? (
        <div className="rounded-xl border bg-card p-4 text-sm">
          Subscription started successfully. If you don’t see it yet, click Refresh.
        </div>
      ) : null}
      {cancel ? (
        <div className="rounded-xl border bg-card p-4 text-sm">Checkout canceled. You can try again anytime.</div>
      ) : null}

      {error ? <div className="text-sm text-destructive">{error}</div> : null}

      <div className="mt-5 rounded-3xl border bg-card shadow-card overflow-hidden">
        <div className="relative px-5 py-4">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-blue-600/12 via-transparent to-yellow-500/12" />
          <div className="pointer-events-none absolute inset-0 bg-white/35" />

          <div className="relative flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">Subscription</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {hasExistingSubscription
                  ? "You’re subscribed. To change plans or cancel, use Manage Billing."
                  : "Choose a plan to activate your dealership subscription."}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="rounded-full border bg-white/70 px-3 py-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</span>
                <span className="ml-2 text-xs font-semibold text-slate-900">{status}</span>
              </div>
              <div className="rounded-full border bg-white/70 px-3 py-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Plan</span>
                <span className="ml-2 text-xs font-semibold text-slate-900">{plan ?? "—"}</span>
              </div>
              <div className="rounded-full border bg-white/70 px-3 py-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Contract fee</span>
                <span className="ml-2 text-xs font-semibold text-slate-900">{feeCents === null ? "—" : money(feeCents)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {plans.map((p) => (
          <div
            key={p.key}
            className={
              "group relative rounded-3xl border shadow-card overflow-hidden transition-all duration-200 will-change-transform " +
              (p.featured
                ? "bg-gradient-to-b from-blue-600 to-blue-800 text-white border-blue-500/30 lg:scale-[1.02]"
                : "bg-card") +
              " hover:-translate-y-1 hover:shadow-xl"
            }
          >
            <div
              className={
                "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 " +
                (p.featured
                  ? "bg-[radial-gradient(circle_at_30%_10%,rgba(255,255,255,0.22),transparent_55%)]"
                  : "bg-[radial-gradient(circle_at_30%_10%,rgba(37,99,235,0.12),transparent_55%)]")
              }
            />

            <div className="relative p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={"text-[11px] font-semibold tracking-widest uppercase " + (p.featured ? "text-white/80" : "text-muted-foreground")}>
                    {p.badge}
                  </div>
                  <div className={"mt-1.5 text-[17px] font-semibold " + (p.featured ? "text-white" : "text-foreground")}>{p.title}</div>
                  <div className={"mt-1 text-[13px] " + (p.featured ? "text-white/80" : "text-muted-foreground")}>{p.description}</div>
                </div>

                {plan === p.key ? (
                  <div className={"shrink-0 rounded-full px-3 py-1 text-xs font-semibold " + (p.featured ? "bg-white/15 text-white" : "bg-blue-50 text-blue-700")}>Active</div>
                ) : null}
              </div>

              {p.key === "EARLY_ADOPTER" ? (
                <div className="mt-4">
                  <div className="text-sm text-white/80">
                    <span className="line-through opacity-80">$1,188 / year</span>
                  </div>
                  <div className="text-[34px] font-bold tracking-tight text-white">$594 / year</div>
                  <div className="mt-1 text-xs font-semibold text-white/85">50% Launch Discount</div>
                </div>
              ) : (
                <div className={"mt-4 text-[34px] font-bold tracking-tight " + (p.featured ? "text-white" : "text-blue-600")}>
                  {p.price}
                </div>
              )}

              <div className={"mt-4 text-sm font-semibold " + (p.featured ? "text-white/85" : "text-muted-foreground")}>What’s included</div>

              <div className="mt-2.5 space-y-1.5">
                {features.map((f) => {
                  const ok = (f as any)[p.key] as boolean;
                  return (
                    <div
                      key={f.label}
                      className={
                        "flex items-start gap-2.5 rounded-xl px-2 py-1 " +
                        (p.featured ? "hover:bg-white/8" : "hover:bg-slate-50")
                      }
                    >
                      <div
                        className={
                          "mt-0.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border " +
                          (ok
                            ? p.featured
                              ? "bg-white/15 border-white/25"
                              : "bg-blue-50 border-blue-200"
                            : p.featured
                              ? "bg-white/5 border-white/15"
                              : "bg-slate-50 border-slate-200")
                        }
                      >
                        {ok ? (
                          <Check className={"h-3 w-3 " + (p.featured ? "text-white" : "text-blue-600")} />
                        ) : (
                          <X className={"h-3 w-3 " + (p.featured ? "text-white/70" : "text-slate-400")} />
                        )}
                      </div>
                      <div className={"text-[13px] leading-snug " + (p.featured ? "text-white/85" : "text-slate-700")}>{f.label}</div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5">
                <Button
                  className={
                    "w-full rounded-xl h-10 text-sm " +
                    (p.featured
                      ? "bg-white text-blue-700 hover:bg-white/95"
                      : "bg-blue-600 text-white hover:bg-blue-700")
                  }
                  disabled={busy || user.role !== "DEALER_ADMIN" || (hasExistingSubscription && plan !== p.key)}
                  onClick={() => {
                    if (hasExistingSubscription) return;
                    void subscribe(p.key);
                  }}
                >
                  {hasExistingSubscription && plan === p.key ? "Current plan" : `Choose ${p.title}`}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {user.role !== "DEALER_ADMIN" ? (
        <div className="mt-8 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          You are a dealership employee. Ask your Dealer Admin to subscribe to enable access.
        </div>
      ) : null}
    </PageShell>
  );
}
