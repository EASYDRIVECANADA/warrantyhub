import { getSupabaseClient } from "../supabase/client";

import type { ContractsApi } from "./api";
import type { Contract, CreateContractInput } from "./types";
import { warrantyIdFromContractId } from "./types";

type ContractsRow = {
  id: string;
  contract_number: string;
  customer_name: string;
  provider_id?: string | null;
  product_id?: string | null;
  product_pricing_id?: string | null;
  pricing_term_months?: number | null;
  pricing_term_km?: number | null;
  pricing_vehicle_mileage_min_km?: number | null;
  pricing_vehicle_mileage_max_km?: number | null;
  pricing_vehicle_class?: string | null;
  pricing_deductible_cents?: number | null;
  pricing_base_price_cents?: number | null;
  pricing_dealer_cost_cents?: number | null;
  addon_snapshot?: unknown | null;
  addon_total_retail_cents?: number | null;
  addon_total_cost_cents?: number | null;
  created_by_user_id?: string | null;
  created_by_email?: string | null;
  sold_by_user_id?: string | null;
  sold_by_email?: string | null;
  sold_at?: string | null;
  remitted_by_user_id?: string | null;
  remitted_by_email?: string | null;
  remitted_at?: string | null;
  paid_by_user_id?: string | null;
  paid_by_email?: string | null;
  paid_at?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_city?: string | null;
  customer_province?: string | null;
  customer_postal_code?: string | null;
  vin?: string | null;
  vehicle_year?: string | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_trim?: string | null;
  vehicle_mileage_km?: number | null;
  vehicle_body_class?: string | null;
  vehicle_engine?: string | null;
  vehicle_transmission?: string | null;
  created_at: string;
  status?: string | null;
  updated_at?: string | null;
  warranty_id?: string | null;
};

function toContract(r: ContractsRow): Contract {
  const createdAt = r.created_at;
  return {
    id: r.id,
    warrantyId: (r.warranty_id ?? "").trim() || warrantyIdFromContractId(r.id),
    contractNumber: r.contract_number,
    customerName: r.customer_name,
    providerId: r.provider_id ?? undefined,
    productId: r.product_id ?? undefined,
    productPricingId: r.product_pricing_id ?? undefined,
    pricingTermMonths: typeof r.pricing_term_months === "number" ? r.pricing_term_months : r.pricing_term_months === null ? null : undefined,
    pricingTermKm: typeof r.pricing_term_km === "number" ? r.pricing_term_km : r.pricing_term_km === null ? null : undefined,
    pricingVehicleMileageMinKm: typeof r.pricing_vehicle_mileage_min_km === "number" ? r.pricing_vehicle_mileage_min_km : undefined,
    pricingVehicleMileageMaxKm:
      typeof r.pricing_vehicle_mileage_max_km === "number"
        ? r.pricing_vehicle_mileage_max_km
        : r.pricing_vehicle_mileage_max_km === null
          ? null
          : undefined,
    pricingVehicleClass: typeof r.pricing_vehicle_class === "string" ? r.pricing_vehicle_class : undefined,
    pricingDeductibleCents: typeof r.pricing_deductible_cents === "number" ? r.pricing_deductible_cents : undefined,
    pricingBasePriceCents: typeof r.pricing_base_price_cents === "number" ? r.pricing_base_price_cents : undefined,
    pricingDealerCostCents: typeof r.pricing_dealer_cost_cents === "number" ? r.pricing_dealer_cost_cents : undefined,
    addonSnapshot: r.addon_snapshot ?? undefined,
    addonTotalRetailCents: typeof r.addon_total_retail_cents === "number" ? r.addon_total_retail_cents : undefined,
    addonTotalCostCents: typeof r.addon_total_cost_cents === "number" ? r.addon_total_cost_cents : undefined,
    createdByUserId: r.created_by_user_id ?? undefined,
    createdByEmail: r.created_by_email ?? undefined,
    soldByUserId: r.sold_by_user_id ?? undefined,
    soldByEmail: r.sold_by_email ?? undefined,
    soldAt: r.sold_at ?? undefined,
    remittedByUserId: r.remitted_by_user_id ?? undefined,
    remittedByEmail: r.remitted_by_email ?? undefined,
    remittedAt: r.remitted_at ?? undefined,
    paidByUserId: r.paid_by_user_id ?? undefined,
    paidByEmail: r.paid_by_email ?? undefined,
    paidAt: r.paid_at ?? undefined,
    customerEmail: r.customer_email ?? undefined,
    customerPhone: r.customer_phone ?? undefined,
    customerAddress: r.customer_address ?? undefined,
    customerCity: r.customer_city ?? undefined,
    customerProvince: r.customer_province ?? undefined,
    customerPostalCode: r.customer_postal_code ?? undefined,
    vin: r.vin ?? undefined,
    vehicleYear: r.vehicle_year ?? undefined,
    vehicleMake: r.vehicle_make ?? undefined,
    vehicleModel: r.vehicle_model ?? undefined,
    vehicleTrim: r.vehicle_trim ?? undefined,
    vehicleMileageKm: typeof r.vehicle_mileage_km === "number" ? r.vehicle_mileage_km : undefined,
    vehicleBodyClass: r.vehicle_body_class ?? undefined,
    vehicleEngine: r.vehicle_engine ?? undefined,
    vehicleTransmission: r.vehicle_transmission ?? undefined,
    createdAt,
    status: (r.status ?? "DRAFT") as Contract["status"],
    updatedAt: r.updated_at ?? createdAt,
  };
}

function nextStatus(current: Contract["status"]): Contract["status"] | null {
  if (current === "DRAFT") return "SOLD";
  if (current === "SOLD") return "REMITTED";
  if (current === "REMITTED") return "PAID";
  return null;
}

export const supabaseContractsApi: ContractsApi = {
  async list() {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("contracts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data as ContractsRow[]).map(toContract);
  },

  async get(id: string) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { data, error } = await supabase
      .from("contracts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return toContract(data as ContractsRow);
  },

  async create(input: CreateContractInput) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const now = new Date().toISOString();

    const baseInsert = {
      contract_number: input.contractNumber,
      customer_name: input.customerName,
      provider_id: input.providerId,
      product_id: input.productId,
      product_pricing_id: input.productPricingId,
      pricing_term_months: typeof input.pricingTermMonths === "number" ? input.pricingTermMonths : input.pricingTermMonths === null ? null : undefined,
      pricing_term_km: typeof input.pricingTermKm === "number" ? input.pricingTermKm : input.pricingTermKm === null ? null : undefined,
      pricing_vehicle_mileage_min_km: typeof input.pricingVehicleMileageMinKm === "number" ? input.pricingVehicleMileageMinKm : undefined,
      pricing_vehicle_mileage_max_km:
        typeof input.pricingVehicleMileageMaxKm === "number"
          ? input.pricingVehicleMileageMaxKm
          : input.pricingVehicleMileageMaxKm === null
            ? null
            : undefined,
      pricing_vehicle_class: typeof input.pricingVehicleClass === "string" ? input.pricingVehicleClass : undefined,
      pricing_deductible_cents: typeof input.pricingDeductibleCents === "number" ? input.pricingDeductibleCents : undefined,
      pricing_base_price_cents: typeof input.pricingBasePriceCents === "number" ? input.pricingBasePriceCents : undefined,
      addon_snapshot: (input as any).addonSnapshot,
      addon_total_retail_cents: typeof (input as any).addonTotalRetailCents === "number" ? (input as any).addonTotalRetailCents : undefined,
      addon_total_cost_cents: typeof (input as any).addonTotalCostCents === "number" ? (input as any).addonTotalCostCents : undefined,
      created_by_user_id: input.createdByUserId,
      created_by_email: input.createdByEmail,
      customer_email: input.customerEmail,
      customer_phone: input.customerPhone,
      customer_address: input.customerAddress,
      customer_city: input.customerCity,
      customer_province: input.customerProvince,
      customer_postal_code: input.customerPostalCode,
      vin: input.vin,
      vehicle_year: input.vehicleYear,
      vehicle_make: input.vehicleMake,
      vehicle_model: input.vehicleModel,
      vehicle_trim: input.vehicleTrim,
      vehicle_body_class: input.vehicleBodyClass,
      vehicle_engine: input.vehicleEngine,
      vehicle_transmission: input.vehicleTransmission,
    };

    const extendedInsert = {
      ...baseInsert,
      status: "DRAFT",
      vehicle_mileage_km: typeof input.vehicleMileageKm === "number" ? input.vehicleMileageKm : undefined,
      updated_at: now,
      pricing_dealer_cost_cents: typeof input.pricingDealerCostCents === "number" ? input.pricingDealerCostCents : undefined,
    };

    const attempt = await supabase.from("contracts").insert(extendedInsert).select("*").single();
    if (!attempt.error) {
      const raw = attempt.data as ContractsRow;
      const created = toContract(raw);

      const computed = warrantyIdFromContractId(created.id);
      const existing = (raw.warranty_id ?? "").trim();
      if (!existing) {
        const updateAttempt = await supabase
          .from("contracts")
          .update({ warranty_id: computed, updated_at: now })
          .eq("id", created.id)
          .select("*")
          .single();

        if (!updateAttempt.error) return toContract(updateAttempt.data as ContractsRow);
      }

      return created;
    }

    const fallback = await supabase.from("contracts").insert(baseInsert).select("*").single();
    if (fallback.error) throw fallback.error;

    const raw = fallback.data as ContractsRow;
    const created = toContract(raw);
    const computed = warrantyIdFromContractId(created.id);
    const existing = (raw.warranty_id ?? "").trim();
    if (!existing) {
      const updateAttempt = await supabase
        .from("contracts")
        .update({ warranty_id: computed })
        .eq("id", created.id)
        .select("*")
        .single();

      if (!updateAttempt.error) return toContract(updateAttempt.data as ContractsRow);
    }

    return created;
  },

  async delete(id: string) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const { error } = await supabase.from("contracts").delete().eq("id", id);
    if (error) throw error;
  },

  async update(id: string, patch: Parameters<ContractsApi["update"]>[1]) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured");

    const now = new Date().toISOString();
    const current = await supabaseContractsApi.get(id);
    if (!current) throw new Error("Contract not found");

    const hasNonStatusEdits = Object.keys(patch).some((k) => k !== "status");
    if (hasNonStatusEdits && current.status !== "DRAFT") {
      throw new Error("Contract is locked (only Draft contracts are editable)");
    }

    if (typeof patch.status === "string") {
      const desired = patch.status as Contract["status"];
      if (desired !== current.status) {
        const allowed = nextStatus(current.status);
        if (allowed !== desired) {
          throw new Error("Invalid status transition");
        }
      }
    }

    const updateRowBase: Record<string, unknown> = {};

    if (typeof patch.providerId === "string") updateRowBase.provider_id = patch.providerId.trim() ? patch.providerId : null;
    if (typeof patch.productId === "string") updateRowBase.product_id = patch.productId.trim() ? patch.productId : null;

    if ("productPricingId" in patch) {
      const v = (patch as any).productPricingId as string | null | undefined;
      if (typeof v === "string") updateRowBase.product_pricing_id = v.trim() ? v : null;
      if (v === null) updateRowBase.product_pricing_id = null;
    }
    if ("pricingTermMonths" in patch) {
      const v = (patch as any).pricingTermMonths as number | null | undefined;
      if (typeof v === "number") updateRowBase.pricing_term_months = v;
      if (v === null) updateRowBase.pricing_term_months = null;
    }
    if ("pricingTermKm" in patch) {
      const v = (patch as any).pricingTermKm as number | null | undefined;
      if (typeof v === "number") updateRowBase.pricing_term_km = v;
      if (v === null) updateRowBase.pricing_term_km = null;
    }
    if ("pricingVehicleMileageMinKm" in patch) {
      const v = (patch as any).pricingVehicleMileageMinKm as number | null | undefined;
      if (typeof v === "number") (updateRowBase as any).pricing_vehicle_mileage_min_km = v;
      if (v === null) (updateRowBase as any).pricing_vehicle_mileage_min_km = null;
    }
    if ("pricingVehicleMileageMaxKm" in patch) {
      const v = (patch as any).pricingVehicleMileageMaxKm as number | null | undefined;
      if (typeof v === "number") (updateRowBase as any).pricing_vehicle_mileage_max_km = v;
      if (v === null) (updateRowBase as any).pricing_vehicle_mileage_max_km = null;
    }
    if ("pricingVehicleClass" in patch) {
      const v = (patch as any).pricingVehicleClass as string | null | undefined;
      if (typeof v === "string") (updateRowBase as any).pricing_vehicle_class = v;
      if (v === null) (updateRowBase as any).pricing_vehicle_class = null;
    }
    if ("pricingDeductibleCents" in patch) {
      const v = (patch as any).pricingDeductibleCents as number | null | undefined;
      if (typeof v === "number") updateRowBase.pricing_deductible_cents = v;
      if (v === null) updateRowBase.pricing_deductible_cents = null;
    }
    if ("pricingBasePriceCents" in patch) {
      const v = (patch as any).pricingBasePriceCents as number | null | undefined;
      if (typeof v === "number") updateRowBase.pricing_base_price_cents = v;
      if (v === null) updateRowBase.pricing_base_price_cents = null;
    }
    if ("pricingDealerCostCents" in patch) {
      const v = (patch as any).pricingDealerCostCents as number | null | undefined;
      if (typeof v === "number") (updateRowBase as any).pricing_dealer_cost_cents = v;
      if (v === null) (updateRowBase as any).pricing_dealer_cost_cents = null;
    }
    if ("addonSnapshot" in patch) {
      const v = (patch as any).addonSnapshot as unknown | null | undefined;
      if (v !== undefined) (updateRowBase as any).addon_snapshot = v;
      if (v === null) (updateRowBase as any).addon_snapshot = null;
    }
    if ("addonTotalRetailCents" in patch) {
      const v = (patch as any).addonTotalRetailCents as number | null | undefined;
      if (typeof v === "number") (updateRowBase as any).addon_total_retail_cents = v;
      if (v === null) (updateRowBase as any).addon_total_retail_cents = null;
    }
    if ("addonTotalCostCents" in patch) {
      const v = (patch as any).addonTotalCostCents as number | null | undefined;
      if (typeof v === "number") (updateRowBase as any).addon_total_cost_cents = v;
      if (v === null) (updateRowBase as any).addon_total_cost_cents = null;
    }

    if (typeof patch.createdByUserId === "string") updateRowBase.created_by_user_id = patch.createdByUserId;
    if (typeof patch.createdByEmail === "string") updateRowBase.created_by_email = patch.createdByEmail;
    if (typeof patch.soldByUserId === "string") updateRowBase.sold_by_user_id = patch.soldByUserId;
    if (typeof patch.soldByEmail === "string") updateRowBase.sold_by_email = patch.soldByEmail;
    if (typeof patch.soldAt === "string") updateRowBase.sold_at = patch.soldAt;
    if (typeof patch.remittedByUserId === "string") updateRowBase.remitted_by_user_id = patch.remittedByUserId;
    if (typeof patch.remittedByEmail === "string") updateRowBase.remitted_by_email = patch.remittedByEmail;
    if (typeof patch.remittedAt === "string") updateRowBase.remitted_at = patch.remittedAt;
    if (typeof patch.paidByUserId === "string") updateRowBase.paid_by_user_id = patch.paidByUserId;
    if (typeof patch.paidByEmail === "string") updateRowBase.paid_by_email = patch.paidByEmail;
    if (typeof patch.paidAt === "string") updateRowBase.paid_at = patch.paidAt;

    if (typeof patch.customerName === "string") updateRowBase.customer_name = patch.customerName;
    if (typeof patch.customerEmail === "string") updateRowBase.customer_email = patch.customerEmail;
    if (typeof patch.customerPhone === "string") updateRowBase.customer_phone = patch.customerPhone;
    if (typeof patch.customerAddress === "string") updateRowBase.customer_address = patch.customerAddress;
    if (typeof patch.customerCity === "string") updateRowBase.customer_city = patch.customerCity;
    if (typeof patch.customerProvince === "string") updateRowBase.customer_province = patch.customerProvince;
    if (typeof patch.customerPostalCode === "string") updateRowBase.customer_postal_code = patch.customerPostalCode;
    if (typeof patch.vin === "string") updateRowBase.vin = patch.vin;
    if (typeof patch.vehicleYear === "string") updateRowBase.vehicle_year = patch.vehicleYear;
    if (typeof patch.vehicleMake === "string") updateRowBase.vehicle_make = patch.vehicleMake;
    if (typeof patch.vehicleModel === "string") updateRowBase.vehicle_model = patch.vehicleModel;
    if (typeof patch.vehicleTrim === "string") updateRowBase.vehicle_trim = patch.vehicleTrim;
    if (typeof patch.vehicleMileageKm === "number") updateRowBase.vehicle_mileage_km = patch.vehicleMileageKm;
    if (typeof patch.vehicleBodyClass === "string") updateRowBase.vehicle_body_class = patch.vehicleBodyClass;
    if (typeof patch.vehicleEngine === "string") updateRowBase.vehicle_engine = patch.vehicleEngine;
    if (typeof patch.vehicleTransmission === "string") updateRowBase.vehicle_transmission = patch.vehicleTransmission;

    if (typeof patch.status === "string") {
      updateRowBase.status = patch.status;
    }

    updateRowBase.updated_at = now;

    const baseOnly: Record<string, unknown> = {};
    if (typeof patch.providerId === "string") baseOnly.provider_id = patch.providerId.trim() ? patch.providerId : null;
    if (typeof patch.productId === "string") baseOnly.product_id = patch.productId.trim() ? patch.productId : null;
    if ("productPricingId" in patch) {
      const v = (patch as any).productPricingId as string | null | undefined;
      if (typeof v === "string") baseOnly.product_pricing_id = v.trim() ? v : null;
      if (v === null) baseOnly.product_pricing_id = null;
    }
    if ("pricingTermMonths" in patch) {
      const v = (patch as any).pricingTermMonths as number | null | undefined;
      if (typeof v === "number") baseOnly.pricing_term_months = v;
      if (v === null) baseOnly.pricing_term_months = null;
    }
    if ("pricingTermKm" in patch) {
      const v = (patch as any).pricingTermKm as number | null | undefined;
      if (typeof v === "number") baseOnly.pricing_term_km = v;
      if (v === null) baseOnly.pricing_term_km = null;
    }
    if ("pricingVehicleMileageMinKm" in patch) {
      const v = (patch as any).pricingVehicleMileageMinKm as number | null | undefined;
      if (typeof v === "number") (baseOnly as any).pricing_vehicle_mileage_min_km = v;
      if (v === null) (baseOnly as any).pricing_vehicle_mileage_min_km = null;
    }
    if ("pricingVehicleMileageMaxKm" in patch) {
      const v = (patch as any).pricingVehicleMileageMaxKm as number | null | undefined;
      if (typeof v === "number") (baseOnly as any).pricing_vehicle_mileage_max_km = v;
      if (v === null) (baseOnly as any).pricing_vehicle_mileage_max_km = null;
    }
    if ("pricingVehicleClass" in patch) {
      const v = (patch as any).pricingVehicleClass as string | null | undefined;
      if (typeof v === "string") (baseOnly as any).pricing_vehicle_class = v;
      if (v === null) (baseOnly as any).pricing_vehicle_class = null;
    }
    if ("pricingDeductibleCents" in patch) {
      const v = (patch as any).pricingDeductibleCents as number | null | undefined;
      if (typeof v === "number") baseOnly.pricing_deductible_cents = v;
      if (v === null) baseOnly.pricing_deductible_cents = null;
    }
    if ("pricingBasePriceCents" in patch) {
      const v = (patch as any).pricingBasePriceCents as number | null | undefined;
      if (typeof v === "number") baseOnly.pricing_base_price_cents = v;
      if (v === null) baseOnly.pricing_base_price_cents = null;
    }
    if ("pricingDealerCostCents" in patch) {
      const v = (patch as any).pricingDealerCostCents as number | null | undefined;
      if (typeof v === "number") (baseOnly as any).pricing_dealer_cost_cents = v;
      if (v === null) (baseOnly as any).pricing_dealer_cost_cents = null;
    }
    if ("addonSnapshot" in patch) {
      const v = (patch as any).addonSnapshot as unknown | null | undefined;
      if (v !== undefined) (baseOnly as any).addon_snapshot = v;
      if (v === null) (baseOnly as any).addon_snapshot = null;
    }
    if ("addonTotalRetailCents" in patch) {
      const v = (patch as any).addonTotalRetailCents as number | null | undefined;
      if (typeof v === "number") (baseOnly as any).addon_total_retail_cents = v;
      if (v === null) (baseOnly as any).addon_total_retail_cents = null;
    }
    if ("addonTotalCostCents" in patch) {
      const v = (patch as any).addonTotalCostCents as number | null | undefined;
      if (typeof v === "number") (baseOnly as any).addon_total_cost_cents = v;
      if (v === null) (baseOnly as any).addon_total_cost_cents = null;
    }
    if (typeof patch.createdByUserId === "string") baseOnly.created_by_user_id = patch.createdByUserId;
    if (typeof patch.createdByEmail === "string") baseOnly.created_by_email = patch.createdByEmail;
    if (typeof patch.soldByUserId === "string") baseOnly.sold_by_user_id = patch.soldByUserId;
    if (typeof patch.soldByEmail === "string") baseOnly.sold_by_email = patch.soldByEmail;
    if (typeof patch.soldAt === "string") baseOnly.sold_at = patch.soldAt;
    if (typeof patch.remittedByUserId === "string") baseOnly.remitted_by_user_id = patch.remittedByUserId;
    if (typeof patch.remittedByEmail === "string") baseOnly.remitted_by_email = patch.remittedByEmail;
    if (typeof patch.remittedAt === "string") baseOnly.remitted_at = patch.remittedAt;
    if (typeof patch.paidByUserId === "string") baseOnly.paid_by_user_id = patch.paidByUserId;
    if (typeof patch.paidByEmail === "string") baseOnly.paid_by_email = patch.paidByEmail;
    if (typeof patch.paidAt === "string") baseOnly.paid_at = patch.paidAt;
    if (typeof patch.customerName === "string") baseOnly.customer_name = patch.customerName;
    if (typeof patch.customerEmail === "string") baseOnly.customer_email = patch.customerEmail;
    if (typeof patch.customerPhone === "string") baseOnly.customer_phone = patch.customerPhone;
    if (typeof patch.customerAddress === "string") baseOnly.customer_address = patch.customerAddress;
    if (typeof patch.customerCity === "string") baseOnly.customer_city = patch.customerCity;
    if (typeof patch.customerProvince === "string") baseOnly.customer_province = patch.customerProvince;
    if (typeof patch.customerPostalCode === "string") baseOnly.customer_postal_code = patch.customerPostalCode;
    if (typeof patch.vin === "string") baseOnly.vin = patch.vin;
    if (typeof patch.vehicleYear === "string") baseOnly.vehicle_year = patch.vehicleYear;
    if (typeof patch.vehicleMake === "string") baseOnly.vehicle_make = patch.vehicleMake;
    if (typeof patch.vehicleModel === "string") baseOnly.vehicle_model = patch.vehicleModel;
    if (typeof patch.vehicleTrim === "string") baseOnly.vehicle_trim = patch.vehicleTrim;
    if (typeof patch.vehicleBodyClass === "string") baseOnly.vehicle_body_class = patch.vehicleBodyClass;
    if (typeof patch.vehicleEngine === "string") baseOnly.vehicle_engine = patch.vehicleEngine;
    if (typeof patch.vehicleTransmission === "string") baseOnly.vehicle_transmission = patch.vehicleTransmission;

    const attempt = await supabase.from("contracts").update(updateRowBase).eq("id", id).select("*").single();
    if (!attempt.error) return toContract(attempt.data as ContractsRow);

    if (Object.keys(baseOnly).length === 0) {
      return { ...current, status: patch.status ?? current.status, updatedAt: now };
    }

    const fallback = await supabase.from("contracts").update(baseOnly).eq("id", id).select("*").single();
    if (fallback.error) throw fallback.error;

    const mapped = toContract(fallback.data as ContractsRow);
    return {
      ...mapped,
      status: patch.status ?? mapped.status,
      updatedAt: now,
    };
  },
};
