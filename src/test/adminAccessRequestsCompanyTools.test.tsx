import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminAccessRequestsPage } from "../pages/AdminAccessRequestsPage";
import { invokeEdgeFunction } from "../lib/supabase/functions";

const requestRows = [
  {
    id: "request-provider-1",
    requester_id: "provider-user-1",
    request_type: "PROVIDER",
    company: "Apex Warranty",
    name: "Provider Admin",
    email: "admin@apex.test",
    message: null,
    rejection_message: null,
    status: "PENDING",
    created_at: "2026-05-19T00:00:00.000Z",
    reviewed_at: null,
    reviewed_by_email: null,
    assigned_role: null,
    assigned_company: null,
  },
];

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
  invokeEdgeFunction: vi.fn().mockResolvedValue({ ok: true }),
}));

function makeSupabaseChain(table: string) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.order = vi.fn(() => Promise.resolve({ data: table === "access_requests" ? requestRows : [], error: null }));
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
        <AdminAccessRequestsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminAccessRequestsPage company access tools integration", () => {
  beforeEach(() => {
    vi.mocked(invokeEdgeFunction).mockClear();
  });

  it("approves provider requests through the shared company-access-tools function", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Provider Admin");
    await user.click(screen.getByRole("button", { name: /approve/i }));

    await waitFor(() => {
      expect(invokeEdgeFunction).toHaveBeenCalledWith("company-access-tools", {
        action: "approve_access_request",
        requestId: "request-provider-1",
        companyType: "provider",
        assignedCompany: "Apex Warranty",
        assignedRole: "PROVIDER",
      });
    });
  });
});
