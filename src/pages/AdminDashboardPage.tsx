import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Building2, DollarSign, LifeBuoy, Store, FileText, Users, Activity, AlertCircle, ArrowRight } from "lucide-react";

import { Button } from "../components/ui/button";
import { getBatchesApi } from "../lib/batches/batches";
import type { Batch, RemittanceWorkflowStatus } from "../lib/batches/types";
import { getSupabaseClient } from "../lib/supabase/client";
import { getAppMode } from "../lib/runtime";

export function AdminDashboardPage() {
  const mode = useMemo(() => getAppMode(), []);
  const batchesApi = useMemo(() => getBatchesApi(), []);

  const batchesQuery = useQuery({
    queryKey: ["batches"],
    queryFn: () => batchesApi.list(),
  });

  const openSupportQuery = useQuery({
    queryKey: ["admin-open-support-count"],
    enabled: mode === "supabase",
    queryFn: async () => {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase not configured");
      const { count, error } = await supabase
        .from("support_conversations")
        .select("*", { count: "exact", head: true })
        .eq("status", "OPEN");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const providersCountQuery = useQuery({
    queryKey: ["admin-providers-count"],
    enabled: mode === "supabase",
    queryFn: async () => {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase not configured");
      const { count, error } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "PROVIDER");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const dealersCountQuery = useQuery({
    queryKey: ["admin-dealers-count"],
    enabled: mode === "supabase",
    queryFn: async () => {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase not configured");
      const { count, error } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .in("role", ["DEALER_ADMIN", "DEALER_EMPLOYEE"]);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const batches = (batchesQuery.data ?? []) as Batch[];
  const remittances = batches.filter((b) => Array.isArray(b.contractIds) && b.contractIds.length > 0);

  const derivedWorkflow = (b: Batch): RemittanceWorkflowStatus => {
    const s = b.remittanceStatus;
    if (s) return s;
    if (b.paymentStatus === "PAID") return "PAID";
    if (b.status === "CLOSED") return "SUBMITTED";
    return "DRAFT";
  };

  const awaitingReview = remittances.filter((r) => derivedWorkflow(r) === "SUBMITTED");

  const supportCount = openSupportQuery.data ?? 0;
  const providersCount = providersCountQuery.data ?? 0;
  const dealersCount = dealersCountQuery.data ?? 0;
  const countsLoading = mode === "supabase" && (openSupportQuery.isLoading || providersCountQuery.isLoading || dealersCountQuery.isLoading);

  const isError = batchesQuery.isError;
  const isLoading = batchesQuery.isLoading;

  const dashboardCards = [
    {
      title: "Pending Remittances",
      value: awaitingReview.length,
      subtitle: "Submitted remittances awaiting review",
      icon: DollarSign,
      tone: "amber" as const,
      href: "/admin-remittances",
    },
    {
      title: "Support Inbox",
      value: countsLoading ? "—" : `${supportCount}`,
      subtitle: "Open support conversations",
      icon: LifeBuoy,
      tone: "blue" as const,
      href: "/admin-support",
    },
    {
      title: "Provider Companies",
      value: countsLoading ? "—" : `${providersCount}`,
      subtitle: "Active warranty providers",
      icon: Store,
      tone: "emerald" as const,
      href: "/admin-providers",
    },
    {
      title: "Dealer Companies",
      value: countsLoading ? "—" : `${dealersCount}`,
      subtitle: "Active dealership accounts",
      icon: Building2,
      tone: "violet" as const,
      href: "/admin-dealers",
    },
  ];

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-background to-blue-50 dark:from-slate-950/50 dark:via-background dark:to-blue-950/30" />
      </div>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b bg-gradient-to-r from-blue-600/5 via-transparent to-transparent">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 border border-blue-500/20">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 text-[10px] font-semibold uppercase tracking-wider">
                      Admin
                    </span>
                  </div>
                  <h1 className="text-xl font-bold text-foreground mt-1">Admin Dashboard</h1>
                  <p className="text-sm text-muted-foreground">Operational overview and quick actions</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild className="gap-2">
                  <Link to="/admin-access-requests">
                    <AlertCircle className="w-4 h-4" />
                    Access Requests
                  </Link>
                </Button>
                <Button size="sm" asChild className="gap-2">
                  <Link to="/admin-remittances">
                    View Remittances
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="text-sm text-muted-foreground">
              {isLoading ? (
                <span>Loading dashboard data…</span>
              ) : isError ? (
                <span className="text-destructive">Failed to load some data. Please refresh the page.</span>
              ) : (
                <span>Overview of all platform activity</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {dashboardCards.map((card) => (
            <Link
              key={card.title}
              to={card.href}
              className="group rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-200 overflow-hidden block"
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-muted-foreground">{card.title}</div>
                    <div className="text-3xl font-bold text-foreground mt-2 tracking-tight">{card.value}</div>
                    <div className="text-xs text-muted-foreground mt-2">{card.subtitle}</div>
                  </div>
                  <div
                    className={
                      card.tone === "blue"
                        ? "p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : card.tone === "amber"
                          ? "p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : card.tone === "emerald"
                            ? "p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "p-2.5 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400"
                    }
                  >
                    <card.icon className="w-5 h-5" />
                  </div>
                </div>
              </div>
              <div
                className={
                  card.tone === "blue"
                    ? "h-1 bg-gradient-to-r from-blue-500 to-blue-400"
                    : card.tone === "amber"
                      ? "h-1 bg-gradient-to-r from-amber-500 to-amber-400"
                      : card.tone === "emerald"
                        ? "h-1 bg-gradient-to-r from-emerald-500 to-emerald-400"
                        : "h-1 bg-gradient-to-r from-violet-500 to-violet-400"
                }
              />
            </Link>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">Remittances</div>
                  <div className="text-sm text-muted-foreground">Payment batch management</div>
                </div>
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 rounded-xl bg-muted/50">
                  <div className="text-2xl font-bold text-foreground">{awaitingReview.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Awaiting Review</div>
                </div>
                <div className="text-center p-4 rounded-xl bg-muted/50">
                  <div className="text-2xl font-bold text-foreground">{remittances.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Total Batches</div>
                </div>
              </div>
              <Button asChild className="w-full mt-4 gap-2">
                <Link to="/admin-remittances">
                  Manage Remittances
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b bg-gradient-to-r from-blue-500/5 via-transparent to-transparent">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <LifeBuoy className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">Support</div>
                  <div className="text-sm text-muted-foreground">Help desk & inquiries</div>
                </div>
              </div>
            </div>
            <div className="p-5">
              <div className="text-center p-4 rounded-xl bg-muted/50">
                <div className="text-2xl font-bold text-foreground">{countsLoading ? "—" : supportCount}</div>
                <div className="text-xs text-muted-foreground mt-1">Open Conversations</div>
              </div>
              <Button variant="outline" asChild className="w-full mt-4 gap-2">
                <Link to="/admin-support">
                  View Support Inbox
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b bg-gradient-to-r from-violet-500/5 via-transparent to-transparent">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">Quick Stats</div>
                  <div className="text-sm text-muted-foreground">Platform overview</div>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                <span className="text-sm text-muted-foreground">Providers</span>
                <span className="font-semibold">{countsLoading ? "—" : providersCount}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                <span className="text-sm text-muted-foreground">Dealers</span>
                <span className="font-semibold">{countsLoading ? "—" : dealersCount}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                <span className="text-sm text-muted-foreground">Pending Reviews</span>
                <span className="font-semibold text-amber-600">{awaitingReview.length}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-gradient-to-r from-slate-500/5 via-transparent to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-slate-500/10 text-slate-600 dark:text-slate-400">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">Quick Actions</div>
                  <div className="text-sm text-muted-foreground">Common administrative tasks</div>
                </div>
              </div>
            </div>
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Button variant="outline" asChild className="h-auto py-4 justify-start gap-3">
              <Link to="/admin-remittances">
                <DollarSign className="w-5 h-5 text-amber-600" />
                <div className="text-left">
                  <div className="font-medium">Remittances</div>
                  <div className="text-xs text-muted-foreground">Manage payments</div>
                </div>
              </Link>
            </Button>
            <Button variant="outline" asChild className="h-auto py-4 justify-start gap-3">
              <Link to="/admin-support">
                <LifeBuoy className="w-5 h-5 text-blue-600" />
                <div className="text-left">
                  <div className="font-medium">Support</div>
                  <div className="text-xs text-muted-foreground">Help desk</div>
                </div>
              </Link>
            </Button>
            <Button variant="outline" asChild className="h-auto py-4 justify-start gap-3">
              <Link to="/admin-providers">
                <Store className="w-5 h-5 text-emerald-600" />
                <div className="text-left">
                  <div className="font-medium">Providers</div>
                  <div className="text-xs text-muted-foreground">View companies</div>
                </div>
              </Link>
            </Button>
            <Button variant="outline" asChild className="h-auto py-4 justify-start gap-3">
              <Link to="/admin-users">
                <Users className="w-5 h-5 text-violet-600" />
                <div className="text-left">
                  <div className="font-medium">Users</div>
                  <div className="text-xs text-muted-foreground">Manage roles</div>
                </div>
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-6 text-xs text-muted-foreground text-center">
          {isLoading ? "Loading…" : isError ? "Some data failed to load." : ""}
          <span className="ml-2">Mode: {mode}</span>
        </div>
      </div>
    </div>
  );
}
