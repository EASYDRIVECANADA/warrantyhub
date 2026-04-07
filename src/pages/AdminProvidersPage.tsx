import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, ChevronRight, Package, FileText, Users, ArrowLeft, Store, Mail, Phone, MapPin, Calendar, ArrowRight } from "lucide-react";

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

  const activeCount = companies.filter((c) => c.status === "ACTIVE").length;
  const pendingCount = companies.filter((c) => c.status === "PENDING").length;
  const suspendedCount = companies.filter((c) => c.status === "SUSPENDED").length;

  return (
    <PageShell
      badge="Admin"
      title="Provider Companies"
      subtitle="View and manage warranty provider companies"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="gap-2">
            <Link to="/superadmin-companies">
              <Store className="w-4 h-4" />
              Manage Companies
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="gap-2">
            <Link to="/admin-dashboard">
              <ArrowRight className="w-4 h-4 rotate-180" />
              Dashboard
            </Link>
          </Button>
        </div>
      }
    >
      {selectedCompany ? (
        <div className="space-y-6">
          <Button variant="ghost" size="sm" onClick={() => setSelectedCompanyId(null)} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to providers
          </Button>

          <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600">
                    <Store className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold">{selectedCompany.providerCompanyName}</h2>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${statusBadgeClass(selectedCompany.status)}`}>
                        {statusLabel(selectedCompany.status)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{selectedCompany.legalBusinessName}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border bg-gradient-to-br from-blue-500/5 to-transparent p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Package className="w-4 h-4" />
                    Products
                  </div>
                  <div className="text-3xl font-bold mt-2">{selectedCompanyProductCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">Published products</div>
                </div>
                <div className="rounded-xl border bg-gradient-to-br from-violet-500/5 to-transparent p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="w-4 h-4" />
                    Contracts
                  </div>
                  <div className="text-3xl font-bold mt-2">{selectedCompanyContractCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">Total contracts</div>
                </div>
                <div className="rounded-xl border bg-gradient-to-br from-emerald-500/5 to-transparent p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="w-4 h-4" />
                    Team Members
                  </div>
                  <div className="text-3xl font-bold mt-2">{selectedCompanyTeamCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">Active users</div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Contact Information</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Email</div>
                        <div className="text-sm font-medium">{selectedCompany.contactEmail || "—"}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Phone</div>
                        <div className="text-sm font-medium">{selectedCompany.phone || "—"}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Address</div>
                        <div className="text-sm font-medium">{selectedCompany.address || "—"}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Details</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Registered</div>
                        <div className="text-sm font-medium">
                          {selectedCompany.createdAt ? new Date(selectedCompany.createdAt).toLocaleDateString() : "—"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                      <Store className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Legal Name</div>
                        <div className="text-sm font-medium">{selectedCompany.legalBusinessName || "—"}</div>
                      </div>
                    </div>
                  </div>
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
              <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-500/5 via-transparent to-transparent">
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold">Published Products</h3>
                  </div>
                </div>
                <div className="divide-y">
                  {companyProducts.map((p) => (
                    <div key={p.id} className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors">
                      <div>
                        <div className="font-medium text-sm">{p.displayName || p.companyName || "Unnamed Product"}</div>
                        <div className="text-xs text-muted-foreground mt-1">ID: {(p.id ?? "").slice(0, 8)}</div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm font-medium">{productCountByProvider[p.id ?? ""] ?? 0}</div>
                          <div className="text-[10px] text-muted-foreground uppercase">Pricing Tiers</div>
                        </div>
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
          <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b bg-gradient-to-r from-emerald-600/5 via-transparent to-transparent">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
                    <Store className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">Provider Companies</div>
                    <div className="text-sm text-muted-foreground">Read-only provider directory</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-700">
                    <span className="text-sm font-medium">{activeCount}</span>
                    <span className="text-xs text-muted-foreground ml-1">Active</span>
                  </div>
                  <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-700">
                    <span className="text-sm font-medium">{pendingCount}</span>
                    <span className="text-xs text-muted-foreground ml-1">Pending</span>
                  </div>
                  <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-500/10 text-red-700">
                    <span className="text-sm font-medium">{suspendedCount}</span>
                    <span className="text-xs text-muted-foreground ml-1">Suspended</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-b">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, legal name, or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 bg-background/70"
                />
              </div>
            </div>

            {isLoading && (
              <div className="p-6">
                <div className="animate-pulse space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-muted rounded-xl" />
                  ))}
                </div>
              </div>
            )}

            {isError && (
              <div className="p-6 text-center">
                <div className="text-sm text-destructive">Failed to load provider data. Please try again.</div>
              </div>
            )}

            {!isLoading && !isError && filteredCompanies.length === 0 && (
              <div className="p-12 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
                  <Store className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="text-sm font-medium">
                  {search ? "No providers match your search" : "No provider companies"}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {search ? "Try a different search term" : "Provider companies will appear here once created"}
                </div>
              </div>
            )}

            {!isLoading && !isError && filteredCompanies.length > 0 && (
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
                      className="w-full px-6 py-5 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="p-2.5 rounded-xl bg-muted/50 text-muted-foreground">
                          <Store className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-sm truncate">{c.providerCompanyName}</span>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-medium shrink-0 ${statusBadgeClass(c.status)}`}>
                              {statusLabel(c.status)}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 truncate">{c.legalBusinessName}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-sm shrink-0">
                        <div className="text-center min-w-[60px]">
                          <div className="font-bold text-lg">{prodCount}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Products</div>
                        </div>
                        <div className="text-center min-w-[60px]">
                          <div className="font-bold text-lg">{ctrCount}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Contracts</div>
                        </div>
                        <div className="text-center min-w-[60px]">
                          <div className="font-bold text-lg">{teamCount}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Team</div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="px-6 py-3 border-t bg-muted/30">
              <div className="text-xs text-muted-foreground">
                Showing {filteredCompanies.length} of {companies.length} provider companies
              </div>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
