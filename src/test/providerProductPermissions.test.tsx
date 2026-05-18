import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProviderProductsPage2 from "../pages/provider/ProviderProductsPage2";

let providerRole = "member";

vi.mock("../providers/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: "provider-member-1",
      email: "member@provider.test",
      role: "provider",
      providerRole,
    },
  }),
}));

vi.mock("../hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("../lib/products/productsV2", () => ({
  getProductsV2Api: () => ({
    list: vi.fn().mockResolvedValue([
      {
        id: "product-1",
        providerEntityId: "provider-1",
        name: "Powertrain",
        type: "VSC",
        status: "active",
        pricing: { rows: [] },
        coverageDetails: { categories: [] },
        updatedAt: "2026-05-19T00:00:00.000Z",
      },
    ]),
    update: vi.fn(),
    create: vi.fn(),
  }),
}));

describe("Provider product permissions", () => {
  beforeEach(() => {
    providerRole = "member";
  });

  it("hides product editing controls from provider members", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <ProviderProductsPage2 />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Powertrain")).toBeInTheDocument();
    });

    expect(screen.queryByRole("link", { name: /add product/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /ai import/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });
});
