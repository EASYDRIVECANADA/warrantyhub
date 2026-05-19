import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProductCoveragePage from "../pages/dealership/ProductCoveragePage";

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

const product = {
  id: "product-1",
  name: "Test Warranty",
  type: "VSC",
  status: "active",
  provider_entity_id: "provider-1",
  provider_id: null,
  pricing_json: {
    deductible: "10000",
    rows: [
      {
        label: "Eesf",
        vehicleClass: "Class 1",
        dealerCost: 100,
        suggestedRetail: 0,
      },
    ],
  },
  coverage_details_json: {},
  eligibility_rules: {},
};

let dealerPricing: null | {
  retail_price: Record<string, number>;
  confidentiality_enabled: boolean;
  selling_enabled: boolean;
} = null;

function makeSupabaseChain(table: string) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));

  if (table === "products") {
    chain.single = vi.fn(() => Promise.resolve({ data: product, error: null }));
  }

  if (table === "providers") {
    chain.single = vi.fn(() => Promise.resolve({ data: { id: "provider-1", company_name: "Provider One" }, error: null }));
  }

  if (table === "dealership_product_pricing") {
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: dealerPricing, error: null }));
  }

  return chain;
}

vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => makeSupabaseChain(table)),
  },
}));

describe("ProductCoveragePage configure-first pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dealerPricing = null;
  });

  it("does not show a zero-dollar base price before the dealer configures selling", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/dealership/products/product-1"]}>
        <Routes>
          <Route path="/dealership/products/:id" element={<ProductCoveragePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /test class 1/i });
    await user.click(screen.getByRole("button", { name: /pricing & options/i }));

    const basePricing = screen.getByRole("heading", { name: /base pricing/i }).closest("div");
    expect(basePricing).not.toBeNull();

    await waitFor(() => {
      expect(within(basePricing as HTMLElement).queryByRole("button", { name: "$0" })).not.toBeInTheDocument();
    });
    expect(within(basePricing as HTMLElement).getByRole("button", { name: /setup required/i })).toBeDisabled();
  });
});
