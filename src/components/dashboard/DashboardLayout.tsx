import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider";
import {
  LayoutDashboard,
  Building2,
  Shield,
  Users,
  FileText,
  DollarSign,
  Package,
  Settings,
  LogOut,
  Menu,
  ChevronDown,
  ChevronUp,
  BarChart3,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  children?: NavItem[];
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  navItems: NavItem[];
  title: string;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, navItems, title }) => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    navItems.forEach((item) => {
      if (item.children) {
        const isChildActive = item.children.some((c) => location.pathname === c.href);
        if (isChildActive) map[item.label] = true;
      }
    });
    return map;
  });

  const roleLabel = (() => {
    const role = user?.role ?? "";
    switch (role) {
      case "DEALER_ADMIN":
      case "DEALER_EMPLOYEE":
        return "Dealer Portal";
      case "PROVIDER":
        return "Provider Portal";
      case "SUPER_ADMIN":
      case "ADMIN":
        return "Admin Portal";
      default:
        return "Dashboard";
    }
  })();

  const handleSignOut = async () => {
    await signOut();
    navigate("/sign-in");
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-auto",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full overflow-y-auto">
          {/* Logo & Role */}
          <div className="px-6 border-b border-border py-4 shrink-0">
            <div className="flex items-center gap-2">
              <img
                src="/images/Bridge Warranty_Icon Only.png"
                alt="Bridge Warranty"
                className="w-8 h-8 object-contain rounded-lg"
              />
              <span className="font-bold text-lg text-foreground">Bridge Warranty</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2 tracking-wide uppercase">
              {roleLabel}
            </p>
          </div>

          <nav className="p-4 space-y-1 shrink-0">
            {navItems.map((item) => {
              if (item.children) {
                const isExpanded = expandedGroups[item.label] ?? false;
                const isChildActive = item.children.some((c) => location.pathname === c.href);
                return (
                  <div key={item.label}>
                    <button
                      onClick={() =>
                        setExpandedGroups((prev) => ({ ...prev, [item.label]: !prev[item.label] }))
                      }
                      className={cn(
                        "w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        isChildActive
                          ? "text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <item.icon className="w-4 h-4" />
                        {item.label}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {isExpanded && (
                      <div className="ml-4 pl-3 border-l border-border space-y-1 mt-1">
                        {item.children.map((child) => {
                          const isActive = location.pathname === child.href;
                          return (
                            <Link
                              key={child.href}
                              to={child.href}
                              onClick={() => setSidebarOpen(false)}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                isActive
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
                              )}
                            >
                              <child.icon className="w-4 h-4" />
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User */}
          <div className="p-4 border-t border-border shrink-0">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-xs font-bold text-primary">
                  {user?.email?.charAt(0).toUpperCase() || "U"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {user?.email || "User"}
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  {(user?.role ?? "").replace(/_/g, " ").toLowerCase()}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center gap-4 px-6 border-b border-border bg-card">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5 text-muted-foreground" />
          </button>
          <h1 className="text-lg font-bold text-foreground">{title}</h1>
        </header>

        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
};

export default DashboardLayout;

// --- Nav item configs per role ---

export const adminNavItems: NavItem[] = [
  { label: "Overview", href: "/admin/overview", icon: LayoutDashboard },
  { label: "Dealerships", href: "/admin/dealerships", icon: Building2 },
  { label: "Providers", href: "/admin/providers", icon: Shield },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Contracts", href: "/admin/contracts", icon: FileText },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export const dealershipNavItems: NavItem[] = [
  { label: "Dashboard", href: "/dealership/overview", icon: LayoutDashboard },
  { label: "Find Products", href: "/dealership/find-products", icon: Package },
  { label: "Contracts", href: "/dealership/contracts", icon: FileText },
  { label: "Remittances", href: "/dealership/remittances", icon: DollarSign },
  { label: "Reporting", href: "/dealership/reporting", icon: BarChart3 },
  {
    label: "Settings",
    href: "#",
    icon: Settings,
    children: [
      { label: "Configuration", href: "/dealership/settings/configuration", icon: Settings },
      { label: "Team", href: "/dealership/settings/team", icon: Users },
      { label: "Profile", href: "/dealership/settings/profile", icon: Shield },
    ],
  },
];

export const providerNavItems: NavItem[] = [
  { label: "Overview", href: "/provider/overview", icon: LayoutDashboard },
  { label: "Products", href: "/provider/products", icon: Package },
  { label: "Contracts", href: "/provider/contracts", icon: FileText },
  { label: "Remittances", href: "/provider/remittances", icon: DollarSign },
  { label: "Analytics", href: "/provider/analytics", icon: BarChart3 },
  { label: "Settings", href: "/provider/settings", icon: Settings },
];
