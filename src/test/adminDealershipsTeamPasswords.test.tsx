import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminDealershipsPage } from "../pages/AdminDealershipsPage";
import { invokeEdgeFunction } from "../lib/supabase/functions";

vi.mock("../providers/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: "super-admin-1",
      email: "admin@bridge.test",
      role: "SUPER_ADMIN",
    },
  }),
}));

vi.mock("../lib/runtime", () => ({
  getAppMode: () => "supabase",
}));

vi.mock("../lib/utils", async () => {
  const actual = await vi.importActual<typeof import("../lib/utils")>("../lib/utils");
  return {
    ...actual,
    confirmProceed: vi.fn(() => Promise.resolve(true)),
  };
});

vi.mock("../lib/supabase/functions", () => ({
  invokeEdgeFunction: vi.fn(),
}));

const dealerRows = [
  {
    id: "dealer-1",
    name: "Bridge Test Dealer",
    markup_pct: 10,
    contract_fee_cents: 2500,
    subscription_status: "active",
    subscription_plan_key: "standard",
  },
];

const memberRows = [
  {
    id: "member-1",
    dealer_id: "dealer-1",
    user_id: "user-1",
    role: "DEALER_EMPLOYEE",
    status: "ACTIVE",
    profiles: {
      email: "employee@bridge.test",
      display_name: "Employee One",
      is_active: true,
    },
  },
];

function makeSupabaseChain(table: string) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() =>
    Promise.resolve({
      data: table === "dealers" ? dealerRows : table === "dealer_members" ? memberRows : [],
      error: null,
    }),
  );
  return chain;
}

vi.mock("../lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: vi.fn((table: string) => makeSupabaseChain(table)),
  }),
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
        <AdminDealershipsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminDealershipsPage dealer team passwords", () => {
  beforeEach(() => {
    vi.mocked(invokeEdgeFunction).mockReset();
  });

  it("lets super admins manually create a dealership with an initial admin", async () => {
    vi.mocked(invokeEdgeFunction).mockResolvedValue({
      dealerId: "dealer-created-1",
      dealershipId: "dealership-created-1",
      adminUserId: "admin-created-1",
      temporaryPassword: "DealerAdminTemp123!",
    });
    const user = userEvent.setup();

    renderPage();

    await screen.findByText("Bridge Test Dealer");
    await user.click(screen.getByRole("button", { name: /new dealership/i }));
    await user.type(screen.getByLabelText(/dealership name/i), "North Star Auto");
    await user.type(screen.getByLabelText(/admin email/i), "Owner@NorthStar.test");
    await user.clear(screen.getByLabelText(/markup percentage/i));
    await user.type(screen.getByLabelText(/markup percentage/i), "7");
    await user.clear(screen.getByLabelText(/contract fee/i));
    await user.type(screen.getByLabelText(/contract fee/i), "49.99");
    await user.click(screen.getByRole("button", { name: /^create dealership$/i }));

    await waitFor(() => {
      expect(invokeEdgeFunction).toHaveBeenCalledWith("admin-dealer-tools", {
        action: "create_dealer",
        dealer: {
          name: "North Star Auto",
          adminEmail: "Owner@NorthStar.test",
          markupPct: 7,
          contractFeeCents: 4999,
        },
      });
    });
    expect(await screen.findByText("Temporary password created")).toBeInTheDocument();
    expect(screen.getByDisplayValue("DealerAdminTemp123!")).toBeInTheDocument();
  });

  it("shows the generated temporary password after adding a dealer member", async () => {
    vi.mocked(invokeEdgeFunction).mockResolvedValue({
      dealerMemberId: "member-created-1",
      userId: "user-created-1",
      temporaryPassword: "DealerTemp123!",
    });
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByText("Bridge Test Dealer"));
    await user.type(screen.getByPlaceholderText("employee@company.com"), "NewUser@Bridge.test");
    await user.click(screen.getByRole("button", { name: /add member/i }));

    await waitFor(() => {
      expect(invokeEdgeFunction).toHaveBeenCalledWith("admin-dealer-tools", {
        action: "add_dealer_member",
        dealerId: "dealer-1",
        email: "NewUser@Bridge.test",
        role: "DEALER_EMPLOYEE",
        status: "ACTIVE",
        redirectTo: `${window.location.origin}/reset-password`,
      });
    });
    expect(await screen.findByText("Temporary password created")).toBeInTheDocument();
    expect(screen.getByDisplayValue("DealerTemp123!")).toBeInTheDocument();
  });

  it("can generate a new temporary password for an existing dealer member", async () => {
    vi.mocked(invokeEdgeFunction).mockResolvedValue({
      temporaryPassword: "ResetTemp123!",
    });
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByText("Bridge Test Dealer"));
    await user.click(await screen.findByRole("button", { name: /new password/i }));

    await waitFor(() => {
      expect(invokeEdgeFunction).toHaveBeenCalledWith("admin-dealer-tools", {
        action: "generate_temporary_password",
        userId: "user-1",
      });
    });
    expect(await screen.findByText("Temporary password created")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ResetTemp123!")).toBeInTheDocument();
  });
});
