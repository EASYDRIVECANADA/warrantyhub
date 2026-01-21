import { useEffect, useRef } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";

import { Navbar } from "../components/Navbar";
import type { Role } from "../lib/auth/types";
import { useAuth } from "../providers/AuthProvider";

export function RootLayout() {
  const { user, isLoading, refreshUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const prevRoleRef = useRef<Role | null>(null);

  useEffect(() => {
    if (!user) return;
    if (user.role !== "UNASSIGNED") return;

    const id = window.setInterval(() => {
      void refreshUser();
    }, 5000);

    return () => {
      window.clearInterval(id);
    };
  }, [refreshUser, user]);

  useEffect(() => {
    if (!user) return;
    if (user.role === "UNASSIGNED") return;

    const path = location.pathname;
    const prevRole = prevRoleRef.current;
    prevRoleRef.current = user.role;

    const shouldRedirect = path === "/request-access" || (path === "/profile" && prevRole === "UNASSIGNED");
    if (!shouldRedirect) return;

    const role = user.role;
    const dashboardPath =
      role === "ADMIN" || role === "SUPER_ADMIN"
        ? "/company-dashboard"
        : role === "PROVIDER"
          ? "/provider-dashboard"
          : role === "DEALER_ADMIN"
            ? "/dealer-admin"
            : "/dealer-dashboard";

    navigate(dashboardPath, { replace: true });
  }, [location.pathname, navigate, user]);

  useEffect(() => {
    if (!user) return;
    if (prevRoleRef.current === null) prevRoleRef.current = user.role;
  }, [user]);

  if (!isLoading && user?.role === "UNASSIGNED") {
    const path = location.pathname;
    const allowed = path === "/request-access" || path === "/profile";
    if (!allowed) return <Navigate to="/request-access" replace />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="pt-16">
        <Outlet />
      </main>
    </div>
  );
}
