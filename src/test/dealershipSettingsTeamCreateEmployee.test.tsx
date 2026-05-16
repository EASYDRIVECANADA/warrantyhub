import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TeamManagementPage from "../pages/dealership/settings/TeamManagementPage";
import { invokeEdgeFunction } from "../lib/supabase/functions";

const toast = vi.fn();

vi.mock("../hooks/useDealership", () => ({
  useDealership: () => ({
    dealershipId: "dealership-1",
    dealershipName: "Bridge Warranty Dealer",
    memberRole: "admin",
    loading: false,
    reloadDealership: vi.fn(),
  }),
}));

vi.mock("../providers/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: "dealer-admin-1",
      email: "admin@example.com",
      role: "DEALER_ADMIN",
    },
  }),
}));

vi.mock("../hooks/use-toast", () => ({
  useToast: () => ({ toast }),
}));

vi.mock("../lib/supabase/functions", () => ({
  invokeEdgeFunction: vi.fn().mockResolvedValue({
    dealerMemberId: "member-1",
    userId: "employee-1",
    temporaryPassword: "TempPass123!",
  }),
}));

function makeSupabaseChain(table: string) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  chain.insert = vi.fn(() => Promise.resolve({ data: null, error: null }));
  chain.update = vi.fn(() => chain);
  chain.upsert = vi.fn(() => Promise.resolve({ data: null, error: null }));
  chain.delete = vi.fn(() => chain);

  if (table === "dealership_members") {
    chain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
  }

  return chain;
}

vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => makeSupabaseChain(table)),
  },
}));

describe("dealership settings team creation", () => {
  beforeEach(() => {
    toast.mockClear();
    vi.mocked(invokeEdgeFunction).mockClear();
  });

  it("creates a brand-new employee instead of requiring an existing account", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TeamManagementPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: /add member/i }));
    await user.type(screen.getByPlaceholderText("team@example.com"), "employee@example.com");
    await user.type(screen.getByPlaceholderText("John Doe"), "Jane Employee");
    await user.type(screen.getByPlaceholderText("(555) 123-4567"), "555-111-2222");
    await user.click(screen.getByRole("button", { name: /create employee/i }));

    await waitFor(() => {
      expect(invokeEdgeFunction).toHaveBeenCalledWith("dealer-team-tools", {
        action: "create_employee",
        employee: {
          firstName: "Jane",
          lastName: "Employee",
          phone: "555-111-2222",
          email: "employee@example.com",
          password: expect.any(String),
          role: "DEALER_EMPLOYEE",
        },
      });
    });

    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "User Not Found" }));
    expect(screen.getByText("Temporary password created")).toBeInTheDocument();
  });

  it("sends a temporary password for older deployed employee-create functions", async () => {
    vi.mocked(invokeEdgeFunction).mockResolvedValueOnce({
      dealerMemberId: "member-1",
      userId: "employee-1",
    });

    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TeamManagementPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: /add member/i }));
    await user.type(screen.getByPlaceholderText("team@example.com"), "legacy@example.com");
    await user.type(screen.getByPlaceholderText("John Doe"), "Legacy Employee");
    await user.click(screen.getByRole("button", { name: /create employee/i }));

    await waitFor(() => {
      expect(invokeEdgeFunction).toHaveBeenCalled();
    });

    const payload = vi.mocked(invokeEdgeFunction).mock.calls[0]?.[1] as {
      employee?: { password?: string };
    };
    const fallbackPassword = payload.employee?.password;

    expect(fallbackPassword).toMatch(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*]).{16}$/);
    expect(screen.getByDisplayValue(fallbackPassword!)).toBeInTheDocument();
  });
});
