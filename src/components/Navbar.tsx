import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "./ui/button";
import { cn, confirmProceed } from "../lib/utils";
import { BRAND } from "../lib/brand";
import { useAuth } from "../providers/AuthProvider";

function NavPill({
  to,
  label,
  exact = false,
}: {
  to: string;
  label: string;
  exact?: boolean;
}) {
  const location = useLocation();
  const active = exact
    ? location.pathname === to
    : location.pathname.startsWith(to);

  return (
    <Link
      to={to}
      className={cn(
        "px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-150 whitespace-nowrap",
        active
          ? "bg-primary text-white shadow-sm"
          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
      )}
    >
      {label}
    </Link>
  );
}

export function Navbar() {
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isUnassigned = user?.role === "UNASSIGNED";
  const location = useLocation();
  const hideProfileLink = location.pathname === "/request-access";

  const dashboardPath =
    user?.role === "UNASSIGNED"
      ? "/request-access"
      : user?.role === "ADMIN"
        ? "/company-dashboard"
        : user?.role === "PROVIDER"
          ? "/provider-dashboard"
          : user?.role === "DEALER_EMPLOYEE"
            ? "/dealer-dashboard"
            : user?.role === "DEALER_ADMIN"
              ? "/dealer-admin"
              : user?.role === "SUPER_ADMIN"
                ? "/platform"
                : null;

  const brandPath =
    user?.role === "SUPER_ADMIN" ? "/platform" : dashboardPath ?? "/find-insurance";

  // Nav items per role — kept short so they don't overflow
  const loggedInLinks: { to: string; label: string; exact?: boolean }[] = user
    ? user.role === "DEALER_ADMIN"
      ? [
          { to: "/dealer-admin", label: "Dashboard", exact: true },
          { to: "/dealer-marketplace", label: "Find Products" },
          { to: "/dealer-contracts", label: "Contracts" },
          { to: "/dealer-remittances", label: "Remittances" },
          { to: "/dealer-reporting", label: "Reporting" },
        ]
      : user.role === "DEALER_EMPLOYEE"
        ? [
            { to: "/dealer-dashboard", label: "Dashboard", exact: true },
            { to: "/dealer-marketplace", label: "Find Products" },
            { to: "/dealer-contracts", label: "Contracts" },
          ]
        : user.role === "PROVIDER"
          ? [
              { to: "/provider-dashboard", label: "Dashboard", exact: true },
              { to: "/provider-products", label: "Products" },
              { to: "/provider-contracts", label: "Contracts" },
              { to: "/provider-remittances", label: "Remittances" },
            ]
          : user.role === "ADMIN"
            ? [
                { to: "/company-dashboard", label: "Dashboard", exact: true },
                { to: "/admin-remittances", label: "Remittances" },
                { to: "/admin-providers", label: "Providers" },
              ]
            : user.role === "SUPER_ADMIN"
              ? [
                  { to: "/platform", label: "Dashboard", exact: true },
                  { to: "/admin-access-requests", label: "Access Requests" },
                  { to: "/admin-companies", label: "Companies" },
                  { to: "/admin-users", label: "Users" },
                ]
              : []
    : [];

  const mobileLinks = !user
    ? [
        { to: "/find-insurance", label: "Home", exact: true },
        { to: "/brochure", label: "Coverage Brochure" },
      ]
    : loggedInLinks;

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 h-[70px] bg-white/90 backdrop-blur-xl border-b border-slate-200/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center gap-6">

          {/* Logo */}
          <Link to={brandPath} className="shrink-0 group">
            <img
              src={BRAND.logoUrl}
              alt={BRAND.name}
              className="h-12 w-auto object-contain transition-opacity group-hover:opacity-75"
            />
          </Link>

          {/* Divider */}
          <div className="hidden md:block h-7 w-px bg-slate-200 shrink-0" />

          {/* Center nav links */}
          <div className="hidden md:flex items-center gap-1 flex-1">
            {!user ? (
              <>
                <NavPill to="/find-insurance" label="Home" exact />
                <NavPill to="/brochure" label="Coverage Brochure" />
              </>
            ) : !isUnassigned ? (
              loggedInLinks.map((link) => (
                <NavPill key={link.to} to={link.to} label={link.label} exact={link.exact} />
              ))
            ) : null}
          </div>

          {/* Right — desktop */}
          <div className="hidden md:flex items-center gap-2 ml-auto shrink-0">
            {user ? (
              <>
                {!hideProfileLink && (
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium"
                  >
                    <Link to="/profile">Profile</Link>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-500 hover:bg-red-50 hover:text-red-600 font-medium"
                  onClick={() => {
                    void (async () => {
                      if (!(await confirmProceed(`Sign out of ${BRAND.name}?`, "Sign Out")))
                        return;
                      await signOut();
                      window.location.assign("/find-insurance");
                    })();
                  }}
                >
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium"
                >
                  <Link to="/sign-in">Sign In</Link>
                </Button>
                <Button
                  size="sm"
                  asChild
                  className="bg-primary hover:bg-primary/90 text-white font-semibold px-5 rounded-full shadow-sm"
                >
                  <Link to="/register-dealership">Register Dealership</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden ml-auto p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed top-[70px] left-0 right-0 z-40 md:hidden bg-white border-b border-slate-200 shadow-xl">
          <div className="px-4 py-3 space-y-0.5">
            {mobileLinks.map((link) => {
              const active =
                link.exact
                  ? location.pathname === link.to
                  : location.pathname.startsWith(link.to);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {!user ? (
            <div className="px-4 pb-4 pt-2 border-t border-slate-100 flex flex-col gap-2">
              <Button variant="outline" size="sm" asChild className="w-full justify-center rounded-full">
                <Link to="/sign-in" onClick={() => setMobileOpen(false)}>Sign In</Link>
              </Button>
              <Button
                size="sm"
                asChild
                className="w-full justify-center bg-primary hover:bg-primary/90 text-white rounded-full"
              >
                <Link to="/register-dealership" onClick={() => setMobileOpen(false)}>
                  Register Dealership
                </Link>
              </Button>
            </div>
          ) : (
            <div className="px-4 pb-4 pt-2 border-t border-slate-100 flex flex-col gap-1">
              {!hideProfileLink && (
                <Link
                  to="/profile"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                >
                  Profile
                </Link>
              )}
              <button
                className="flex items-center px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors text-left"
                onClick={() => {
                  void (async () => {
                    if (!(await confirmProceed(`Sign out of ${BRAND.name}?`, "Sign Out"))) return;
                    await signOut();
                    window.location.assign("/find-insurance");
                  })();
                }}
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
