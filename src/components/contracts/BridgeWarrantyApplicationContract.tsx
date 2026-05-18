import type { ReactNode } from "react";

type CustomerInfo = {
  firstName?: string;
  lastName?: string;
  initials?: string;
  email?: string;
  phone?: string;
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
  components: string[];
  addOns: CoverageAddOn[];
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

function SectionBar({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[#073f82] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white">
      {children}
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children?: ReactNode; className?: string }) {
  return (
    <div className={`min-h-[30px] border-b border-r border-slate-400 px-1.5 py-1 ${className}`}>
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

export function BridgeWarrantyApplicationContract(props: BridgeWarrantyApplicationContractProps) {
  const customerName = `${props.customer.firstName ?? ""} ${props.customer.lastName ?? ""}`.trim();
  const vehicleLabel = [props.vehicle.year, props.vehicle.make, props.vehicle.model].map(value).filter((v) => v !== "N/A").join(" ");
  const coverageTitle = value(props.coverage.title ?? props.warranty.productName).toUpperCase();
  const hasLegalDetails = (props.termsSections?.length ?? 0) > 0 || (props.exclusions?.length ?? 0) > 0;

  return (
    <div className="print-contract-root bg-white text-slate-950">
      <div className="mx-auto max-w-[190mm] bg-white p-8 print:p-0">
        <div className="min-h-[260mm] text-[8px] leading-tight">
          <div className="grid grid-cols-[1fr_1.2fr_1fr] items-start border-b border-slate-400 pb-2">
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
            EXTENDED LIMITED WARRANTY APPLICATION
          </div>

          <div className="mt-1 grid grid-cols-[1fr_38mm] gap-2">
            <div>
              <SectionBar>CUSTOMER / LESSEE INFORMATION</SectionBar>
              <div className="grid grid-cols-12 border-l border-t border-slate-400">
                <Field label="Last Name:" className="col-span-4">{value(props.customer.lastName)}</Field>
                <Field label="First Name:" className="col-span-4">{value(props.customer.firstName)}</Field>
                <Field label="Initials:" className="col-span-4">{value(props.customer.initials)}</Field>
                <Field label="Address:" className="col-span-6">N/A</Field>
                <Field label="City:" className="col-span-3">N/A</Field>
                <Field label="Province:" className="col-span-3">N/A</Field>
                <Field label="Postal Code:" className="col-span-3">N/A</Field>
                <Field label="Home phone:" className="col-span-3">{value(props.customer.phone)}</Field>
                <Field label="Business phone:" className="col-span-3">N/A</Field>
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
                <Field label="Engine Size:" className="col-span-2">N/A</Field>
                <Field label="Body Type:" className="col-span-3">{vehicleLabel || "N/A"}</Field>
                <Field label="Colour:" className="col-span-2">{value(props.vehicle.colour)}</Field>
                <Field label="V.I.N.:" className="col-span-8">{value(props.vehicle.vin)}</Field>
                <Field label="Lienholder:" className="col-span-4">N/A</Field>
              </div>

              <SectionBar>FACTORY WARRANTY (IF STILL IN EFFECT)</SectionBar>
              <div className="grid grid-cols-12 border-l border-t border-slate-400">
                <Field label="Type of Coverage:" className="col-span-4">N/A</Field>
                <Field label="Term of Coverage:" className="col-span-4">{value(props.warranty.termLabel)}</Field>
                <Field label="In Service Date:" className="col-span-4">{value(props.warranty.startDateLabel)}</Field>
              </div>

              <SectionBar>COST OF WARRANTY</SectionBar>
              <div className="grid grid-cols-12 border-l border-t border-slate-400">
                <Field label="Cost of warranty:" className="col-span-3">{value(props.warranty.basePriceLabel)}</Field>
                <Field label="HST:" className="col-span-3">$0.00</Field>
                <Field label="HST Exempt:" className="col-span-3">No</Field>
                <Field label="Cost of warranty Total:" className="col-span-3">{value(props.warranty.totalPriceLabel)}</Field>
              </div>

              <SectionBar>CUSTOMER ACKNOWLEDGMENT</SectionBar>
              <div className="border border-t-0 border-slate-400 bg-slate-200 px-2 py-1.5 text-[7.5px] leading-snug">
                <div>- I acknowledge that I have read, reviewed, and understood this Bridge Warranty application and the terms provided by the product provider.</div>
                <div>- I confirm that all information provided on this application is true, complete, and accurate to the best of my knowledge.</div>
                <div>- I understand that this agreement is a service agreement and not an insurance policy.</div>
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

          <div className="mt-3 grid grid-cols-[1fr_1fr] items-end gap-6 text-[8px]">
            <div>
              <div>DATE OF PURCHASE: <span className="font-semibold">{value(props.purchaseDate)}</span></div>
              <div className="mt-2 flex items-end gap-2">
                <span>SELLING DEALER:</span>
                <span className="min-w-[150px] border-b border-slate-800 px-2 pb-0.5 font-semibold">{value(props.dealer.name)}</span>
              </div>
            </div>
            <div className="text-right">
              <div>EXPIRY DATE: <span className="font-semibold">{value(props.expiryDate)}</span></div>
              <div className="mt-3 flex items-end justify-end gap-2">
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

        {hasLegalDetails ? (
          <div className="mt-5 border-t border-slate-300 pt-4 text-[9px] leading-snug print:break-before-page">
            <div className="mb-2 border-b border-[#073f82] pb-2 text-[11px] font-bold text-[#073f82]">{props.brandName} Vehicle Service Contract</div>
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
