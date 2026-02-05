import { useMemo } from "react";

import { Button } from "../components/ui/button";
import { getAppMode } from "../lib/runtime";
import { useAuth } from "../providers/AuthProvider";

export function ProfilePage() {
  const { user, signOut } = useAuth();
  const mode = useMemo(() => getAppMode(), []);

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-xl mx-auto">
        <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-2">Your account identity and current access status.</p>

        <div className="mt-6 rounded-lg border bg-card p-4">
          <div className="grid grid-cols-1 gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-muted-foreground">Email</div>
              <div className="font-medium break-all">{user?.email ?? "—"}</div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-muted-foreground">Role</div>
              <div className="font-medium">{user?.role ?? "—"}</div>
            </div>
            {user?.role === "DEALER_ADMIN" || user?.role === "DEALER_EMPLOYEE" ? (
              <div className="flex items-center justify-between gap-3">
                <div className="text-muted-foreground">Dealership</div>
                <div className="font-medium break-words text-right">{user?.companyName ?? user?.dealerId ?? "—"}</div>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <div className="text-muted-foreground">Mode</div>
              <div className="font-medium">{mode === "supabase" ? "Supabase" : "Local"}</div>
            </div>
          </div>

          <div className="mt-4">
            <Button
              variant="outline"
              onClick={() => {
                void signOut();
              }}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
