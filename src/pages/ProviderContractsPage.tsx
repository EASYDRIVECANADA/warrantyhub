import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PageShell } from "../components/PageShell";
import { getContractsApi } from "../lib/contracts/contracts";
import type { Contract } from "../lib/contracts/types";
import { getProductsApi } from "../lib/products/products";
import type { Product } from "../lib/products/types";
import { sanitizeWordsOnly } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";

function dealerLabel(c: Contract) {
  const created = (c.createdByEmail ?? "").trim();
  if (created) return created;
  const sold = (c.soldByEmail ?? "").trim();
  if (sold) return sold;
  return "—";
}

function productLabel(productById: Map<string, Product>, c: Contract) {
  const pid = (c.productId ?? "").trim();
  if (!pid) return "—";
  return productById.get(pid)?.name ?? "—";
}

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function ProviderContractsPage() {
  const { user } = useAuth();
  const api = useMemo(() => getContractsApi(), []);
  const productsApi = useMemo(() => getProductsApi(), []);

  const [searchContract, setSearchContract] = useState("");
  const [searchCustomer, setSearchCustomer] = useState("");
  const [searchDealer, setSearchDealer] = useState("");
  const [searchProduct, setSearchProduct] = useState("");

  const contractsQuery = useQuery({
    queryKey: ["provider-contracts"],
    queryFn: () => api.list(),
  });

  const productsQuery = useQuery({
    queryKey: ["provider-products"],
    queryFn: () => productsApi.list(),
  });

  const products = (productsQuery.data ?? []) as Product[];
  const productById = new Map(products.map((p) => [p.id, p] as const));

  const allContracts = (contractsQuery.data ?? []) as Contract[];
  const providerContracts = allContracts.filter((c) => {
    const pid = (c.providerId ?? "").trim();
    return Boolean(user?.id) && pid === user?.id;
  });

  const filtered = providerContracts.filter((c) => {
    const qContract = norm(searchContract);
    const qCustomer = norm(searchCustomer);
    const qDealer = norm(searchDealer);
    const qProduct = norm(searchProduct);

    if (qContract) {
      const hay = norm(`${c.contractNumber} ${c.warrantyId}`);
      if (!hay.includes(qContract)) return false;
    }

    if (qCustomer) {
      const hay = norm(`${c.customerName} ${c.customerEmail ?? ""}`);
      if (!hay.includes(qCustomer)) return false;
    }

    if (qDealer) {
      const hay = norm(`${c.createdByEmail ?? ""} ${c.soldByEmail ?? ""}`);
      if (!hay.includes(qDealer)) return false;
    }

    if (qProduct) {
      const hay = norm(`${productLabel(productById, c)}`);
      if (!hay.includes(qProduct)) return false;
    }

    return true;
  });

  return (
    <PageShell
      badge="Provider Portal"
      title="Contracts"
      subtitle="Contracts are created by dealers. Providers have read-only access for support."
      actions={
        <Button variant="outline" asChild>
          <Link to="/provider-dashboard">Back to dashboard</Link>
        </Button>
      }
    >
      <div className="mt-8 rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b">
          <div className="font-semibold">Search</div>
          <div className="text-sm text-muted-foreground mt-1">Find contracts by contract #, customer, dealer, or product.</div>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Input
            value={searchContract}
            onChange={(e) => setSearchContract(sanitizeWordsOnly(e.target.value))}
            placeholder="Contract # / Warranty ID"
          />
          <Input
            value={searchCustomer}
            onChange={(e) => setSearchCustomer(sanitizeWordsOnly(e.target.value))}
            placeholder="Customer name"
          />
          <Input
            value={searchDealer}
            onChange={(e) => setSearchDealer(e.target.value)}
            placeholder="Dealer (email)"
          />
          <Input
            value={searchProduct}
            onChange={(e) => setSearchProduct(sanitizeWordsOnly(e.target.value))}
            placeholder="Product name"
          />
        </div>
      </div>

      <div className="mt-10 rounded-2xl border bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold">Contract List (Read-only)</div>
            <div className="text-sm text-muted-foreground mt-1">Created by dealers • view-only for provider support.</div>
          </div>
          <div className="text-sm text-muted-foreground">{filtered.length} shown</div>
        </div>

        <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 border-b text-xs text-muted-foreground">
          <div className="col-span-3">Contract</div>
          <div className="col-span-3">Customer</div>
          <div className="col-span-3">Created by Dealer</div>
          <div className="col-span-2">Product</div>
          <div className="col-span-1 text-right">Action</div>
        </div>

        <div className="divide-y">
          {filtered.map((c) => (
            <div key={c.id} className="px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <div className="md:col-span-3">
                  <div className="text-sm font-medium text-foreground">{c.contractNumber}</div>
                  <div className="text-xs text-muted-foreground mt-1">{c.warrantyId}</div>
                </div>
                <div className="md:col-span-3 text-sm text-muted-foreground">
                  <div className="text-sm">{c.customerName}</div>
                  <div className="text-xs text-muted-foreground mt-1">{c.status}</div>
                </div>
                <div className="md:col-span-3 text-sm text-muted-foreground">{dealerLabel(c)}</div>
                <div className="md:col-span-2 text-sm text-muted-foreground">{productLabel(productById, c)}</div>
                <div className="md:col-span-1 flex md:justify-end">
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/provider-contracts/${c.id}`}>View</Link>
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {contractsQuery.isLoading ? <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div> : null}
          {contractsQuery.isError ? <div className="px-6 py-6 text-sm text-destructive">Failed to load contracts.</div> : null}
          {!contractsQuery.isLoading && !contractsQuery.isError && filtered.length === 0 ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">No contracts found.</div>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
