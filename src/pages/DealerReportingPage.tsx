import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Calendar, ChevronDown, Download, FileText, Filter, TrendingUp, Users } from "lucide-react";

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
  const dollars = cents / 100;
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const [page, setPage] = useState(1);
  const pageSize = 25;
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
    setPage(1);
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
    <PageShell title="">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Reporting</h1>
          <p className="text-sm text-slate-500 mt-0.5">Analyze contracts, revenue, and team performance.</p>
        </div>
      </div>

      {contracts.length === 0 && !isLoading ? (
        <div className="rounded-2xl border bg-white shadow-sm p-8 text-center">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
          <div className="font-semibold text-lg">No contracts yet</div>
          <div className="text-sm text-muted-foreground mt-1">Create a contract to start seeing totals and exports.</div>
          <div className="mt-5 flex gap-2 justify-center flex-wrap">
            <Button asChild>
              <Link to="/dealer-marketplace">Find products</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/dealer-contracts">Go to contracts</Link>
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-slate-50">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600">
                <Calendar className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold">Date Range</span>
            </div>
            <div className="flex items-center gap-2">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 w-auto" />
              <span className="text-sm text-muted-foreground">–</span>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 w-auto" />
            </div>

            <div className="flex items-center gap-2 flex-wrap ml-auto">
              <span className="text-xs text-muted-foreground">Presets</span>
              <select
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
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
            <div className="w-full md:w-[320px]">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by warranty #, customer, VIN..." className="h-9" />
            </div>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
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
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            >
              <option value="">All employees</option>
              {employeeOptions.map((em) => (
                <option key={em} value={em}>
                  {em}
                </option>
              ))}
            </select>

            <Button size="sm" variant="outline" onClick={clearFilters} className="h-9">
              <Filter className="h-4 w-4 mr-1" />
              Clear filters
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAdvancedFilters((v) => !v)} className="h-9">
              {showAdvancedFilters ? "Hide" : "More"}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowProfitability((v) => !v)}
              className="h-9 whitespace-nowrap"
            >
              <TrendingUp className="h-4 w-4 mr-1" />
              {showProfitability ? "Hide" : "Show"} Profit
            </Button>

            <div className="relative ml-auto">
              <details className="relative">
                <summary className="list-none">
                  <Button type="button" size="sm" className="h-9">
                    <Download className="h-4 w-4 mr-1" />
                    Export
                    <ChevronDown className="h-4 w-4 ml-1" />
                  </Button>
                </summary>
                <div className="absolute right-0 mt-2 w-48 rounded-xl border bg-white shadow-md p-1.5 z-20">
                  <button
                    type="button"
                    className="w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
                    onClick={() => exportContractsCsv()}
                  >
                    <FileText className="h-4 w-4" />
                    Export Contracts CSV
                  </button>
                  <button
                    type="button"
                    className="w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
                    onClick={() => exportAuditCsv()}
                  >
                    <BarChart3 className="h-4 w-4" />
                    Export Activity CSV
                  </button>
                </div>
              </details>
            </div>
          </div>

          {showAdvancedFilters ? (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
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
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="">All product types</option>
                {productTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    {productTypeLabel(t)}
                  </option>
                ))}
              </select>

              <div className="h-9 rounded-md border bg-white px-3 text-sm flex items-center justify-between">
                <span className="text-muted-foreground">Outstanding</span>
                <span className="font-medium">{money(outstandingCents)}</span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="p-5 border-b bg-slate-50/50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border bg-white p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <FileText className="h-3.5 w-3.5" />
                Contracts
              </div>
              <div className="text-2xl font-bold mt-1">{totals.count}</div>
              <div className="text-xs text-slate-500 mt-2">
                <span className="text-emerald-600">{totals.soldCount} sold</span> • <span className="text-blue-600">{totals.remittedCount} remitted</span> • <span className="text-purple-600">{totals.paidCount} paid</span>
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <TrendingUp className="h-3.5 w-3.5" />
                Retail
              </div>
              <div className="text-2xl font-bold mt-1">{money(totals.retail)}</div>
            </div>
            {effectiveShowProfitability ? (
              <>
                <div className="rounded-xl border bg-white p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <BarChart3 className="h-3.5 w-3.5" />
                    Provider Cost
                  </div>
                  <div className="text-2xl font-bold mt-1">{money(totals.cost)}</div>
                </div>
                <div className="rounded-xl border bg-white p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Profit
                  </div>
                  <div className="text-2xl font-bold mt-1 text-emerald-600">{money(totals.margin)}</div>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-2 mb-5">
            <button
              type="button"
              onClick={() => setActiveTab("CONTRACTS")}
              className={
                "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium border transition-all duration-200 " +
                (activeTab === "CONTRACTS" ? "bg-slate-900 text-white border-slate-900" : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600")
              }
            >
              <FileText className="h-3.5 w-3.5" />
              Contracts
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("EMPLOYEE")}
              className={
                "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium border transition-all duration-200 " +
                (activeTab === "EMPLOYEE" ? "bg-slate-900 text-white border-slate-900" : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600")
              }
            >
              <Users className="h-3.5 w-3.5" />
              By Employee
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("PROFITABILITY")}
              className={
                "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium border transition-all duration-200 " +
                (activeTab === "PROFITABILITY" ? "bg-slate-900 text-white border-slate-900" : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600")
              }
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Profitability
            </button>
          </div>

          {activeTab === "EMPLOYEE" ? (
            <div className="overflow-auto rounded-xl border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <Users className="h-3.5 w-3.5" />
                      Employee
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Count</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Retail</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">{effectiveShowProfitability ? "Profit" : ""}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {bySeller.map((r) => (
                    <tr key={r.email} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">
                            {r.email.charAt(0).toUpperCase()}
                          </div>
                          <span className="break-all text-sm">{r.email}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">{r.count}</td>
                      <td className="px-4 py-3 text-right">{money(r.retail)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 font-medium">{effectiveShowProfitability ? money(r.margin) : ""}</td>
                    </tr>
                  ))}
                  {bySeller.length === 0 ? (
                    <tr>
                      <td className="px-4 py-10 text-sm text-muted-foreground text-center" colSpan={4}>
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No employee attribution in this view.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}

          {activeTab !== "EMPLOYEE" ? (
            <div className="overflow-auto rounded-xl border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Contract #</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Sold by</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Retail</th>
                    {effectiveShowProfitability ? <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Profit</th> : null}
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered
                    .slice((page - 1) * pageSize, page * pageSize)
                    .map((c) => {
                    const retail = (c.pricingBasePriceCents ?? 0) + (c.addonTotalRetailCents ?? 0);
                    const cost = (c.pricingDealerCostCents ?? 0) + (c.addonTotalCostCents ?? 0);
                    const margin = retail - cost;
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-medium">{c.contractNumber || c.warrantyId || "—"}</td>
                        <td className="px-4 py-3">{c.customerName || "—"}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground break-all text-xs">{c.soldByEmail ?? c.createdByEmail ?? ""}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {effectiveContractDate(c) ? new Date(effectiveContractDate(c)).toLocaleDateString() : ""}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">{money(retail)}</td>
                        {effectiveShowProfitability ? <td className="px-4 py-3 text-right text-emerald-600">{money(margin)}</td> : null}
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
                      <td className="px-4 py-10 text-sm text-muted-foreground text-center" colSpan={effectiveShowProfitability ? 8 : 7}>
                        Loading…
                      </td>
                    </tr>
                  ) : null}
                  {isError ? (
                    <tr>
                      <td className="px-4 py-10 text-sm text-destructive text-center" colSpan={effectiveShowProfitability ? 8 : 7}>
                        Failed to load reporting data.
                      </td>
                    </tr>
                  ) : null}
                  {!isLoading && !isError && filtered.length === 0 ? (
                    <tr>
                      <td className="px-4 py-10 text-sm text-muted-foreground text-center" colSpan={effectiveShowProfitability ? 8 : 7}>
                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No results for these filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>

              {filtered.length > pageSize ? (
                <div className="flex items-center justify-between px-6 py-4 border-t bg-slate-50">
                  <div className="text-sm text-muted-foreground">
                    Page {page} of {Math.ceil(filtered.length / pageSize)} ({filtered.length} total)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page === 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= Math.ceil(filtered.length / pageSize)}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
