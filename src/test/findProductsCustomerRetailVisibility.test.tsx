import { render, screen, waitFor } from "@testing-library/react";
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
    id: "product-1",
    name: "Customer Hidden Warranty",
    product_type: "VSC",
    published: true,
    provider_entity_id: "provider-1",
    provider_id: null,
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
    coverage_details_json: {},
    eligibility_rules: {},
  },
];

let pricingRows: Array<{
  product_id: string;
  retail_price: Record<string, number>;
  confidentiality_enabled: boolean;
  sort_order: number | null;
}> = [];

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
    chain.in = vi.fn(() => Promise.resolve({ data: [{ id: "provider-1", company_name: "Provider One" }], error: null }));
  }

  if (table === "dealership_product_pricing") {
    chain.eq = vi.fn(() => Promise.resolve({ data: pricingRows, error: null }));
  }

  return chain;
}

vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => makeSupabaseChain(table)),
  },
}));

describe("FindProductsPage customer retail visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pricingRows = [];
  });

  it("shows dealer cost on product cards when customer retail is disabled", async () => {
    pricingRows = [
      {
        product_id: "product-1",
        retail_price: { "t0|m-|r0|term0": 999 },
        confidentiality_enabled: false,
        sort_order: null,
      },
    ];

    render(
      <MemoryRouter>
        <FindProductsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Customer Hidden Warranty")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("$999")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("$889")).not.toBeInTheDocument();
    expect(screen.getByText("$189")).toBeInTheDocument();
    expect(screen.getByText("Dealer cost")).toBeInTheDocument();
  });

  it("shows saved dealer retail on product cards when customer retail is enabled", async () => {
    pricingRows = [
      {
        product_id: "product-1",
        retail_price: { "t0|m-|r0|term0": 999 },
        confidentiality_enabled: true,
        sort_order: null,
      },
    ];

    render(
      <MemoryRouter>
        <FindProductsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Customer Hidden Warranty")).toBeInTheDocument();
    expect(await screen.findByText("$999")).toBeInTheDocument();
    expect(screen.getByText("Retail price")).toBeInTheDocument();
    expect(screen.queryByText("$889")).not.toBeInTheDocument();
    expect(screen.queryByText("$189")).not.toBeInTheDocument();
  });
});
