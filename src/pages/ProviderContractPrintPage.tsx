import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { getContractsApi } from "../lib/contracts/contracts";
import type { Contract } from "../lib/contracts/types";
import { BRAND } from "../lib/brand";
import { getProvidersApi } from "../lib/providers/providers";
import type { ProviderPublic } from "../lib/providers/types";
import { getProductsApi } from "../lib/products/products";
import type { Product } from "../lib/products/types";

const bridgeWarrantyLogoUrl = new URL("../../images/Bridge Warranty_White Background.png", import.meta.url).href;

function money(cents?: number) {
  if (typeof cents !== "number") return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function renderProviderTerms(input: {
  providerTermsText?: string;
  productName: string;
  termMonthsLabel: string;
  termKmLabel: string;
  deductibleLabel: string;
  coverageDetailsText: string;
  exclusionsText: string;
}) {
  const defaultCoverageDetails = `This Vehicle Service Contract provides coverage for specified mechanical and electrical components of the registered vehicle, subject to the terms, conditions, exclusions, and limitations outlined herein.\n\nCovered Components may include:\n• Engine (internally lubricated parts)\n• Transmission / Transaxle\n• Drive Axle\n• Electrical Systems\n• Cooling System\n• Fuel System\n• Steering Components\n• Suspension Components\n• Air Conditioning System`;

  const defaultExclusions = `This Contract does not provide coverage for normal wear and tear, routine maintenance services, brake components, tires, cosmetic items, or damage resulting from misuse, neglect, accidents, or unauthorized modifications.`;

  const fallback = `BRIDGE WARRANTY\nVehicle Service Contract\n\nCoverage Details\n{{coverage_details}}\n\nExclusions\n{{exclusions}}\n\nDuration and Mileage Limits\nCoverage remains valid for the Term and Mileage limits specified in the Contract Schedule, whichever occurs first. Coverage automatically expires upon reaching either limit.\n\nDeductible Amount\nThe Contract Holder agrees to pay the deductible amount specified in the Contract Schedule per approved repair claim.\n\nClaim Process\nTo obtain benefits, the Contract Holder must contact the Administrator prior to any repair work. All repairs must receive authorization. Failure to follow this process may result in denial of coverage.\n\nService Provider Information\nRepairs must be performed by the Selling Dealership or a licensed repair facility approved by the Administrator.\n\nPayment Terms\nApproved repair costs may be paid directly to the repair facility or reimbursed to the Contract Holder following review and approval of documentation.\n\nTransferability\nThis Contract may be transferred to a subsequent private owner subject to Administrator approval and applicable transfer fees.\n\nDispute Resolution\nAny disputes arising under this Contract shall be resolved through the Administrator’s internal review process and, where applicable, binding arbitration.\n\nCancellation and Refund Policy\nThe Contract Holder may cancel this Contract subject to the cancellation provisions outlined in the Contract Schedule. Refunds, where applicable, will be calculated on a prorated basis`;

  const raw = (input.providerTermsText ?? "").trim() || fallback;

  const coverage = input.coverageDetailsText.trim() || defaultCoverageDetails;
  const exclusions = input.exclusionsText.trim() || defaultExclusions;

  return raw
    .replaceAll("{{product_name}}", input.productName)
    .replaceAll("{{term_months}}", input.termMonthsLabel)
    .replaceAll("{{term_km}}", input.termKmLabel)
    .replaceAll("{{deductible}}", input.deductibleLabel)
    .replaceAll("{{coverage_details}}", coverage)
    .replaceAll("{{exclusions}}", exclusions);
}

export function ProviderContractPrintPage() {
  const { id } = useParams();
  const contractId = id ?? "";

  const api = useMemo(() => getContractsApi(), []);
  const providersApi = useMemo(() => getProvidersApi(), []);
  const productsApi = useMemo(() => getProductsApi(), []);

  const contractQuery = useQuery({
    queryKey: ["provider-contract", contractId],
    enabled: !!contractId,
    queryFn: () => api.get(contractId),
  });

  const contract = contractQuery.data as Contract | null | undefined;

  const productQuery = useQuery({
    queryKey: ["provider-contract-product", contract?.productId],
    enabled: Boolean(contract?.productId),
    queryFn: async () => {
      const pid = (contract?.productId ?? "").trim();
      if (!pid) return null;
      return productsApi.get(pid);
    },
  });

  const product = productQuery.data as Product | null | undefined;

  const myProfileQuery = useQuery({
    queryKey: ["my-provider-profile"],
    queryFn: () => providersApi.getMyProfile(),
  });

  const provider = myProfileQuery.data as ProviderPublic | null | undefined;

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

  const termMonthsLabel =
    contract.pricingTermMonths === null
      ? "Unlimited"
      : typeof contract.pricingTermMonths === "number"
        ? `${contract.pricingTermMonths} mo`
        : "—";
  const termKmLabel =
    contract.pricingTermKm === null
      ? "Unlimited"
      : typeof contract.pricingTermKm === "number"
        ? `${contract.pricingTermKm} km`
        : "—";
  const deductibleLabel = money(contract.pricingDeductibleCents ?? undefined);
  const productName = (product?.name ?? "—").toString();
  const coverageDetailsText = (product?.coverageDetails ?? "").trim();
  const exclusionsText = (product?.exclusions ?? "").trim();
  const providerTerms = renderProviderTerms({
    providerTermsText: provider?.termsText,
    productName,
    termMonthsLabel,
    termKmLabel,
    deductibleLabel,
    coverageDetailsText,
    exclusionsText,
  });

  return (
    <div className="print-contract-root min-h-screen bg-white text-slate-900">
      <div className="max-w-4xl mx-auto p-8">
        <div className="border rounded-xl overflow-hidden">
          <div className="px-6 py-5 border-b">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-3">
                  <img src={bridgeWarrantyLogoUrl} alt={BRAND.name} className="h-14 w-auto object-contain" />
                </div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-2">{BRAND.name}</div>
                <h1 className="text-xl font-bold font-display mt-1">Warranty Contract • Provider Copy</h1>
                <div className="text-sm text-slate-500 mt-1">Read-only copy for provider support and record keeping.</div>
              </div>
              <div className="text-right">
                {provider?.logoUrl ? (
                  <div className="flex justify-end">
                    <img src={provider.logoUrl} alt="" className="h-12 w-auto object-contain mb-2" />
                  </div>
                ) : null}
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

            <div className="mt-6 rounded-lg border p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Terms & Conditions</div>
              <div className="mt-3 text-sm whitespace-pre-wrap leading-relaxed">{providerTerms}</div>
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
