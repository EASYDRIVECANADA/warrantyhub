import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import FindProductsPage from "../pages/dealership/FindProductsPage";

vi.mock("../hooks/useDealership", () => ({
  useDealership: () => ({
    dealershipId: "dealership-1",
    dealershipName: "Bridge Warranty Dealer",
    memberRole: "admin",
    loading: false,
  }),
}));

vi.mock("../components/dashboard/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  dealershipNavItems: [],
}));

const products = [
  {
    id: "gap-product",
    name: "Gap Protection",
    product_type: "GAP",
    published: true,
    provider_entity_id: "gap-provider",
    provider_id: null,
    pricing_json: {
      rows: [{ label: "60 Months", vehicleClass: "Standard", dealerCost: 200, suggestedRetail: 500 }],
    },
    coverage_details_json: {},
    eligibility_rules: {},
  },
  {
    id: "ppf-product",
    name: "Paint Protection Film",
    product_type: "PPF",
    published: true,
    provider_entity_id: "ppf-provider",
    provider_id: null,
    pricing_json: {
      rows: [{ label: "Full Front", vehicleClass: "Standard", dealerCost: 400, suggestedRetail: 900 }],
    },
    coverage_details_json: {},
    eligibility_rules: {},
  },
];

function makeSupabaseChain(table: string) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));

  if (table === "products") {
    chain.order = vi.fn(() => Promise.resolve({ data: products, error: null }));
  }

  if (table === "providers") {
    chain.in = vi.fn(() =>
      Promise.resolve({
        data: [
          { id: "gap-provider", company_name: "Gap Provider" },
          { id: "ppf-provider", company_name: "Infinite Auto Care" },
        ],
        error: null,
      }),
    );
  }

  if (table === "dealership_product_pricing") {
    chain.eq = vi.fn(() => Promise.resolve({ data: [], error: null }));
  }

  return chain;
}

vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => makeSupabaseChain(table)),
  },
}));

describe("FindProductsPage dynamic filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("only shows provider tabs that have products in the active category", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <FindProductsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Gap Protection")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Gap Provider" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Infinite Auto Care" })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Extended Warranty" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tire and Rim" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "PPF" }));

    expect(await screen.findByText("Paint Protection Film")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Infinite Auto Care" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Gap Provider" })).not.toBeInTheDocument();
    });
  });
});
