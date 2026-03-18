import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../providers/AuthProvider";

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

  const dealerId = (user.dealerId ?? "").toString().trim();
  if (!dealerId) return <Navigate to="/request-access" replace />;

  if (!hasActiveSubscription(user)) {
    return <Navigate to="/dealer-billing" replace />;
  }

  return <Outlet />;
}
