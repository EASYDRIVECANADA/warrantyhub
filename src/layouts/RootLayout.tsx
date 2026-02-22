import { Component, useEffect, useRef, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";

import { Navbar } from "../components/Navbar";
import { Button } from "../components/ui/button";
import { SupportWidget } from "../components/SupportWidget";
import { BRAND } from "../lib/brand";
import type { Role } from "../lib/auth/types";
import { cn, confirmProceed } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";

import {
  BarChart3,
  DollarSign,
  FileText,
  LayoutGrid,
  LogOut,
  Menu,
  Store,
  User,
  Users,
  X,
} from "lucide-react";

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
  const { user, isLoading, refreshUser, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const prevRoleRef = useRef<Role | null>(null);

  const isDealerAdminSidebarCollapsed = false;

  const [isDealerAdminMobileNavOpen, setIsDealerAdminMobileNavOpen] = useState(false);

  useEffect(() => {
    setIsDealerAdminMobileNavOpen(false);
  }, [location.pathname]);

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
    const allowed = path === "/request-access" || path === "/profile" || path === "/dealer-employee-signup";
    if (!allowed) return <Navigate to="/request-access" replace />;
  }

  const isAuthLikeRoute =
    location.pathname === "/sign-in" ||
    location.pathname === "/register-dealership" ||
    location.pathname === "/forgot-password" ||
    location.pathname === "/reset-password" ||
    location.pathname === "/dealer-employee-signup";

  const showDealerAdminShell = Boolean(user) && user?.role === "DEALER_ADMIN" && !isAuthLikeRoute;

  const hideTopNavbar = isAuthLikeRoute;

  const isAppRoute =
    location.pathname.startsWith("/dealer-") ||
    location.pathname.startsWith("/provider-") ||
    location.pathname.startsWith("/admin-") ||
    location.pathname.startsWith("/company-dashboard") ||
    location.pathname.startsWith("/platform") ||
    location.pathname.startsWith("/audit-logs") ||
    location.pathname.startsWith("/support") ||
    location.pathname === "/request-access" ||
    location.pathname === "/profile";

  const hidePublicNavbarWhileLoading = isAppRoute && isLoading && !user;

  const dealerAdminNavItems = [
    { to: "/dealer-admin", label: "Dashboard", icon: LayoutGrid, active: location.pathname === "/dealer-admin" },
    {
      to: "/dealer-marketplace",
      label: "Find Products",
      icon: Store,
      active: location.pathname.startsWith("/dealer-marketplace"),
    },
    { to: "/dealer-contracts", label: "Contracts", icon: FileText, active: location.pathname.startsWith("/dealer-contracts") },
    {
      to: "/dealer-remittances",
      label: "Remittances",
      icon: DollarSign,
      active: location.pathname.startsWith("/dealer-remittances"),
    },
    { to: "/dealer-reporting", label: "Reporting", icon: BarChart3, active: location.pathname.startsWith("/dealer-reporting") },
    { to: "/dealer-team", label: "Team", icon: Users, active: location.pathname.startsWith("/dealer-team") },
  ] as const;

  const dealerAdminSecondaryItems = [
    { to: "/profile", label: "Profile", icon: User, active: location.pathname.startsWith("/profile") },
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {showDealerAdminShell ? (
        <div
          className="min-h-screen grid grid-cols-1"
          style={{ gridTemplateColumns: `minmax(0, 1fr)` }}
        >
          <div
            className="hidden lg:grid min-h-screen"
            style={{ gridTemplateColumns: isDealerAdminSidebarCollapsed ? "88px minmax(0, 1fr)" : "260px minmax(0, 1fr)" }}
          >
            <aside className="flex flex-col border-r bg-card/95 backdrop-blur-xl">
              <div className={`h-14 px-4 flex items-center border-b ${isDealerAdminSidebarCollapsed ? "justify-center" : "justify-start"}`}>
                <Link to="/dealer-admin" className={`flex items-center gap-2 ${isDealerAdminSidebarCollapsed ? "justify-center" : ""}`}>
                  <img src={BRAND.logoUrl} alt={BRAND.name} className="h-9 w-auto object-contain" />
                  {!isDealerAdminSidebarCollapsed ? (
                    <div className="leading-tight">
                      <div className="font-semibold text-sm">{BRAND.name}</div>
                      <div className="text-[11px] text-muted-foreground">Dealer Admin</div>
                    </div>
                  ) : null}
                </Link>
              </div>

              <div className={`px-2 py-3 flex-1 ${isDealerAdminSidebarCollapsed ? "" : ""}`}>
                <div className="space-y-1">
                  {dealerAdminNavItems.map((item) => (
                    <Button
                      key={item.to}
                      variant="ghost"
                      className={
                        `w-full ${isDealerAdminSidebarCollapsed ? "justify-center px-0" : "justify-start"} h-9 text-[13px] font-medium ` +
                        (item.active
                          ? "bg-blue-600/15 text-foreground hover:bg-blue-600/20"
                          : "text-muted-foreground hover:text-foreground hover:bg-blue-600/10")
                      }
                      type="button"
                      onClick={() => {
                        setIsDealerAdminMobileNavOpen(false);
                        navigate(item.to);
                      }}
                    >
                      <span className="flex items-center gap-2" title={isDealerAdminSidebarCollapsed ? item.label : undefined}>
                        <item.icon className="h-4 w-4" />
                        {!isDealerAdminSidebarCollapsed ? <span>{item.label}</span> : null}
                      </span>
                    </Button>
                  ))}
                </div>

                <div className="pt-3 mt-3 border-t" />
                <div className="space-y-1">
                  {dealerAdminSecondaryItems.map((item) => (
                    <Button
                      key={item.to}
                      variant="ghost"
                      className={
                        `w-full ${isDealerAdminSidebarCollapsed ? "justify-center px-0" : "justify-start"} h-9 text-[13px] font-medium ` +
                        (item.active
                          ? "bg-blue-600/15 text-foreground hover:bg-blue-600/20"
                          : "text-muted-foreground hover:text-foreground hover:bg-blue-600/10")
                      }
                      type="button"
                      onClick={() => {
                        setIsDealerAdminMobileNavOpen(false);
                        navigate(item.to);
                      }}
                    >
                      <span className="flex items-center gap-2" title={isDealerAdminSidebarCollapsed ? item.label : undefined}>
                        <item.icon className="h-4 w-4" />
                        {!isDealerAdminSidebarCollapsed ? <span>{item.label}</span> : null}
                      </span>
                    </Button>
                  ))}

                  <Button
                    variant={isDealerAdminSidebarCollapsed ? "ghost" : "default"}
                    size={isDealerAdminSidebarCollapsed ? "icon" : "sm"}
                    className={cn(
                      isDealerAdminSidebarCollapsed
                        ? "text-muted-foreground hover:text-foreground hover:bg-red-500/10"
                        : "bg-red-500/10 text-red-600 hover:bg-red-500/15 hover:text-red-600",
                    )}
                    title={isDealerAdminSidebarCollapsed ? "Sign Out" : undefined}
                    onClick={() => {
                      void (async () => {
                        if (!(await confirmProceed(`Sign out of ${BRAND.name}?`, "Sign Out"))) return;
                        await signOut();
                        window.location.assign("/find-insurance");
                      })();
                    }}
                  >
                    <LogOut className={isDealerAdminSidebarCollapsed ? "h-4 w-4" : "h-4 w-4"} />
                    {isDealerAdminSidebarCollapsed ? null : <span>Sign Out</span>}
                  </Button>
                </div>
              </div>
            </aside>

            <main className="min-w-0">
              {isLoading && !user ? <div style={{ padding: 24, color: "#6b7280" }}>Loading…</div> : null}
              <RouteErrorBoundary key={location.pathname}>
                <Outlet />
              </RouteErrorBoundary>
            </main>
          </div>

          <div className="lg:hidden">
            <div className="h-14 px-4 border-b bg-card/95 backdrop-blur-xl flex items-center justify-between">
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setIsDealerAdminMobileNavOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
              <Link to="/dealer-admin" className="flex items-center gap-2">
                <img src={BRAND.logoUrl} alt={BRAND.name} className="h-9 w-auto object-contain" />
                <div className="leading-tight">
                  <div className="font-semibold text-sm">Dealer Admin</div>
                  <div className="text-[11px] text-muted-foreground">Dashboard</div>
                </div>
              </Link>
              <div className="w-9" />
            </div>

            <main className="min-w-0">
              {isLoading && !user ? <div style={{ padding: 24, color: "#6b7280" }}>Loading…</div> : null}
              <RouteErrorBoundary key={location.pathname}>
                <Outlet />
              </RouteErrorBoundary>
            </main>

            {isDealerAdminMobileNavOpen ? (
              <div className="fixed inset-0 z-50">
                <button
                  type="button"
                  className="absolute inset-0 bg-black/40"
                  onClick={() => setIsDealerAdminMobileNavOpen(false)}
                />
                <div className="absolute left-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-card border-r shadow-xl flex flex-col">
                  <div className="h-14 px-4 border-b flex items-center justify-between">
                    <div className="font-semibold text-sm">Menu</div>
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setIsDealerAdminMobileNavOpen(false)}>
                      <X className="h-5 w-5" />
                    </Button>
                  </div>

                  <div className="p-3 flex-1">
                    <div className="space-y-1">
                      {dealerAdminNavItems.map((item) => (
                        <Button
                          key={item.to}
                          variant="ghost"
                          className={
                            `w-full justify-start h-9 text-[13px] font-medium ` +
                            (item.active
                              ? "bg-blue-600/15 text-foreground hover:bg-blue-600/20"
                              : "text-muted-foreground hover:text-foreground hover:bg-blue-600/10")
                          }
                          type="button"
                          onClick={() => {
                            setIsDealerAdminMobileNavOpen(false);
                            navigate(item.to);
                          }}
                        >
                          <span className="flex items-center gap-2">
                            <item.icon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </span>
                        </Button>
                      ))}
                    </div>

                    <div className="pt-3 mt-3 border-t" />
                    <div className="space-y-1">
                      {dealerAdminSecondaryItems.map((item) => (
                        <Button
                          key={item.to}
                          variant="ghost"
                          className={
                            `w-full justify-start h-9 text-[13px] font-medium ` +
                            (item.active
                              ? "bg-blue-600/15 text-foreground hover:bg-blue-600/20"
                              : "text-muted-foreground hover:text-foreground hover:bg-blue-600/10")
                          }
                          type="button"
                          onClick={() => {
                            setIsDealerAdminMobileNavOpen(false);
                            navigate(item.to);
                          }}
                        >
                          <span className="flex items-center gap-2">
                            <item.icon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </span>
                        </Button>
                      ))}

                      <Button
                        variant="ghost"
                        className="w-full justify-start h-9 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-red-500/10"
                        onClick={() => {
                          void (async () => {
                            if (!(await confirmProceed(`Sign out of ${BRAND.name}?`, "Sign Out"))) return;
                            await signOut();
                            window.location.assign("/find-insurance");
                          })();
                        }}
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Sign Out</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {hideTopNavbar || hidePublicNavbarWhileLoading ? null : <Navbar />}
          <main className={hideTopNavbar ? "" : "pt-16"}>
            {isLoading && !user ? <div style={{ padding: 24, color: "#6b7280" }}>Loading…</div> : null}
            <RouteErrorBoundary key={location.pathname}>
              <Outlet />
            </RouteErrorBoundary>
          </main>
        </>
      )}
      <SupportWidget />
    </div>
  );
}
