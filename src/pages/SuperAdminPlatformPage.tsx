import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, Search, ShieldCheck, UserCircle, Users, Store, BriefcaseBusiness, Clock } from "lucide-react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { BRAND } from "../lib/brand";
import { getAppMode } from "../lib/runtime";
import { getSupabaseClient } from "../lib/supabase/client";
import type { Role } from "../lib/auth/types";

type AccessRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

type AccessRequest = {
  id: string;
  requestType: "DEALER" | "PROVIDER";
  company: string;
  name: string;
  email: string;
  status: AccessRequestStatus;
  createdAt: string;
  reviewedAt?: string;
};

type AdminProfile = {
  id: string;
  email?: string;
  role: Role;
};

const LOCAL_ACCESS_REQUESTS_KEY = "warrantyhub.local.access_requests";
const LOCAL_USERS_KEY = "warrantyhub.local.users";

function readLocalAccessRequests(): AccessRequest[] {
  const raw = localStorage.getItem(LOCAL_ACCESS_REQUESTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as any[];
    return parsed.map((r) => ({
      id: r.id,
      requestType: r.requestType,
      company: r.company,
      name: r.name,
      email: r.email,
      status: (r.status ?? "PENDING") as AccessRequestStatus,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt ?? undefined,
    }));
  } catch {
    return [];
  }
}

function readLocalProfiles(): AdminProfile[] {
  const raw = localStorage.getItem(LOCAL_USERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as any[];
    return parsed.map((u) => ({ id: u.id, email: u.email ?? undefined, role: u.role as Role }));
  } catch {
    return [];
  }
}

export function SuperAdminPlatformPage() {
  const mode = useMemo(() => getAppMode(), []);

  const [globalSearch, setGlobalSearch] = useState("");

  const profilesQuery = useQuery({
    queryKey: ["superadmin", "profiles", mode],
    queryFn: async (): Promise<AdminProfile[]> => {
      if (mode === "supabase") {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Supabase is not configured");

        const { data, error } = await supabase.from("profiles").select("id, email, role");
        if (error) throw error;

        return (data as any[]).map((r) => ({
          id: r.id,
          email: r.email ?? undefined,
          role: ((r.role ?? "UNASSIGNED") === "DEALER" ? "DEALER_ADMIN" : r.role) as Role,
        }));
      }

      return readLocalProfiles();
    },
  });

  const accessRequestsQuery = useQuery({
    queryKey: ["superadmin", "access-requests", mode],
    queryFn: async (): Promise<AccessRequest[]> => {
      if (mode === "supabase") {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Supabase is not configured");

        const { data, error } = await supabase
          .from("access_requests")
          .select("id, request_type, company, name, email, status, created_at, reviewed_at")
          .order("created_at", { ascending: false });

        if (error) throw error;
        return (data as any[]).map((r) => ({
          id: r.id,
          requestType: r.request_type,
          company: r.company,
          name: r.name,
          email: r.email,
          status: (r.status ?? "PENDING") as AccessRequestStatus,
          createdAt: r.created_at,
          reviewedAt: r.reviewed_at ?? undefined,
        }));
      }

      return readLocalAccessRequests().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  });

  const profiles = profilesQuery.data ?? [];
  const accessRequests = accessRequestsQuery.data ?? [];

  const totalUsers = profiles.length;
  const activeDealers = profiles.filter((p) => p.role === "DEALER_ADMIN").length;
  const activeProviders = profiles.filter((p) => p.role === "PROVIDER").length;

  const pendingApprovals = accessRequests.filter((r) => r.status === "PENDING");
  const alertCount = pendingApprovals.length;

  const filteredUsers = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return [];
    return profiles
      .filter((p) => [p.email, p.role, p.id].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      .slice(0, 5);
  }, [profiles, globalSearch]);

  const auditLog = useMemo(() => {
    const events: { at: string; label: string; detail: string }[] = [];
    for (const r of accessRequests) {
      events.push({
        at: r.createdAt,
        label: "Access request submitted",
        detail: `${r.requestType} • ${r.company} • ${r.email}`,
      });
      if (r.reviewedAt) {
        events.push({
          at: r.reviewedAt,
          label: `Access request ${r.status.toLowerCase()}`,
          detail: `${r.requestType} • ${r.company} • ${r.email}`,
        });
      }
    }

    return events
      .filter((e) => Boolean(e.at))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 8);
  }, [accessRequests]);

  const isLoading =
    profilesQuery.isLoading || accessRequestsQuery.isLoading;

  const isError = profilesQuery.isError || accessRequestsQuery.isError;

  const kpis = useMemo(
    () => [
      {
        label: "Total Users",
        value: totalUsers,
        icon: Users,
        tone: "blue" as const,
      },
      {
        label: "Pending Approvals",
        value: pendingApprovals.length,
        icon: ShieldCheck,
        tone: "amber" as const,
      },
      {
        label: "Active Dealers",
        value: activeDealers,
        icon: Store,
        tone: "emerald" as const,
      },
      {
        label: "Active Providers",
        value: activeProviders,
        icon: BriefcaseBusiness,
        tone: "violet" as const,
      },
    ],
    [totalUsers, pendingApprovals.length, activeDealers, activeProviders],
  );

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-background to-violet-50 dark:from-blue-950/30 dark:via-background dark:to-violet-950/25" />
        <div
          className="absolute inset-0 opacity-[0.35] dark:opacity-[0.25]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, rgba(2,6,23,0.12) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="rounded-2xl border bg-card/75 backdrop-blur-sm shadow-sm">
          <div className="p-5 sm:p-6 flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shadow-sm">
                <img src={BRAND.logoUrl} alt={BRAND.name} className="w-6 h-6 invert" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">SUPER ADMIN</div>
                <div className="text-xl font-semibold text-foreground">Platform Dashboard</div>
                <div className="text-sm text-muted-foreground mt-0.5">Overview of users and approvals.</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin-access-requests">
              <span className="inline-flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Alerts
                {alertCount > 0 ? (
                  <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-foreground text-xs border">
                    {alertCount}
                  </span>
                ) : null}
              </span>
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/profile">
              <span className="inline-flex items-center gap-2">
                <UserCircle className="w-4 h-4" />
                Profile
              </span>
            </Link>
          </Button>
            </div>
          </div>

          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <div className="relative max-w-xl">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Search className="w-4 h-4" />
              </div>
              <Input
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search users (email, role, id)…"
                className="pl-9 bg-background/70"
              />
            </div>
        {globalSearch.trim() ? (
          <div className="mt-2 max-w-xl rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="px-3 py-2 text-xs text-muted-foreground border-b">Top matches</div>
            <div className="divide-y">
              {filteredUsers.map((p) => (
                <Link key={p.id} to="/admin-users" className="block px-3 py-2 hover:bg-muted">
                  <div className="text-sm font-medium break-all">{p.email ?? "(email unknown)"}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{p.role}</div>
                </Link>
              ))}
              {filteredUsers.length === 0 ? <div className="px-3 py-3 text-sm text-muted-foreground">No matches.</div> : null}
            </div>
          </div>
        ) : null}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="group rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-muted-foreground">{kpi.label}</div>
                <div className="text-2xl font-semibold text-foreground mt-1 tracking-tight">{kpi.value}</div>
              </div>
              <div
                className={
                  kpi.tone === "blue"
                    ? "p-2 rounded-xl border bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/15"
                    : kpi.tone === "amber"
                      ? "p-2 rounded-xl border bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/15"
                      : kpi.tone === "emerald"
                        ? "p-2 rounded-xl border bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/15"
                        : "p-2 rounded-xl border bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/15"
                }
              >
                <kpi.icon className="w-4 h-4" />
              </div>
            </div>
            <div
              className={
                kpi.tone === "blue"
                  ? "mt-3 h-[3px] rounded-full bg-gradient-to-r from-blue-500/55 via-blue-500/25 to-transparent"
                  : kpi.tone === "amber"
                    ? "mt-3 h-[3px] rounded-full bg-gradient-to-r from-amber-500/55 via-amber-500/25 to-transparent"
                    : kpi.tone === "emerald"
                      ? "mt-3 h-[3px] rounded-full bg-gradient-to-r from-emerald-500/55 via-emerald-500/25 to-transparent"
                      : "mt-3 h-[3px] rounded-full bg-gradient-to-r from-violet-500/55 via-violet-500/25 to-transparent"
              }
            />
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap bg-gradient-to-r from-blue-500/10 via-transparent to-transparent">
            <div>
              <div className="font-semibold">Pending approvals</div>
              <div className="text-sm text-muted-foreground mt-0.5">Newest dealer/provider access requests.</div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin-access-requests">Open</Link>
            </Button>
          </div>

          <div className="divide-y">
            {pendingApprovals.slice(0, 4).map((r) => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {r.company}
                      <span className="text-muted-foreground font-normal"> • {r.requestType}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">{r.email}</div>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            ))}

            {accessRequestsQuery.isLoading ? <div className="px-4 py-4 text-sm text-muted-foreground">Loading…</div> : null}
            {!accessRequestsQuery.isLoading && pendingApprovals.length === 0 ? (
              <div className="px-4 py-4 text-sm text-muted-foreground">No pending approvals.</div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-3 bg-gradient-to-r from-violet-500/10 via-transparent to-transparent">
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/15">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold">Recent activity</div>
              <div className="text-sm text-muted-foreground mt-0.5">Last few approval events.</div>
            </div>
          </div>

          <div className="divide-y">
            {auditLog.slice(0, 4).map((e) => (
              <div key={`${e.label}-${e.at}-${e.detail}`} className="px-4 py-3">
                <div className="text-sm font-medium">{e.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{e.detail}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{new Date(e.at).toLocaleString()}</div>
              </div>
            ))}
            {auditLog.length === 0 ? <div className="px-4 py-4 text-sm text-muted-foreground">No activity yet.</div> : null}
          </div>
        </div>
      </div>

      <div className="mt-3 text-xs text-muted-foreground">
        {isLoading ? "Loading…" : isError ? "Some dashboard data failed to load." : ""}
      </div>
    </div>
  );
}
