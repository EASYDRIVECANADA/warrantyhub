import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Building2, DollarSign, FileText, Package, Users } from "lucide-react";

import { Button } from "../components/ui/button";
import { getBatchesApi } from "../lib/batches/batches";
import { getContractsApi } from "../lib/contracts/contracts";
import { getEmployeesApi } from "../lib/employees/employees";
import { getRemittancesApi } from "../lib/remittances/remittances";
import type { Batch } from "../lib/batches/types";
import type { Contract } from "../lib/contracts/types";
import type { Employee } from "../lib/employees/types";
import type { Remittance } from "../lib/remittances/types";

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

type SummaryCard = {
  title: string;
  value: string;
  subtitle?: string;
  icon: "contracts" | "remittances" | "batches" | "employees";
  href?: string;
};

function iconForSummary(kind: SummaryCard["icon"]) {
  if (kind === "contracts") return FileText;
  if (kind === "remittances") return DollarSign;
  if (kind === "batches") return Package;
  return Users;
}

export function AdminDashboardPage() {
  const contractsApi = useMemo(() => getContractsApi(), []);
  const remittancesApi = useMemo(() => getRemittancesApi(), []);
  const batchesApi = useMemo(() => getBatchesApi(), []);
  const employeesApi = useMemo(() => getEmployeesApi(), []);

  const contractsQuery = useQuery({
    queryKey: ["contracts"],
    queryFn: () => contractsApi.list(),
  });

  const remittancesQuery = useQuery({
    queryKey: ["remittances"],
    queryFn: () => remittancesApi.list(),
  });

  const batchesQuery = useQuery({
    queryKey: ["batches"],
    queryFn: () => batchesApi.list(),
  });

  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: () => employeesApi.list(),
  });

  const contracts = (contractsQuery.data ?? []) as Contract[];
  const remittances = (remittancesQuery.data ?? []) as Remittance[];
  const batches = (batchesQuery.data ?? []) as Batch[];
  const employees = (employeesQuery.data ?? []) as Employee[];

  const contractCounts = {
    total: contracts.length,
    draft: contracts.filter((c) => c.status === "DRAFT").length,
    sold: contracts.filter((c) => c.status === "SOLD").length,
    remitted: contracts.filter((c) => c.status === "REMITTED").length,
    paid: contracts.filter((c) => c.status === "PAID").length,
  };

  const remittanceCounts = {
    due: remittances.filter((r) => r.status === "DUE").length,
    paid: remittances.filter((r) => r.status === "PAID").length,
  };

  const outstandingCents = remittances
    .filter((r) => r.status === "DUE")
    .reduce((sum, r) => sum + (r.amountCents ?? 0), 0);

  const batchCounts = {
    open: batches.filter((b) => b.status === "OPEN").length,
    closed: batches.filter((b) => b.status === "CLOSED").length,
  };

  const summaryCards: SummaryCard[] = [
    {
      title: "Contracts",
      value: `${contractCounts.total}`,
      subtitle: `${contractCounts.draft} Draft • ${contractCounts.sold} Sold • ${contractCounts.remitted} Remitted • ${contractCounts.paid} Paid`,
      icon: "contracts",
      href: "/admin-contracts",
    },
    {
      title: "Outstanding",
      value: formatMoney(outstandingCents),
      subtitle: `${remittanceCounts.due} due • ${remittanceCounts.paid} paid`,
      icon: "remittances",
      href: "/admin-remittances",
    },
    {
      title: "Batches",
      value: `${batches.length}`,
      subtitle: `${batchCounts.open} open • ${batchCounts.closed} closed`,
      icon: "batches",
      href: "/admin-batches",
    },
    {
      title: "Employees",
      value: `${employees.length}`,
      subtitle: "Internal directory",
      icon: "employees",
      href: "/admin-employees",
    },
  ];

  const isError = contractsQuery.isError || remittancesQuery.isError || batchesQuery.isError || employeesQuery.isError;
  const isLoading = contractsQuery.isLoading || remittancesQuery.isLoading || batchesQuery.isLoading || employeesQuery.isLoading;

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center px-2.5 py-1 rounded-full border bg-card text-[11px] text-muted-foreground">
              Company Admin
            </div>
            <h1 className="font-display text-3xl md:text-[34px] font-bold text-foreground mt-3">Company Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-2">Track contracts, remittances, batches, and team directory.</p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin-contracts">View contracts</Link>
            </Button>
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
              <Link to="/admin-contracts">Contracts</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/admin-remittances">Remittances</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/admin-batches">Batches</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/admin-employees">Employees</Link>
            </Button>
          </div>

          {isLoading ? <div className="px-6 pb-6 text-sm text-muted-foreground">Loading…</div> : null}
          {isError ? <div className="px-6 pb-6 text-sm text-destructive">Failed to load dashboard data.</div> : null}
        </div>
    </div>
  );
}
