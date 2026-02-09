import { Component, useEffect, useRef } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";

import { Navbar } from "../components/Navbar";
import { SupportWidget } from "../components/SupportWidget";
import type { Role } from "../lib/auth/types";
import { useAuth } from "../providers/AuthProvider";

class RouteErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; message?: string; details?: string }
> {
  state: { hasError: boolean; message?: string; details?: string } = { hasError: false };

  static getDerivedStateFromError(err: unknown) {
    const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "Unexpected error";
    return { hasError: true, message: msg };
  }

  componentDidCatch(err: unknown, info: unknown) {
    const errorObj = err instanceof Error ? err : null;
    const errorMessage = errorObj?.message ?? (typeof err === "string" ? err : "Unexpected error");
    const errorStack = errorObj?.stack ?? "";
    const componentStack = (info as any)?.componentStack ? String((info as any).componentStack) : "";
    const details = [
      `Message: ${errorMessage}`,
      errorStack ? `\nStack:\n${errorStack}` : "",
      componentStack ? `\nComponent stack:${componentStack}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    // eslint-disable-next-line no-console
    console.error("RouteErrorBoundary caught an error", err, info);
    this.setState({ details });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Something went wrong.</div>
          <div style={{ color: "#6b7280" }}>{this.state.message ?? "Unexpected error"}</div>
          {this.state.details ? (
            <pre
              style={{
                marginTop: 12,
                padding: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                background: "#f9fafb",
                color: "#111827",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 12,
                lineHeight: 1.4,
              }}
            >
              {this.state.details}
            </pre>
          ) : null}
          <button
            style={{ marginTop: 16, padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 6 }}
            onClick={() => this.setState({ hasError: false, message: undefined, details: undefined })}
            type="button"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
        {isLoading && !user ? <div style={{ padding: 24, color: "#6b7280" }}>Loading…</div> : null}
        <RouteErrorBoundary key={location.pathname}>
          <Outlet />
        </RouteErrorBoundary>
      </main>
      <SupportWidget />
    </div>
  );
}
