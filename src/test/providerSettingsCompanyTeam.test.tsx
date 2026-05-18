import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProviderSettingsPage from "../pages/provider/ProviderSettingsPage";
import { invokeEdgeFunction } from "../lib/supabase/functions";

const toast = vi.fn();
let providerRole = "admin";
let providerMembers = [
  {
    id: "provider-member-admin-1",
    user_id: "provider-admin-1",
    role: "admin",
    created_at: "2026-05-19T00:00:00.000Z",
  },
];

vi.mock("../providers/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: "provider-admin-1",
      email: "admin@provider.test",
      role: "provider",
      providerRole,
    },
  }),
}));

vi.mock("../hooks/use-toast", () => ({
  useToast: () => ({ toast }),
}));

vi.mock("../lib/supabase/functions", () => ({
  invokeEdgeFunction: vi.fn().mockResolvedValue({
    userId: "provider-member-1",
    temporaryPassword: "ProviderTemp123!",
  }),
}));

function makeSupabaseChain(table: string) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.in = vi.fn(() => Promise.resolve({
    data: [
      { id: "provider-admin-1", email: "admin@provider.test", full_name: "Provider Admin" },
      { id: "provider-member-1", email: "member@provider.test", full_name: "Provider Member" },
    ],
    error: null,
  }));
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));

  if (table === "provider_members") {
    chain.maybeSingle = vi.fn(() => Promise.resolve({
      data: { provider_id: "provider-1", role: providerRole },
      error: null,
    }));
    chain.eq = vi.fn(() => chain);
    chain.select = vi.fn(() => chain);
    chain.then = undefined;
  }

  if (table === "providers") {
    chain.maybeSingle = vi.fn(() => Promise.resolve({
      data: {
        id: "provider-1",
        company_name: "Apex Warranty",
        description: "",
        contact_email: "info@provider.test",
        contact_phone: "",
        address: "",
        regions_served: ["Ontario"],
      },
      error: null,
    }));
    chain.update = vi.fn(() => chain);
  }

  const originalEq = chain.eq as any;
  chain.eq = vi.fn((column: string, value: string) => {
    originalEq?.(column, value);
    if (table === "provider_members" && column === "provider_id") {
      return Promise.resolve({ data: providerMembers, error: null });
    }
    return chain;
  });

  return chain;
}

vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => makeSupabaseChain(table)),
  },
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
      <MemoryRouter>
        <ProviderSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProviderSettingsPage team management", () => {
  beforeEach(() => {
    toast.mockClear();
    vi.mocked(invokeEdgeFunction).mockClear();
    providerRole = "admin";
    providerMembers = [
      {
        id: "provider-member-admin-1",
        user_id: "provider-admin-1",
        role: "admin",
        created_at: "2026-05-19T00:00:00.000Z",
      },
    ];
  });

  it("creates provider members through company-access-tools and shows the temporary password", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("tab", { name: /team/i }));
    await user.click(screen.getByRole("button", { name: /add member/i }));
    await user.type(screen.getByPlaceholderText("John Doe"), "Pat Provider");
    await user.type(screen.getByPlaceholderText("john@company.com"), "member@provider.test");
    await user.click(screen.getByRole("button", { name: /create member/i }));

    await waitFor(() => {
      expect(invokeEdgeFunction).toHaveBeenCalledWith("company-access-tools", {
        action: "create_company_member",
        companyType: "provider",
        companyId: "provider-1",
        member: {
          firstName: "Pat",
          lastName: "Provider",
          email: "member@provider.test",
          phone: undefined,
          role: "member",
        },
      });
    });
    expect(screen.getByText("Temporary password created")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ProviderTemp123!")).toBeInTheDocument();
  });
});
