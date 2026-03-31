import { useEffect, useMemo } from "react";

import { useParams } from "react-router-dom";

import { useQuery } from "@tanstack/react-query";



import { getContractsApi } from "../lib/contracts/contracts";

import { getMarketplaceApi } from "../lib/marketplace/marketplace";

import { getProvidersApi } from "../lib/providers/providers";

import { getProductPricingApi } from "../lib/productPricing/productPricing";

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

  termsConditionsText?: string;

  claimsRepairsText?: string;

  providerResponsibilityText?: string;

  limitationLiabilityText?: string;

  customerAcknowledgementText?: string;

}) {

  const coverage =

    props.coverageDetailsText.trim() ||

    "Coverage details are provided by the Provider and may vary by plan. Refer to the Provider documentation for the complete schedule of coverages.";

  const exclusions =

    props.exclusionsText.trim() ||

    "Exclusions are set by the Provider and may include normal wear and tear, routine maintenance, cosmetic items, and damage caused by misuse or neglect.";



  const applyTokens = (raw: string) => {

    return raw

      .replaceAll("{{product_name}}", props.productName)

      .replaceAll("{{term_months}}", props.termMonthsLabel)

      .replaceAll("{{term_km}}", props.termKmLabel)

      .replaceAll("{{deductible}}", props.deductibleLabel)

      .replaceAll("{{coverage_details}}", coverage)

      .replaceAll("{{exclusions}}", exclusions)

      .replaceAll("{{provider_name}}", props.providerName);

  };



  const sectionText = (raw?: string) => {

    const t = (raw ?? "").trim();

    if (!t) return "";

    return applyTokens(t).trim();

  };



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



      {(() => {

        const t = sectionText(props.termsConditionsText);

        if (!t) return null;

        return <Section title="Terms & Conditions">{t}</Section>;

      })()}



      {(() => {

        const t = sectionText(props.claimsRepairsText);

        if (!t) return null;

        return <Section title="Claims / Repairs">{t}</Section>;

      })()}



      <Section title="Platform Disclaimer">

        {props.platformName} is a technology platform that markets and facilitates the sale of products and services on behalf of independent providers. Unless expressly stated otherwise in writing, {props.platformName} is not the obligor, administrator, insurer, or underwriter of any vehicle service contract.

      </Section>



      {(() => {

        const t = sectionText(props.providerResponsibilityText);

        if (!t) return null;

        return <Section title="Provider Responsibility">{t}</Section>;

      })()}



      {(() => {

        const t = sectionText(props.limitationLiabilityText);

        if (!t) return null;

        return <Section title="Limitation of Liability">{t}</Section>;

      })()}



      {(() => {

        const t = sectionText(props.customerAcknowledgementText);

        if (!t) return null;

        return <Section title="Customer Acknowledgement">{t}</Section>;

      })()}

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



function titleForCopyType(t: string) {

  const s = (t ?? "").trim().toLowerCase();

  if (s === "dealer") return "Dealer Copy";

  if (s === "provider") return "Provider Copy";

  return "Customer Copy";

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

  const productPricingApi = useMemo(() => getProductPricingApi(), []);



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



  const isGap = selectedProduct?.productType === "GAP";



  const pricingOptionsQuery = useQuery({

    queryKey: ["product-pricing-public", contract?.productId ?? ""],

    enabled: Boolean(contract?.productId),

    queryFn: () => productPricingApi.list({ productId: (contract?.productId ?? "").trim() }),

  });



  const pricingOptions = (pricingOptionsQuery.data ?? []) as Array<{ id: string; claimLimitCents?: number; termMonths: number | null }>;

  const selectedPricing = (() => {

    const pid = (contract?.productPricingId ?? "").trim();

    if (!pid) return undefined;

    return pricingOptions.find((p) => (p?.id ?? "").trim() === pid);

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



  const gapLtv = typeof selectedProduct?.coverageMaxLtvPercent === "number" ? selectedProduct?.coverageMaxLtvPercent : null;

  const gapMaxBenefitText = (() => {

    const t = (selectedProduct?.keyBenefits ?? "").trim();

    return t ? t : null;

  })();



  const GapRow = (p: { label: string; value?: string | null }) => {

    const v = (p.value ?? "").toString().trim();

    if (!v || v === "—") return null;

    const isLong = v.length > 40 || v.includes("\n");

    return (

      <div

        className={

          isLong

            ? "grid grid-cols-[max-content_1fr] items-start gap-2 text-sm leading-tight"

            : "grid grid-cols-[max-content_1fr] items-start gap-2 text-sm leading-tight"

        }

      >

        <div className="text-slate-700 whitespace-nowrap">{p.label}:</div>

        <div

          className={

            isLong

              ? "font-medium text-slate-900 text-left whitespace-pre-line break-words min-w-0"

              : "font-medium text-slate-900 text-left whitespace-nowrap min-w-0"

          }

        >

          {v}

        </div>

      </div>

    );

  };



  const GapBlock = (p: { title: string; rows: Array<React.ReactNode> }) => {

    const rows = (p.rows ?? []).filter(Boolean);

    if (rows.length === 0) return null;

    return (

      <div className="gap-block border border-slate-200">

        <div className="gap-block-title px-3 py-2 border-b border-slate-200">

          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-800">{p.title}</div>

        </div>

        <div className="gap-block-body px-2 py-2 space-y-2">{rows}</div>

      </div>

    );

  };



  const gapHeaderTitle = "GAP Waiver Agreement";

  const gapContractId = (contract.contractNumber || contract.warrantyId || "").trim();



  const providerBlock = GapBlock({

    title: "Provider (Obligor)",

    rows: [<GapRow key="provider-name" label="Provider Name" value={providerDisplay(selectedProduct?.providerId ?? contract.providerId)} />],

  });



  const customerBlock = GapBlock({

    title: "Contract Holder / Customer",

    rows: [

      <GapRow key="customer-name" label="Full Name" value={contract.customerName} />,

      <GapRow key="customer-address" label="Address" value={addressLine} />,

      <GapRow key="customer-phone" label="Phone" value={contract.customerPhone} />,

      <GapRow key="customer-email" label="Email" value={contract.customerEmail} />,

      <GapRow

        key="application-date"

        label="Application Date"

        value={contract.createdAt ? new Date(contract.createdAt).toLocaleDateString() : null}

      />,

    ],

  });



  const registeredVehicleBlock = GapBlock({

    title: "Vehicle Information",

    rows: [

      <GapRow key="vehicle-year" label="Year" value={(contract.vehicleYear ?? "").trim() || null} />,

      <GapRow key="vehicle-make" label="Make" value={(contract.vehicleMake ?? "").trim() || null} />,

      <GapRow key="vehicle-model" label="Model" value={(contract.vehicleModel ?? "").trim() || null} />,

      <GapRow key="vehicle-trim" label="Trim" value={(contract.vehicleTrim ?? "").trim() || null} />,

      <GapRow key="vehicle-vin" label="VIN" value={(contract.vin ?? "").trim() || null} />,

      typeof contract.vehicleMileageKm === "number" && Number.isFinite(contract.vehicleMileageKm) ? (

        <GapRow key="vehicle-odo" label="Current Odometer" value={`${contract.vehicleMileageKm.toLocaleString()} KM`} />

      ) : null,

    ],

  });



  const gapCoverageBlock = GapBlock({

    title: "GAP Coverage Details",

    rows: [

      gapLtv !== null ? <GapRow key="gap-ltv" label="Maximum Loan To Value (LTV)" value={`${gapLtv}%`} /> : null,

      typeof selectedPricing?.claimLimitCents === "number" ? (

        <GapRow key="gap-max-benefit" label="Maximum Benefit" value={money(selectedPricing.claimLimitCents)} />

      ) : null,

      typeof contract.pricingDeductibleCents === "number" ? (

        <GapRow key="gap-deductible" label="Deductible Coverage" value={money(contract.pricingDeductibleCents)} />

      ) : null,

      typeof contract.pricingTermMonths === "number" ? (

        <GapRow key="gap-term-months" label="Coverage Term" value={`${contract.pricingTermMonths} Months`} />

      ) : null,

      typeof contract.pricingTermKm === "number" ? (

        <GapRow key="gap-term-km" label="Coverage Term (KM)" value={`${contract.pricingTermKm.toLocaleString()} KM`} />

      ) : null,

      (() => {

        if (typeof contract.pricingTermMonths !== "number") return null;

        const base = contract.soldAt ?? contract.createdAt;

        if (!base) return null;

        const d = new Date(base);

        if (Number.isNaN(d.getTime())) return null;

        const end = new Date(d);

        end.setMonth(end.getMonth() + contract.pricingTermMonths);

        return <GapRow key="gap-exp" label="Expiration Date" value={end.toLocaleDateString()} />;

      })(),

      gapMaxBenefitText ? <GapRow key="gap-notes" label="Notes" value={gapMaxBenefitText} /> : null,

    ],

  });



  const eligibleClaimBlock = GapBlock({

    title: "Eligible Claim Event",

    rows: [

      <div key="eligible-claim" className="text-sm text-slate-800 leading-relaxed">

        Coverage applies when the vehicle is declared a <span className="font-semibold">Total Loss</span> by the primary auto insurance provider due to:

        <div className="mt-2">

          <div>✓ Collision</div>

          <div>✓ Theft</div>

          <div>✓ Comprehensive loss</div>

        </div>

      </div>,

    ],

  });



  const exclusionsBlock = GapBlock({

    title: "Exclusions Summary",

    rows: [

      exclusionsText ? (

        <div key="exclusions" className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">

          {exclusionsText}

        </div>

      ) : null,

    ],

  });



  const importantNoticeBlock = GapBlock({

    title: "Important Notice",

    rows: [

      <div key="important-notice" className="text-sm text-slate-700 leading-relaxed">

        Bridge Warranty Inc. operates solely as a technology marketplace facilitating the sale of financial protection products.

        <div className="mt-2">Bridge Warranty is NOT the obligor, insurer, or claims administrator under this contract.</div>

      </div>,

    ],

  });



  return (

    <div

      className="print-contract-root min-h-screen bg-white text-slate-900"

      style={{ fontFamily: '"Times New Roman", Times, serif' }}

    >

      <style>{`

        @media print {

          @page {

            size: A4;

            margin: 3mm;

          }



          body {

            -webkit-print-color-adjust: exact;

            print-color-adjust: exact;

          }



          .print-contract-root {

            background: white !important;

            font-family: "Times New Roman", Times, serif !important;

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

            font-size: 9px !important;

          }



          .gap-block-title {

            padding: 2mm 3mm !important;

          }



          .gap-block-body {

            padding: 2mm 3mm !important;

          }



          .gap-block-body .space-y-2 > :not([hidden]) ~ :not([hidden]) {

            margin-top: 3px !important;

          }



          .gap-agreement-container .mt-4 {

            margin-top: 6px !important;

          }



          .gap-agreement-container .mt-3 {

            margin-top: 4px !important;

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

            font-size: 8.25px !important;

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



          .contract-section {

            break-inside: avoid;

            page-break-inside: avoid;

          }



          .contract-hr {

            border-color: #e2e8f0 !important;

          }



          .print-grid-2 {

            display: grid !important;

            grid-template-columns: 1fr 1fr !important;

            column-gap: 24px !important;

          }



          .print-col-divider {

            border-left: 1px solid #e2e8f0 !important;

            padding-left: 24px !important;

          }



          .print-no-stack {

            margin-top: 0 !important;

          }



          .gap-agreement-container {

            max-width: 820px;

            margin: 0 auto;

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

      {isGap ? (

        <div className="contract-print-container gap-agreement-container mx-auto p-4 md:p-8">

          <div className="border border-slate-200 bg-white px-4 py-4 md:px-6 md:py-6">

            <div className="flex items-start justify-between gap-6">

              <div>

                <img src={bridgeWarrantyLogoUrl} alt={BRAND.name} className="h-10 w-auto object-contain" />

                <div className="text-[11px] uppercase tracking-widest text-slate-600 mt-3">{BRAND.name} Marketplace</div>

              </div>

              <div className="text-right">

                <div className="text-[11px] uppercase tracking-widest text-slate-600">{gapHeaderTitle}</div>

                {gapContractId ? (

                  <div className="mt-1 text-[12px] text-slate-800">

                    <span className="text-slate-500">Contract ID:</span> <span className="font-semibold">{gapContractId}</span>

                  </div>

                ) : null}

              </div>

            </div>



            <div className="mt-4">

              <div className="border-t contract-hr" />

            </div>



            {providerBlock ? <div className="mt-4">{providerBlock}</div> : null}



            {customerBlock || gapCoverageBlock || registeredVehicleBlock || eligibleClaimBlock ? (

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-0 print-grid-2">

                <div className="pr-0 md:pr-4">

                  {customerBlock ? <div>{customerBlock}</div> : null}

                  {registeredVehicleBlock ? <div className="mt-3">{registeredVehicleBlock}</div> : null}

                </div>

                <div className="mt-3 md:mt-0 print-col-divider print-no-stack">

                  {gapCoverageBlock ? <div>{gapCoverageBlock}</div> : null}

                  {eligibleClaimBlock ? <div className="mt-3">{eligibleClaimBlock}</div> : null}

                </div>

              </div>

            ) : null}



            {exclusionsBlock || importantNoticeBlock ? (

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-0 print-grid-2">

                {exclusionsBlock ? <div className={importantNoticeBlock ? "pr-0 md:pr-4" : undefined}>{exclusionsBlock}</div> : null}

                {importantNoticeBlock ? (

                  <div className={exclusionsBlock ? "mt-3 md:mt-0 print-col-divider print-no-stack" : undefined}>{importantNoticeBlock}</div>

                ) : null}

              </div>

            ) : null}



            <div className="mt-4 border-t contract-hr pt-4">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                <div>

                  <div className="text-[11px] font-bold uppercase tracking-widest text-slate-800">Signatures</div>

                  <div className="mt-3 space-y-2 text-sm text-slate-700">

                    <div className="flex items-center gap-3">

                      <div className="w-44">Customer Signature:</div>

                      <div className="flex-1 border-b contract-hr" />

                    </div>

                    <div className="flex items-center gap-3">

                      <div className="w-44">Dealer Representative:</div>

                      <div className="flex-1 border-b contract-hr" />

                    </div>

                  </div>

                </div>

                <div className="text-right text-[11px] text-slate-500">

                  <div>Document Version: BW-GAP-2026-V1</div>

                  <div className="mt-1">{titleForCopyType(type)}</div>

                </div>

              </div>

            </div>

          </div>

        </div>

      ) : (

        <div className="contract-print-container max-w-4xl mx-auto p-10">

          <div className="contract-print-sheet border border-slate-200 rounded-none overflow-hidden bg-white">

            <div className="contract-print-header px-8 pt-8 pb-5">

              <div className="flex items-start justify-between gap-8">

                <div>

                  <div className="flex items-start">

                    <img src={bridgeWarrantyLogoUrl} alt={BRAND.name} className="h-16 w-auto object-contain" />

                  </div>

                  <h1 className="text-sm font-semibold tracking-tight mt-2">Warranty Contract • {titleForCopyType(type)}</h1>

                  <div className="text-xs text-slate-500 mt-1">Printed copy for records and audit trail.</div>

                </div>



                <div className="text-right">

                  {providerForContract?.logoUrl ? (

                    <div className="flex justify-end">

                      <img src={providerForContract.logoUrl} alt="" className="h-10 w-auto object-contain" />

                    </div>

                  ) : null}

                  <div className="text-[11px] uppercase tracking-widest text-slate-500">Warranty ID</div>

                  <div className="text-xl font-semibold tracking-wide mt-1">{contract.warrantyId}</div>

                  <div className="text-[12px] text-slate-500 mt-2">Contract #{contract.contractNumber}</div>

                </div>

              </div>

            </div>



            <div className="contract-print-body px-8 pb-8">

              <div>

                <div className="contract-section border-t contract-hr pt-5">

                  <div className="text-[11px] font-bold uppercase tracking-widest text-slate-700">Contract Details</div>

                  <div className="mt-3 border-b contract-hr" />

                  <div className="mt-4 grid grid-cols-2 gap-x-12 gap-y-2 text-sm">

                    <div className="flex items-center justify-between gap-6">

                      <div className="text-slate-600">Status</div>

                      <div className="font-medium uppercase">{contract.status}</div>

                    </div>

                    <div className="flex items-center justify-between gap-6">

                      <div className="text-slate-600">Created</div>

                      <div className="font-medium">{new Date(contract.createdAt).toLocaleDateString()}</div>

                    </div>

                    <div className="flex items-center justify-between gap-6">

                      <div className="text-slate-600">Last Updated</div>

                      <div className="font-medium">{new Date(contract.updatedAt).toLocaleDateString()}</div>

                    </div>

                    <div className="flex items-center justify-between gap-6">

                      <div className="text-slate-600">Copy Type</div>

                      <div className="font-medium">{titleForCopyType(type)}</div>

                    </div>

                  </div>

                </div>



                <div className="contract-section border-t contract-hr pt-5 mt-6">

                  <div className="text-[11px] font-bold uppercase tracking-widest text-slate-700">Customer Information</div>

                  <div className="mt-3 border-b contract-hr" />

                  <div className="mt-4 grid grid-cols-2 gap-0 text-sm print-grid-2">

                    <div className="space-y-4 pr-8">

                      <div>

                        <div className="text-slate-600">Name</div>

                        <div className="font-medium">{contract.customerName || "—"}</div>

                      </div>

                      <div>

                        <div className="text-slate-600">Email</div>

                        <div className="font-medium">{contract.customerEmail || "—"}</div>

                      </div>

                    </div>

                    <div className="space-y-4 print-col-divider print-no-stack">

                      <div>

                        <div className="text-slate-600">Phone</div>

                        <div className="font-medium">{contract.customerPhone || "—"}</div>

                      </div>

                      <div>

                        <div className="text-slate-600">Address</div>

                        <div className="font-medium">{addressLine || "—"}</div>

                      </div>

                    </div>

                  </div>

                </div>



                <div className="contract-section border-t contract-hr pt-5 mt-6">

                  <div className="text-[11px] font-bold uppercase tracking-widest text-slate-700">Plan & Pricing</div>

                  <div className="mt-3 border-b contract-hr" />

                  <div className="mt-4 grid grid-cols-2 gap-0 text-sm print-grid-2">

                    <div className="space-y-3 pr-8">

                      <div>

                        <div className="text-slate-600">Product</div>

                        <div className="font-medium">{selectedProduct?.name ?? "—"}</div>

                      </div>

                      <div>

                        <div className="text-slate-600">Price</div>

                        <div className="font-medium">

                          {type === "provider"

                            ? money((contract.pricingDealerCostCents ?? 0) + (contract.addonTotalCostCents ?? 0))

                            : money((contract.pricingBasePriceCents ?? 0) + (contract.addonTotalRetailCents ?? 0))}

                        </div>

                      </div>

                      <div>

                        <div className="text-slate-600">Deductible</div>

                        <div className="font-medium">{money(contract.pricingDeductibleCents ?? undefined)}</div>

                      </div>

                      <div>

                        <div className="text-slate-600">Term</div>

                        <div className="font-medium">

                          {contract.pricingTermMonths === null

                            ? "Unlimited"

                            : typeof contract.pricingTermMonths === "number"

                              ? `${contract.pricingTermMonths} mo`

                              : "—"} / {contract.pricingTermKm === null

                            ? "Unlimited"

                            : typeof contract.pricingTermKm === "number"

                              ? `${contract.pricingTermKm} km`

                              : "—"}

                        </div>

                      </div>

                    </div>

                    <div className="space-y-3 print-col-divider print-no-stack">

                      <div>

                        <div className="text-slate-600">Provider</div>

                        <div className="font-medium">{providerDisplay(selectedProduct?.providerId ?? contract.providerId)}</div>

                      </div>

                      <div>

                        <div className="text-slate-600">Warranty ID</div>

                        <div className="font-medium">{contract.warrantyId || "—"}</div>

                      </div>

                      <div>

                        <div className="text-slate-600">Contract #</div>

                        <div className="font-medium">{contract.contractNumber || "—"}</div>

                      </div>

                    </div>

                  </div>

                </div>



                <div className="contract-section border-t contract-hr pt-5 mt-6">

                  <div className="text-[11px] font-bold uppercase tracking-widest text-slate-700">Vehicle Information</div>

                  <div className="mt-3 border-b contract-hr" />



                  <div className="mt-4 grid grid-cols-2 gap-0 text-sm print-grid-2">

                    <div className="space-y-3 pr-8">

                      <div>

                        <div className="text-slate-600">VIN</div>

                        <div className="font-semibold text-slate-900">{contract.vin || "—"}</div>

                      </div>

                      <div>

                        <div className="text-slate-600">Year/Make/Model</div>

                        <div className="font-medium">{vehicleLine || "—"}</div>

                      </div>

                      <div>

                        <div className="text-slate-600">Body/Class</div>

                        <div className="font-medium">{contract.vehicleBodyClass || "—"}</div>

                      </div>

                    </div>



                    <div className="space-y-3 print-col-divider print-no-stack">

                      <div>

                        <div className="text-slate-600">Mileage (km)</div>

                        <div className="font-medium">

                          {typeof contract.vehicleMileageKm === "number" && Number.isFinite(contract.vehicleMileageKm)

                            ? contract.vehicleMileageKm.toLocaleString()

                            : "—"}

                        </div>

                      </div>

                      <div>

                        <div className="text-slate-600">Engine</div>

                        <div className="font-medium">{contract.vehicleEngine || "—"}</div>

                      </div>

                      <div>

                        <div className="text-slate-600">Transmission</div>

                        <div className="font-medium">{contract.vehicleTransmission || "—"}</div>

                      </div>

                    </div>

                  </div>

                </div>



                <div className="contract-section border-t contract-hr pt-5 mt-6 grid grid-cols-1 md:grid-cols-2 gap-12">

                  <div>

                    <div className="text-[11px] font-bold uppercase tracking-widest text-slate-700">Dealer Signature</div>

                    <div className="mt-3 border-b contract-hr" />

                    <div className="mt-4 text-sm text-slate-600">

                      <div className="flex items-center justify-between gap-6">

                        <div className="min-w-0">Name / Title:</div>

                        <div className="flex-1 border-b contract-hr" />

                      </div>

                      <div className="mt-4 flex items-center justify-between gap-6">

                        <div className="min-w-0">Signature:</div>

                        <div className="flex-1 border-b contract-hr" />

                      </div>

                    </div>

                  </div>



                  <div>

                    <div className="text-[11px] font-bold uppercase tracking-widest text-slate-700">Customer Signature</div>

                    <div className="mt-3 border-b contract-hr" />

                    <div className="mt-4 text-sm text-slate-600">

                      <div className="flex items-center justify-between gap-6">

                        <div className="min-w-0">Signature:</div>

                        <div className="flex-1 border-b contract-hr" />

                      </div>

                      <div className="mt-4 flex items-center justify-between gap-6">

                        <div className="min-w-0">Date:</div>

                        <div className="flex-1 border-b contract-hr" />

                      </div>

                    </div>

                  </div>

                </div>

              </div>



              <div className="contract-print-terms print-break-before print-avoid-break border border-slate-200 p-5 mt-7">

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

                      termsConditionsText={providerForContract?.termsConditionsText}

                      claimsRepairsText={providerForContract?.claimsRepairsText}

                      providerResponsibilityText={providerForContract?.providerResponsibilityText}

                      limitationLiabilityText={providerForContract?.limitationLiabilityText}

                      customerAcknowledgementText={providerForContract?.customerAcknowledgementText}

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

      )}

    </div>

  );

}

