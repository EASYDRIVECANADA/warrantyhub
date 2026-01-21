import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BarChart3, DollarSign, FileText, Users } from "lucide-react";

import { Button } from "../components/ui/button";
import { getBatchesApi } from "../lib/batches/batches";
import type { Batch } from "../lib/batches/types";
import { getContractsApi } from "../lib/contracts/contracts";
import type { Contract } from "../lib/contracts/types";
import { getEmployeesApi } from "../lib/employees/employees";
import type { Employee } from "../lib/employees/types";

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

type SummaryCard = {
  title: string;
  value: string;
  subtitle?: string;
  icon: "contracts" | "outstanding" | "employees" | "reporting";
  href?: string;
};

function iconForSummary(kind: SummaryCard["icon"]) {
  if (kind === "contracts") return FileText;
  if (kind === "outstanding") return DollarSign;
  if (kind === "employees") return Users;
  return BarChart3;
}

export function DealerAdminPage() {
  const contractsApi = useMemo(() => getContractsApi(), []);
  const batchesApi = useMemo(() => getBatchesApi(), []);
  const employeesApi = useMemo(() => getEmployeesApi(), []);

  const contractsQuery = useQuery({
    queryKey: ["contracts"],
    queryFn: () => contractsApi.list(),
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
  const batches = (batchesQuery.data ?? []) as Batch[];
  const employees = (employeesQuery.data ?? []) as Employee[];

  const contractCounts = {
    draft: contracts.filter((c) => c.status === "DRAFT").length,
    sold: contracts.filter((c) => c.status === "SOLD").length,
    remitted: contracts.filter((c) => c.status === "REMITTED").length,
    paid: contracts.filter((c) => c.status === "PAID").length,
    total: contracts.length,
  };

  const outstandingCents = batches
    .filter((b) => b.status === "CLOSED" && b.paymentStatus === "UNPAID")
    .reduce((sum, b) => sum + (b.totalCents ?? 0), 0);

  const paidCents = batches
    .filter((b) => b.status === "CLOSED" && b.paymentStatus === "PAID")
    .reduce((sum, b) => sum + (b.totalCents ?? 0), 0);

  const attribution = {
    createdBy: new Map<string, number>(),
    soldBy: new Map<string, number>(),
    remittedBy: new Map<string, number>(),
    paidBy: new Map<string, number>(),
  };

  for (const c of contracts) {
    const created = (c.createdByEmail ?? "").trim().toLowerCase();
    if (created) attribution.createdBy.set(created, (attribution.createdBy.get(created) ?? 0) + 1);

    const sold = (c.soldByEmail ?? "").trim().toLowerCase();
    if (sold) attribution.soldBy.set(sold, (attribution.soldBy.get(sold) ?? 0) + 1);

    const remitted = (c.remittedByEmail ?? "").trim().toLowerCase();
    if (remitted) attribution.remittedBy.set(remitted, (attribution.remittedBy.get(remitted) ?? 0) + 1);

    const paid = (c.paidByEmail ?? "").trim().toLowerCase();
    if (paid) attribution.paidBy.set(paid, (attribution.paidBy.get(paid) ?? 0) + 1);
  }

  const actors = Array.from(
    new Set([
      ...Array.from(attribution.createdBy.keys()),
      ...Array.from(attribution.soldBy.keys()),
      ...Array.from(attribution.remittedBy.keys()),
      ...Array.from(attribution.paidBy.keys()),
    ]),
  ).sort();

  const summaryCards: SummaryCard[] = [
    {
      title: "Contracts",
      value: `${contractCounts.total}`,
      subtitle: `${contractCounts.draft} Draft • ${contractCounts.sold} Sold • ${contractCounts.remitted} Remitted • ${contractCounts.paid} Paid`,
      icon: "contracts",
      href: "/dealer-contracts",
    },
    {
      title: "Outstanding",
      value: money(outstandingCents),
      subtitle: `Paid ${money(paidCents)} • Unpaid ${money(outstandingCents)}`,
      icon: "outstanding",
      href: "/dealer-remittances",
    },
    {
      title: "Employees",
      value: `${employees.length}`,
      subtitle: "Manage dealership staff",
      icon: "employees",
      href: "/dealer-employees",
    },
    {
      title: "Reporting",
      value: `${actors.length}`,
      subtitle: "Active user emails with logged actions",
      icon: "reporting",
    },
  ];

  const isError = contractsQuery.isError || batchesQuery.isError || employeesQuery.isError;
  const isLoading = contractsQuery.isLoading || batchesQuery.isLoading || employeesQuery.isLoading;

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center px-2.5 py-1 rounded-full border bg-card text-[11px] text-muted-foreground">
              Dealer Admin
            </div>
            <h1 className="font-display text-3xl md:text-[34px] font-bold text-foreground mt-3">Dealer Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-2">Reporting, remittance oversight, and staff management.</p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/dealer-admin">Dashboard</Link>
            </Button>
            <Button asChild>
              <Link to="/dealer-remittances">Remittances</Link>
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
            <div>
              <div className="font-semibold">Employee / User Activity</div>
              <div className="text-sm text-muted-foreground mt-1">Who created/sold/remitted/paid contracts.</div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/dealer-contracts">View contracts</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/dealer-employees">Manage employees</Link>
              </Button>
            </div>
          </div>

          <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 border-b text-xs text-muted-foreground">
            <div className="col-span-4">Email</div>
            <div className="col-span-2 text-right">Created</div>
            <div className="col-span-2 text-right">Sold</div>
            <div className="col-span-2 text-right">Remitted</div>
            <div className="col-span-2 text-right">Paid</div>
          </div>

          <div className="divide-y">
            {actors.map((email) => (
              <div key={email} className="px-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  <div className="md:col-span-4">
                    <div className="text-sm font-medium text-foreground break-all">{email}</div>
                  </div>
                  <div className="md:col-span-2 text-sm text-right text-muted-foreground">{attribution.createdBy.get(email) ?? 0}</div>
                  <div className="md:col-span-2 text-sm text-right text-muted-foreground">{attribution.soldBy.get(email) ?? 0}</div>
                  <div className="md:col-span-2 text-sm text-right text-muted-foreground">{attribution.remittedBy.get(email) ?? 0}</div>
                  <div className="md:col-span-2 text-sm text-right text-muted-foreground">{attribution.paidBy.get(email) ?? 0}</div>
                </div>
              </div>
            ))}

            {isLoading ? <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div> : null}
            {!isLoading && actors.length === 0 ? (
              <div className="px-6 py-6 text-sm text-muted-foreground">No activity recorded yet.</div>
            ) : null}
            {isError ? <div className="px-6 py-6 text-sm text-destructive">Failed to load reporting data.</div> : null}
          </div>
        </div>
    </div>
  );
}
