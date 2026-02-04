import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, Search, ShieldCheck, UserCircle } from "lucide-react";

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

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

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
  const [activityMode, setActivityMode] = useState<"DAILY" | "MONTHLY">("DAILY");

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

  const activityDaily = useMemo(() => {
    const days: { day: string; count: number }[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      days.push({ day: isoDay(d), count: 0 });
    }

    const idxByDay = new Map(days.map((d, idx) => [d.day, idx]));
    for (const r of accessRequests) {
      const day = (r.createdAt ?? "").slice(0, 10);
      const idx = idxByDay.get(day);
      if (typeof idx === "number") days[idx].count += 1;
    }

    return days;
  }, [accessRequests]);

  const activityMonthly = useMemo(() => {
    const out: { month: string; count: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, count: 0 });
    }

    const idxByMonth = new Map(out.map((m, idx) => [m.month, idx]));
    for (const r of accessRequests) {
      const month = (r.createdAt ?? "").slice(0, 7);
      const idx = idxByMonth.get(month);
      if (typeof idx === "number") out[idx].count += 1;
    }

    return out;
  }, [accessRequests]);

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

  const activity = activityMode === "DAILY" ? activityDaily : activityMonthly;
  const activityMax = Math.max(1, ...activity.map((x: any) => x.count));

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <img src={BRAND.logoUrl} alt={BRAND.name} className="w-8 h-8" />
          <div>
            <div className="text-xs text-muted-foreground">SUPER ADMIN</div>
            <div className="text-xl font-semibold text-foreground">Platform Dashboard</div>
          </div>
        </div>

        <div className="flex-1 min-w-[260px] max-w-xl">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Search className="w-4 h-4" />
            </div>
            <Input
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Global search (users, email, role)…"
              className="pl-9"
            />
          </div>
          {globalSearch.trim() ? (
            <div className="mt-2 rounded-lg border bg-card shadow-card overflow-hidden">
              <div className="px-3 py-2 text-xs text-muted-foreground border-b">Top matches</div>
              <div className="divide-y">
                {filteredUsers.map((p) => (
                  <Link key={p.id} to="/admin-users" className="block px-3 py-2 hover:bg-muted">
                    <div className="text-sm font-medium break-all">{p.email ?? "(email unknown)"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{p.role}</div>
                  </Link>
                ))}
                {filteredUsers.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-muted-foreground">No matches.</div>
                ) : null}
              </div>
            </div>
          ) : null}
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

      <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="rounded-xl border bg-card shadow-card p-6">
          <div className="text-sm text-muted-foreground">Total Users</div>
          <div className="text-3xl font-bold text-foreground mt-2">{totalUsers}</div>
        </div>
        <div className="rounded-xl border bg-card shadow-card p-6">
          <div className="text-sm text-muted-foreground">Pending Approvals</div>
          <div className="text-3xl font-bold text-foreground mt-2">{pendingApprovals.length}</div>
        </div>
        <div className="rounded-xl border bg-card shadow-card p-6">
          <div className="text-sm text-muted-foreground">Active Dealers</div>
          <div className="text-3xl font-bold text-foreground mt-2">{activeDealers}</div>
        </div>
        <div className="rounded-xl border bg-card shadow-card p-6">
          <div className="text-sm text-muted-foreground">Active Providers</div>
          <div className="text-3xl font-bold text-foreground mt-2">{activeProviders}</div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border bg-card shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold">Platform Activity</div>
              <div className="text-sm text-muted-foreground mt-1">Access requests submitted over time.</div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={activityMode === "DAILY" ? "default" : "outline"}
                onClick={() => setActivityMode("DAILY")}
              >
                Daily
              </Button>
              <Button
                size="sm"
                variant={activityMode === "MONTHLY" ? "default" : "outline"}
                onClick={() => setActivityMode("MONTHLY")}
              >
                Monthly
              </Button>
            </div>
          </div>
          <div className="px-6 py-6">
            <div className="grid grid-cols-14 gap-2 items-end">
              {(activityMode === "DAILY" ? activityDaily : activityMonthly).map((p: any) => {
                const key = activityMode === "DAILY" ? p.day : p.month;
                const h = Math.round((p.count / activityMax) * 80);
                return (
                  <div key={key} className="flex flex-col items-center gap-2">
                    <div className="w-full max-w-[16px] rounded-md bg-muted border" style={{ height: `${h}px` }} />
                    <div className="text-[10px] text-muted-foreground">
                      {activityMode === "DAILY" ? key.slice(5) : key.slice(5)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 text-xs text-muted-foreground">
              {isLoading ? "Loading…" : isError ? "Some dashboard data failed to load." : ""}
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted text-foreground border border-border">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold">System Alerts & Flags</div>
              <div className="text-sm text-muted-foreground mt-1">Operational signals.</div>
            </div>
          </div>
          <div className="px-6 py-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm">Pending approvals</div>
              <div className="text-sm font-medium">{pendingApprovals.length}</div>
            </div>
            <div className="pt-2">
              <Button variant="outline" className="w-full" asChild>
                <Link to="/admin-access-requests">Review approvals</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border bg-card shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b">
            <div className="font-semibold">Audit Log</div>
            <div className="text-sm text-muted-foreground mt-1">Read-only activity feed.</div>
          </div>
          <div className="divide-y">
            {auditLog.map((e) => (
              <div key={`${e.label}-${e.at}-${e.detail}`} className="px-6 py-4">
                <div className="text-sm font-medium">{e.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{e.detail}</div>
                <div className="text-xs text-muted-foreground mt-1">{new Date(e.at).toLocaleString()}</div>
              </div>
            ))}
            {auditLog.length === 0 ? <div className="px-6 py-6 text-sm text-muted-foreground">No activity yet.</div> : null}
          </div>
        </div>

        <div className="rounded-xl border bg-card shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold">Pending Approvals</div>
              <div className="text-sm text-muted-foreground mt-1">New dealer/provider access requests.</div>
            </div>
            <Button variant="outline" asChild>
              <Link to="/admin-access-requests">Open</Link>
            </Button>
          </div>

          <div className="divide-y">
            {pendingApprovals.slice(0, 6).map((r) => (
              <div key={r.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">
                      {r.requestType} • {r.company}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {r.name} • {r.email}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            ))}

            {accessRequestsQuery.isLoading ? <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div> : null}
            {!accessRequestsQuery.isLoading && pendingApprovals.length === 0 ? (
              <div className="px-6 py-6 text-sm text-muted-foreground">No pending approvals.</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
