import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DealerTeamPage } from "../pages/DealerTeamPage";

vi.mock("../providers/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: "dealer-admin-1",
      email: "admin@example.com",
      role: "DEALER_ADMIN",
      dealerId: "dealer-1",
    },
  }),
}));

vi.mock("../lib/runtime", () => ({
  getAppMode: () => "local",
}));

vi.mock("../lib/auditLog", () => ({
  logAuditEvent: vi.fn(),
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <DealerTeamPage />
    </QueryClientProvider>,
  );
}

describe("DealerTeamPage temporary password flow", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("does not ask dealer admins to enter employee passwords", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /add first member/i }));

    expect(screen.getByText("Add New Team Member")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Enter password")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Confirm password")).not.toBeInTheDocument();
    expect(screen.queryByText("Password Requirements:")).not.toBeInTheDocument();
  });

  it("shows a one-time temporary password after creating a local employee", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /add first member/i }));
    await user.type(screen.getByPlaceholderText("John"), "John");
    await user.type(screen.getByPlaceholderText("Doe"), "Doe");
    await user.type(screen.getByPlaceholderText("(555) 123-4567"), "555-123-4567");
    await user.type(screen.getByPlaceholderText("john.doe@company.com"), "employee@example.com");
    await user.click(screen.getByRole("button", { name: /^add member$/i }));

    await waitFor(() => {
      expect(screen.getByText("Temporary password created")).toBeInTheDocument();
    });

    expect(screen.getAllByText("employee@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("This password is shown once. Share it securely with the employee.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy password/i })).toBeInTheDocument();
  });

  it("keeps local employee profile details available when editing", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /add first member/i }));
    await user.type(screen.getByPlaceholderText("John"), "Jane");
    await user.type(screen.getByPlaceholderText("Doe"), "Employee");
    await user.type(screen.getByPlaceholderText("(555) 123-4567"), "555-111-2222");
    await user.type(screen.getByPlaceholderText("john.doe@company.com"), "employee@example.com");
    await user.click(screen.getByRole("button", { name: /^add member$/i }));

    await waitFor(() => {
      expect(screen.getByText("Temporary password created")).toBeInTheDocument();
    });

    await user.keyboard("{Escape}");
    await user.click(await screen.findByRole("button", { name: /^edit$/i }));

    expect(screen.getByPlaceholderText("John")).toHaveValue("Jane");
    expect(screen.getByPlaceholderText("Doe")).toHaveValue("Employee");
    expect(screen.getByPlaceholderText("(555) 123-4567")).toHaveValue("555-111-2222");
    expect(screen.getByPlaceholderText("john.doe@company.com")).toHaveValue("employee@example.com");
  });
});
