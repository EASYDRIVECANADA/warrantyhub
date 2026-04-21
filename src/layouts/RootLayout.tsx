import { Component, useEffect, useRef, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";

import { Navbar } from "../components/Navbar";
import { Button, buttonVariants } from "../components/ui/button";
import { SupportWidget } from "../components/SupportWidget";
import { BRAND } from "../lib/brand";
import type { Role } from "../lib/auth/types";
import { cn, confirmProceed } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";

import {
  BarChart3,
  Cog,
  ChevronDown,
  CreditCard,
  DollarSign,
  FileText,
  LayoutGrid,
  LogOut,
  Menu,
  Package,
  Settings,
  Store,
  Text,
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

  const dashboardPathForRole = (role: Role) => {
    return role === "SUPER_ADMIN"
      ? "/platform"
      : role === "ADMIN"
        ? "/company-dashboard"
        : role === "PROVIDER"
          ? "/provider/overview"
          : "/dealership/overview";
  };

  const isDealerAdminSidebarCollapsed = false;
  const isProviderSidebarCollapsed = false;

  const [isDealerAdminMobileNavOpen, setIsDealerAdminMobileNavOpen] = useState(false);
  const [isProviderMobileNavOpen, setIsProviderMobileNavOpen] = useState(false);
  const [isSuperAdminMobileNavOpen, setIsSuperAdminMobileNavOpen] = useState(false);
  const [isDealerAdminSettingsOpen, setIsDealerAdminSettingsOpen] = useState(false);
  const [dealerConfidentialityMode, setDealerConfidentialityMode] = useState(() => {
    try {
      return localStorage.getItem("warrantyhub.dealer.confidentiality_pricing") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleConfidentialityChange = () => {
      try {
        const value = localStorage.getItem("warrantyhub.dealer.confidentiality_pricing") === "true";
        setDealerConfidentialityMode(value);
      } catch {
      }
    };
    window.addEventListener("confidentiality-mode-changed", handleConfidentialityChange);
    return () => window.removeEventListener("confidentiality-mode-changed", handleConfidentialityChange);
  }, []);

  useEffect(() => {
    setIsDealerAdminMobileNavOpen(false);
    setIsProviderMobileNavOpen(false);
    setIsSuperAdminMobileNavOpen(false);
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
    navigate(dashboardPathForRole(role), { replace: true });
  }, [location.pathname, navigate, user]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) return;
    if (user.role === "UNASSIGNED") return;

    const path = location.pathname;
    const isPublicLanding = path === "/" || path === "/find-insurance";
    const isAuthRoute = path === "/sign-in" || path === "/login";
    if (!isPublicLanding && !isAuthRoute) return;

    navigate(dashboardPathForRole(user.role), { replace: true });
  }, [isLoading, location.pathname, navigate, user]);

  // Redirect provider users from old /provider-* routes to new /provider/* routes
  const providerRedirectMap: Record<string, string> = {
    "/provider-dashboard": "/provider/overview",
    "/provider-products": "/provider/products",
    "/provider-terms": "/provider/settings",
    "/provider-contracts": "/provider/contracts",
    "/provider-remittances": "/provider/remittances",
    "/provider-documents": "/provider/settings",
  };

  useEffect(() => {
    if (!user || user.role !== "PROVIDER") return;
    const target = providerRedirectMap[location.pathname];
    if (target) navigate(target, { replace: true });
  }, [user, location.pathname, navigate]);

  // Redirect dealer users from old /dealer-* routes to new /dealership/* routes
  const dealerRedirectMap: Record<string, string> = {
    "/dealer-admin": "/dealership/overview",
    "/dealer-dashboard": "/dealership/overview",
    "/dealer-marketplace": "/dealership/find-products",
    "/dealer-contracts": "/dealership/contracts",
    "/dealer-remittances": "/dealership/remittances",
    "/dealer-reporting": "/dealership/reporting",
    "/dealer-configure": "/dealership/settings/configuration",
    "/dealer-employees": "/dealership/settings/team",
    "/dealer-team": "/dealership/settings/team",
    "/dealer-contracts-admin": "/dealership/contracts",
  };

  useEffect(() => {
    if (!user || (user.role !== "DEALER_ADMIN" && user.role !== "DEALER_EMPLOYEE")) return;
    const target = dealerRedirectMap[location.pathname];
    if (target) navigate(target, { replace: true });
  }, [user, location.pathname, navigate]);

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
  const showProviderShell = Boolean(user) && user?.role === "PROVIDER" && !isAuthLikeRoute;
  const showSuperAdminShell = Boolean(user) && user?.role === "SUPER_ADMIN" && !isAuthLikeRoute;

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

  const subscriptionsDisabled = (() => {
    const explicit = (import.meta as any)?.env?.VITE_DISABLE_SUBSCRIPTION;
    const on = (explicit ?? "").toString().trim().toLowerCase();
    return on === "1" || on === "true" || on === "yes" || on === "on";
  })();

  const dealerAdminSettingsActive =
    location.pathname.startsWith("/dealer-configure") ||
    location.pathname.startsWith("/dealer-team") ||
    location.pathname.startsWith("/profile") ||
    location.pathname.startsWith("/dealer-billing") ||
    location.pathname.startsWith("/dealer-payments");

  useEffect(() => {
    if (dealerAdminSettingsActive) setIsDealerAdminSettingsOpen(true);
  }, [dealerAdminSettingsActive]);

  type DealerAdminNavItem = {
    to: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    active: boolean;
  };

  const dealerAdminNavItems: DealerAdminNavItem[] = [
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
  ];

  const dealerAdminSecondaryItems: DealerAdminNavItem[] = [];

  const dealerAdminSettingsItems: DealerAdminNavItem[] = [
    { to: "/dealer-configure", label: "Configuration", icon: Cog, active: location.pathname.startsWith("/dealer-configure") },
    { to: "/dealer-team", label: "Team", icon: Users, active: location.pathname.startsWith("/dealer-team") },
    ...(subscriptionsDisabled
      ? ([] as const)
      : ([{ to: "/dealer-billing", label: "Plans", icon: CreditCard, active: location.pathname.startsWith("/dealer-billing") }] as const)),
    ...(subscriptionsDisabled
      ? ([] as const)
      : ([{ to: "/dealer-payments", label: "Payments", icon: DollarSign, active: location.pathname.startsWith("/dealer-payments") }] as const)),
    { to: "/profile", label: "Profile", icon: User, active: location.pathname.startsWith("/profile") },
  ];

  const providerNavItems = [
    { to: "/provider-dashboard", label: "Dashboard", icon: LayoutGrid, active: location.pathname === "/provider-dashboard" },
    { to: "/provider-products", label: "Products", icon: Package, active: location.pathname.startsWith("/provider-products") },
    { to: "/provider-terms", label: "Terms", icon: Text, active: location.pathname.startsWith("/provider-terms") },
    { to: "/provider-contracts", label: "Contracts", icon: FileText, active: location.pathname.startsWith("/provider-contracts") },
    {
      to: "/provider-remittances",
      label: "Remittances",
      icon: DollarSign,
      active: location.pathname.startsWith("/provider-remittances"),
    },
  ] as const;

  const providerSecondaryItems = [{ to: "/profile", label: "Profile", icon: User, active: location.pathname.startsWith("/profile") }] as const;

  const superAdminNavItems = [
    { to: "/platform", label: "Platform Dashboard", icon: LayoutGrid, active: location.pathname === "/platform" },
    { to: "/admin-access-requests", label: "Access Requests", icon: Users, active: location.pathname.startsWith("/admin-access-requests") },
    { to: "/admin-companies", label: "Companies", icon: Package, active: location.pathname.startsWith("/admin-companies") },
    { to: "/admin-dealerships", label: "Dealerships", icon: Store, active: location.pathname.startsWith("/admin-dealerships") },
    { to: "/admin-users", label: "Platform Users", icon: User, active: location.pathname.startsWith("/admin-users") },
    { to: "/audit-logs", label: "Audit Logs", icon: FileText, active: location.pathname.startsWith("/audit-logs") },
  ] as const;

  const superAdminSecondaryItems = [{ to: "/profile", label: "Profile", icon: User, active: location.pathname.startsWith("/profile") }] as const;

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
            <aside className="relative isolate z-20 flex flex-col border-r border-slate-800 bg-slate-900 text-white overflow-hidden">
                <div className="relative z-10 flex flex-col flex-1">
                <div className={`px-4 py-4 flex flex-col border-b border-slate-800 ${isDealerAdminSidebarCollapsed ? "items-center" : "items-start"}`}>
                  <Link to="/dealer-admin" className={`flex items-center gap-2.5 ${isDealerAdminSidebarCollapsed ? "justify-center" : ""}`}>
                    <img src="/images/warrantyhubwhite.png" alt={BRAND.name} className="h-8 w-auto object-contain" />
                    {!isDealerAdminSidebarCollapsed ? (
                      <div className="font-bold text-base tracking-tight">{BRAND.name}</div>
                    ) : null}
                  </Link>
                  {!isDealerAdminSidebarCollapsed ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Dealer Admin</span>
                      {dealerConfidentialityMode ? (
                        <>
                          <span className="text-[10px] text-slate-600">|</span>
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-yellow-400/80">Confidentiality Pricing</span>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className={`px-3 py-4 flex-1 ${isDealerAdminSidebarCollapsed ? "" : ""}`}>
                  <div className="space-y-0.5">
                    {dealerAdminNavItems.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={(e) => {
                          setIsDealerAdminMobileNavOpen(false);
                          if (location.pathname.startsWith("/dealer-marketplace/compare")) {
                            e.preventDefault();
                            window.location.assign(item.to);
                          }
                        }}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 h-10 text-[13px] font-medium transition-colors w-full",
                          isDealerAdminSidebarCollapsed ? "justify-center px-0" : "justify-start",
                          item.active
                            ? "bg-white text-slate-900"
                            : "text-slate-400 hover:text-white hover:bg-slate-800",
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!isDealerAdminSidebarCollapsed ? <span>{item.label}</span> : null}
                      </Link>
                    ))}
                  </div>

                  <div className="my-4 border-t border-slate-800" />
                  <div className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => setIsDealerAdminSettingsOpen((v) => !v)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 h-10 text-[13px] font-medium transition-colors w-full",
                        isDealerAdminSidebarCollapsed ? "justify-center px-0" : "justify-start",
                        dealerAdminSettingsActive
                          ? "bg-slate-800 text-white"
                          : "text-slate-400 hover:text-white hover:bg-slate-800",
                      )}
                      aria-expanded={isDealerAdminSettingsOpen}
                    >
                      <Settings className="h-4 w-4 shrink-0" />
                      {!isDealerAdminSidebarCollapsed ? <span>Settings</span> : null}
                      {!isDealerAdminSidebarCollapsed ? (
                        <ChevronDown className={cn("h-3.5 w-3.5 ml-auto transition-transform text-slate-500", isDealerAdminSettingsOpen ? "rotate-180" : "")} />
                      ) : null}
                    </button>

                    {isDealerAdminSidebarCollapsed ? null : isDealerAdminSettingsOpen ? (
                      <div className="pl-3 space-y-0.5 mt-0.5">
                        {dealerAdminSettingsItems.map((item) => (
                          <Link
                            key={item.to + item.label}
                            to={item.to}
                            onClick={(e) => {
                              setIsDealerAdminMobileNavOpen(false);
                              if (location.pathname.startsWith("/dealer-marketplace/compare")) {
                                e.preventDefault();
                                window.location.assign(item.to);
                              }
                            }}
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-3 h-9 text-[13px] font-medium transition-colors w-full",
                              item.active
                                ? "bg-slate-700 text-white"
                                : "text-slate-400 hover:text-white hover:bg-slate-800",
                            )}
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-0.5">
                    {dealerAdminSecondaryItems.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={(e) => {
                          setIsDealerAdminMobileNavOpen(false);
                          if (location.pathname.startsWith("/dealer-marketplace/compare")) {
                            e.preventDefault();
                            window.location.assign(item.to);
                          }
                        }}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 h-10 text-[13px] font-medium transition-colors w-full",
                          isDealerAdminSidebarCollapsed ? "justify-center px-0" : "justify-start",
                          item.active
                            ? "bg-white text-slate-900"
                            : "text-slate-400 hover:text-white hover:bg-slate-800",
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!isDealerAdminSidebarCollapsed ? <span>{item.label}</span> : null}
                      </Link>
                    ))}
                  </div>

                  <div className="mt-auto pt-4 border-t border-slate-800">
                    <button
                      type="button"
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 h-10 text-[13px] font-medium transition-colors w-full",
                        isDealerAdminSidebarCollapsed ? "justify-center" : "justify-start",
                        "text-slate-400 hover:text-red-400 hover:bg-red-500/10",
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
                      <LogOut className="h-4 w-4 shrink-0" />
                      {isDealerAdminSidebarCollapsed ? null : <span>Sign Out</span>}
                    </button>
                  </div>
                </div>
              </div>
            </aside>

            <main className="relative z-0 min-w-0">
              {isLoading && !user ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/30 backdrop-blur-sm">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" aria-label="Loading" />
                </div>
              ) : null}
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
              {isLoading && !user ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/30 backdrop-blur-sm">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" aria-label="Loading" />
                </div>
              ) : null}
              <RouteErrorBoundary key={location.pathname}>
                <Outlet />
              </RouteErrorBoundary>
            </main>

            {isDealerAdminMobileNavOpen ? (
              <div className="fixed inset-0 z-50">
                <button
                  type="button"
                  className="absolute inset-0 bg-black/60"
                  onClick={() => setIsDealerAdminMobileNavOpen(false)}
                />
                <div className="absolute left-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-slate-900 border-r border-slate-800 shadow-2xl flex flex-col text-white overflow-hidden">
                  <div className="relative z-10 flex flex-col flex-1">
                  <div className="px-4 py-4 border-b border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm">{BRAND.name}</div>
                      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mt-0.5">Dealer Admin</div>
                    </div>
                    <button type="button" onClick={() => setIsDealerAdminMobileNavOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="p-3 flex-1 flex flex-col">
                    <div className="space-y-0.5">
                      {dealerAdminNavItems.map((item) => (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={(e) => {
                            setIsDealerAdminMobileNavOpen(false);
                            if (location.pathname.startsWith("/dealer-marketplace/compare")) {
                              e.preventDefault();
                              window.location.assign(item.to);
                            }
                          }}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 h-10 text-[13px] font-medium transition-colors w-full",
                            item.active
                              ? "bg-white text-slate-900"
                              : "text-slate-400 hover:text-white hover:bg-slate-800",
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      ))}
                    </div>

                    <div className="my-3 border-t border-slate-800" />
                    <div className="space-y-0.5">
                      <button
                        type="button"
                        onClick={() => setIsDealerAdminSettingsOpen((v) => !v)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 h-10 text-[13px] font-medium transition-colors w-full",
                          dealerAdminSettingsActive
                            ? "bg-slate-800 text-white"
                            : "text-slate-400 hover:text-white hover:bg-slate-800",
                        )}
                        aria-expanded={isDealerAdminSettingsOpen}
                      >
                        <Settings className="h-4 w-4 shrink-0" />
                        <span>Settings</span>
                        <ChevronDown className={cn("h-3.5 w-3.5 ml-auto transition-transform text-slate-500", isDealerAdminSettingsOpen ? "rotate-180" : "")} />
                      </button>

                      {isDealerAdminSettingsOpen ? (
                        <div className="pl-3 space-y-0.5 mt-0.5">
                          {dealerAdminSettingsItems.map((item) => (
                            <Link
                              key={item.to + item.label}
                              to={item.to}
                              onClick={(e) => {
                                setIsDealerAdminMobileNavOpen(false);
                                if (location.pathname.startsWith("/dealer-marketplace/compare")) {
                                  e.preventDefault();
                                  window.location.assign(item.to);
                                }
                              }}
                              className={cn(
                                "flex items-center gap-3 rounded-lg px-3 h-9 text-[13px] font-medium transition-colors w-full",
                                item.active
                                  ? "bg-slate-700 text-white"
                                  : "text-slate-400 hover:text-white hover:bg-slate-800",
                              )}
                            >
                              <item.icon className="h-4 w-4 shrink-0" />
                              <span>{item.label}</span>
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-0.5">
                      {dealerAdminSecondaryItems.map((item) => (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={(e) => {
                            setIsDealerAdminMobileNavOpen(false);
                            if (location.pathname.startsWith("/dealer-marketplace/compare")) {
                              e.preventDefault();
                              window.location.assign(item.to);
                            }
                          }}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 h-10 text-[13px] font-medium transition-colors w-full",
                            item.active
                              ? "bg-white text-slate-900"
                              : "text-slate-400 hover:text-white hover:bg-slate-800",
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      ))}

                      <div className="pt-3 mt-2 border-t border-slate-800">
                        <button
                          type="button"
                          className="flex items-center gap-3 rounded-lg px-3 h-10 text-[13px] font-medium transition-colors w-full text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                          onClick={() => {
                            (async () => {
                              if (!(await confirmProceed(`Sign out of ${BRAND.name}?`, "Sign Out"))) return;
                              await signOut();
                              window.location.assign("/find-insurance");
                            })();
                          }}
                        >
                          <LogOut className="h-4 w-4 shrink-0" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : showSuperAdminShell ? (
        <div className="min-h-screen grid grid-cols-1" style={{ gridTemplateColumns: `minmax(0, 1fr)` }}>
          <div className="hidden lg:grid min-h-screen" style={{ gridTemplateColumns: "260px minmax(0, 1fr)" }}>
            <aside className="relative isolate flex flex-col border-r text-white overflow-hidden">
              <div className="pointer-events-none absolute inset-0 hero-gradient" />
              <div className="pointer-events-none absolute inset-0 bg-white/10" />
              <div
                className="pointer-events-none absolute inset-0 opacity-12"
                style={{
                  backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)",
                  backgroundSize: "44px 44px",
                }}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/0 via-white/0 to-black/8" />

              <div className="relative z-10 flex flex-col flex-1">
                <div className="h-14 px-4 flex items-center border-b border-white/15 justify-start">
                  <Link to="/platform" className="flex items-center gap-2">
                    <img src="/images/warrantyhubwhite.png" alt={BRAND.name} className="h-9 w-auto object-contain" />
                    <div className="leading-tight">
                      <div className="font-semibold text-sm">{BRAND.name}</div>
                      <div className="text-[11px] text-white/80">Platform Admin</div>
                    </div>
                  </Link>
                </div>

                <div className="px-2 py-3 flex-1">
                  <div className="space-y-1">
                    {superAdminNavItems.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setIsSuperAdminMobileNavOpen(false)}
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "sm" }),
                          "w-full justify-start h-9 text-[13px] font-medium",
                          item.active ? "bg-white/15 text-white hover:bg-white/20" : "text-white/85 hover:text-white hover:bg-white/10",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </span>
                      </Link>
                    ))}
                  </div>

                  <div className="pt-3 mt-3 border-t border-white/15" />
                  <div className="space-y-1">
                    {superAdminSecondaryItems.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setIsSuperAdminMobileNavOpen(false)}
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "sm" }),
                          "w-full justify-start h-9 text-[13px] font-medium",
                          item.active ? "bg-white/15 text-white hover:bg-white/20" : "text-white/85 hover:text-white hover:bg-white/10",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </span>
                      </Link>
                    ))}

                    <Button
                      variant="ghost"
                      className="w-full justify-start h-9 text-[13px] font-medium text-white/85 hover:text-white hover:bg-red-500/20"
                      onClick={() => {
                        (async () => {
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
            </aside>

            <main className="min-w-0">
              {isLoading && !user ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/30 backdrop-blur-sm">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" aria-label="Loading" />
                </div>
              ) : null}
              <RouteErrorBoundary key={location.pathname}>
                <Outlet />
              </RouteErrorBoundary>
            </main>
          </div>

          <div className="lg:hidden">
            <div className="h-14 px-4 border-b bg-card/95 backdrop-blur-xl flex items-center justify-between">
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setIsSuperAdminMobileNavOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
              <Link to="/platform" className="flex items-center gap-2">
                <img src={BRAND.logoUrl} alt={BRAND.name} className="h-9 w-auto object-contain" />
                <div className="leading-tight">
                  <div className="font-semibold text-sm">Platform Admin</div>
                  <div className="text-[11px] text-muted-foreground">{location.pathname === "/platform" ? "Dashboard" : ""}</div>
                </div>
              </Link>
              <div className="w-9" />
            </div>

            <main className="min-w-0">
              {isLoading && !user ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/30 backdrop-blur-sm">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" aria-label="Loading" />
                </div>
              ) : null}
              <RouteErrorBoundary key={location.pathname}>
                <Outlet />
              </RouteErrorBoundary>
            </main>

            {isSuperAdminMobileNavOpen ? (
              <div className="fixed inset-0 z-50">
                <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setIsSuperAdminMobileNavOpen(false)} />
                <div className="absolute left-0 top-0 bottom-0 w-[280px] max-w-[85vw] border-r shadow-xl flex flex-col text-white overflow-hidden">
                  <div className="pointer-events-none absolute inset-0 hero-gradient" />
                  <div className="pointer-events-none absolute inset-0 bg-white/10" />
                  <div
                    className="pointer-events-none absolute inset-0 opacity-12"
                    style={{
                      backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)",
                      backgroundSize: "44px 44px",
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/0 via-white/0 to-black/8" />

                  <div className="relative z-10 flex flex-col flex-1">
                    <div className="h-14 px-4 border-b border-white/15 flex items-center justify-between">
                      <div className="font-semibold text-sm">Menu</div>
                      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setIsSuperAdminMobileNavOpen(false)}>
                        <X className="h-5 w-5" />
                      </Button>
                    </div>

                    <div className="p-3 flex-1">
                      <div className="space-y-1">
                        {superAdminNavItems.map((item) => (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => setIsSuperAdminMobileNavOpen(false)}
                            className={cn(
                              buttonVariants({ variant: "ghost", size: "sm" }),
                              "w-full justify-start h-9 text-[13px] font-medium",
                              item.active ? "bg-white/15 text-white hover:bg-white/20" : "text-white/85 hover:text-white hover:bg-white/10",
                            )}
                          >
                            <span className="flex items-center gap-2">
                              <item.icon className="h-4 w-4" />
                              <span>{item.label}</span>
                            </span>
                          </Link>
                        ))}
                      </div>

                      <div className="pt-3 mt-3 border-t border-white/15" />
                      <div className="space-y-1">
                        {superAdminSecondaryItems.map((item) => (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => setIsSuperAdminMobileNavOpen(false)}
                            className={cn(
                              buttonVariants({ variant: "ghost", size: "sm" }),
                              "w-full justify-start h-9 text-[13px] font-medium",
                              item.active ? "bg-white/15 text-white hover:bg-white/20" : "text-white/85 hover:text-white hover:bg-white/10",
                            )}
                          >
                            <span className="flex items-center gap-2">
                              <item.icon className="h-4 w-4" />
                              <span>{item.label}</span>
                            </span>
                          </Link>
                        ))}

                        <Button
                          variant="ghost"
                          className="w-full justify-start h-9 text-[13px] font-medium text-white/85 hover:text-white hover:bg-red-500/20"
                          onClick={() => {
                            (async () => {
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
              </div>
            ) : null}
          </div>
        </div>
      ) : showProviderShell ? (
        <div className="min-h-screen grid grid-cols-1" style={{ gridTemplateColumns: `minmax(0, 1fr)` }}>
          <div
            className="hidden lg:grid min-h-screen"
            style={{ gridTemplateColumns: isProviderSidebarCollapsed ? "88px minmax(0, 1fr)" : "260px minmax(0, 1fr)" }}
          >
            <aside className="relative isolate flex flex-col border-r text-white overflow-hidden">
              <div className="pointer-events-none absolute inset-0 hero-gradient" />
              <div className="pointer-events-none absolute inset-0 bg-white/10" />
              <div
                className="pointer-events-none absolute inset-0 opacity-12"
                style={{
                  backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)",
                  backgroundSize: "44px 44px",
                }}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/0 via-white/0 to-black/8" />

              <div className="relative z-10 flex flex-col flex-1">
              <div className={`h-14 px-4 flex items-center border-b border-white/15 ${isProviderSidebarCollapsed ? "justify-center" : "justify-start"}`}>
                <Link
                  to="/provider-dashboard"
                  className={`flex items-center gap-2 ${isProviderSidebarCollapsed ? "justify-center" : ""}`}
                >
                  <img src="/images/warrantyhubwhite.png" alt={BRAND.name} className="h-9 w-auto object-contain" />
                  {!isProviderSidebarCollapsed ? (
                    <div className="leading-tight">
                      <div className="font-semibold text-sm">{BRAND.name}</div>
                      <div className="text-[11px] text-white/80">Provider Portal</div>
                    </div>
                  ) : null}
                </Link>
              </div>

              <div className={`px-2 py-3 flex-1 ${isProviderSidebarCollapsed ? "" : ""}`}>
                <div className="space-y-1">
                  {providerNavItems.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setIsProviderMobileNavOpen(false)}
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                        `w-full ${isProviderSidebarCollapsed ? "justify-center px-0" : "justify-start"} h-9 text-[13px] font-medium`,
                        item.active
                          ? "bg-white/15 text-white hover:bg-white/20"
                          : "text-white/85 hover:text-white hover:bg-white/10",
                      )}
                    >
                      <span className="flex items-center gap-2" title={isProviderSidebarCollapsed ? item.label : undefined}>
                        <item.icon className="h-4 w-4" />
                        {!isProviderSidebarCollapsed ? <span>{item.label}</span> : null}
                      </span>
                    </Link>
                  ))}
                </div>

                <div className="pt-3 mt-3 border-t border-white/15" />
                <div className="space-y-1">
                  {providerSecondaryItems.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setIsProviderMobileNavOpen(false)}
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                        `w-full ${isProviderSidebarCollapsed ? "justify-center px-0" : "justify-start"} h-9 text-[13px] font-medium`,
                        item.active
                          ? "bg-white/15 text-white hover:bg-white/20"
                          : "text-white/85 hover:text-white hover:bg-white/10",
                      )}
                    >
                      <span className="flex items-center gap-2" title={isProviderSidebarCollapsed ? item.label : undefined}>
                        <item.icon className="h-4 w-4" />
                        {!isProviderSidebarCollapsed ? <span>{item.label}</span> : null}
                      </span>
                    </Link>
                  ))}

                  <Button
                    variant={isProviderSidebarCollapsed ? "ghost" : "default"}
                    size={isProviderSidebarCollapsed ? "icon" : "sm"}
                    className={cn(
                      isProviderSidebarCollapsed
                        ? "text-white/85 hover:text-white hover:bg-red-500/20"
                        : "bg-red-500/20 text-white hover:bg-red-500/25 hover:text-white",
                    )}
                    title={isProviderSidebarCollapsed ? "Sign Out" : undefined}
                    onClick={() => {
                      (async () => {
                        if (!(await confirmProceed(`Sign out of ${BRAND.name}?`, "Sign Out"))) return;
                        await signOut();
                        window.location.assign("/find-insurance");
                      })();
                    }}
                  >
                    <LogOut className={isProviderSidebarCollapsed ? "h-4 w-4" : "h-4 w-4"} />
                    {isProviderSidebarCollapsed ? null : <span>Sign Out</span>}
                  </Button>
                </div>
              </div>
              </div>
            </aside>

            <main className="min-w-0">
              {isLoading && !user ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/30 backdrop-blur-sm">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" aria-label="Loading" />
                </div>
              ) : null}
              <RouteErrorBoundary key={location.pathname}>
                <Outlet />
              </RouteErrorBoundary>
            </main>
          </div>

          <div className="lg:hidden">
            <div className="h-14 px-4 border-b bg-card/95 backdrop-blur-xl flex items-center justify-between">
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setIsProviderMobileNavOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
              <Link to="/provider-dashboard" className="flex items-center gap-2">
                <img src={BRAND.logoUrl} alt={BRAND.name} className="h-9 w-auto object-contain" />
                <div className="leading-tight">
                  <div className="font-semibold text-sm">Provider Portal</div>
                  <div className="text-[11px] text-muted-foreground">{location.pathname === "/provider-dashboard" ? "Dashboard" : ""}</div>
                </div>
              </Link>
              <div className="w-9" />
            </div>

            <main className="min-w-0">
              {isLoading && !user ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/30 backdrop-blur-sm">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" aria-label="Loading" />
                </div>
              ) : null}
              <RouteErrorBoundary key={location.pathname}>
                <Outlet />
              </RouteErrorBoundary>
            </main>

            {isProviderMobileNavOpen ? (
              <div className="fixed inset-0 z-50">
                <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setIsProviderMobileNavOpen(false)} />
                <div className="absolute left-0 top-0 bottom-0 w-[280px] max-w-[85vw] border-r shadow-xl flex flex-col text-white overflow-hidden">
                  <div className="pointer-events-none absolute inset-0 hero-gradient" />
                  <div className="pointer-events-none absolute inset-0 bg-white/10" />
                  <div
                    className="pointer-events-none absolute inset-0 opacity-12"
                    style={{
                      backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)",
                      backgroundSize: "44px 44px",
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/0 via-white/0 to-black/8" />

                  <div className="relative z-10 flex flex-col flex-1">
                    <div className="h-14 px-4 border-b border-white/15 flex items-center justify-between">
                      <div className="font-semibold text-sm">Menu</div>
                      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setIsProviderMobileNavOpen(false)}>
                        <X className="h-5 w-5" />
                      </Button>
                    </div>

                    <div className="p-3 flex-1">
                      <div className="space-y-1">
                        {providerNavItems.map((item) => (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => setIsProviderMobileNavOpen(false)}
                            className={cn(
                              buttonVariants({ variant: "ghost", size: "sm" }),
                              "w-full justify-start h-9 text-[13px] font-medium",
                              item.active
                                ? "bg-white/15 text-white hover:bg-white/20"
                                : "text-white/85 hover:text-white hover:bg-white/10",
                            )}
                          >
                            <span className="flex items-center gap-2">
                              <item.icon className="h-4 w-4" />
                              <span>{item.label}</span>
                            </span>
                          </Link>
                        ))}
                      </div>

                      <div className="pt-3 mt-3 border-t border-white/15" />
                      <div className="space-y-1">
                        {providerSecondaryItems.map((item) => (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => setIsProviderMobileNavOpen(false)}
                            className={cn(
                              buttonVariants({ variant: "ghost", size: "sm" }),
                              "w-full justify-start h-9 text-[13px] font-medium",
                              item.active
                                ? "bg-white/15 text-white hover:bg-white/20"
                                : "text-white/85 hover:text-white hover:bg-white/10",
                            )}
                          >
                            <span className="flex items-center gap-2">
                              <item.icon className="h-4 w-4" />
                              <span>{item.label}</span>
                            </span>
                          </Link>
                        ))}

                        <Button
                          variant="ghost"
                          className="w-full justify-start h-9 text-[13px] font-medium text-white/85 hover:text-white hover:bg-red-500/20"
                          onClick={() => {
                            (async () => {
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
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {hideTopNavbar || hidePublicNavbarWhileLoading ? null : <Navbar />}
          <main className={hideTopNavbar ? "" : "pt-16"}>
            {isLoading && !user ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/30 backdrop-blur-sm">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" aria-label="Loading" />
              </div>
            ) : null}
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
