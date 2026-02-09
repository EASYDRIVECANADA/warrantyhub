import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { listAuditEvents } from "../lib/auditLog";
import { getBatchesApi } from "../lib/batches/batches";
import type { Batch } from "../lib/batches/types";
import { getContractsApi } from "../lib/contracts/contracts";
import type { Contract, ContractStatus } from "../lib/contracts/types";
import { getMarketplaceApi } from "../lib/marketplace/marketplace";
import { getProvidersApi } from "../lib/providers/providers";
import type { ProviderPublic } from "../lib/providers/types";
import type { Product, ProductType } from "../lib/products/types";
import { useAuth } from "../providers/AuthProvider";

function toIsoDateInput(iso: string | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function parseDateInput(v: string) {
  const t = v.trim();
  if (!t) return null;
  const d = new Date(`${t}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function withinDateRange(iso: string, start: Date | null, end: Date | null) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return true;
  if (start && d < start) return false;
  if (end) {
    const inclusiveEnd = new Date(end);
    inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() + 1);
    if (d >= inclusiveEnd) return false;
  }
  return true;
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

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function productTypeLabel(t: ProductType) {
  if (t === "EXTENDED_WARRANTY") return "Extended Warranty";
  if (t === "TIRE_RIM") return "Tire & Rim";
  if (t === "APPEARANCE") return "Appearance";
  if (t === "GAP") return "GAP";
  return "Other";
}

function providerLabel(id: string) {
  const trimmed = id.trim();
  if (!trimmed) return "—";
  return `Provider ${trimmed.slice(0, 8)}`;
}

function providerDisplayName(p: ProviderPublic | undefined, id: string) {
  const company = (p?.companyName ?? "").trim();
  if (company) return company;
  const display = (p?.displayName ?? "").trim();
  if (display) return display;
  return providerLabel(id);
}

function effectiveContractDate(c: Contract) {
  return (c.soldAt ?? c.remittedAt ?? c.paidAt ?? c.updatedAt ?? c.createdAt ?? "").toString();
}

function batchMatchesDealer(b: Batch, dealerContractIds: Set<string>) {
  for (const id of b.contractIds ?? []) {
    if (dealerContractIds.has(id)) return true;
  }
  return false;
}

type StatusFilter = "ALL" | ContractStatus;

export function DealerReportingPage() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/sign-in" replace />;
  if (user.role !== "DEALER_ADMIN") return <Navigate to="/dealer-dashboard" replace />;

  const dealerId = (user.dealerId ?? user.id).trim();

  const contractsApi = useMemo(() => getContractsApi(), []);
  const batchesApi = useMemo(() => getBatchesApi(), []);
  const marketplaceApi = useMemo(() => getMarketplaceApi(), []);
  const providersApi = useMemo(() => getProvidersApi(), []);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [startDate, setStartDate] = useState(() => toIsoDateInput(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()));
  const [endDate, setEndDate] = useState(() => toIsoDateInput(new Date().toISOString()));
  const [soldByEmail, setSoldByEmail] = useState("");
  const [providerId, setProviderId] = useState("");
  const [productType, setProductType] = useState<string>("");

  const contractsQuery = useQuery({
    queryKey: ["contracts"],
    queryFn: () => contractsApi.list(),
  });

  const batchesQuery = useQuery({
    queryKey: ["batches"],
    queryFn: () => batchesApi.list(),
  });

  const productsQuery = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: () => marketplaceApi.listPublishedProducts(),
  });

  const products = (productsQuery.data ?? []) as Product[];
  const productById = new Map(products.map((p) => [p.id, p] as const));

  const providerOptions = Array.from(new Set(products.map((p) => p.providerId).filter(Boolean))).sort();
  const productTypeOptions = Array.from(new Set(products.map((p) => p.productType))).sort();

  const providersQuery = useQuery({
    queryKey: ["providers", providerOptions.join(",")],
    queryFn: () => providersApi.listByIds(providerOptions),
    enabled: providerOptions.length > 0,
  });

  const providerById = new Map(((providersQuery.data ?? []) as ProviderPublic[]).map((p) => [p.id, p] as const));

  const contracts = ((contractsQuery.data ?? []) as Contract[]).filter((c) => (c.dealerId ?? "").trim() === dealerId);
  const dealerContractIds = useMemo(() => new Set(contracts.map((c) => c.id)), [contracts]);
  const batches = ((batchesQuery.data ?? []) as Batch[]).filter((b) => batchMatchesDealer(b, dealerContractIds));

  const q = query.trim().toLowerCase();
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);
  const soldBy = soldByEmail.trim().toLowerCase();
  const providerFilter = providerId.trim();
  const productTypeFilter = productType.trim();

  const filtered = contracts
    .filter((c) => {
      if (status === "ALL") return true;
      return c.status === status;
    })
    .filter((c) => {
      const d = effectiveContractDate(c);
      if (!d) return true;
      return withinDateRange(d, start, end);
    })
    .filter((c) => {
      if (!soldBy) return true;
      return (c.soldByEmail ?? "").trim().toLowerCase().includes(soldBy);
    })
    .filter((c) => {
      if (!providerFilter && !productTypeFilter) return true;
      const p = c.productId ? productById.get(c.productId) : undefined;
      const effectiveProvider = (c.providerId ?? p?.providerId ?? "").trim();
      const effectiveType = (p?.productType ?? "").toString();
      if (providerFilter && effectiveProvider !== providerFilter) return false;
      if (productTypeFilter && effectiveType !== productTypeFilter) return false;
      return true;
    })
    .filter((c) => {
      if (!q) return true;
      const fields = [c.warrantyId, c.contractNumber, c.customerName, c.vin, c.customerEmail, c.customerPhone]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());
      return fields.some((f) => f.includes(q));
    })
    .sort((a, b) => effectiveContractDate(b).localeCompare(effectiveContractDate(a)));

  const totals = useMemo(() => {
    let retail = 0;
    let cost = 0;
    let soldCount = 0;
    let remittedCount = 0;
    let paidCount = 0;

    for (const c of filtered) {
      const r = (c.pricingBasePriceCents ?? 0) + (c.addonTotalRetailCents ?? 0);
      const k = (c.pricingDealerCostCents ?? 0) + (c.addonTotalCostCents ?? 0);
      if (c.status === "SOLD" || c.status === "REMITTED" || c.status === "PAID") {
        retail += r;
        cost += k;
      }
      if (c.status === "SOLD") soldCount += 1;
      if (c.status === "REMITTED") remittedCount += 1;
      if (c.status === "PAID") paidCount += 1;
    }

    return {
      retail,
      cost,
      margin: retail - cost,
      count: filtered.length,
      soldCount,
      remittedCount,
      paidCount,
    };
  }, [filtered]);

  const outstandingCents = useMemo(() => {
    return batches
      .filter((b) => b.status === "CLOSED" && b.paymentStatus === "UNPAID")
      .reduce((sum, b) => sum + (b.totalCents ?? 0), 0);
  }, [batches]);

  const bySeller = useMemo(() => {
    const m = new Map<string, { count: number; retail: number; cost: number }>();
    for (const c of filtered) {
      const key = (c.soldByEmail ?? c.createdByEmail ?? "").trim().toLowerCase();
      if (!key) continue;
      const r = (c.pricingBasePriceCents ?? 0) + (c.addonTotalRetailCents ?? 0);
      const k = (c.pricingDealerCostCents ?? 0) + (c.addonTotalCostCents ?? 0);
      const current = m.get(key) ?? { count: 0, retail: 0, cost: 0 };
      const next = {
        count: current.count + 1,
        retail: current.retail + (c.status === "SOLD" || c.status === "REMITTED" || c.status === "PAID" ? r : 0),
        cost: current.cost + (c.status === "SOLD" || c.status === "REMITTED" || c.status === "PAID" ? k : 0),
      };
      m.set(key, next);
    }
    return Array.from(m.entries())
      .map(([email, v]) => ({ email, ...v, margin: v.retail - v.cost }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  const audit = useMemo(() => listAuditEvents({ dealerId, limit: 500 }), [dealerId]);

  const exportContractsCsv = () => {
    const header = [
      "warranty_id",
      "contract_number",
      "status",
      "customer_name",
      "vin",
      "sold_by_email",
      "sold_at",
      "provider",
      "product",
      "product_type",
      "retail_cents",
      "cost_cents",
      "margin_cents",
      "created_at",
      "updated_at",
    ];

    const lines = [
      header.join(","),
      ...filtered.map((c) => {
        const p = c.productId ? productById.get(c.productId) : undefined;
        const effectiveProvider = (c.providerId ?? p?.providerId ?? "").trim();
        const providerName = effectiveProvider ? providerDisplayName(providerById.get(effectiveProvider), effectiveProvider) : "";
        const retail = (c.pricingBasePriceCents ?? 0) + (c.addonTotalRetailCents ?? 0);
        const cost = (c.pricingDealerCostCents ?? 0) + (c.addonTotalCostCents ?? 0);
        const margin = retail - cost;

        return [
          csvEscape(c.warrantyId ?? ""),
          csvEscape(c.contractNumber ?? ""),
          csvEscape(c.status ?? ""),
          csvEscape(c.customerName ?? ""),
          csvEscape(c.vin ?? ""),
          csvEscape(c.soldByEmail ?? ""),
          csvEscape(c.soldAt ?? ""),
          csvEscape(providerName),
          csvEscape(p?.name ?? ""),
          csvEscape(p?.productType ? productTypeLabel(p.productType) : ""),
          String(retail),
          String(cost),
          String(margin),
          csvEscape(c.createdAt ?? ""),
          csvEscape(c.updatedAt ?? ""),
        ].join(",");
      }),
    ].join("\n");

    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadTextFile(`dealer-reporting-contracts-${ts}.csv`, lines, "text/csv;charset=utf-8");
  };

  const exportAuditCsv = () => {
    const header = ["created_at", "kind", "actor_email", "entity_type", "entity_id", "message"]; 
    const lines = [
      header.join(","),
      ...audit.map((e) =>
        [
          csvEscape(e.createdAt),
          csvEscape(e.kind),
          csvEscape(e.actorEmail ?? ""),
          csvEscape(e.entityType ?? ""),
          csvEscape(e.entityId ?? ""),
          csvEscape(e.message ?? ""),
        ].join(","),
      ),
    ].join("\n");

    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadTextFile(`dealer-reporting-audit-${ts}.csv`, lines, "text/csv;charset=utf-8");
  };

  const isLoading = contractsQuery.isLoading || batchesQuery.isLoading || productsQuery.isLoading || providersQuery.isLoading;
  const isError = contractsQuery.isError || batchesQuery.isError || productsQuery.isError || providersQuery.isError;

  return (
    <PageShell
      badge="Dealer Admin"
      title="Reporting"
      subtitle="Dealership performance, contract totals, and staff activity."
      actions={
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <Link to="/dealer-admin">Back to Dealer Admin</Link>
          </Button>
          <Button variant="outline" onClick={exportAuditCsv}>
            Export Activity CSV
          </Button>
          <Button onClick={exportContractsCsv}>Export Contracts CSV</Button>
        </div>
      }
    >
      <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b">
          <div className="font-semibold">Filters</div>
          <div className="text-sm text-muted-foreground mt-1">Use date range and optional filters to generate totals and exports.</div>
        </div>

        <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-4">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Warranty ID, contract #, customer, VIN"
            />
          </div>

          <div className="lg:col-span-2">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>

          <div className="lg:col-span-2">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>

          <div className="lg:col-span-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            >
              <option value="ALL">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SOLD">Sold</option>
              <option value="REMITTED">Remitted</option>
              <option value="PAID">Paid</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <Input value={soldByEmail} onChange={(e) => setSoldByEmail(e.target.value)} placeholder="Sold by email" />
          </div>

          <div className="lg:col-span-4">
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            >
              <option value="">All providers</option>
              {providerOptions.map((pid) => (
                <option key={pid} value={pid}>
                  {providerDisplayName(providerById.get(pid), pid)}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-4">
            <select
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            >
              <option value="">All product types</option>
              {productTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {productTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-4 rounded-lg border bg-background px-4 py-3">
            <div className="text-xs text-muted-foreground">Outstanding (unpaid remittances)</div>
            <div className="text-lg font-semibold mt-1">{money(outstandingCents)}</div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card shadow-card p-5">
          <div className="text-xs text-muted-foreground">Contracts in view</div>
          <div className="text-2xl font-bold mt-1">{totals.count}</div>
          <div className="text-xs text-muted-foreground mt-2">Sold {totals.soldCount} • Remitted {totals.remittedCount} • Paid {totals.paidCount}</div>
        </div>
        <div className="rounded-xl border bg-card shadow-card p-5">
          <div className="text-xs text-muted-foreground">Retail</div>
          <div className="text-2xl font-bold mt-1">{money(totals.retail)}</div>
        </div>
        <div className="rounded-xl border bg-card shadow-card p-5">
          <div className="text-xs text-muted-foreground">Cost</div>
          <div className="text-2xl font-bold mt-1">{money(totals.cost)}</div>
        </div>
        <div className="rounded-xl border bg-card shadow-card p-5">
          <div className="text-xs text-muted-foreground">Margin</div>
          <div className="text-2xl font-bold mt-1">{money(totals.margin)}</div>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b">
          <div className="font-semibold">By Employee</div>
          <div className="text-sm text-muted-foreground mt-1">Based on sold/created attribution inside the filtered view.</div>
        </div>

        <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 border-b text-xs text-muted-foreground">
          <div className="col-span-6">Email</div>
          <div className="col-span-2 text-right">Count</div>
          <div className="col-span-2 text-right">Retail</div>
          <div className="col-span-2 text-right">Margin</div>
        </div>

        <div className="divide-y">
          {bySeller.map((r) => (
            <div key={r.email} className="px-6 py-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <div className="md:col-span-6 text-sm text-foreground break-all">{r.email}</div>
                <div className="md:col-span-2 text-sm text-right text-foreground">{r.count}</div>
                <div className="md:col-span-2 text-sm text-right text-foreground">{money(r.retail)}</div>
                <div className="md:col-span-2 text-sm text-right text-foreground">{money(r.margin)}</div>
              </div>
            </div>
          ))}
          {bySeller.length === 0 ? <div className="px-6 py-8 text-sm text-muted-foreground">No employee attribution in this view.</div> : null}
        </div>
      </div>

      <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b">
          <div className="font-semibold">Contracts</div>
          <div className="text-sm text-muted-foreground mt-1">Showing the filtered view (dealer-scoped).</div>
        </div>

        <div className="hidden lg:grid grid-cols-12 gap-3 px-6 py-3 border-b text-xs text-muted-foreground">
          <div className="col-span-2">Warranty ID</div>
          <div className="col-span-2">Contract #</div>
          <div className="col-span-2">Customer</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-2">Sold By</div>
          <div className="col-span-1 text-right">Retail</div>
          <div className="col-span-1 text-right">Cost</div>
          <div className="col-span-1 text-right">Margin</div>
        </div>

        <div className="divide-y">
          {filtered.slice(0, 200).map((c) => {
            const retail = (c.pricingBasePriceCents ?? 0) + (c.addonTotalRetailCents ?? 0);
            const cost = (c.pricingDealerCostCents ?? 0) + (c.addonTotalCostCents ?? 0);
            const margin = retail - cost;
            return (
              <div key={c.id} className="px-6 py-4">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                  <div className="lg:col-span-2 text-sm font-medium text-foreground break-all">{c.warrantyId}</div>
                  <div className="lg:col-span-2 text-sm text-foreground">{c.contractNumber}</div>
                  <div className="lg:col-span-2 text-sm text-foreground break-all">{c.customerName}</div>
                  <div className="lg:col-span-1 text-sm text-foreground">{c.status}</div>
                  <div className="lg:col-span-2 text-sm text-foreground break-all">{c.soldByEmail ?? c.createdByEmail ?? ""}</div>
                  <div className="lg:col-span-1 text-sm text-right text-foreground">{money(retail)}</div>
                  <div className="lg:col-span-1 text-sm text-right text-foreground">{money(cost)}</div>
                  <div className="lg:col-span-1 text-sm text-right text-foreground">{money(margin)}</div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{effectiveContractDate(c) ? new Date(effectiveContractDate(c)).toLocaleString() : ""}</div>
              </div>
            );
          })}

          {isLoading ? <div className="px-6 py-8 text-sm text-muted-foreground">Loading…</div> : null}
          {isError ? <div className="px-6 py-8 text-sm text-destructive">Failed to load reporting data.</div> : null}
          {!isLoading && !isError && filtered.length === 0 ? <div className="px-6 py-10 text-sm text-muted-foreground">No contracts match these filters.</div> : null}
          {!isLoading && !isError && filtered.length > 200 ? (
            <div className="px-6 py-6 text-sm text-muted-foreground">Showing first 200 rows. Use CSV export for full data.</div>
          ) : null}
        </div>
      </div>

      <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold">Activity</div>
            <div className="text-sm text-muted-foreground mt-1">Recent dealership audit events.</div>
          </div>
          <Button variant="outline" onClick={exportAuditCsv}>
            Export CSV
          </Button>
        </div>

        <div className="divide-y">
          {audit.slice(0, 50).map((e) => (
            <div key={e.id} className="px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-foreground">{e.kind}</div>
                  <div className="text-xs text-muted-foreground mt-1 break-all">{e.message ?? "—"}</div>
                  <div className="text-[11px] text-muted-foreground mt-1 break-all">{e.actorEmail ?? ""}</div>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</div>
              </div>
            </div>
          ))}
          {audit.length === 0 ? <div className="px-6 py-8 text-sm text-muted-foreground">No activity yet.</div> : null}
        </div>
      </div>
    </PageShell>
  );
}
