import { useEffect, useMemo, useState } from "react";
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
import type { MarketplaceProduct } from "../lib/marketplace/api";
import type { ProductType } from "../lib/products/types";
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

function lastNDaysRange(n: number) {
  const now = new Date();
  const start = new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
  return { start, end: now };
}

function monthToDateRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start, end: now };
}

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
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<"CONTRACTS" | "EMPLOYEE" | "PROFITABILITY">("CONTRACTS");
  const profitabilityKey = useMemo(() => `warrantyhub.dealer_reporting.show_profitability.${user.id}`, [user.id]);
  const [showProfitability, setShowProfitability] = useState(() => {
    const raw = localStorage.getItem(profitabilityKey);
    return raw === "1";
  });

  useEffect(() => {
    localStorage.setItem(profitabilityKey, showProfitability ? "1" : "0");
  }, [profitabilityKey, showProfitability]);

  const applyLast30Days = () => {
    const { start, end } = lastNDaysRange(30);
    setStartDate(toIsoDateInput(start.toISOString()));
    setEndDate(toIsoDateInput(end.toISOString()));
  };

  const clearFilters = () => {
    setQuery("");
    setStatus("ALL");
    setSoldByEmail("");
    setProviderId("");
    setProductType("");
    setShowAdvancedFilters(false);
    applyLast30Days();
  };

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

  const products = (productsQuery.data ?? []) as MarketplaceProduct[];
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

  const employeeOptions = useMemo(() => {
    return Array.from(new Set(bySeller.map((x) => x.email))).sort();
  }, [bySeller]);

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
      ...(showProfitability ? (["provider_amount_cents", "profit_cents"] as const) : ([] as const)),
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
          ...(showProfitability ? ([String(cost), String(margin)] as const) : ([] as const)),
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

  const effectiveShowProfitability = showProfitability || activeTab === "PROFITABILITY";

  return (
    <PageShell
      title="Reporting"
      subtitle="Track dealership performance by date range."
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
            onClick={() => setShowProfitability((v) => !v)}
            aria-pressed={effectiveShowProfitability}
            title="Show provider amount and profit columns"
          >
            <span className="text-sm text-muted-foreground">Show profitability</span>
            <span
              className={
                "relative inline-flex h-5 w-10 items-center rounded-full transition-colors " +
                (effectiveShowProfitability ? "bg-primary" : "bg-muted")
              }
              aria-hidden
            >
              <span
                className={
                  "inline-block h-4 w-4 transform rounded-full bg-background shadow transition-transform " +
                  (effectiveShowProfitability ? "translate-x-5" : "translate-x-1")
                }
              />
            </span>
          </button>

          <details className="relative">
            <summary className="list-none">
              <Button type="button" size="sm" className="whitespace-nowrap">
                Export (CSV)
              </Button>
            </summary>
            <div className="absolute right-0 mt-2 w-56 rounded-xl border bg-card shadow-card p-2 z-20">
              <button
                type="button"
                className="w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-muted/40"
                onClick={() => exportContractsCsv()}
              >
                Export Contracts CSV
              </button>
              <button
                type="button"
                className="w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-muted/40"
                onClick={() => exportAuditCsv()}
              >
                Export Activity CSV
              </button>
            </div>
          </details>
        </div>
      }
    >
      {contracts.length === 0 && !isLoading ? (
        <div className="rounded-2xl border bg-card shadow-card p-6">
          <div className="font-semibold">No contracts yet</div>
          <div className="text-sm text-muted-foreground mt-1">Create a contract to start seeing totals and exports.</div>
          <div className="mt-4 flex gap-2 flex-wrap">
            <Button asChild>
              <Link to="/dealer-marketplace">Find products</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/dealer-contracts">Go to contracts</Link>
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="p-4 border-b">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <span className="text-sm text-muted-foreground">–</span>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-xs text-muted-foreground">Presets</div>
              <select
                className="h-10 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  if (v === "LAST_7") {
                    const { start, end } = lastNDaysRange(7);
                    setStatus("ALL");
                    setStartDate(toIsoDateInput(start.toISOString()));
                    setEndDate(toIsoDateInput(end.toISOString()));
                  }
                  if (v === "LAST_30") {
                    setStatus("ALL");
                    applyLast30Days();
                  }
                  if (v === "MTD") {
                    const { start, end } = monthToDateRange();
                    setStatus("ALL");
                    setStartDate(toIsoDateInput(start.toISOString()));
                    setEndDate(toIsoDateInput(end.toISOString()));
                  }
                  if (v === "PAID_30") {
                    const { start, end } = lastNDaysRange(30);
                    setStatus("PAID");
                    setStartDate(toIsoDateInput(start.toISOString()));
                    setEndDate(toIsoDateInput(end.toISOString()));
                  }
                  if (v === "SOLD_7") {
                    const { start, end } = lastNDaysRange(7);
                    setStatus("SOLD");
                    setStartDate(toIsoDateInput(start.toISOString()));
                    setEndDate(toIsoDateInput(end.toISOString()));
                  }
                  e.target.value = "";
                }}
              >
                <option value="">Last 30 days</option>
                <option value="LAST_7">Last 7 days</option>
                <option value="LAST_30">Last 30 days</option>
                <option value="MTD">Month to date</option>
                <option value="PAID_30">Paid last 30 days</option>
                <option value="SOLD_7">Sold last 7 days</option>
              </select>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <div className="w-full md:w-[360px]">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by warranty #, customer, VIN, status" />
            </div>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="h-10 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            >
              <option value="ALL">All status</option>
              <option value="DRAFT">Draft</option>
              <option value="SOLD">Sold</option>
              <option value="REMITTED">Remitted</option>
              <option value="PAID">Paid</option>
            </select>

            <select
              value={soldByEmail}
              onChange={(e) => setSoldByEmail(e.target.value)}
              className="h-10 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            >
              <option value="">All employees</option>
              {employeeOptions.map((em) => (
                <option key={em} value={em}>
                  {em}
                </option>
              ))}
            </select>

            <Button size="sm" variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAdvancedFilters((v) => !v)}>
              {showAdvancedFilters ? "Hide" : "More"}
            </Button>
          </div>

          {showAdvancedFilters ? (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="h-10 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="">All providers</option>
                {providerOptions.map((pid) => (
                  <option key={pid} value={pid}>
                    {providerDisplayName(providerById.get(pid), pid)}
                  </option>
                ))}
              </select>

              <select
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                className="h-10 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="">All product types</option>
                {productTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    {productTypeLabel(t)}
                  </option>
                ))}
              </select>

              <div className="h-10 rounded-md border bg-background px-3 text-sm flex items-center justify-between">
                <span className="text-muted-foreground">Outstanding</span>
                <span className="font-medium">{money(outstandingCents)}</span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="p-4 border-b">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border bg-background p-4">
              <div className="text-xs text-muted-foreground">Contracts</div>
              <div className="text-xl font-semibold mt-1">{totals.count}</div>
              <div className="text-xs text-muted-foreground mt-2">Sold {totals.soldCount} • Remitted {totals.remittedCount} • Paid {totals.paidCount}</div>
            </div>
            <div className="rounded-xl border bg-background p-4">
              <div className="text-xs text-muted-foreground">Retail</div>
              <div className="text-xl font-semibold mt-1">{money(totals.retail)}</div>
            </div>
            {effectiveShowProfitability ? (
              <>
                <div className="rounded-xl border bg-background p-4">
                  <div className="text-xs text-muted-foreground">Provider</div>
                  <div className="text-xl font-semibold mt-1">{money(totals.cost)}</div>
                </div>
                <div className="rounded-xl border bg-background p-4">
                  <div className="text-xs text-muted-foreground">Profit</div>
                  <div className="text-xl font-semibold mt-1">{money(totals.margin)}</div>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-center gap-2 rounded-lg border bg-background p-1 w-fit">
            <button
              type="button"
              onClick={() => setActiveTab("CONTRACTS")}
              className={
                "px-3 py-2 text-sm rounded-md transition-colors " +
                (activeTab === "CONTRACTS" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/40")
              }
            >
              Contracts
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("EMPLOYEE")}
              className={
                "px-3 py-2 text-sm rounded-md transition-colors " +
                (activeTab === "EMPLOYEE" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/40")
              }
            >
              By employee
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("PROFITABILITY")}
              className={
                "px-3 py-2 text-sm rounded-md transition-colors " +
                (activeTab === "PROFITABILITY" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/40")
              }
            >
              Profitability
            </button>
          </div>

          {activeTab === "EMPLOYEE" ? (
            <div className="mt-4 overflow-auto rounded-xl border bg-background">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-3 text-left font-medium">Employee</th>
                    <th className="px-4 py-3 text-right font-medium">Count</th>
                    <th className="px-4 py-3 text-right font-medium">Retail</th>
                    <th className="px-4 py-3 text-right font-medium">{effectiveShowProfitability ? "Profit" : ""}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {bySeller.map((r) => (
                    <tr key={r.email} className="hover:bg-muted/20">
                      <td className="px-4 py-3 break-all">{r.email}</td>
                      <td className="px-4 py-3 text-right">{r.count}</td>
                      <td className="px-4 py-3 text-right">{money(r.retail)}</td>
                      <td className="px-4 py-3 text-right">{effectiveShowProfitability ? money(r.margin) : ""}</td>
                    </tr>
                  ))}
                  {bySeller.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-sm text-muted-foreground" colSpan={4}>
                        No employee attribution in this view.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}

          {activeTab !== "EMPLOYEE" ? (
            <div className="mt-4 overflow-auto rounded-xl border bg-background">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-3 text-left font-medium">Contract #</th>
                    <th className="px-4 py-3 text-left font-medium">Customer</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Sold by</th>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                    <th className="px-4 py-3 text-right font-medium">Retail</th>
                    {effectiveShowProfitability ? <th className="px-4 py-3 text-right font-medium">Profit</th> : null}
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.slice(0, 200).map((c) => {
                    const retail = (c.pricingBasePriceCents ?? 0) + (c.addonTotalRetailCents ?? 0);
                    const cost = (c.pricingDealerCostCents ?? 0) + (c.addonTotalCostCents ?? 0);
                    const margin = retail - cost;
                    return (
                      <tr key={c.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">{c.contractNumber || c.warrantyId || "—"}</td>
                        <td className="px-4 py-3">{c.customerName || "—"}</td>
                        <td className="px-4 py-3">{c.status}</td>
                        <td className="px-4 py-3 text-muted-foreground break-all">{c.soldByEmail ?? c.createdByEmail ?? ""}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {effectiveContractDate(c) ? new Date(effectiveContractDate(c)).toLocaleDateString() : ""}
                        </td>
                        <td className="px-4 py-3 text-right">{money(retail)}</td>
                        {effectiveShowProfitability ? <td className="px-4 py-3 text-right">{money(margin)}</td> : null}
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="outline" asChild>
                            <Link to={`/dealer-contracts/${c.id}`}>Open</Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}

                  {isLoading ? (
                    <tr>
                      <td className="px-4 py-8 text-sm text-muted-foreground" colSpan={effectiveShowProfitability ? 8 : 7}>
                        Loading…
                      </td>
                    </tr>
                  ) : null}
                  {isError ? (
                    <tr>
                      <td className="px-4 py-8 text-sm text-destructive" colSpan={effectiveShowProfitability ? 8 : 7}>
                        Failed to load reporting data.
                      </td>
                    </tr>
                  ) : null}
                  {!isLoading && !isError && filtered.length === 0 ? (
                    <tr>
                      <td className="px-4 py-10 text-sm text-muted-foreground" colSpan={effectiveShowProfitability ? 8 : 7}>
                        No results for these filters.
                      </td>
                    </tr>
                  ) : null}
                  {!isLoading && !isError && filtered.length > 200 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={effectiveShowProfitability ? 8 : 7}>
                        Showing first 200 rows. Use CSV export for full data.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
