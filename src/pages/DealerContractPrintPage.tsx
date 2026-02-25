import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { getContractsApi } from "../lib/contracts/contracts";
import { getMarketplaceApi } from "../lib/marketplace/marketplace";
import { getProvidersApi } from "../lib/providers/providers";
import type { Contract } from "../lib/contracts/types";
import type { MarketplaceProduct } from "../lib/marketplace/api";
import type { ProviderPublic } from "../lib/providers/types";
import { BRAND } from "../lib/brand";
import { getAppMode } from "../lib/runtime";
import { useAuth } from "../providers/AuthProvider";

const bridgeWarrantyLogoUrl = new URL("../../images/Bridge Warranty_White Background.png", import.meta.url).href;

const LOCAL_DEALER_MEMBERSHIPS_KEY = "warrantyhub.local.dealer_memberships";

function readLocalDealerMemberships(): Array<{ dealerId?: string; userId?: string }> {
  const raw = localStorage.getItem(LOCAL_DEALER_MEMBERSHIPS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as any[]) : [];
  } catch {
    return [];
  }
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
  const defaultCoverageDetails = `Coverage details are provided by the Provider and may vary by plan. Refer to the Provider documentation for the complete schedule of coverages.`;

  const defaultExclusions = `Exclusions are set by the Provider and may include normal wear and tear, routine maintenance, cosmetic items, and damage caused by misuse or neglect.`;

  const fallback = `Vehicle Service Contract\n\nContract Schedule\nProduct: {{product_name}}\nTerm: {{term_months}} / {{term_km}}\nDeductible: {{deductible}}\n\nCoverage Details\n{{coverage_details}}\n\nExclusions\n{{exclusions}}\n\nClaims Process\nFor any covered failure, contact the Provider (or the Provider’s administrator) for instructions and authorization before repairs are performed. Unauthorized repairs may not be covered.\n\nRepair Facility\nRepairs must be performed by a licensed repair facility and may require pre-approval by the Provider.\n\nLimitations\nThis Contract is subject to limitations, conditions, and procedures set by the Provider. The Provider’s final contract language governs in the event of any conflict.\n\nCancellation\nCancellation and refund rules (if any) are determined by the Provider and the selling dealership, subject to applicable law.`;

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

function CustomerCopyTerms(props: {
  platformName: string;
  providerName: string;
  productName: string;
  termMonthsLabel: string;
  termKmLabel: string;
  deductibleLabel: string;
  coverageDetailsText: string;
  exclusionsText: string;
}) {
  const coverage =
    props.coverageDetailsText.trim() ||
    "Coverage details are provided by the Provider and may vary by plan. Refer to the Provider documentation for the complete schedule of coverages.";
  const exclusions =
    props.exclusionsText.trim() ||
    "Exclusions are set by the Provider and may include normal wear and tear, routine maintenance, cosmetic items, and damage caused by misuse or neglect.";

  const Section = (p: { title: string; children: React.ReactNode }) => (
    <section className="mt-4">
      <div className="text-[12px] font-semibold text-slate-900">{p.title}</div>
      <div className="mt-1 text-[13px] leading-relaxed text-slate-700">{p.children}</div>
    </section>
  );

  return (
    <div className="text-slate-800">
      <div className="text-[12px] font-semibold">BRIDGE WARRANTY</div>
      <div className="text-[13px]">Vehicle Service Contract</div>
      <div className="mt-2 text-[12px] leading-relaxed text-slate-600">
        This page summarizes the key details of your purchase and provides important notices. For full coverage terms, procedures, and limitations, refer to the
        Provider’s official contract documentation.
      </div>

      <Section title="Contract Schedule (Customer Copy)">
        <div className="space-y-1">
          <div>
            <span className="text-slate-600">Product:</span> <span className="font-medium">{props.productName}</span>
          </div>
          <div>
            <span className="text-slate-600">Provider:</span> <span className="font-medium">{props.providerName}</span>
          </div>
          <div>
            <span className="text-slate-600">Term:</span> <span className="font-medium">{props.termMonthsLabel}</span> /{" "}
            <span className="font-medium">{props.termKmLabel}</span>
          </div>
          <div>
            <span className="text-slate-600">Deductible:</span> <span className="font-medium">{props.deductibleLabel}</span>
          </div>
        </div>
      </Section>

      <Section title="Coverage Details">{coverage}</Section>
      <Section title="Exclusions">{exclusions}</Section>

      <Section title="Terms & Conditions">
        This Vehicle Service Contract is offered by the Provider identified above. Coverage is subject to the Provider’s terms, conditions, exclusions, and limitations.
      </Section>

      <Section title="Claims / Repairs">
        In the event of a covered failure, you must contact the Provider (or the Provider’s administrator) for instructions and authorization before repairs are performed. You may be required to provide vehicle and contract information and obtain a claim authorization number.
      </Section>

      <Section title="Platform Disclaimer">
        {props.platformName} is a technology platform that markets and facilitates the sale of products and services on behalf of independent providers. Unless expressly stated otherwise in writing, {props.platformName} is not the obligor, administrator, insurer, or underwriter of any vehicle service contract.
      </Section>

      <Section title="Provider Responsibility">
        All coverage obligations, claim decisions, and benefit payments are the sole responsibility of the Provider (and/or the Provider’s administrator, insurer, or underwriter, if applicable).
      </Section>

      <Section title="Limitation of Liability">
        To the fullest extent permitted by law, {props.platformName} is not responsible for the performance of the Provider, denial of claims, coverage interpretations, cancellations, refunds, or any damages arising from the Provider’s products or services.
      </Section>

      <Section title="Customer Acknowledgement">
        By purchasing or accepting this contract, you acknowledge that you have reviewed this Customer Copy and understand that the Provider’s contract terms govern your rights and benefits.
      </Section>
    </div>
  );
}

function dealershipUserIds(dealerId: string) {
  const memberships = readLocalDealerMemberships();
  const ids = new Set<string>();
  ids.add(dealerId);
  for (const m of memberships) {
    const did = (m?.dealerId ?? "").toString();
    const uid = (m?.userId ?? "").toString();
    if (did && uid && did === dealerId) ids.add(uid);
  }
  return ids;
}

type CopyType = "dealer" | "provider" | "customer";

function titleForCopyType(t: CopyType) {
  if (t === "dealer") return "Dealer Copy";
  if (t === "provider") return "Provider Copy";
  return "Customer Copy";
}

function addonPricingTypeLabel(raw: unknown) {
  const t = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (t === "PER_TERM") return "Per term";
  if (t === "PER_CLAIM") return "Per claim";
  return "Fixed";
}

export function DealerContractPrintPage() {
  const { user } = useAuth();
  const { id, copyType } = useParams();
  const contractId = id ?? "";
  const type = (copyType ?? "dealer") as CopyType;

  const mode = useMemo(() => getAppMode(), []);
  const isEmployee = user?.role === "DEALER_EMPLOYEE";

  const api = useMemo(() => getContractsApi(), []);
  const marketplaceApi = useMemo(() => getMarketplaceApi(), []);
  const providersApi = useMemo(() => getProvidersApi(), []);

  const contractQuery = useQuery({
    queryKey: ["contract", contractId],
    enabled: !!contractId,
    queryFn: () => api.get(contractId),
  });

  const productsQuery = useQuery({
    queryKey: ["marketplace-products"],
    queryFn: () => marketplaceApi.listPublishedProducts(),
  });

  const contract = contractQuery.data as Contract | null | undefined;

  const products = (productsQuery.data ?? []) as MarketplaceProduct[];
  const productById = new Map(products.map((p) => [p.id, p] as const));
  const selectedProduct = (() => {
    const pid = (contract?.productId ?? "").trim();
    return pid ? productById.get(pid) : undefined;
  })();

  const providerIds = Array.from(
    new Set(
      [contract?.providerId, selectedProduct?.providerId]
        .map((x) => (x ?? "").trim())
        .filter(Boolean),
    ),
  );

  const providersQuery = useQuery({
    queryKey: ["providers", providerIds.join(",")],
    queryFn: () => providersApi.listByIds(providerIds),
    enabled: providerIds.length > 0,
  });

  const providers = (providersQuery.data ?? []) as ProviderPublic[];
  const providerById = new Map(providers.map((p) => [p.id, p] as const));

  const providerDisplay = (id: string | undefined) => {
    const pid = (id ?? "").trim();
    if (!pid) return "—";
    const p = providerById.get(pid);
    const company = (p?.companyName ?? "").trim();
    if (company) return company;
    const display = (p?.displayName ?? "").trim();
    if (display) return display;
    return `Provider ${pid.slice(0, 8)}`;
  };

  const providerForContract = (() => {
    const pid = (selectedProduct?.providerId ?? contract?.providerId ?? "").trim();
    return pid ? providerById.get(pid) : undefined;
  })();

  const money = (cents?: number) => {
    if (typeof cents !== "number") return "—";
    return `$${(cents / 100).toFixed(2)}`;
  };

  const uid = (user?.id ?? "").trim();
  const uem = (user?.email ?? "").trim().toLowerCase();
  const isMine = (c: Contract) => {
    const byId = (c.createdByUserId ?? "").trim();
    const byEmail = (c.createdByEmail ?? "").trim().toLowerCase();
    if (uid && byId) return byId === uid;
    if (uem && byEmail) return byEmail === uem;
    return false;
  };

  const canView = (c: Contract) => {
    if (!user) return false;
    if (isEmployee) return isMine(c);
    if (user.role !== "DEALER_ADMIN") return isMine(c);
    if (mode !== "local") return isMine(c);

    const did = (user.dealerId ?? "").trim();
    if (!did) return isMine(c);

    const cdid = (c.dealerId ?? "").trim();
    if (cdid && cdid === did) return true;

    const ids = dealershipUserIds(did);
    const byId = (c.createdByUserId ?? "").trim();
    return Boolean(byId) && ids.has(byId);
  };

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

  if (!contract || !canView(contract) || (isEmployee && type === "provider")) {
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
  const productName = (selectedProduct?.name ?? "—").toString();
  const coverageDetailsText = (selectedProduct?.coverageDetails ?? "").trim();
  const exclusionsText = (selectedProduct?.exclusions ?? "").trim();
  const providerTerms = renderProviderTerms({
    providerTermsText: providerForContract?.termsText,
    productName,
    termMonthsLabel,
    termKmLabel,
    deductibleLabel,
    coverageDetailsText,
    exclusionsText,
  });

  return (
    <div className="print-contract-root min-h-screen bg-slate-50 text-slate-900">
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 6mm;
          }

          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .print-contract-root {
            background: white !important;
          }

          .contract-print-container {
            padding: 0 !important;
            max-width: none !important;
            margin: 0 !important;
          }

          .contract-print-sheet {
            border: none !important;
            border-radius: 0 !important;
          }

          .contract-print-header {
            padding: 5mm 5mm 3mm 5mm !important;
          }

          .contract-print-body {
            padding: 3mm 5mm 5mm 5mm !important;
            font-size: 9.75px !important;
          }

          .contract-print-card {
            padding: 6px !important;
          }

          .contract-print-gap {
            margin-top: 4px !important;
          }

          .contract-print-terms {
            margin-top: 6px !important;
            padding: 5mm !important;
          }

          .contract-print-body .grid {
            gap: 6px !important;
          }

          .contract-print-body .text-xl {
            font-size: 12px !important;
            line-height: 1.2 !important;
          }

          .contract-print-body .text-lg {
            font-size: 10.5px !important;
          }

          .contract-print-body .text-sm {
            font-size: 8.5px !important;
          }

          .contract-print-body .mt-4 {
            margin-top: 4px !important;
          }

          .contract-print-body .mt-6 {
            margin-top: 6px !important;
          }

          .contract-print-body .mt-7 {
            margin-top: 8px !important;
          }

          .contract-print-body .space-y-3 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 6px !important;
          }

          .contract-print-body .space-y-2 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 4px !important;
          }

          .print-break-after {
            break-after: page;
            page-break-after: always;
          }
          .print-break-before {
            break-before: page;
            page-break-before: always;
          }
          .print-avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
      <div className="contract-print-container max-w-5xl mx-auto p-10">
        <div className="contract-print-sheet border border-slate-200 rounded-2xl overflow-hidden bg-white">
          <div className="contract-print-header px-8 py-6 border-b border-slate-200">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-3">
                  <img src={bridgeWarrantyLogoUrl} alt={BRAND.name} className="h-10 w-auto object-contain" />
                  {providerForContract?.logoUrl ? (
                    <img src={providerForContract.logoUrl} alt="" className="h-10 w-auto object-contain" />
                  ) : null}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-3">{BRAND.name}</div>
                <h1 className="text-xl font-bold font-display mt-1">Warranty Contract • {titleForCopyType(type)}</h1>
                <div className="text-sm text-slate-500 mt-1">Printed copy for records and audit trail.</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-slate-500">
                  {providerDisplay(selectedProduct?.providerId ?? contract.providerId)}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500">Warranty ID</div>
                <div className="text-lg font-semibold tracking-wide">{contract.warrantyId}</div>
                <div className="text-[11px] text-slate-500 mt-1">Contract #{contract.contractNumber}</div>
              </div>
            </div>
          </div>

          <div className="contract-print-body px-8 py-8">
            <div className="print-break-after">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
                <div className="contract-print-card rounded-xl border border-slate-200 p-5">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Contract Details</div>
                  <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
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
                      <div className="font-medium">{titleForCopyType(type)}</div>
                    </div>
                  </div>
                </div>

                <div className="contract-print-card rounded-xl border border-slate-200 p-5">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Customer Information</div>
                  <div className="mt-4 space-y-3 text-sm">
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

              <div className="contract-print-gap mt-7 contract-print-card rounded-xl border border-slate-200 p-5">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Plan & Pricing</div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-7 text-sm">
                  <div>
                    <div className="text-[11px] text-slate-500">Product</div>
                    <div className="font-medium">{selectedProduct?.name ?? "—"}</div>
                    <div className="text-[11px] text-slate-500 mt-1">Provider: {providerDisplay(selectedProduct?.providerId ?? contract.providerId)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Price</div>
                    <div className="font-medium">
                      {type === "provider"
                        ? money((contract.pricingDealerCostCents ?? 0) + (contract.addonTotalCostCents ?? 0))
                        : money((contract.pricingBasePriceCents ?? 0) + (contract.addonTotalRetailCents ?? 0))}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">Deductible: {money(contract.pricingDeductibleCents ?? undefined)}</div>
                  </div>
                </div>
                <div className="mt-3 text-[11px] text-slate-500">
                  Term: {contract.pricingTermMonths === null ? "Unlimited" : typeof contract.pricingTermMonths === "number" ? `${contract.pricingTermMonths} mo` : "—"} / {contract.pricingTermKm === null ? "Unlimited" : typeof contract.pricingTermKm === "number" ? `${contract.pricingTermKm} km` : "—"}
                </div>

                {Array.isArray((contract as any).addonSnapshot) && ((contract as any).addonSnapshot as any[]).length > 0 ? (
                  <div className="mt-3 text-[11px] text-slate-500">
                    Add-ons:
                    <div className="mt-1">
                      {(((contract as any).addonSnapshot as any[]) || []).map((a) => (
                        <div key={(a?.id ?? a?.name ?? Math.random()).toString()} className="flex items-center justify-between gap-3">
                          <div>
                            {(a?.name ?? "—").toString()}
                            <span className="text-slate-400"> • {addonPricingTypeLabel(a?.pricingType)}</span>
                          </div>
                          <div>
                            {money(type === "provider" ? ((a?.chosenPriceCents ?? a?.dealerCostCents ?? a?.basePriceCents ?? 0) as number) : ((a?.chosenPriceCents ?? a?.basePriceCents ?? 0) as number))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="contract-print-gap mt-7 contract-print-card rounded-xl border border-slate-200 p-5">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Vehicle Information</div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-5 text-sm">
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

              <div className="contract-print-gap mt-7 grid grid-cols-1 md:grid-cols-2 gap-7">
                <div className="contract-print-card rounded-xl border border-slate-200 p-5">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Dealer Signature</div>
                  <div className="mt-6 border-b border-slate-300" />
                  <div className="mt-2 grid grid-cols-2 gap-3 text-[11px] text-slate-500">
                    <div>Name / Title</div>
                    <div>Date</div>
                  </div>
                </div>
                <div className="contract-print-card rounded-xl border border-slate-200 p-5">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Customer Signature</div>
                  <div className="mt-6 border-b border-slate-300" />
                  <div className="mt-2 grid grid-cols-2 gap-3 text-[11px] text-slate-500">
                    <div>Signature</div>
                    <div>Date</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="contract-print-terms print-break-before print-avoid-break rounded-xl border border-slate-200 p-5 mt-7">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Terms & Conditions</div>
              {type === "customer" ? (
                <div className="mt-4">
                  <CustomerCopyTerms
                    platformName={BRAND.name}
                    providerName={providerDisplay(selectedProduct?.providerId ?? contract.providerId)}
                    productName={productName}
                    termMonthsLabel={termMonthsLabel}
                    termKmLabel={termKmLabel}
                    deductibleLabel={deductibleLabel}
                    coverageDetailsText={coverageDetailsText}
                    exclusionsText={exclusionsText}
                  />
                </div>
              ) : (
                <div className="mt-4 text-sm whitespace-pre-wrap leading-relaxed">{providerTerms}</div>
              )}
            </div>
          </div>

          <div className="px-8 py-5 border-t border-slate-200 text-[11px] text-slate-500">
            Generated by {BRAND.name} • Keep this copy for your records.
          </div>
        </div>
      </div>
    </div>
  );
}
