import type { CreateEmployeeInput, Employee } from "./types";

export type EmployeesApi = {
  list(): Promise<Employee[]>;
  create(input: CreateEmployeeInput): Promise<Employee>;
  update(id: string, patch: Partial<Pick<Employee, "name" | "email">>): Promise<Employee>;
  remove(id: string): Promise<void>;
};
