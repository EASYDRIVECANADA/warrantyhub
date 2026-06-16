import { render, screen, within } from "@testing-library/react";
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
        suggestedRetail: 589,
      },
    ],
  },
  coverage_details_json: {},
  eligibility_rules: {},
};

let dealerPricing: null | {
  dealer_cost?: Record<string, number>;
  retail_price: Record<string, number>;
  confidentiality_enabled: boolean;
  selling_enabled: boolean;
} = null;

function makeSupabaseChain(table: string) {
  const chain: Record<string, unknown> = {};
  let selectedColumns: string | null = null;
  chain.select = vi.fn((columns?: string) => {
    selectedColumns = typeof columns === "string" ? columns : null;
    return chain;
  });
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
    chain.maybeSingle = vi.fn(() => {
      if (!dealerPricing) return Promise.resolve({ data: null, error: null });
      const selected = selectedColumns
        ? selectedColumns.split(",").map((column) => column.trim()).filter(Boolean)
        : null;
      const data = selected
        ? Object.fromEntries(selected.map((column) => [column, (dealerPricing as Record<string, unknown>)[column]]))
        : dealerPricing;

      return Promise.resolve({ data, error: null });
    });
  }

  return chain;
}

vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => makeSupabaseChain(table)),
  },
}));

describe("ProductCoveragePage standard retail pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dealerPricing = null;
  });

  it("shows generated standard retail before the dealer configures selling", async () => {
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

    expect(await within(basePricing as HTMLElement).findByRole("button", { name: "$809" })).toBeEnabled();
    expect(within(basePricing as HTMLElement).queryByRole("button", { name: /setup required/i })).not.toBeInTheDocument();
    screen.getAllByRole("button", { name: /get a quote/i }).forEach((button) => {
      expect(button).toBeEnabled();
    });
  });

  it("shows generated standard retail when provider retail is not supplied", async () => {
    const originalPricing = product.pricing_json;
    product.pricing_json = {
      deductible: "100",
      rows: [
        {
          label: "12 Months / 20,000 km",
          vehicleClass: "$3,000 Claim Max - Class 1/2/3",
          dealerCost: 325,
          suggestedRetail: "n/a" as any,
        },
      ],
    };

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/dealership/products/product-1"]}>
        <Routes>
          <Route path="/dealership/products/:id" element={<ProductCoveragePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /test \$3,000 claim max/i });
    await user.click(screen.getByRole("button", { name: /pricing & options/i }));

    const basePricing = screen.getByRole("heading", { name: /base pricing/i }).closest("div");
    expect(basePricing).not.toBeNull();

    expect(await within(basePricing as HTMLElement).findByRole("button", { name: "$1,029" })).toBeEnabled();
    expect(within(basePricing as HTMLElement).queryByRole("button", { name: /setup required/i })).not.toBeInTheDocument();

    product.pricing_json = originalPricing;
  });

  it("shows dealer cost on product detail when customer retail is disabled", async () => {
    dealerPricing = {
      dealer_cost: { "t0|m-|r0|term0": 125 },
      retail_price: {},
      confidentiality_enabled: false,
      selling_enabled: false,
    };

    render(
      <MemoryRouter initialEntries={["/dealership/products/product-1"]}>
        <Routes>
          <Route path="/dealership/products/:id" element={<ProductCoveragePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /test class 1/i });

    expect(await screen.findAllByText("$125")).toHaveLength(2);
    expect(screen.getByText("Dealer cost")).toBeInTheDocument();
    expect(screen.queryByText("$809")).not.toBeInTheDocument();
    expect(screen.queryByText("Customer price")).not.toBeInTheDocument();
  });
});
