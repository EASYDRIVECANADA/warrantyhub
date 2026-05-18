import { format } from "date-fns";

import type { BridgeWarrantyApplicationContractProps } from "../../components/contracts/BridgeWarrantyApplicationContract";

const CONTRACT_NUMBER_PREFIX = "BW";

type SavedAddonSnapshot = {
  name?: string;
  retail?: number;
  retailDisplay?: string;
};

type SavedContractPrintRow = {
  id: string;
  customer_first_name?: string | null;
  customer_last_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_city?: string | null;
  customer_province?: string | null;
  customer_postal_code?: string | null;
  vin?: string | null;
  vehicle_year?: number | string | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_mileage?: number | null;
  vehicle_engine?: string | null;
  vehicle_transmission?: string | null;
  contract_price?: number | null;
  pricing_vehicle_class?: string | null;
  pricing_term_months?: number | null;
  pricing_term_km?: number | null;
  pricing_base_price_cents?: number | null;
  pricing_dealer_cost_cents?: number | null;
  addon_snapshot?: SavedAddonSnapshot[] | null;
  addon_total_retail_cents?: number | null;
  addon_total_cost_cents?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
};

type SavedProductPrintRow = {
  name?: string | null;
  product_type?: string | null;
  pricing_json?: any;
  coverage_details_json?: any;
};

type SavedDealerPrintInfo = {
  name?: string | null;
  phone?: string | null;
  address?: string | null;
};

function contractNumber(id: string): string {
  return `${CONTRACT_NUMBER_PREFIX}-${id.substring(0, 8).toUpperCase()}`;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return format(new Date(), "MMMM d, yyyy");
  try {
    const normalized = dateStr.includes("T") ? dateStr : `${dateStr}T12:00:00`;
    return format(new Date(normalized), "MMMM d, yyyy");
  } catch {
    return dateStr;
  }
}

function moneyFromCents(cents?: number | null): string | undefined {
  if (typeof cents !== "number") return undefined;
  return `$${(cents / 100).toLocaleString()}`;
}

function money(value?: number | null): string | undefined {
  if (typeof value !== "number") return undefined;
  return `$${value.toLocaleString()}`;
}

function termLabel(months?: number | null, km?: number | null): string | undefined {
  if (!months) return undefined;
  const kmLabel = km == null ? "Unlimited km" : `${km.toLocaleString()} km`;
  return `${months} Months / ${kmLabel}`;
}

function deductibleLabel(value: unknown): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "N/A";
  return normalized.startsWith("$") ? normalized : `$${normalized}`;
}

function addonPriceLabel(addon: SavedAddonSnapshot): string | undefined {
  if (addon.retailDisplay === "Included") return "Included";
  return money(addon.retail);
}

export function buildSavedBridgeWarrantyContractProps(input: {
  brandName: string;
  contract: SavedContractPrintRow;
  product?: SavedProductPrintRow | null;
  dealer?: SavedDealerPrintInfo | null;
  providerName?: string;
}): BridgeWarrantyApplicationContractProps {
  const { brandName, contract, product, dealer, providerName } = input;
  const coverageDetails = product?.coverage_details_json ?? {};
  const pricing = product?.pricing_json ?? {};
  const categories = Array.isArray(coverageDetails.categories)
    ? coverageDetails.categories.map((category: any) => String(category?.name ?? "").trim()).filter(Boolean)
    : [];
  const addOns = Array.isArray(contract.addon_snapshot)
    ? contract.addon_snapshot.map((addon) => ({
      name: String(addon.name ?? "Add-on").trim() || "Add-on",
      priceLabel: addonPriceLabel(addon),
    }))
    : [];

  return {
    brandName,
    contractNumber: contractNumber(contract.id),
    issueDate: formatDate(contract.created_at),
    purchaseDate: formatDate(contract.start_date ?? contract.created_at),
    expiryDate: contract.end_date ? formatDate(contract.end_date) : undefined,
    customer: {
      firstName: contract.customer_first_name ?? undefined,
      lastName: contract.customer_last_name ?? undefined,
      email: contract.customer_email ?? undefined,
      phone: contract.customer_phone ?? undefined,
      address: contract.customer_address ?? undefined,
      city: contract.customer_city ?? undefined,
      province: contract.customer_province ?? undefined,
      postalCode: contract.customer_postal_code ?? undefined,
    },
    dealer: {
      name: dealer?.name ?? undefined,
      phone: dealer?.phone ?? undefined,
      address: dealer?.address ?? undefined,
    },
    vehicle: {
      year: contract.vehicle_year ?? undefined,
      make: contract.vehicle_make ?? undefined,
      model: contract.vehicle_model ?? undefined,
      vin: contract.vin ?? undefined,
      mileageKm: typeof contract.vehicle_mileage === "number" ? `${contract.vehicle_mileage.toLocaleString()} km` : undefined,
      type: "Personal",
      transmission: contract.vehicle_transmission ?? undefined,
      engineSize: contract.vehicle_engine ?? undefined,
    },
    warranty: {
      productName: product?.name ?? undefined,
      providerName: providerName || undefined,
      termLabel: termLabel(contract.pricing_term_months, contract.pricing_term_km) ?? "Selected Term",
      deductibleLabel: deductibleLabel(pricing.deductible),
      basePriceLabel: moneyFromCents(contract.pricing_base_price_cents) ?? money(contract.contract_price) ?? "N/A",
      totalPriceLabel: money(contract.contract_price) ?? "N/A",
      startDateLabel: contract.start_date ? formatDate(contract.start_date) : undefined,
    },
    coverage: {
      title: product?.name ?? "Extended Warranty",
      productType: product?.product_type ?? undefined,
      components: categories,
      addOns,
    },
    termsSections: Array.isArray(coverageDetails.termsSections) ? coverageDetails.termsSections : [],
    exclusions: Array.isArray(coverageDetails.exclusions) ? coverageDetails.exclusions : [],
  };
}
