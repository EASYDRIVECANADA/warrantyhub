import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../providers/AuthProvider";

function subscriptionDisabledEnabled() {
  const explicit = (import.meta as any)?.env?.VITE_DISABLE_SUBSCRIPTION;
  const on = (explicit ?? "").toString().trim().toLowerCase();
  if (on === "1" || on === "true" || on === "yes" || on === "on") return true;
  const host = (globalThis as any)?.location?.hostname ?? "";
  if (host === "localhost" || host === "127.0.0.1") return true;
  return false;
}

function devBypassEnabled() {
  const explicit = (import.meta as any)?.env?.VITE_BYPASS_SUBSCRIPTION;
  const on = (explicit ?? "").toString().trim().toLowerCase();
  if (on === "1" || on === "true" || on === "yes" || on === "on") return true;
  return Boolean((import.meta as any)?.env?.DEV);
}

function devBypassDealerMembershipEnabled() {
  const explicit = (import.meta as any)?.env?.VITE_BYPASS_DEALER_MEMBERSHIP;
  const on = (explicit ?? "").toString().trim().toLowerCase();
  return on === "1" || on === "true" || on === "yes" || on === "on";
}

function isDealerRole(role: string) {
  return role === "DEALER_ADMIN" || role === "DEALER_EMPLOYEE";
}

function hasActiveSubscription(user: any) {
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

export function DealerSubscriptionRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading && !user) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) return <Navigate to="/sign-in" replace />;
  if (!isDealerRole(user.role)) return <Outlet />;

  if (Boolean((import.meta as any)?.env?.DEV)) return <Outlet />;
  const host = (globalThis as any)?.location?.hostname ?? "";
  if (host === "localhost" || host === "127.0.0.1") return <Outlet />;

  const dealerId = (user.dealerId ?? "").toString().trim();
  if (!dealerId && !devBypassDealerMembershipEnabled()) return <Navigate to="/request-access" replace />;

  if (!subscriptionDisabledEnabled() && !devBypassEnabled() && !hasActiveSubscription(user)) {
    return <Navigate to="/dealer-billing" replace />;
  }

  return <Outlet />;
}
