import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../components/ui/button";
import { PageShell } from "../components/PageShell";
import { getAppMode } from "../lib/runtime";
import { useAuth } from "../providers/AuthProvider";

export function ProfilePage() {
  const { user, signOut } = useAuth();
  const mode = useMemo(() => getAppMode(), []);
  const navigate = useNavigate();

  return (
    <PageShell
      title="Profile"
    >
      <div className="max-w-2xl mx-auto">
        <div className="grid grid-cols-1 gap-6">
          <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-sm">👤</div>
                <div className="font-semibold">Account Details</div>
              </div>
            </div>

            <div className="p-6 text-sm">
              <div className="grid grid-cols-2 gap-y-3">
                <div className="text-muted-foreground">Email</div>
                <div className="font-medium break-all text-right">{user?.email ?? "—"}</div>

                <div className="text-muted-foreground">Role</div>
                <div className="font-medium text-right">{user?.role ?? "—"}</div>

                <div className="text-muted-foreground">Dealership</div>
                <div className="font-medium break-words text-right">
                  {user?.role === "DEALER_ADMIN" || user?.role === "DEALER_EMPLOYEE" ? user?.companyName ?? user?.dealerId ?? "—" : "—"}
                </div>

                <div className="text-muted-foreground">Auth Mode</div>
                <div className="font-medium text-right">{mode === "supabase" ? "Supabase" : "Local"}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b">
              <div className="font-semibold">Session</div>
              <div className="text-sm text-muted-foreground mt-1">Sign out of your account</div>
            </div>

            <div className="p-6">
              <Button
                onClick={() => {
                  void (async () => {
                    await signOut();
                    navigate("/find-insurance", { replace: true });
                  })();
                }}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
