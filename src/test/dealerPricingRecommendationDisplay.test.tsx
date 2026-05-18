import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ConfigurationPage from "../pages/dealership/settings/ConfigurationPage";

let authUser = {
  id: "dealer-admin-1",
  email: "admin@example.com",
  role: "DEALER_ADMIN",
};

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
    user: authUser,
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

type TestPricingRow = {
  product_id: string;
  dealer_cost: Record<string, number>;
  retail_price: Record<string, number>;
  confidentiality_enabled: boolean;
  sort_order: number | null;
};

const defaultPricingRows: TestPricingRow[] = [
  {
    product_id: "product-1",
    dealer_cost: {},
    retail_price: { "t0|m-|r0|term0": 889 },
    confidentiality_enabled: true,
    sort_order: null,
  },
];

let pricingRows: TestPricingRow[] = defaultPricingRows;
const dealershipPricingUpsertMock = vi.fn(() => Promise.resolve({ data: null, error: null }));
const dealershipPricingUpdateMock = vi.fn();

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

    chain.update = vi.fn((payload) => {
      isUpdating = true;
      updateEqCount = 0;
      dealershipPricingUpdateMock(payload);
      return chain;
    });
    chain.upsert = dealershipPricingUpsertMock;
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
    authUser = {
      id: "dealer-admin-1",
      email: "admin@example.com",
      role: "DEALER_ADMIN",
    };
    pricingRows = defaultPricingRows;
    dealershipPricingUpsertMock.mockClear();
    dealershipPricingUpdateMock.mockClear();
    delete (window as any).__warrantyhub_confirm__;
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

  it("resets selected plan retail back to provider suggested retail", async () => {
    pricingRows = [
      {
        product_id: "product-1",
        dealer_cost: { "t0|m-|r0|term0": 199 },
        retail_price: { "t0|m-|r0|term0": 999 },
        confidentiality_enabled: true,
        sort_order: null,
      },
    ];
    (window as any).__warrantyhub_confirm__ = vi.fn().mockResolvedValue(true);

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /provider one/i }));
    await user.click(await screen.findByRole("button", { name: /test warranty/i }));

    expect(await screen.findByText("$999")).toBeInTheDocument();
    expect(screen.getByText("Cost $199")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reset retail/i }));

    await waitFor(() => {
      expect(screen.getByText("$889")).toBeInTheDocument();
    });
    expect(screen.queryByText("$999")).not.toBeInTheDocument();
    expect(screen.getByText("Cost $199")).toBeInTheDocument();
    expect((window as any).__warrantyhub_confirm__).toHaveBeenCalledWith(
      "Reset retail prices for this plan back to provider suggested retail?",
      "Reset retail pricing",
    );
  });

  it("does not expose dealer cost editing in dealership configuration", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /provider one/i }));
    await user.click(await screen.findByRole("button", { name: /test warranty/i }));

    expect(await screen.findByText("Cost $189")).toBeInTheDocument();
    expect(screen.queryByText(/click either pencil/i)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/clear custom cost/i)).not.toBeInTheDocument();
  });

  it("allows the EasyDrive super admin account to edit dealer cost overrides", async () => {
    authUser = {
      id: "easydrive-super-admin",
      email: "info@easydrivecanada.com",
      role: "SUPER_ADMIN",
    };
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /provider one/i }));
    await user.click(await screen.findByRole("button", { name: /test warranty/i }));

    await user.click(await screen.findByTitle(/edit dealer cost/i));
    const costInput = screen.getByRole("spinbutton", { name: /^dealer cost$/i });
    await user.clear(costInput);
    await user.type(costInput, "275");
    await user.click(screen.getByRole("button", { name: /save dealer cost/i }));

    await waitFor(() => {
      expect(dealershipPricingUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          dealer_cost: { "t0|m-|r0|term0": 275 },
        }),
      );
    });
    expect(await screen.findByText("Cost $275")).toBeInTheDocument();
  });

  it("warns before turning customer retail off because dealer cost may be shown", async () => {
    pricingRows = [
      {
        product_id: "product-1",
        dealer_cost: {},
        retail_price: { "t0|m-|r0|term0": 889 },
        confidentiality_enabled: true,
        sort_order: null,
      },
    ];
    (window as any).__warrantyhub_confirm__ = vi.fn().mockResolvedValue(false);

    const user = userEvent.setup();
    renderPage();

    const toggle = await screen.findByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "true");

    await user.click(toggle);

    await waitFor(() => {
      expect((window as any).__warrantyhub_confirm__).toHaveBeenCalledWith(
        expect.stringContaining("customers may see dealer cost"),
        "Show dealer cost?",
      );
    });
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("turns customer retail on without the dealer-cost exposure warning", async () => {
    pricingRows = [
      {
        product_id: "product-1",
        dealer_cost: {},
        retail_price: { "t0|m-|r0|term0": 889 },
        confidentiality_enabled: false,
        sort_order: null,
      },
    ];
    (window as any).__warrantyhub_confirm__ = vi.fn().mockResolvedValue(false);

    const user = userEvent.setup();
    renderPage();

    const toggle = await screen.findByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await user.click(toggle);

    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-checked", "true");
    });
    expect((window as any).__warrantyhub_confirm__).not.toHaveBeenCalled();
  });

  it("persists customer retail visibility for products without existing pricing rows", async () => {
    pricingRows = [];
    (window as any).__warrantyhub_confirm__ = vi.fn().mockResolvedValue(true);

    const user = userEvent.setup();
    renderPage();

    const toggle = await screen.findByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await user.click(toggle);

    await waitFor(() => {
      expect(dealershipPricingUpsertMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            dealership_id: "dealership-1",
            product_id: "product-1",
            retail_price: {},
            confidentiality_enabled: true,
          }),
        ],
        { onConflict: "dealership_id,product_id" },
      );
    });
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });
});
