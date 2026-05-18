import { Navigate, Outlet } from "react-router-dom";

import type { Role } from "../lib/auth/types";
import { useAuth } from "../providers/AuthProvider";

function roleToDashboardPath(role: string): string {
  if (role === "SUPER_ADMIN" || role === "ADMIN") return "/admin/overview";
  if (role === "PROVIDER") return "/provider/overview";
  if (role === "DEALER_ADMIN" || role === "DEALER_EMPLOYEE") return "/dealership/overview";
  if (role === "UNASSIGNED") return "/request-access";
  return "/";
}

function canAccessAllowedRoles(user: { role: Role }, allowedRoles?: Role[]) {
  if (!allowedRoles) return true;
  if (user.role === "SUPER_ADMIN") return true;
  return allowedRoles.includes(user.role);
}

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

  if (!canAccessAllowedRoles(user, allowedRoles)) {
    return <Navigate to={roleToDashboardPath(user.role)} replace />;
  }

  return <Outlet />;
}
