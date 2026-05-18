import type { ReactNode } from "react";

type CustomerInfo = {
  firstName?: string;
  lastName?: string;
  initials?: string;
  email?: string;
  phone?: string;
  businessPhone?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
};

type DealerInfo = {
  name?: string;
  phone?: string;
  address?: string;
};

type VehicleInfo = {
  year?: number | string | null;
  make?: string | null;
  model?: string | null;
  vin?: string;
  mileageKm?: string;
  type?: string;
  colour?: string;
  fuel?: string;
  transmission?: string;
  engineSize?: string;
  bodyType?: string;
  lienholder?: string;
};

type WarrantyInfo = {
  productName?: string;
  providerName?: string;
  termLabel?: string;
  deductibleLabel?: string;
  basePriceLabel?: string;
  totalPriceLabel?: string;
  startDateLabel?: string;
};

type CoverageAddOn = {
  name: string;
  priceLabel?: string;
};

type CoverageInfo = {
  title?: string;
  productType?: string;
  components: string[];
  addOns: CoverageAddOn[];
};

type ContractTermSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export type BridgeWarrantyApplicationContractProps = {
  brandName: string;
  contractNumber: string;
  issueDate: string;
  purchaseDate: string;
  expiryDate?: string;
  customer: CustomerInfo;
  dealer: DealerInfo;
  vehicle: VehicleInfo;
  warranty: WarrantyInfo;
  coverage: CoverageInfo;
  termsSections?: Array<{ title: string; content: string }>;
  exclusions?: string[];
};

function value(text?: string | number | null): string {
  const normalized = String(text ?? "").trim();
  return normalized || "N/A";
}

function nonEmptyUnique(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((item) => item.trim())
    .filter((item) => {
      if (!item || seen.has(item.toLowerCase())) return false;
      seen.add(item.toLowerCase());
      return true;
    });
}

function normalizedProductType(type?: string): string {
  return (type ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
}

function productFamily(type?: string): "vsc" | "gap" | "tireRim" | "ppf" | "ceramic" | "undercoating" | "key" | "dent" | "other" {
  const normalized = normalizedProductType(type);
  if (!normalized) return "vsc";
  if (["vsc", "extended warranty", "warranty"].includes(normalized)) return "vsc";
  if (normalized === "gap") return "gap";
  if (["tire & rim", "tire rim", "tire and rim"].includes(normalized)) return "tireRim";
  if (normalized === "ppf" || normalized.includes("paint protection")) return "ppf";
  if (normalized.includes("ceramic")) return "ceramic";
  if (normalized.includes("undercoating")) return "undercoating";
  if (normalized.includes("key")) return "key";
  if (normalized.includes("dent")) return "dent";
  return "other";
}

function productLabel(type?: string, fallbackTitle?: string): string {
  switch (productFamily(type)) {
    case "vsc":
      return "extended limited warranty";
    case "gap":
      return "GAP protection";
    case "tireRim":
      return "road hazard tire and rim protection";
    case "ppf":
      return "paint protection film";
    case "ceramic":
      return "ceramic coating protection";
    case "undercoating":
      return "undercoating protection";
    case "key":
      return "key replacement protection";
    case "dent":
      return "dent repair protection";
    case "other":
      return value(fallbackTitle).toLowerCase() === "n/a" ? "vehicle protection product or service" : value(fallbackTitle);
  }
}

function applicationTitle(type?: string): string {
  switch (productFamily(type)) {
    case "vsc":
      return "EXTENDED LIMITED WARRANTY APPLICATION";
    case "gap":
      return "GAP PROTECTION APPLICATION";
    case "tireRim":
      return "TIRE AND RIM PROTECTION APPLICATION";
    case "ppf":
      return "PAINT PROTECTION FILM APPLICATION";
    case "ceramic":
      return "CERAMIC COATING APPLICATION";
    case "undercoating":
      return "UNDERCOATING PROTECTION APPLICATION";
    case "key":
      return "KEY REPLACEMENT APPLICATION";
    case "dent":
      return "DENT REPAIR APPLICATION";
    case "other":
      return "PROTECTION PRODUCT APPLICATION";
  }
}

function documentSubtitle(type?: string): string {
  switch (productFamily(type)) {
    case "vsc":
      return "Vehicle Service Contract";
    case "gap":
      return "GAP Protection Contract";
    case "tireRim":
      return "Tire and Rim Protection Contract";
    case "ppf":
      return "Paint Protection Film Contract";
    case "ceramic":
      return "Ceramic Coating Contract";
    case "undercoating":
      return "Undercoating Protection Contract";
    case "key":
      return "Key Replacement Contract";
    case "dent":
      return "Dent Repair Contract";
    case "other":
      return "Protection Product Contract";
  }
}

function SectionBar({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[#073f82] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white">
      {children}
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children?: ReactNode; className?: string }) {
  return (
    <div className={`min-h-[28px] border-b border-r border-slate-400 px-1.5 py-0.5 ${className}`}>
      <div className="text-[7px] font-semibold leading-none text-slate-700">{label}</div>
      <div className="mt-0.5 min-h-[12px] text-[8px] font-medium leading-tight text-slate-950">{children ?? "N/A"}</div>
    </div>
  );
}

function CheckLine({ checked = true, children }: { checked?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-start gap-1 text-[8px] leading-tight text-slate-950">
      <span className="mt-[1px] inline-flex h-2.5 w-2.5 items-center justify-center border border-slate-500 bg-white text-[7px] leading-none">
        {checked ? "x" : ""}
      </span>
      <span>{children}</span>
    </div>
  );
}

const BRIDGE_WARRANTY_ADMIN_TERMS: ContractTermSection[] = [
  {
    title: "Product And Provider Terms",
    paragraphs: [
      "This application and any issued contract document the selected vehicle protection product or service. Bridge Warranty administers the marketplace and contract documentation. Product obligations, claim decisions, benefit approvals, and payments remain subject to the selected provider terms.",
    ],
  },
  {
    title: "Definitions",
    paragraphs: [
      "Agreement means the issued service contract, this application, the selected provider terms, and any approved endorsements or add-ons. Covered Vehicle means the vehicle identified by VIN on the application. Provider means the company responsible for the selected protection product.",
    ],
  },
  {
    title: "Claims And Authorization",
    paragraphs: [
      "The customer must obtain provider authorization before repairs begin. Unauthorized repairs, teardown, diagnosis, storage, or replacement work may be declined. The repair facility may be required to provide estimates, photos, maintenance records, diagnostic reports, and failed parts for inspection.",
      "Bridge Warranty may assist with routing documentation, but claim approval and payment are controlled by the provider terms.",
    ],
  },
  {
    title: "Customer Responsibilities",
    paragraphs: [
      "The customer is responsible for maintaining the vehicle according to manufacturer recommendations, keeping maintenance records, protecting the vehicle from further damage after a failure, and paying deductibles, taxes, betterment, non-covered diagnosis, and any amount above provider limits.",
    ],
  },
  {
    title: "General Exclusions",
    paragraphs: [
      "Coverage does not apply to pre-existing conditions, failures caused by misuse, neglect, collision, overheating, contamination, lack of maintenance, unauthorized modifications, commercial/racing use unless accepted by the provider, or repairs started without authorization.",
    ],
    bullets: [
      "Normal maintenance items, fluids, filters, batteries, belts, hoses, brake friction material, tires, glass, trim, upholstery, and cosmetic items are excluded unless specifically listed as covered.",
      "Diagnostic charges, teardown, rental, towing, lodging, and other incidental expenses are excluded unless the selected benefit expressly includes them.",
      "Consequential damage, loss of use, loss of income, diminished value, and penalties are excluded to the fullest extent allowed by applicable law.",
    ],
  },
  {
    title: "Limits Of Liability",
    paragraphs: [
      "The provider's liability is limited to the benefits, per-claim caps, aggregate caps, deductibles, labour rates, part rules, and term limits stated in the selected provider terms. Bridge Warranty is not responsible for any amount declined by the provider or outside the selected product terms.",
    ],
  },
  {
    title: "Cancellation And Transfer",
    paragraphs: [
      "Cancellation, refund, transfer, and reinstatement rights are governed by the selected provider terms and applicable law. Any approved refund may be reduced by earned coverage, claims paid, administrative fees, remittances, or amounts owed to a lienholder.",
    ],
  },
  {
    title: "Privacy And Consent",
    paragraphs: [
      "The customer authorizes Bridge Warranty, the dealership, the provider, and repair facilities to collect, use, and exchange information needed to administer this application, verify eligibility, process claims, support audits, and communicate about the contract.",
    ],
  },
];

function selectedProductTerms(props: BridgeWarrantyApplicationContractProps): ContractTermSection[] {
  const productName = value(props.coverage.title ?? props.warranty.productName);
  const type = props.coverage.productType;
  const label = productLabel(type, productName);
  const components = nonEmptyUnique(props.coverage.components);
  const addOns = props.coverage.addOns
    .map((addOn) => `${addOn.name.trim()}${addOn.priceLabel ? ` - ${addOn.priceLabel.trim()}` : ""}`)
    .filter((line) => line.trim().length > 0);

  const productScopeBullets: string[] = [];
  switch (productFamily(type)) {
    case "vsc":
      productScopeBullets.push(
        "Coverage is for covered mechanical or electrical breakdowns listed by component category and provider terms.",
        "Normal maintenance, wear items, cosmetic items, and non-covered diagnosis apply only if the provider terms expressly include them.",
      );
      break;
    case "gap":
      productScopeBullets.push(
        "Benefits relate to an eligible finance or lease deficiency after a covered total loss, subject to the provider terms.",
        "This product does not cover mechanical repairs, maintenance, cosmetic repairs, or vehicle service work.",
      );
      break;
    case "tireRim":
      productScopeBullets.push(
        "Benefits relate to eligible tire and rim repair or replacement caused by covered road hazard events.",
        "Mounting, balancing, valve stems, towing, cosmetic rim repair, or replacement limits apply only when shown on the application or provider terms.",
      );
      break;
    case "ppf":
      productScopeBullets.push(
        "Benefits relate to eligible paint protection film products and services shown on the application and provider terms.",
        "Coverage is limited to the protected areas, installation requirements, care requirements, and remedy limits stated by the provider.",
      );
      break;
    case "ceramic":
      productScopeBullets.push(
        "Benefits relate to eligible ceramic coating products and services shown on the application and provider terms.",
        "Coverage is limited to approved surfaces, maintenance requirements, inspection rules, and remedy limits stated by the provider.",
      );
      break;
    case "undercoating":
      productScopeBullets.push(
        "Benefits relate to eligible undercoating or corrosion protection products and services shown on the application and provider terms.",
        "Coverage is limited by application requirements, inspection rules, excluded corrosion causes, and remedy limits stated by the provider.",
      );
      break;
    case "key":
      productScopeBullets.push(
        "Benefits relate to eligible key, remote, fob, programming, and replacement services shown on the application and provider terms.",
        "Coverage is limited by claim frequency, replacement limits, locksmith rules, programming rules, and proof requirements stated by the provider.",
      );
      break;
    case "dent":
      productScopeBullets.push(
        "Benefits relate to eligible paintless dent repair or dent repair services shown on the application and provider terms.",
        "Coverage is limited by dent size, location, paint condition, panel eligibility, repair method, and provider remedy limits.",
      );
      break;
    case "other":
      productScopeBullets.push(
        "Benefits apply only to the selected product or service shown on the application and in the provider terms.",
        "Coverage, eligibility, claim requirements, exclusions, and remedy limits are controlled by the provider terms.",
      );
      break;
  }

  return [
    {
      title: "Selected Product And Services",
      paragraphs: [
        `This contract is for ${productName}, a ${label}. The selected term, deductible, selling price, vehicle information, provider, and add-ons shown on the application form part of the contract record.`,
      ],
      bullets: productScopeBullets,
    },
    {
      title: "Selected Coverage Categories",
      paragraphs: [
        components.length > 0
          ? "The following coverage categories were selected or supplied by the product record for this contract."
          : "No component categories were supplied by the product record for this contract. The selected provider terms remain the controlling coverage source.",
      ],
      bullets: components.length > 0 ? components : undefined,
    },
    {
      title: "Selected Add-Ons",
      paragraphs: [
        addOns.length > 0
          ? "The following add-ons were selected for this contract and are included in the printed price snapshot."
          : "No optional add-ons were selected for this contract.",
      ],
      bullets: addOns.length > 0 ? addOns : undefined,
    },
  ];
}

function bridgeWarrantyTerms(props: BridgeWarrantyApplicationContractProps): ContractTermSection[] {
  const [productAndProvider, definitions, ...remainingAdminTerms] = BRIDGE_WARRANTY_ADMIN_TERMS;
  return [
    productAndProvider,
    definitions,
    ...selectedProductTerms(props),
    ...remainingAdminTerms,
  ];
}

function TermsPageHeader({ brandName, contractNumber, subtitle }: { brandName: string; contractNumber: string; subtitle: string }) {
  return (
    <div className="mb-3 border-b border-slate-300 pb-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[12px] font-extrabold text-[#073f82]">{brandName}</div>
          <div className="text-[8px] text-slate-600">{subtitle}</div>
        </div>
        <div className="text-right text-[8px] text-slate-600">
          <div>Application / Contract #</div>
          <div className="font-bold text-slate-900">{contractNumber}</div>
        </div>
      </div>
    </div>
  );
}

function ContractTermBlock({ section }: { section: ContractTermSection }) {
  return (
    <section className="mb-2 break-inside-avoid">
      <div className="mb-1 bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[#073f82]">
        {section.title}
      </div>
      <div className="space-y-1 px-1 text-[8px] leading-snug text-slate-800">
        {section.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {section.bullets?.length ? (
          <ul className="list-disc pl-4">
            {section.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

export function BridgeWarrantyApplicationContract(props: BridgeWarrantyApplicationContractProps) {
  const customerName = `${props.customer.firstName ?? ""} ${props.customer.lastName ?? ""}`.trim();
  const vehicleLabel = [props.vehicle.year, props.vehicle.make, props.vehicle.model].map(value).filter((v) => v !== "N/A").join(" ");
  const coverageTitle = value(props.coverage.title ?? props.warranty.productName).toUpperCase();
  const productType = props.coverage.productType;
  const printedApplicationTitle = applicationTitle(productType);
  const printedDocumentSubtitle = documentSubtitle(productType);
  const terms = bridgeWarrantyTerms(props);
  const hasProviderDetails = (props.termsSections?.length ?? 0) > 0 || (props.exclusions?.length ?? 0) > 0;

  return (
    <div className="print-contract-root bg-white text-slate-950">
      <div className="mx-auto max-w-[190mm] bg-white p-8 print:p-0">
        <div className="text-[8px] leading-tight">
          <div className="grid grid-cols-[1fr_1.2fr_1fr] items-start border-b border-slate-400 pb-1.5">
            <div className="text-center">
              <div className="text-[12px] font-extrabold text-[#073f82]">{props.brandName}</div>
              <div className="text-[16px] font-bold text-[#e340a1]">{props.contractNumber}</div>
            </div>
            <div className="text-center text-[7px] leading-tight">
              <div className="font-bold">Administered by {props.brandName} Corp.</div>
              <div>Toronto, ON</div>
              <div>Canada</div>
              <div>www.bridgewarranty.com</div>
            </div>
            <div className="text-[7px] leading-tight">
              <div>Tel: 416-000-0000</div>
              <div>Fax: 416-000-0000</div>
              <div>Toll Free: 1-866-000-0000</div>
              <div>Email: info@bridgewarranty.com</div>
              <div>Issued: {props.issueDate}</div>
            </div>
          </div>

          <div className="mt-1 text-center text-[12px] font-extrabold uppercase tracking-wide text-[#073f82]">
            {printedApplicationTitle}
          </div>

          <div className="mt-1 grid grid-cols-[1fr_38mm] gap-2">
            <div>
              <SectionBar>CUSTOMER / LESSEE INFORMATION</SectionBar>
              <div className="grid grid-cols-12 border-l border-t border-slate-400">
                <Field label="Last Name:" className="col-span-4">{value(props.customer.lastName)}</Field>
                <Field label="First Name:" className="col-span-4">{value(props.customer.firstName)}</Field>
                <Field label="Initials:" className="col-span-4">{value(props.customer.initials)}</Field>
                <Field label="Address:" className="col-span-6">{value(props.customer.address)}</Field>
                <Field label="City:" className="col-span-3">{value(props.customer.city)}</Field>
                <Field label="Province:" className="col-span-3">{value(props.customer.province)}</Field>
                <Field label="Postal Code:" className="col-span-3">{value(props.customer.postalCode)}</Field>
                <Field label="Home phone:" className="col-span-3">{value(props.customer.phone)}</Field>
                <Field label="Business phone:" className="col-span-3">{value(props.customer.businessPhone)}</Field>
                <Field label="Email:" className="col-span-3">{value(props.customer.email)}</Field>
              </div>

              <SectionBar>DEALERSHIP / VEHICLE INFORMATION</SectionBar>
              <div className="grid grid-cols-12 border-l border-t border-slate-400">
                <Field label="Dealership Name:" className="col-span-5">{value(props.dealer.name)}</Field>
                <Field label="Phone:" className="col-span-3">{value(props.dealer.phone)}</Field>
                <Field label="Vehicle Type:" className="col-span-4">{value(props.vehicle.type ?? "Personal")}</Field>
                <Field label="Year:" className="col-span-2">{value(props.vehicle.year)}</Field>
                <Field label="Make:" className="col-span-3">{value(props.vehicle.make)}</Field>
                <Field label="Model:" className="col-span-3">{value(props.vehicle.model)}</Field>
                <Field label="Odometer:" className="col-span-2">{value(props.vehicle.mileageKm)}</Field>
                <Field label="Purchase Price:" className="col-span-2">{value(props.warranty.totalPriceLabel)}</Field>
                <Field label="Fuel:" className="col-span-2">{value(props.vehicle.fuel)}</Field>
                <Field label="Transmission:" className="col-span-3">{value(props.vehicle.transmission)}</Field>
                <Field label="Engine Size:" className="col-span-2">{value(props.vehicle.engineSize)}</Field>
                <Field label="Body Type:" className="col-span-3">{value(props.vehicle.bodyType ?? props.vehicle.type ?? vehicleLabel)}</Field>
                <Field label="Colour:" className="col-span-2">{value(props.vehicle.colour)}</Field>
                <Field label="V.I.N.:" className="col-span-8">{value(props.vehicle.vin)}</Field>
                <Field label="Lienholder:" className="col-span-4">{value(props.vehicle.lienholder)}</Field>
              </div>

              <SectionBar>FACTORY WARRANTY (IF STILL IN EFFECT)</SectionBar>
              <div className="grid grid-cols-12 border-l border-t border-slate-400">
                <Field label="Type of Coverage:" className="col-span-4">N/A</Field>
                <Field label="Term of Coverage:" className="col-span-4">{value(props.warranty.termLabel)}</Field>
                <Field label="In Service Date:" className="col-span-4">{value(props.warranty.startDateLabel)}</Field>
              </div>

              <SectionBar>COST OF COVERAGE</SectionBar>
              <div className="grid grid-cols-12 border-l border-t border-slate-400">
                <Field label="Coverage price:" className="col-span-3">{value(props.warranty.basePriceLabel)}</Field>
                <Field label="HST:" className="col-span-3">$0.00</Field>
                <Field label="HST Exempt:" className="col-span-3">No</Field>
                <Field label="Coverage Total:" className="col-span-3">{value(props.warranty.totalPriceLabel)}</Field>
              </div>

              <SectionBar>CUSTOMER ACKNOWLEDGMENT</SectionBar>
              <div className="border border-t-0 border-slate-400 bg-slate-200 px-2 py-1.5 text-[7.5px] leading-snug">
                <div>- I acknowledge that I have read, reviewed, and understood this Bridge Warranty application and the terms provided by the product provider.</div>
                <div>- I confirm that all information provided on this application is true, complete, and accurate to the best of my knowledge.</div>
                <div>- I understand that this agreement documents the selected protection product or service and is governed by the provider terms.</div>
                <div>- I authorize Bridge Warranty and the listed provider to process this application and related contract documents.</div>
                <div>- I understand that claims, approvals, and payments are administered according to the provider terms and conditions.</div>
              </div>
            </div>

            <aside className="bg-slate-200 p-1.5">
              <div className="bg-[#073f82] px-1.5 py-1 text-center text-[8px] font-extrabold uppercase leading-tight text-white">
                {value(props.warranty.termLabel)}
                <br />
                <div>{coverageTitle}</div>
                {value(props.warranty.deductibleLabel)} Deductible
              </div>
              <div className="mt-1.5 space-y-1">
                {props.coverage.components.length > 0 ? (
                  props.coverage.components.map((component) => <CheckLine key={component}>{component}</CheckLine>)
                ) : (
                  <CheckLine checked={false}>Coverage components listed in provider terms</CheckLine>
                )}
              </div>
              <div className="mt-2 bg-[#073f82] px-1.5 py-1 text-[8px] font-extrabold uppercase text-white">
                Additional Options:
              </div>
              <div className="mt-1 space-y-1">
                {props.coverage.addOns.length > 0 ? (
                  props.coverage.addOns.map((addOn) => (
                    <CheckLine key={addOn.name}>{addOn.name}{addOn.priceLabel ? ` - ${addOn.priceLabel}` : ""}</CheckLine>
                  ))
                ) : (
                  <CheckLine checked={false}>No selected add-ons</CheckLine>
                )}
              </div>
            </aside>
          </div>

          <div className="mt-2 grid grid-cols-[1fr_1fr] items-end gap-6 text-[8px]">
            <div>
              <div>DATE OF PURCHASE: <span className="font-semibold">{value(props.purchaseDate)}</span></div>
              <div className="mt-1.5 flex items-end gap-2">
                <span>SELLING DEALER:</span>
                <span className="min-w-[150px] border-b border-slate-800 px-2 pb-0.5 font-semibold">{value(props.dealer.name)}</span>
              </div>
            </div>
            <div className="text-right">
              <div>EXPIRY DATE: <span className="font-semibold">{value(props.expiryDate)}</span></div>
              <div className="mt-2 flex items-end justify-end gap-2">
                <span>APPLICANT:</span>
                <span className="inline-block w-36 border-b border-slate-800">&nbsp;</span>
              </div>
              <div className="mt-1 text-[7px]">Print Name: {value(customerName)}</div>
            </div>
          </div>

          <div className="mt-2 text-[7px] text-slate-700">
            This application is issued through {props.brandName}. Product obligations, claims decisions, and benefit payments remain subject to the provider terms and conditions.
          </div>
        </div>

        <div className="mt-4 text-[8px] leading-tight print:mt-0 print:break-before-page">
          <TermsPageHeader brandName={props.brandName} contractNumber={props.contractNumber} subtitle={printedDocumentSubtitle} />
          <div className="mb-2 text-center text-[13px] font-extrabold uppercase tracking-wide text-[#073f82]">
            Bridge Warranty Product Terms
          </div>
          <div className="grid grid-cols-2 gap-x-5">
            {terms.map((section) => (
              <ContractTermBlock key={section.title} section={section} />
            ))}
          </div>
          <div className="mt-2 border-t border-slate-300 pt-1.5 text-[7px] text-slate-600">
            These Bridge Warranty administrative terms are intended to support the application and selected product terms. If there is a conflict between this page and the provider terms for coverage, limits, deductibles, exclusions, claims, or refunds, the provider terms control unless applicable law requires otherwise.
          </div>
        </div>

        {hasProviderDetails ? (
          <div className="mt-4 border-t border-slate-300 pt-3 text-[8px] leading-snug print:mt-0 print:break-before-page">
            <TermsPageHeader brandName={props.brandName} contractNumber={props.contractNumber} subtitle={printedDocumentSubtitle} />
            <div className="mb-2 border-b border-[#073f82] pb-1.5 text-[10px] font-bold text-[#073f82]">Provider-Specific Terms</div>
            {props.termsSections?.map((section) => (
              <section key={section.title} className="mb-2">
                <div className="font-bold uppercase">{section.title}</div>
                <div className="whitespace-pre-wrap text-slate-700">{section.content}</div>
              </section>
            ))}
            {props.exclusions?.length ? (
              <section className="mb-2">
                <div className="font-bold uppercase">Exclusions</div>
                <ul className="list-disc pl-4 text-slate-700">
                  {props.exclusions.map((exclusion) => <li key={exclusion}>{exclusion}</li>)}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
