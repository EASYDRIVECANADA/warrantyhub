import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ConfigurationPage from "../pages/dealership/settings/ConfigurationPage";

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
    signOut: vi.fn(),
  }),
}));

vi.mock("../hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const productRows = [
  {
    id: "product-1",
    name: "Test Warranty",
    product_type: "VSC",
    provider_entity_id: "provider-1",
    provider_id: null,
    published: true,
    eligibility_rules: {},
    coverage_details_json: {},
    coverage_details: {},
    pricing_json: {
      rows: [
        {
          label: "12 Months / 20,000 km",
          vehicleClass: "$1,000 Per Claim",
          dealerCost: 189,
          suggestedRetail: 889,
        },
      ],
    },
  },
];

const pricingRows = [
  {
    product_id: "product-1",
    dealer_cost: {},
    retail_price: { "t0|m-|r0|term0": 889 },
    confidentiality_enabled: true,
    sort_order: null,
  },
];

function makeSupabaseChain(table: string) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
  chain.update = vi.fn(() => chain);
  chain.upsert = vi.fn(() => Promise.resolve({ data: null, error: null }));

  if (table === "products") {
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn(() => Promise.resolve({ data: productRows, error: null }));
  }

  if (table === "providers") {
    chain.in = vi.fn(() => Promise.resolve({ data: [{ id: "provider-1", company_name: "Provider One" }], error: null }));
  }

  if (table === "dealership_product_pricing") {
    let isUpdating = false;
    let updateEqCount = 0;

    chain.update = vi.fn(() => {
      isUpdating = true;
      updateEqCount = 0;
      return chain;
    });
    chain.eq = vi.fn(() => {
      if (!isUpdating) {
        return Promise.resolve({ data: pricingRows, error: null });
      }

      updateEqCount += 1;
      return updateEqCount >= 2 ? Promise.resolve({ data: null, error: null }) : chain;
    });
  }

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
        <ConfigurationPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("dealer pricing recommendation display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps REC visible after a retail price has been applied", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /provider one/i }));
    await user.click(await screen.findByRole("button", { name: /test warranty/i }));

    expect(await screen.findByText("$889")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /REC \$889/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /aggressive/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /REC \$1,089/i })).toBeInTheDocument();
    });
    expect(screen.getByText("$889")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /REC \$1,089/i }));

    await waitFor(() => {
      expect(screen.getByText("$1,089")).toBeInTheDocument();
    });
    expect(screen.queryByText("$889")).not.toBeInTheDocument();
  });
});
