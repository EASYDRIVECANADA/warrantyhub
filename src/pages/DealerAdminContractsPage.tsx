import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { getContractsApi } from "../lib/contracts/contracts";
import type { Contract, ContractStatus } from "../lib/contracts/types";
import { getMarketplaceApi } from "../lib/marketplace/marketplace";
import type { Product } from "../lib/products/types";
import { confirmProceed } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";

type TabKey = "ALL" | ContractStatus;

function labelForTab(t: TabKey) {
  if (t === "ALL") return "All";
  if (t === "DRAFT") return "Draft";
  if (t === "SOLD") return "Sold";
  if (t === "REMITTED") return "Remitted";
  return "Paid";
}

function statusPillClass(s: ContractStatus) {
  if (s === "DRAFT") return "bg-blue-50 text-blue-700 border-blue-200";
  if (s === "SOLD") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "REMITTED") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function providerLabel(id: string | undefined) {
  const t = (id ?? "").trim();
  if (!t) return "—";
  return `Provider ${t.slice(0, 8)}`;
}

function csvEscape(v: string) {
  const needs = /[",\n\r]/.test(v);
  const escaped = v.replace(/"/g, '""');
  return needs ? `"${escaped}"` : escaped;
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function DealerAdminContractsPage() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/sign-in" replace />;
  if (user.role !== "DEALER_ADMIN") return <Navigate to="/dealer-dashboard" replace />;

  const contractsApi = useMemo(() => getContractsApi(), []);
  const marketplaceApi = useMemo(() => getMarketplaceApi(), []);

  const [tab, setTab] = useState<TabKey>("ALL");
  const [q, setQ] = useState("");

  const listQuery = useQuery({
    queryKey: ["contracts"],
    queryFn: () => contractsApi.list(),
  });

  const productsQuery = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: () => marketplaceApi.listPublishedProducts(),
  });

  const products = (productsQuery.data ?? []) as Product[];
  const productById = new Map(products.map((p) => [p.id, p] as const));

  const contracts = (listQuery.data ?? []) as Contract[];
  const filteredByTab = tab === "ALL" ? contracts : contracts.filter((c) => c.status === tab);

  const query = q.trim().toLowerCase();
  const filtered = query
    ? filteredByTab.filter((c) => {
        const cn = (c.contractNumber ?? "").toLowerCase();
        const name = (c.customerName ?? "").toLowerCase();
        const wid = (c.warrantyId ?? "").toLowerCase();
        return cn.includes(query) || name.includes(query) || wid.includes(query);
      })
    : filteredByTab;

  const tabs: TabKey[] = ["ALL", "DRAFT", "SOLD", "REMITTED", "PAID"];

  const exportCsv = async () => {
    if (!(await confirmProceed("Export current view to CSV?"))) return;

    const header = [
      "warranty_id",
      "contract_number",
      "customer_name",
      "status",
      "provider_id",
      "product_id",
      "plan_name",
      "updated_at",
      "created_at",
    ];

    const rows = filtered.map((c) => {
      const pid = (c.productId ?? "").trim();
      const p = pid ? productById.get(pid) : undefined;
      const planLabel = p?.name ?? (pid ? "(Plan not published)" : "");
      return [
        c.warrantyId ?? "",
        c.contractNumber ?? "",
        c.customerName ?? "",
        c.status ?? "",
        c.providerId ?? "",
        c.productId ?? "",
        planLabel,
        c.updatedAt ?? "",
        c.createdAt ?? "",
      ].map((v) => csvEscape(String(v)));
    });

    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadTextFile(`dealer-admin-contracts-${tab.toLowerCase()}-${ts}.csv`, csv, "text/csv");
  };

  return (
    <PageShell
      badge="Dealer Admin"
      title="Contracts (Read-only)"
      subtitle="Review contract lifecycle, linked plan, and print copies. No VIN/plan edits here."
      actions={
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <Link to="/dealer-admin">Back to Dealer Admin</Link>
          </Button>
          <Button variant="outline" onClick={() => void exportCsv()}>
            Export CSV
          </Button>
        </div>
      }
    >
      <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold">Filters</div>
            <div className="text-sm text-muted-foreground mt-1">Search by warranty id, contract #, or customer.</div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={
                  "text-sm px-3 py-1.5 rounded-lg border transition-colors " +
                  (tab === t ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted text-muted-foreground")
                }
              >
                {labelForTab(t)}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 border-b">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contracts…" />
        </div>

        <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 border-b text-xs text-muted-foreground">
          <div className="col-span-3">Warranty ID</div>
          <div className="col-span-2">Contract #</div>
          <div className="col-span-2">Customer</div>
          <div className="col-span-2">Plan</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        <div className="divide-y">
          {filtered.map((c) => {
            const pid = (c.productId ?? "").trim();
            const p = pid ? productById.get(pid) : undefined;
            const planLabel = p?.name ?? (pid ? "(Plan not published)" : "—");

            return (
              <div key={c.id} className="px-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  <div className="md:col-span-3">
                    <div className="text-sm font-medium text-foreground">{c.warrantyId}</div>
                    <div className="text-xs text-muted-foreground mt-1">Updated {new Date(c.updatedAt).toLocaleString()}</div>
                  </div>

                  <div className="md:col-span-2 text-sm text-foreground">{c.contractNumber}</div>

                  <div className="md:col-span-2">
                    <div className="text-sm text-foreground">{c.customerName}</div>
                    <div className="text-xs text-muted-foreground mt-1">{providerLabel(c.providerId)}</div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-sm text-foreground">{planLabel}</div>
                    {p?.productType ? <div className="text-xs text-muted-foreground mt-1">{p.productType}</div> : null}
                  </div>

                  <div className="md:col-span-1">
                    <span className={"inline-flex items-center text-xs px-2 py-1 rounded-md border " + statusPillClass(c.status)}>
                      {labelForTab(c.status)}
                    </span>
                  </div>

                  <div className="md:col-span-2 flex md:justify-end gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/dealer-contracts/${c.id}/print/dealer`}>Print</Link>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {listQuery.isLoading || productsQuery.isLoading ? (
            <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div>
          ) : null}

          {!listQuery.isLoading && !productsQuery.isLoading && filtered.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">No contracts in this view yet.</div>
          ) : null}

          {listQuery.isError || productsQuery.isError ? (
            <div className="px-6 py-6 text-sm text-destructive">Failed to load contracts.</div>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
