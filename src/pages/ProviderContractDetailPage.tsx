import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { PageShell } from "../components/PageShell";
import { getContractsApi } from "../lib/contracts/contracts";
import type { Contract } from "../lib/contracts/types";
import { getProductsApi } from "../lib/products/products";
import type { Product } from "../lib/products/types";

function formatDateTime(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

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

export function ProviderContractDetailPage() {
  const { id } = useParams();
  const contractId = id ?? "";
  const navigate = useNavigate();

  const api = useMemo(() => getContractsApi(), []);
  const productsApi = useMemo(() => getProductsApi(), []);

  const contractQuery = useQuery({
    queryKey: ["provider-contract", contractId],
    enabled: Boolean(contractId),
    queryFn: () => api.get(contractId),
  });

  const productsQuery = useQuery({
    queryKey: ["provider-products"],
    queryFn: () => productsApi.list(),
  });

  const contract = contractQuery.data as Contract | null | undefined;

  const products = (productsQuery.data ?? []) as Product[];
  const productById = new Map(products.map((p) => [p.id, p] as const));

  const vehicleLine = [contract?.vehicleYear, contract?.vehicleMake, contract?.vehicleModel, contract?.vehicleTrim]
    .filter(Boolean)
    .join(" ");

  const addressLine = [
    contract?.customerAddress,
    contract?.customerCity,
    contract?.customerProvince,
    contract?.customerPostalCode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <PageShell
      badge="Provider Portal"
      title={contract ? `Contract ${contract.contractNumber}` : "Contract"}
      subtitle="Contracts are created by dealers. Providers have read-only access for support."
      actions={
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <Link to="/provider-contracts">Back to contracts</Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(`/provider-contracts/${contractId}/print`)}
            disabled={!contractId}
          >
            Download PDF
          </Button>
        </div>
      }
    >
      <div className="max-w-4xl mx-auto">
        {contractQuery.isError ? <div className="text-sm text-destructive">Failed to load contract.</div> : null}

        {contractQuery.isLoading ? <div className="mt-6 text-sm text-muted-foreground">Loading…</div> : null}

        {!contractQuery.isLoading && !contract ? (
          <div className="mt-6 rounded-2xl border bg-card p-6 shadow-card">
            <div className="text-sm text-muted-foreground">Contract not found.</div>
          </div>
        ) : null}

        {contract ? (
          <div className="mt-6 grid grid-cols-1 gap-6">
            <div className="rounded-2xl border bg-card p-6 shadow-card">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-sm text-muted-foreground">Read-only</div>
                  <div className="text-lg font-semibold mt-1">Created by Dealer: {dealerLabel(contract)}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Providers can view contracts for support but cannot edit, delete, or change pricing.
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="text-sm font-semibold">{contract.status}</div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border p-4">
                  <div className="text-xs text-muted-foreground">Warranty ID</div>
                  <div className="text-sm font-medium mt-1">{contract.warrantyId}</div>
                  <div className="text-xs text-muted-foreground mt-3">Contract #</div>
                  <div className="text-sm font-medium mt-1">{contract.contractNumber}</div>
                </div>

                <div className="rounded-xl border p-4">
                  <div className="text-xs text-muted-foreground">Product</div>
                  <div className="text-sm font-medium mt-1">{productLabel(productById, contract)}</div>
                  <div className="text-xs text-muted-foreground mt-3">Created</div>
                  <div className="text-sm font-medium mt-1">{formatDateTime(contract.createdAt)}</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-6 shadow-card">
              <div className="font-semibold">Customer</div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Name</div>
                  <div className="font-medium">{contract.customerName || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Email</div>
                  <div className="font-medium">{contract.customerEmail || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Phone</div>
                  <div className="font-medium">{contract.customerPhone || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Address</div>
                  <div className="font-medium">{addressLine || "—"}</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-6 shadow-card">
              <div className="font-semibold">Vehicle</div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">VIN</div>
                  <div className="font-medium">{contract.vin || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Vehicle</div>
                  <div className="font-medium">{vehicleLine || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Mileage (km)</div>
                  <div className="font-medium">
                    {typeof contract.vehicleMileageKm === "number" ? contract.vehicleMileageKm.toLocaleString() : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Transmission</div>
                  <div className="font-medium">{contract.vehicleTransmission || "—"}</div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
