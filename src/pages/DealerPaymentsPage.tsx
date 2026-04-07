import { useState } from "react";
import { Navigate } from "react-router-dom";
import { CreditCard, History, RefreshCw, ShieldCheck } from "lucide-react";

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
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      }
    >
      {error ? (
        <div className="mb-6 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="group relative rounded-2xl border bg-card shadow-card overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 via-transparent to-yellow-400/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600">
                <CreditCard className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold">Save card information</h3>
                <p className="mt-1 text-sm text-muted-foreground">Update your default payment method.</p>
              </div>
            </div>
            <div className="mt-6">
              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700" 
                disabled={busy || user.role !== "DEALER_ADMIN"} 
                onClick={() => void openStripePortal("payment_method_update")}
              >
                Manage cards
              </Button>
            </div>
          </div>
        </div>

        <div className="group relative rounded-2xl border bg-card shadow-card overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/5 via-transparent to-yellow-400/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600">
                <History className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold">Payment history</h3>
                <p className="mt-1 text-sm text-muted-foreground">View invoices and subscription payments.</p>
              </div>
            </div>
            <div className="mt-6">
              <Button 
                variant="outline" 
                className="w-full hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700" 
                disabled={busy || user.role !== "DEALER_ADMIN"} 
                onClick={() => void openStripePortal("billing_history")}
              >
                View history
              </Button>
            </div>
          </div>
        </div>
      </div>

      {user.role !== "DEALER_EMPLOYEE" ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-amber-600" />
            <p className="text-sm text-amber-800">You are a dealership employee. Ask your Dealer Admin to manage payments.</p>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
