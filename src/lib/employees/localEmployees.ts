import type { EmployeesApi } from "./api";
import type { CreateEmployeeInput, Employee } from "./types";

const STORAGE_KEY = "warrantyhub.local.employees";

function read(): Employee[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<Employee>[];
    return parsed
      .map((e): Employee => {
        const createdAt = e.createdAt ?? new Date().toISOString();
        return {
          id: e.id ?? crypto.randomUUID(),
          name: e.name ?? "",
          email: e.email ?? "",
          createdAt,
        };
      })
      .filter((e) => e.name.trim() && e.email.trim());
  } catch {
    return [];
  }
}

function write(items: Employee[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export const localEmployeesApi: EmployeesApi = {
  async list() {
    return read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async create(input: CreateEmployeeInput) {
    const now = new Date().toISOString();
    const item: Employee = {
      id: crypto.randomUUID(),
      name: input.name,
      email: input.email,
      createdAt: now,
    };

    const next = [item, ...read()];
    write(next);
    return item;
  },

  async update(id: string, patch) {
    const items = read();
    const idx = items.findIndex((e) => e.id === id);
    if (idx < 0) throw new Error("Employee not found");
    const current = items[idx]!;

    const nextItem: Employee = {
      ...current,
      ...patch,
    };

    const next = [...items];
    next[idx] = nextItem;
    write(next);
    return nextItem;
  },

  async remove(id: string) {
    const items = read();
    write(items.filter((e) => e.id !== id));
  },
};
