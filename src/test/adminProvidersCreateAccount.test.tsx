import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminProvidersPage2 from "../pages/admin/AdminProvidersPage2";
import { invokeEdgeFunction } from "../lib/supabase/functions";

const toast = vi.fn();

vi.mock("../providers/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: "super-admin-1",
      email: "admin@bridge.test",
      role: "SUPER_ADMIN",
    },
    signOut: vi.fn(),
  }),
}));

vi.mock("../hooks/use-toast", () => ({
  useToast: () => ({ toast }),
}));

vi.mock("../lib/supabase/functions", () => ({
  invokeEdgeFunction: vi.fn().mockResolvedValue({
    providerId: "provider-created-1",
    userId: "provider-admin-created-1",
    temporaryPassword: "ProviderTemp123!",
  }),
}));

const providerRows = [
  {
    id: "provider-1",
    company_name: "Existing Provider",
    contact_email: "contact@provider.test",
    contact_phone: null,
    regions_served: ["Ontario"],
    status: "approved",
    created_at: "2026-05-19T00:00:00.000Z",
  },
];

const providerMemberRows = [
  {
    id: "provider-member-admin-1",
    user_id: "provider-admin-1",
    role: "admin",
    created_at: "2026-05-19T00:00:00.000Z",
  },
];

const profileRows = [
  {
    id: "provider-admin-1",
    email: "admin@provider.test",
    display_name: "Provider Admin",
    first_name: "Provider",
    last_name: "Admin",
  },
];

function makeSupabaseChain(table: string) {
  const chain: Record<string, unknown> = {};
  let mode = "";
  chain.select = vi.fn(() => chain);
  chain.order = vi.fn(() => Promise.resolve({ data: table === "providers" ? providerRows : [], error: null }));
  chain.update = vi.fn(() => {
    mode = "update";
    return chain;
  });
  chain.eq = vi.fn((column: string) => {
    if (mode === "update") return Promise.resolve({ error: null });
    if (table === "provider_members" && column === "provider_id") {
      return Promise.resolve({ data: providerMemberRows, error: null });
    }
    return chain;
  });
  chain.in = vi.fn(() => Promise.resolve({ data: table === "profiles" ? profileRows : [], error: null }));
  return chain;
}

vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => makeSupabaseChain(table)),
  },
}));

describe("AdminProvidersPage2 provider account creation", () => {
  beforeEach(() => {
    toast.mockClear();
    vi.mocked(invokeEdgeFunction).mockClear();
  });

  it("lets superadmin create a provider company and initial admin account", async () => {
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
          <AdminProvidersPage2 />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("Existing Provider");
    expect(screen.getByText("Manage provider companies and team access")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /create provider account/i }));
    await user.type(screen.getByLabelText(/company name/i), "Apex Warranty");
    await user.type(screen.getByLabelText(/admin first name/i), "Pat");
    await user.type(screen.getByLabelText(/admin last name/i), "Provider");
    await user.type(screen.getByLabelText(/admin email/i), "Admin@Apex.test");
    await user.click(screen.getByRole("button", { name: /^create account$/i }));

    await waitFor(() => {
      expect(invokeEdgeFunction).toHaveBeenCalledWith("company-access-tools", {
        action: "create_provider_account",
        provider: {
          companyName: "Apex Warranty",
          contactEmail: "admin@apex.test",
          status: "approved",
        },
        member: {
          firstName: "Pat",
          lastName: "Provider",
          email: "admin@apex.test",
          phone: undefined,
          role: "admin",
        },
      });
    });
    expect(screen.getByText("Temporary password created")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ProviderTemp123!")).toBeInTheDocument();
    expect(screen.getByText("Provider ID: provider-created-1")).toBeInTheDocument();
    expect(screen.getByText("Apex Warranty")).toBeInTheDocument();
  });

  it("opens providers in the same master-detail workflow as dealerships", async () => {
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
          <AdminProvidersPage2 />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("Existing Provider");
    await user.click(screen.getByRole("button", { name: /team/i }));

    expect(await screen.findByRole("button", { name: /back to providers/i })).toBeInTheDocument();
    expect(screen.getByText("Provider ID: provider-1")).toBeInTheDocument();
    expect(screen.getByText("Provider Settings")).toBeInTheDocument();
    expect(screen.getByText("Team Members")).toBeInTheDocument();
    expect(screen.getByText("Admins")).toBeInTheDocument();
    expect(screen.getByText("Members")).toBeInTheDocument();
  });

  it("keeps list actions focused and supports provider search and filters", async () => {
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
          <AdminProvidersPage2 />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("Existing Provider");
    expect(screen.getByText("All Providers (1)")).toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 1 providers")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /manage team/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^suspend$/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/search providers/i), "missing");
    expect(screen.getByText("No providers match your filters")).toBeInTheDocument();
    expect(screen.getByText("Showing 0 of 1 providers")).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/search providers/i));
    await user.selectOptions(screen.getByLabelText(/status filter/i), "suspended");
    expect(screen.getByText("No providers match your filters")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/status filter/i), "all");
    await user.selectOptions(screen.getByLabelText(/region filter/i), "Ontario");
    expect(screen.getByText("Existing Provider")).toBeInTheDocument();
  });

  it("lets superadmin add a provider employee to an existing provider", async () => {
    vi.mocked(invokeEdgeFunction).mockResolvedValueOnce({
      providerMemberId: "provider-member-created-1",
      userId: "provider-employee-created-1",
      temporaryPassword: "ProviderEmployeeTemp123!",
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
          <AdminProvidersPage2 />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("Existing Provider");
    await user.click(screen.getByRole("button", { name: /team/i }));
    await screen.findByText("Team Members");
    await user.type(screen.getByLabelText(/member full name/i), "Eli Employee");
    await user.type(screen.getByLabelText(/member email/i), "Employee@Provider.test");
    await user.click(screen.getByRole("button", { name: /add member/i }));

    await waitFor(() => {
      expect(invokeEdgeFunction).toHaveBeenCalledWith("company-access-tools", {
        action: "create_company_member",
        companyType: "provider",
        companyId: "provider-1",
        member: {
          firstName: "Eli",
          lastName: "Employee",
          email: "employee@provider.test",
          phone: undefined,
          role: "member",
        },
      });
    });
    expect(screen.getByText("Temporary password created")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ProviderEmployeeTemp123!")).toBeInTheDocument();
    expect(screen.getByText("Temporary password ready")).toBeInTheDocument();
    expect(screen.getByText("Display: Eli Employee")).toBeInTheDocument();
  });

  it("lets superadmin reset and remove provider members from the detail view", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(invokeEdgeFunction).mockResolvedValue({
      temporaryPassword: "ProviderReset123!",
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
          <AdminProvidersPage2 />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("Existing Provider");
    await user.click(screen.getByRole("button", { name: /team/i }));
    await screen.findByText("admin@provider.test");

    await user.click(screen.getByRole("button", { name: /reset password/i }));
    await waitFor(() => {
      expect(invokeEdgeFunction).toHaveBeenCalledWith("company-access-tools", {
        action: "generate_temporary_password",
        companyType: "provider",
        companyId: "provider-1",
        userId: "provider-admin-1",
      });
    });
    expect(screen.getByDisplayValue("ProviderReset123!")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /remove/i }));
    await waitFor(() => {
      expect(invokeEdgeFunction).toHaveBeenCalledWith("company-access-tools", {
        action: "remove_company_member",
        companyType: "provider",
        companyId: "provider-1",
        memberId: "provider-member-admin-1",
        userId: "provider-admin-1",
      });
    });
  });
});
