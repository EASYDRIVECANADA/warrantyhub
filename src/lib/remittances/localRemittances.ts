import type { RemittancesApi } from "./api";
import type { CreateRemittanceInput, Remittance, RemittanceStatus } from "./types";

const STORAGE_KEY = "warrantyhub.local.remittances";

function read(): Remittance[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<Remittance>[];
    return parsed
      .map((r): Remittance => {
        const createdAt = r.createdAt ?? new Date().toISOString();
        const status = (r.status ?? "DUE") as RemittanceStatus;
        const updatedAt = r.updatedAt ?? createdAt;
        return {
          id: r.id ?? crypto.randomUUID(),
          remittanceNumber: r.remittanceNumber ?? "",
          amountCents: r.amountCents ?? 0,
          createdAt,
          status,
          updatedAt,
        };
      })
      .filter((r) => r.remittanceNumber.trim());
  } catch {
    return [];
  }
}

function write(items: Remittance[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function nextStatus(current: RemittanceStatus): RemittanceStatus | null {
  if (current === "DUE") return "PAID";
  return null;
}

export const localRemittancesApi: RemittancesApi = {
  async list() {
    return read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async create(input: CreateRemittanceInput) {
    const now = new Date().toISOString();
    const item: Remittance = {
      id: crypto.randomUUID(),
      remittanceNumber: input.remittanceNumber,
      amountCents: input.amountCents,
      createdAt: now,
      status: "DUE",
      updatedAt: now,
    };

    const next = [item, ...read()];
    write(next);
    return item;
  },

  async update(id: string, patch: Partial<Pick<Remittance, "status">>) {
    const now = new Date().toISOString();
    const items = read();
    const idx = items.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error("Remittance not found");

    const current = items[idx]!;

    if (typeof patch.status === "string") {
      const desired = patch.status as RemittanceStatus;
      if (desired !== current.status) {
        const allowed = nextStatus(current.status);
        if (allowed !== desired) {
          throw new Error("Invalid status transition");
        }
      }
    }

    const next: Remittance = {
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
