import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, ChevronRight, Package, FileText, Users, ArrowLeft } from "lucide-react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { getAppMode } from "../lib/runtime";
import { getSupabaseClient } from "../lib/supabase/client";
import { getProvidersApi } from "../lib/providers/providers";

type ProviderCompanyStatus = "ACTIVE" | "PENDING" | "SUSPENDED";

type ProviderCompany = {
  id: string;
  providerCompanyName: string;
  legalBusinessName: string;
  contactEmail: string;
  status: ProviderCompanyStatus;
  phone?: string;
  address?: string;
  createdAt: string;
};

function statusBadgeClass(status: ProviderCompanyStatus) {
  if (status === "ACTIVE") return "border-emerald-500/15 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "SUSPENDED") return "border-red-500/15 bg-red-500/10 text-red-700 dark:text-red-300";
  return "border-amber-500/15 bg-amber-500/10 text-amber-800 dark:text-amber-300";
}

function statusLabel(status: ProviderCompanyStatus) {
  if (status === "ACTIVE") return "Active";
  if (status === "SUSPENDED") return "Suspended";
  return "Pending";
}

export function AdminProvidersPage() {
  const mode = useMemo(() => getAppMode(), []);
  const providersApi = useMemo(() => getProvidersApi(), []);

  const [search, setSearch] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const companiesQuery = useQuery({
    queryKey: ["admin-provider-companies", mode],
    queryFn: async (): Promise<ProviderCompany[]> => {
      if (mode !== "supabase") return [];

      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const { data, error } = await supabase
        .from("provider_companies")
        .select("id, provider_company_name, legal_business_name, contact_email, status, phone, address, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data as any[]).map((r) => ({
        id: r.id,
        providerCompanyName: r.provider_company_name ?? "",
        legalBusinessName: r.legal_business_name ?? "",
        contactEmail: r.contact_email ?? "",
        status: (r.status ?? "PENDING") as ProviderCompanyStatus,
        phone: r.phone ?? undefined,
        address: r.address ?? undefined,
        createdAt: r.created_at,
      }));
    },
  });

  const providersQuery = useQuery({
    queryKey: ["admin-provider-profiles", mode],
    queryFn: async () => {
      if (mode !== "supabase") return [];

      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const { data, error } = await supabase
        .from("profiles")
        .select("id, role, display_name, company_name, provider_company_id")
        .eq("role", "PROVIDER");

      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const productsQuery = useQuery({
    queryKey: ["admin-all-products", mode],
    queryFn: () => providersApi.listByIds([]),
  });

  const contractsQuery = useQuery({
    queryKey: ["admin-all-contracts", mode],
    queryFn: async () => {
      if (mode !== "supabase") return [];

      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured");

      const { data, error } = await supabase
        .from("contracts")
        .select("id, provider_id");

      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const companies = companiesQuery.data ?? [];
  const providerProfiles = providersQuery.data ?? [];
  const products = productsQuery.data ?? [];
  const contracts = contractsQuery.data ?? [];

  const productCountByProvider = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products) {
      const pid = (p.id ?? "").trim();
      if (pid) counts[pid] = (counts[pid] ?? 0) + 1;
    }
    return counts;
  }, [products]);

  const contractCountByProvider = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of contracts) {
      const pid = (c.provider_id ?? "").trim();
      if (pid) counts[pid] = (counts[pid] ?? 0) + 1;
    }
    return counts;
  }, [contracts]);

  const teamCountByCompany = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of providerProfiles) {
      const cid = (p.provider_company_id ?? "").trim();
      if (cid) counts[cid] = (counts[cid] ?? 0) + 1;
    }
    return counts;
  }, [providerProfiles]);

  const filteredCompanies = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.providerCompanyName.toLowerCase().includes(q) ||
        c.legalBusinessName.toLowerCase().includes(q) ||
        c.contactEmail.toLowerCase().includes(q),
    );
  }, [companies, search]);

  const selectedCompany = selectedCompanyId ? companies.find((c) => c.id === selectedCompanyId) ?? null : null;

  const selectedCompanyProductCount = useMemo(() => {
    if (!selectedCompanyId) return 0;
    const companyProviderIds = providerProfiles
      .filter((p) => p.provider_company_id === selectedCompanyId)
      .map((p) => p.id);
    return companyProviderIds.reduce((sum, pid) => sum + (productCountByProvider[pid] ?? 0), 0);
  }, [selectedCompanyId, providerProfiles, productCountByProvider]);

  const selectedCompanyContractCount = useMemo(() => {
    if (!selectedCompanyId) return 0;
    const companyProviderIds = providerProfiles
      .filter((p) => p.provider_company_id === selectedCompanyId)
      .map((p) => p.id);
    return companyProviderIds.reduce((sum, pid) => sum + (contractCountByProvider[pid] ?? 0), 0);
  }, [selectedCompanyId, providerProfiles, contractCountByProvider]);

  const selectedCompanyTeamCount = teamCountByCompany[selectedCompanyId ?? ""] ?? 0;

  const isLoading = companiesQuery.isLoading;
  const isError = companiesQuery.isError;

  return (
    <PageShell
      badge="Admin"
      title="Providers"
      subtitle="Read-only provider visibility."
      actions={
        <Button variant="outline" asChild>
          <Link to="/company-dashboard">Back to dashboard</Link>
        </Button>
      }
    >
      {selectedCompany ? (
        <div className="space-y-6">
          <Button variant="ghost" size="sm" onClick={() => setSelectedCompanyId(null)} className="gap-1">
            <ArrowLeft className="w-4 h-4" />
            Back to list
          </Button>

          <div className="rounded-xl border bg-card shadow-card p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold">{selectedCompany.providerCompanyName}</h2>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(selectedCompany.status)}`}>
                    {statusLabel(selectedCompany.status)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{selectedCompany.legalBusinessName}</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Package className="w-4 h-4" />
                  Products
                </div>
                <div className="text-2xl font-bold mt-1">{selectedCompanyProductCount}</div>
              </div>
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="w-4 h-4" />
                  Contracts
                </div>
                <div className="text-2xl font-bold mt-1">{selectedCompanyContractCount}</div>
              </div>
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="w-4 h-4" />
                  Team Members
                </div>
                <div className="text-2xl font-bold mt-1">{selectedCompanyTeamCount}</div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Contact Email</span>
                <div className="mt-1 font-medium">{selectedCompany.contactEmail || "—"}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Phone</span>
                <div className="mt-1 font-medium">{selectedCompany.phone || "—"}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Address</span>
                <div className="mt-1 font-medium">{selectedCompany.address || "—"}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Registered</span>
                <div className="mt-1 font-medium">
                  {selectedCompany.createdAt ? new Date(selectedCompany.createdAt).toLocaleDateString() : "—"}
                </div>
              </div>
            </div>
          </div>

          {(() => {
            const companyProviderIds = providerProfiles
              .filter((p) => p.provider_company_id === selectedCompanyId)
              .map((p) => p.id);
            const companyProducts = products.filter((p) => companyProviderIds.includes(p.id ?? ""));

            if (companyProducts.length === 0) return null;

            return (
              <div className="rounded-xl border bg-card shadow-card overflow-hidden">
                <div className="px-6 py-4 border-b">
                  <h3 className="font-semibold">Published Products</h3>
                </div>
                <div className="divide-y">
                  {companyProducts.map((p) => (
                    <div key={p.id} className="px-6 py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-medium text-sm">{p.displayName || p.companyName || "Unnamed Product"}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">ID: {(p.id ?? "").slice(0, 8)}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {productCountByProvider[p.id ?? ""] ?? 0} pricing tier(s)
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search providers by name, legal name, or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading && (
            <div className="rounded-xl border bg-card shadow-card p-6">
              <div className="animate-pulse space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 bg-muted rounded-lg" />
                ))}
              </div>
            </div>
          )}

          {isError && (
            <div className="rounded-xl border bg-card shadow-card p-6 text-sm text-destructive">
              Failed to load provider data.
            </div>
          )}

          {!isLoading && !isError && filteredCompanies.length === 0 && (
            <div className="rounded-xl border bg-card shadow-card p-6 text-sm text-muted-foreground">
              {search ? "No providers match your search." : "No provider companies found."}
            </div>
          )}

          {!isLoading && !isError && filteredCompanies.length > 0 && (
            <div className="rounded-xl border bg-card shadow-card overflow-hidden">
              <div className="px-6 py-3 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {filteredCompanies.length} provider{filteredCompanies.length !== 1 ? "s" : ""}
              </div>
              <div className="divide-y">
                {filteredCompanies.map((c) => {
                  const companyProviderIds = providerProfiles
                    .filter((p) => p.provider_company_id === c.id)
                    .map((p) => p.id);
                  const prodCount = companyProviderIds.reduce((sum, pid) => sum + (productCountByProvider[pid] ?? 0), 0);
                  const ctrCount = companyProviderIds.reduce((sum, pid) => sum + (contractCountByProvider[pid] ?? 0), 0);
                  const teamCount = teamCountByCompany[c.id] ?? 0;

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCompanyId(c.id)}
                      className="w-full px-6 py-4 flex items-center justify-between gap-4 hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-sm truncate">{c.providerCompanyName}</span>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium shrink-0 ${statusBadgeClass(c.status)}`}>
                            {statusLabel(c.status)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 truncate">{c.legalBusinessName}</div>
                      </div>
                      <div className="flex items-center gap-6 text-sm shrink-0">
                        <div className="text-center">
                          <div className="font-semibold">{prodCount}</div>
                          <div className="text-[10px] text-muted-foreground uppercase">Products</div>
                        </div>
                        <div className="text-center">
                          <div className="font-semibold">{ctrCount}</div>
                          <div className="text-[10px] text-muted-foreground uppercase">Contracts</div>
                        </div>
                        <div className="text-center">
                          <div className="font-semibold">{teamCount}</div>
                          <div className="text-[10px] text-muted-foreground uppercase">Team</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
