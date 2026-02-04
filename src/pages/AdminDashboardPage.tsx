import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Building2, DollarSign, LifeBuoy, Store } from "lucide-react";

import { Button } from "../components/ui/button";
import { getBatchesApi } from "../lib/batches/batches";
import type { Batch, RemittanceWorkflowStatus } from "../lib/batches/types";

type SummaryCard = {
  title: string;
  value: string;
  subtitle?: string;
  icon: "remittances" | "support" | "providers" | "dealers";
  href?: string;
};

function iconForSummary(kind: SummaryCard["icon"]) {
  if (kind === "remittances") return DollarSign;
  if (kind === "support") return LifeBuoy;
  if (kind === "providers") return Store;
  return Store;
}

export function AdminDashboardPage() {
  const batchesApi = useMemo(() => getBatchesApi(), []);

  const batchesQuery = useQuery({
    queryKey: ["batches"],
    queryFn: () => batchesApi.list(),
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

  const summaryCards: SummaryCard[] = [
    {
      title: "Pending Approvals",
      value: `${awaitingReview.length}`,
      subtitle: "Submitted remittances awaiting review",
      icon: "remittances",
      href: "/admin-remittances",
    },
    {
      title: "Support Inbox",
      value: "—",
      subtitle: "Dealer & provider support",
      icon: "support",
      href: "/admin-support",
    },
    {
      title: "Providers",
      value: "—",
      subtitle: "Read-only visibility",
      icon: "providers",
      href: "/admin-providers",
    },
    {
      title: "Dealers",
      value: "—",
      subtitle: "Read-only visibility",
      icon: "dealers",
      href: "/admin-dealers",
    },
  ];

  const isError = batchesQuery.isError;
  const isLoading = batchesQuery.isLoading;

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center px-2.5 py-1 rounded-full border bg-card text-[11px] text-muted-foreground">
              Admin
            </div>
            <h1 className="font-display text-3xl md:text-[34px] font-bold text-foreground mt-3">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-2">Operational overview and review queue.</p>
          </div>

          <div className="flex gap-2">
            <Button asChild>
              <Link to="/admin-remittances">View remittances</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/admin-support">Support Inbox</Link>
            </Button>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {summaryCards.map((c) => {
            const Icon = iconForSummary(c.icon);
            const body = (
              <div className="rounded-xl border bg-card shadow-card p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">{c.title}</div>
                    <div className="text-3xl font-bold text-foreground mt-2">{c.value}</div>
                    {c.subtitle ? <div className="text-xs text-muted-foreground mt-2">{c.subtitle}</div> : null}
                  </div>
                  <div className="p-3 rounded-lg bg-muted text-foreground border border-border">
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
              </div>
            );

            return c.href ? (
              <Link key={c.title} to={c.href} className="block">
                {body}
              </Link>
            ) : (
              <div key={c.title}>{body}</div>
            );
          })}
        </div>

        <div className="mt-8 rounded-xl border bg-card shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted text-foreground border border-border">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold">Quick Links</div>
                <div className="text-sm text-muted-foreground mt-1">Common admin workflows.</div>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Button asChild>
              <Link to="/admin-remittances">Remittances</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/admin-support">Support Inbox</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/admin-providers">Providers</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/admin-dealers">Dealers</Link>
            </Button>
          </div>

          {isLoading ? <div className="px-6 pb-6 text-sm text-muted-foreground">Loading…</div> : null}
          {isError ? <div className="px-6 pb-6 text-sm text-destructive">Failed to load dashboard data.</div> : null}
        </div>
    </div>
  );
}
