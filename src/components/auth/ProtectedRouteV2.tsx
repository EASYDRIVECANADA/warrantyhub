import { Navigate } from "react-router-dom";

import { useDealership } from "../../hooks/useDealership";
import type { Role } from "../../lib/auth/types";
import { useAuth } from "../../providers/AuthProvider";

type AppRoleCompat = Role | "super_admin" | "dealership_admin" | "dealership_employee" | "provider";

const ROLE_MAP: Record<string, AppRoleCompat[]> = {
  super_admin: ["SUPER_ADMIN", "ADMIN", "super_admin"],
  dealership_admin: ["DEALER_ADMIN", "dealership_admin"],
  dealership_employee: ["DEALER_EMPLOYEE", "dealership_employee"],
  provider: ["PROVIDER", "provider"],
};

function matchesRole(userRole: string, allowedRoles: string[], memberRole?: "admin" | "employee" | null): boolean {
  if (userRole === "SUPER_ADMIN") return true;
  const isDealershipRouteCheck = allowedRoles.some((role) => role === "dealership_admin" || role === "dealership_employee");
  const effectiveDealershipRole =
    memberRole === "admin"
      ? "dealership_admin"
      : memberRole === "employee"
        ? "dealership_employee"
        : null;

  if (isDealershipRouteCheck && effectiveDealershipRole) {
    return allowedRoles.includes(effectiveDealershipRole);
  }

  if (isDealershipRouteCheck && allowedRoles.length === 1 && allowedRoles[0] === "dealership_admin") {
    return false;
  }

  for (const allowed of allowedRoles) {
    if (userRole === allowed) return true;
    const mapped = ROLE_MAP[allowed];
    if (mapped && mapped.includes(userRole as AppRoleCompat)) return true;
    const userMapped = Object.entries(ROLE_MAP).find(([, vals]) =>
      vals.includes(userRole as AppRoleCompat),
    );
    if (userMapped && allowedRoles.includes(userMapped[0])) return true;
  }
  return false;
}

function roleToDashboardPath(role: string): string {
  if (role === "SUPER_ADMIN" || role === "ADMIN" || role === "super_admin") return "/admin/overview";
  if (role === "PROVIDER" || role === "provider") return "/provider/overview";
  if (role === "DEALER_ADMIN" || role === "DEALER_EMPLOYEE" || role === "dealership_admin" || role === "dealership_employee") return "/dealership/overview";
  return "/";
}

export function ProtectedRouteV2({
  allowedRoles,
  children,
}: {
  allowedRoles?: string[];
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const { memberRole, loading: dealershipLoading } = useDealership();
  const isDealershipRouteCheck = Boolean(
    allowedRoles?.some((role) => role === "dealership_admin" || role === "dealership_employee"),
  );

  if (isLoading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/sign-in" replace />;

  if (isDealershipRouteCheck && dealershipLoading && user.role !== "SUPER_ADMIN") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (allowedRoles && !matchesRole(user.role, allowedRoles, memberRole)) {
    return <Navigate to={roleToDashboardPath(user.role)} replace />;
  }

  return <>{children}</>;
}
