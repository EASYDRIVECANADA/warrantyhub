import { Link, useLocation } from "react-router-dom";

import { Button } from "./ui/button";
import { cn, confirmProceed } from "../lib/utils";
import { BRAND } from "../lib/brand";
import { useAuth } from "../providers/AuthProvider";

function NavLink({ to, label }: { to: string; label: string }) {
  const location = useLocation();
  const active = location.pathname === to;

  return (
    <Link
      to={to}
      className={cn(
        "relative font-medium text-sm transition-colors duration-200 whitespace-nowrap",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {active ? (
        <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-accent rounded-full" />
      ) : null}
    </Link>
  );
}

export function Navbar() {
  const { user, signOut } = useAuth();
  const isUnassigned = user?.role === "UNASSIGNED";

  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  const dashboardPath =
    user?.role === "UNASSIGNED"
      ? "/request-access"
      : user?.role === "ADMIN"
      ? "/company-dashboard"
      : user?.role === "PROVIDER"
        ? "/provider-dashboard"
        : user?.role === "DEALER"
          ? "/dealer-dashboard"
          : user?.role === "DEALER_ADMIN"
            ? "/dealer-admin"
            : null;

  const brandPath = user?.role === "SUPER_ADMIN" ? "/platform" : dashboardPath ?? "/find-insurance";

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-b border-border shadow-card">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-3 items-center h-16 gap-4">
          <div className="flex items-center">
            <Link to={brandPath} className="flex items-center gap-2 group">
              <img src={BRAND.logoUrl} alt={BRAND.name} className="h-14 w-auto object-contain" />
            </Link>
          </div>

          <div className="hidden md:flex items-center justify-center gap-6">
            {!user ? (
              <Link
                to="/find-insurance"
                className={cn(
                  "relative font-medium text-sm transition-colors duration-200 whitespace-nowrap",
                  isActive("/find-insurance") ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Find Warranty
                {isActive("/find-insurance") ? (
                  <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-accent rounded-full" />
                ) : null}
              </Link>
            ) : null}

            {user && isUnassigned ? null : (
              <>
                {dashboardPath && user?.role !== "DEALER" && user?.role !== "DEALER_ADMIN" ? (
                  <NavLink to={dashboardPath} label="Dashboard" />
                ) : null}

                {user?.role === "DEALER" ? <NavLink to="/dealer-dashboard" label="Dashboard" /> : null}

                {user?.role === "DEALER" ? <NavLink to="/dealer-marketplace" label="Marketplace" /> : null}
                {user?.role === "DEALER" ? <NavLink to="/dealer-contracts" label="Contracts" /> : null}
                {user?.role === "DEALER" ? <NavLink to="/dealer-remittances" label="Remittances" /> : null}

                {user?.role === "DEALER_ADMIN" ? <NavLink to="/dealer-admin" label="Dashboard" /> : null}
                {user?.role === "DEALER_ADMIN" ? <NavLink to="/dealer-contracts-admin" label="Contracts" /> : null}
                {user?.role === "DEALER_ADMIN" ? <NavLink to="/dealer-remittances" label="Remittances" /> : null}
                {user?.role === "DEALER_ADMIN" ? <NavLink to="/dealer-employees" label="Employees" /> : null}
                {user?.role === "DEALER_ADMIN" ? <NavLink to="/dealer-team" label="Team" /> : null}
                {user?.role === "PROVIDER" ? <NavLink to="/provider-contracts" label="Contracts" /> : null}
                {user?.role === "PROVIDER" ? <NavLink to="/provider-products" label="Products" /> : null}
                {user?.role === "PROVIDER" ? <NavLink to="/provider-documents" label="Documents" /> : null}

                {user?.role === "SUPER_ADMIN" ? <NavLink to="/platform" label="Platform" /> : null}
                {user?.role === "SUPER_ADMIN" ? <NavLink to="/admin-users" label="Platform Users" /> : null}
                {user?.role === "SUPER_ADMIN" ? <NavLink to="/admin-access-requests" label="Access Requests" /> : null}
                {user?.role === "SUPER_ADMIN" ? <NavLink to="/admin-support" label="Support Inbox" /> : null}

                {user?.role === "ADMIN" ? <NavLink to="/admin-contracts" label="Contracts" /> : null}
                {user?.role === "ADMIN" ? <NavLink to="/admin-remittances" label="Remittances" /> : null}
                {user?.role === "ADMIN" ? <NavLink to="/admin-batches" label="Batches" /> : null}
                {user?.role === "ADMIN" ? <NavLink to="/admin-employees" label="Employees" /> : null}
                {user?.role === "ADMIN" ? <NavLink to="/admin-users" label="Users" /> : null}
                {user?.role === "ADMIN" ? <NavLink to="/admin-access-requests" label="Access" /> : null}
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <div className="hidden md:flex items-center gap-3">
              {user ? (
                <>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/profile">Profile</Link>
                  </Button>
                  {isUnassigned ? null : (
                    <span className="text-xs text-muted-foreground max-w-[220px] truncate">{user.email}</span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void (async () => {
                        if (!(await confirmProceed(`Sign out of ${BRAND.name}?`))) return;
                        await signOut();
                      })();
                    }}
                  >
                    Sign Out
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/sign-in">Sign In</Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link to="/get-started">Get Started</Link>
                  </Button>
                </>
              )}
            </div>

            <div className="md:hidden">
              {user ? (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/profile">Profile</Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void (async () => {
                        if (!(await confirmProceed(`Sign out of ${BRAND.name}?`))) return;
                        await signOut();
                      })();
                    }}
                  >
                    Sign Out
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/sign-in">Sign In</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
