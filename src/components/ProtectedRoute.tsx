import { Navigate, Outlet } from "react-router-dom";

import type { Role } from "../lib/auth/types";
import { useAuth } from "../providers/AuthProvider";

export function ProtectedRoute({ allowedRoles }: { allowedRoles?: Role[] }) {
  const { user, isLoading } = useAuth();

  if (isLoading && !user) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) return <Navigate to="/sign-in" replace />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === "UNASSIGNED") return <Navigate to="/request-access" replace />;
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
