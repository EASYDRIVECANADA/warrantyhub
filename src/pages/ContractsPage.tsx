import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { getContractsApi } from "../lib/contracts/contracts";
import { getMarketplaceApi } from "../lib/marketplace/marketplace";
import { alertMissing, confirmProceed, sanitizeLettersOnly } from "../lib/utils";
import type { Product } from "../lib/products/types";
import { useAuth } from "../providers/AuthProvider";

function money(cents?: number) {
  if (typeof cents !== "number") return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export function ContractsPage({ title }: { title: string }) {
  const api = useMemo(() => getContractsApi(), []);
  const marketplaceApi = useMemo(() => getMarketplaceApi(), []);
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [contractNumber, setContractNumber] = useState("");
  const [customerName, setCustomerName] = useState("");

  const listQuery = useQuery({
    queryKey: ["contracts"],
    queryFn: () => api.list(),
  });

  const productsQuery = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: () => marketplaceApi.listPublishedProducts(),
    enabled: isAdmin,
  });

  const products = (productsQuery.data ?? []) as Product[];
  const productById = new Map(products.map((p) => [p.id, p] as const));

  const createMutation = useMutation({
    mutationFn: () => api.create({ contractNumber, customerName }),
    onSuccess: async () => {
      setContractNumber("");
      setCustomerName("");
      await qc.invalidateQueries({ queryKey: ["contracts"] });
    },
  });

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-muted-foreground mt-1">Create and track warranty contracts.</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input
          value={contractNumber}
          onChange={(e) => setContractNumber(e.target.value)}
          placeholder="Contract #"
        />
        <Input
          value={customerName}
          onChange={(e) => setCustomerName(sanitizeLettersOnly(e.target.value))}
          placeholder="Customer name"
        />
        <Button
          onClick={() => {
            void (async () => {
              const cn = contractNumber.trim();
              const name = customerName.trim();
              if (!cn) return alertMissing("Contract # is required.");
              if (!name) return alertMissing("Customer name is required.");
              if (!(await confirmProceed("Add contract?"))) return;
              createMutation.mutate();
            })();
          }}
          disabled={createMutation.isPending}
        >
          Add contract
        </Button>
      </div>

      {listQuery.isError ? (
        <div className="mt-6 text-sm text-destructive">Failed to load contracts.</div>
      ) : null}

      <div className="mt-6 rounded-lg border bg-card overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b text-sm text-muted-foreground">
          <div className={isAdmin ? "col-span-3" : "col-span-4"}>Contract #</div>
          <div className={isAdmin ? "col-span-3" : "col-span-5"}>Customer</div>
          {isAdmin ? <div className="col-span-2">Dealer Cost</div> : null}
          {isAdmin ? <div className="col-span-2">Retail</div> : null}
          <div className={isAdmin ? "col-span-2 text-right" : "col-span-3 text-right"}>Created</div>
        </div>
        <div className="divide-y">
          {(listQuery.data ?? []).map((c) => {
            const pid = (c.productId ?? "").trim();
            const p = pid ? productById.get(pid) : undefined;
            return (
              <div key={c.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm">
                <div className={isAdmin ? "col-span-3 font-medium" : "col-span-4 font-medium"}>{c.contractNumber}</div>
                <div className={isAdmin ? "col-span-3" : "col-span-5"}>{c.customerName}</div>
                {isAdmin ? <div className="col-span-2 text-muted-foreground">{money(p?.dealerCostCents)}</div> : null}
                {isAdmin ? <div className="col-span-2 text-muted-foreground">{money(p?.basePriceCents)}</div> : null}
                <div className={isAdmin ? "col-span-2 text-right text-muted-foreground" : "col-span-3 text-right text-muted-foreground"}>
                  {new Date(c.createdAt).toLocaleDateString()}
                </div>
              </div>
            );
          })}
          {listQuery.isLoading ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>
          ) : null}
          {!listQuery.isLoading && (listQuery.data ?? []).length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">No contracts yet.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
