import { useState } from "react";
import { Navigate } from "react-router-dom";

import { PageShell } from "../components/PageShell";
import { Button } from "../components/ui/button";
import { useAuth } from "../providers/AuthProvider";
import { invokeEdgeFunction } from "../lib/supabase/functions";

export function DealerPaymentsPage() {
  const { user, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return <Navigate to="/sign-in" replace />;
  if (user.role !== "DEALER_ADMIN" && user.role !== "DEALER_EMPLOYEE") return <Navigate to="/" replace />;

  const dealerId = (user.dealerId ?? "").toString().trim();
  if (!dealerId) return <Navigate to="/request-access" replace />;

  const openStripePortal = async (flow?: "payment_method_update" | "billing_history") => {
    setError(null);
    setBusy(true);
    try {
      if (user.role !== "DEALER_ADMIN") throw new Error("Only Dealer Admin can manage payments");
      const res = await invokeEdgeFunction<{ url: string }>("stripe-create-portal-session", { dealerId, flow });
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
      title="Payments"
      subtitle="Manage saved cards and view payment history."
      actions={
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
      }
    >
      {error ? <div className="text-sm text-destructive">{error}</div> : null}

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-sm font-semibold">Save card information</div>
          <div className="mt-1 text-sm text-muted-foreground">Update your default payment method.</div>
          <div className="mt-4">
            <Button className="w-full" disabled={busy || user.role !== "DEALER_ADMIN"} onClick={() => void openStripePortal("payment_method_update")}>
              Manage cards
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="text-sm font-semibold">Payment history</div>
          <div className="mt-1 text-sm text-muted-foreground">View invoices and subscription payments.</div>
          <div className="mt-4">
            <Button variant="outline" className="w-full" disabled={busy || user.role !== "DEALER_ADMIN"} onClick={() => void openStripePortal("billing_history")}>
              View history
            </Button>
          </div>
        </div>
      </div>

      {user.role !== "DEALER_ADMIN" ? (
        <div className="mt-6 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          You are a dealership employee. Ask your Dealer Admin to manage payments.
        </div>
      ) : null}
    </PageShell>
  );
}
