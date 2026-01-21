import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { getContractsApi } from "../lib/contracts/contracts";
import type { Contract } from "../lib/contracts/types";
import { BRAND } from "../lib/brand";

export function ProviderContractPrintPage() {
  const { id } = useParams();
  const contractId = id ?? "";

  const api = useMemo(() => getContractsApi(), []);

  const contractQuery = useQuery({
    queryKey: ["provider-contract", contractId],
    enabled: !!contractId,
    queryFn: () => api.get(contractId),
  });

  const contract = contractQuery.data as Contract | null | undefined;

  useEffect(() => {
    if (!contract) return;
    const t = window.setTimeout(() => {
      window.print();
    }, 250);
    return () => window.clearTimeout(t);
  }, [contract]);

  if (contractQuery.isLoading) {
    return <div className="container mx-auto px-4 py-10 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!contract) {
    return <div className="container mx-auto px-4 py-10 text-sm text-muted-foreground">Contract not found.</div>;
  }

  const vehicleLine = [contract.vehicleYear, contract.vehicleMake, contract.vehicleModel, contract.vehicleTrim]
    .filter(Boolean)
    .join(" ");

  const addressLine = [
    contract.customerAddress,
    contract.customerCity,
    contract.customerProvince,
    contract.customerPostalCode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="max-w-4xl mx-auto p-8">
        <div className="border rounded-xl overflow-hidden">
          <div className="px-6 py-5 border-b">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{BRAND.name}</div>
                <h1 className="text-xl font-bold font-display mt-1">Warranty Contract • Provider Copy</h1>
                <div className="text-sm text-slate-500 mt-1">Read-only copy for provider support and record keeping.</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Warranty ID</div>
                <div className="text-sm font-semibold">{contract.warrantyId}</div>
                <div className="text-[11px] text-slate-500 mt-1">Contract #{contract.contractNumber}</div>
              </div>
            </div>
          </div>

          <div className="px-6 py-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-lg border p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Contract Details</div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[11px] text-slate-500">Status</div>
                    <div className="font-medium">{contract.status}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Created</div>
                    <div className="font-medium">{new Date(contract.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Last Updated</div>
                    <div className="font-medium">{new Date(contract.updatedAt).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Copy Type</div>
                    <div className="font-medium">Provider Copy</div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Customer Information</div>
                <div className="mt-3 space-y-2 text-sm">
                  <div>
                    <div className="text-[11px] text-slate-500">Name</div>
                    <div className="font-medium">{contract.customerName || "—"}</div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] text-slate-500">Email</div>
                      <div className="font-medium">{contract.customerEmail || "—"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">Phone</div>
                      <div className="font-medium">{contract.customerPhone || "—"}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Address</div>
                    <div className="font-medium">{addressLine || "—"}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-lg border p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Vehicle Information</div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-[11px] text-slate-500">VIN</div>
                  <div className="font-medium">{contract.vin || "—"}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-[11px] text-slate-500">Vehicle</div>
                  <div className="font-medium">{vehicleLine || "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Body Class</div>
                  <div className="font-medium">{contract.vehicleBodyClass || "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Engine</div>
                  <div className="font-medium">{contract.vehicleEngine || "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Transmission</div>
                  <div className="font-medium">{contract.vehicleTransmission || "—"}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t text-[11px] text-slate-500">
            Generated by {BRAND.name} • Provider read-only copy.
          </div>
        </div>
      </div>
    </div>
  );
}
