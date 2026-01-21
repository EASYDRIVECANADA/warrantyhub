import type { ContractsApi } from "./api";
import type { Contract, ContractStatus, CreateContractInput } from "./types";
import { warrantyIdFromContractId } from "./types";

const STORAGE_KEY = "warrantyhub.local.contracts";

function read(): Contract[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<Contract>[];
    return parsed
      .map((c): Contract => {
        const createdAt = c.createdAt ?? new Date().toISOString();
        const status = (c.status ?? "DRAFT") as ContractStatus;
        const updatedAt = c.updatedAt ?? createdAt;
        const id = c.id ?? crypto.randomUUID();
        return {
          id,
          warrantyId: c.warrantyId ?? warrantyIdFromContractId(id),
          contractNumber: c.contractNumber ?? "",
          customerName: c.customerName ?? "",
          providerId: c.providerId,
          productId: c.productId,
          createdByUserId: c.createdByUserId,
          createdByEmail: c.createdByEmail,
          soldByUserId: c.soldByUserId,
          soldByEmail: c.soldByEmail,
          soldAt: c.soldAt,
          remittedByUserId: c.remittedByUserId,
          remittedByEmail: c.remittedByEmail,
          remittedAt: c.remittedAt,
          paidByUserId: c.paidByUserId,
          paidByEmail: c.paidByEmail,
          paidAt: c.paidAt,
          customerEmail: c.customerEmail,
          customerPhone: c.customerPhone,
          customerAddress: c.customerAddress,
          customerCity: c.customerCity,
          customerProvince: c.customerProvince,
          customerPostalCode: c.customerPostalCode,
          vin: c.vin,
          vehicleYear: c.vehicleYear,
          vehicleMake: c.vehicleMake,
          vehicleModel: c.vehicleModel,
          vehicleTrim: c.vehicleTrim,
          vehicleMileageKm: typeof c.vehicleMileageKm === "number" ? c.vehicleMileageKm : undefined,
          vehicleBodyClass: c.vehicleBodyClass,
          vehicleEngine: c.vehicleEngine,
          vehicleTransmission: c.vehicleTransmission,
          createdAt,
          status,
          updatedAt,
        };
      })
      .filter((c) => c.contractNumber.trim());
  } catch {
    return [];
  }
}

function write(items: Contract[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function nextStatus(current: ContractStatus): ContractStatus | null {
  if (current === "DRAFT") return "SOLD";
  if (current === "SOLD") return "REMITTED";
  if (current === "REMITTED") return "PAID";
  return null;
}

type ContractPatch = Parameters<ContractsApi["update"]>[1];

export const localContractsApi: ContractsApi = {
  async list() {
    return read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(id: string) {
    const item = read().find((c) => c.id === id);
    return item ?? null;
  },

  async create(input: CreateContractInput) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const item: Contract = {
      id,
      warrantyId: warrantyIdFromContractId(id),
      contractNumber: input.contractNumber,
      customerName: input.customerName,
      providerId: input.providerId,
      productId: input.productId,
      createdByUserId: input.createdByUserId,
      createdByEmail: input.createdByEmail,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      customerAddress: input.customerAddress,
      customerCity: input.customerCity,
      customerProvince: input.customerProvince,
      customerPostalCode: input.customerPostalCode,
      vin: input.vin,
      vehicleYear: input.vehicleYear,
      vehicleMake: input.vehicleMake,
      vehicleModel: input.vehicleModel,
      vehicleTrim: input.vehicleTrim,
      vehicleMileageKm: input.vehicleMileageKm,
      vehicleBodyClass: input.vehicleBodyClass,
      vehicleEngine: input.vehicleEngine,
      vehicleTransmission: input.vehicleTransmission,
      createdAt: now,
      status: "DRAFT",
      updatedAt: now,
    };

    const next = [item, ...read()];
    write(next);
    return item;
  },

  async update(id: string, patch: ContractPatch) {
    const now = new Date().toISOString();
    const items = read();
    const idx = items.findIndex((c) => c.id === id);
    if (idx < 0) throw new Error("Contract not found");

    const current = items[idx]!;

    const hasNonStatusEdits = Object.keys(patch).some((k) => k !== "status");
    if (hasNonStatusEdits && current.status !== "DRAFT") {
      throw new Error("Contract is locked (only Draft contracts are editable)");
    }

    if (typeof patch.status === "string") {
      const desired = patch.status as ContractStatus;
      if (desired !== current.status) {
        const allowed = nextStatus(current.status);
        if (allowed !== desired) {
          throw new Error("Invalid status transition");
        }
      }
    }

    const next: Contract = {
      ...current,
      ...patch,
      updatedAt: now,
    };

    const updated = [...items];
    updated[idx] = next;
    write(updated);
    return next;
  },
};
