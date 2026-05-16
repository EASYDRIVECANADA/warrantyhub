import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TeamManagementPage from "../pages/dealership/settings/TeamManagementPage";
import { invokeEdgeFunction } from "../lib/supabase/functions";

const toast = vi.fn();
const dealershipMembersUpsert = vi.fn(() => Promise.resolve({ data: null, error: null as Error | null }));
let existingProfileByEmail: { id: string } | null = null;
let dealershipById: { legacy_dealer_id: string | null } | null = null;
let legacyMembers: any[] = [];
let profilesById: any[] = [];

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
  }),
}));

vi.mock("../hooks/use-toast", () => ({
  useToast: () => ({ toast }),
}));

vi.mock("../lib/supabase/functions", () => ({
  invokeEdgeFunction: vi.fn().mockResolvedValue({
    dealerMemberId: "member-1",
    userId: "employee-1",
    temporaryPassword: "TempPass123!",
  }),
}));

function makeSupabaseChain(table: string) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  chain.insert = vi.fn(() => Promise.resolve({ data: null, error: null }));
  chain.update = vi.fn(() => chain);
  chain.upsert = vi.fn(() => Promise.resolve({ data: null, error: null }));
  chain.delete = vi.fn(() => chain);

  if (table === "dealership_members") {
    chain.upsert = dealershipMembersUpsert;
    chain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
  }

  if (table === "profiles") {
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => Promise.resolve({ data: profilesById, error: null }));
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: existingProfileByEmail, error: null }));
  }

  if (table === "dealerships") {
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: dealershipById, error: null }));
  }

  if (table === "dealer_members") {
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn(() => Promise.resolve({ data: legacyMembers, error: null }));
  }

  return chain;
}

vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => makeSupabaseChain(table)),
  },
}));

describe("dealership settings team creation", () => {
  beforeEach(() => {
    toast.mockClear();
    dealershipMembersUpsert.mockClear();
    existingProfileByEmail = null;
    dealershipById = null;
    legacyMembers = [];
    profilesById = [];
    vi.mocked(invokeEdgeFunction).mockClear();
  });

  it("creates a brand-new employee instead of requiring an existing account", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TeamManagementPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: /add member/i }));
    await user.type(screen.getByPlaceholderText("team@example.com"), "employee@example.com");
    await user.type(screen.getByPlaceholderText("John Doe"), "Jane Employee");
    await user.type(screen.getByPlaceholderText("(555) 123-4567"), "555-111-2222");
    await user.click(screen.getByRole("button", { name: /create employee/i }));

    await waitFor(() => {
      expect(invokeEdgeFunction).toHaveBeenCalledWith("dealer-team-tools", {
        action: "create_employee",
        employee: {
          firstName: "Jane",
          lastName: "Employee",
          phone: "555-111-2222",
          email: "employee@example.com",
          password: expect.any(String),
          role: "DEALER_EMPLOYEE",
        },
      });
    });

    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "User Not Found" }));
    expect(screen.getByText("Temporary password created")).toBeInTheDocument();
  });

  it("sends a temporary password for older deployed employee-create functions", async () => {
    vi.mocked(invokeEdgeFunction).mockResolvedValueOnce({
      dealerMemberId: "member-1",
      userId: "employee-1",
    });

    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TeamManagementPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: /add member/i }));
    await user.type(screen.getByPlaceholderText("team@example.com"), "legacy@example.com");
    await user.type(screen.getByPlaceholderText("John Doe"), "Legacy Employee");
    await user.click(screen.getByRole("button", { name: /create employee/i }));

    await waitFor(() => {
      expect(invokeEdgeFunction).toHaveBeenCalled();
    });

    const payload = vi.mocked(invokeEdgeFunction).mock.calls[0]?.[1] as {
      employee?: { password?: string };
    };
    const fallbackPassword = payload.employee?.password;

    expect(fallbackPassword).toMatch(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*]).{16}$/);
    expect(screen.getByDisplayValue(fallbackPassword!)).toBeInTheDocument();
  });

  it("links the created auth user to the current dealership for older deployed functions", async () => {
    vi.mocked(invokeEdgeFunction).mockResolvedValueOnce({
      dealerMemberId: "legacy-member-1",
      userId: "employee-legacy-1",
    });

    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TeamManagementPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: /add member/i }));
    await user.type(screen.getByPlaceholderText("team@example.com"), "elaidelossantos05@gmail.com");
    await user.type(screen.getByPlaceholderText("John Doe"), "Elaide Lossantos");
    await user.click(screen.getByRole("button", { name: /create employee/i }));

    await waitFor(() => {
      expect(dealershipMembersUpsert).toHaveBeenCalledWith(
        {
          dealership_id: "dealership-1",
          user_id: "employee-legacy-1",
          role: "employee",
        },
        { onConflict: "user_id,dealership_id" },
      );
    });
  });

  it("still shows the temporary password when browser membership linking is blocked", async () => {
    dealershipMembersUpsert.mockResolvedValueOnce({ data: null, error: new Error("RLS denied") });
    vi.mocked(invokeEdgeFunction).mockResolvedValueOnce({
      dealerMemberId: "legacy-member-1",
      userId: "employee-legacy-1",
    });

    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TeamManagementPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: /add member/i }));
    await user.type(screen.getByPlaceholderText("team@example.com"), "blocked-link@example.com");
    await user.type(screen.getByPlaceholderText("John Doe"), "Blocked Link");
    await user.click(screen.getByRole("button", { name: /create employee/i }));

    await waitFor(() => {
      expect(screen.getByText("Temporary password created")).toBeInTheDocument();
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Member Added" }));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Error" }));
  });

  it("shows legacy dealer members created by older deployed functions", async () => {
    dealershipById = { legacy_dealer_id: "dealer-1" };
    legacyMembers = [
      {
        id: "legacy-member-1",
        user_id: "employee-legacy-1",
        role: "DEALER_EMPLOYEE",
        created_at: "2026-05-17T00:00:00.000Z",
      },
    ];
    profilesById = [
      {
        id: "employee-legacy-1",
        email: "elaidelossantos05@gmail.com",
        display_name: "Elaide Lossantos",
        first_name: "Elaide",
        last_name: "Lossantos",
        phone: null,
      },
    ];

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TeamManagementPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Elaide Lossantos")).toBeInTheDocument();
    expect(screen.getAllByText(/employee/i).length).toBeGreaterThan(0);
  });

  it("updates legacy dealer member roles without using the prefixed row id as a uuid", async () => {
    dealershipById = { legacy_dealer_id: "dealer-1" };
    legacyMembers = [
      {
        id: "50ae05bf-5ed0-4202-beb9-782f1b437648",
        user_id: "employee-legacy-1",
        role: "DEALER_EMPLOYEE",
        created_at: "2026-05-17T00:00:00.000Z",
      },
    ];
    profilesById = [
      {
        id: "employee-legacy-1",
        email: "elaidelossantos05@gmail.com",
        display_name: "Elaide Lossantos",
        first_name: "Elaide",
        last_name: "Lossantos",
        phone: "123123",
      },
    ];
    vi.mocked(invokeEdgeFunction).mockResolvedValueOnce({ ok: true });

    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TeamManagementPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Elaide Lossantos")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^employee$/i }));
    await user.click(screen.getByRole("option", { name: /^admin$/i }));

    await waitFor(() => {
      expect(invokeEdgeFunction).toHaveBeenCalledWith("dealer-team-tools", {
        action: "update_employee",
        dealerMemberId: "50ae05bf-5ed0-4202-beb9-782f1b437648",
        employee: {
          firstName: "Elaide",
          lastName: "Lossantos",
          phone: "123123",
          email: "elaidelossantos05@gmail.com",
          role: "DEALER_ADMIN",
        },
      });
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Role Updated" }));
  });

  it("generates a new temporary password for an existing team member", async () => {
    dealershipById = { legacy_dealer_id: "dealer-1" };
    legacyMembers = [
      {
        id: "legacy-member-1",
        user_id: "employee-legacy-1",
        role: "DEALER_EMPLOYEE",
        created_at: "2026-05-17T00:00:00.000Z",
      },
    ];
    profilesById = [
      {
        id: "employee-legacy-1",
        email: "elaidelossantos05@gmail.com",
        display_name: "Elaide Lossantos",
        first_name: "Elaide",
        last_name: "Lossantos",
        phone: null,
      },
    ];
    vi.mocked(invokeEdgeFunction).mockResolvedValueOnce({ temporaryPassword: "NewTempPass123!" });

    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TeamManagementPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Elaide Lossantos")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /new password/i }));

    await waitFor(() => {
      expect(invokeEdgeFunction).toHaveBeenCalledWith("dealer-team-tools", {
        action: "generate_temporary_password",
        userId: "employee-legacy-1",
      });
    });
    expect(screen.getByText("Temporary password created")).toBeInTheDocument();
    expect(screen.getByDisplayValue("NewTempPass123!")).toBeInTheDocument();
  });

  it("shows a copyable temporary code when deployed function does not support password generation yet", async () => {
    dealershipById = { legacy_dealer_id: "dealer-1" };
    legacyMembers = [
      {
        id: "legacy-member-1",
        user_id: "employee-legacy-1",
        role: "DEALER_EMPLOYEE",
        created_at: "2026-05-17T00:00:00.000Z",
      },
    ];
    profilesById = [
      {
        id: "employee-legacy-1",
        email: "elaidelossantos05@gmail.com",
        display_name: "Elaide Lossantos",
        first_name: "Elaide",
        last_name: "Lossantos",
        phone: null,
      },
    ];
    vi.mocked(invokeEdgeFunction).mockRejectedValueOnce(new Error("Unsupported action"));

    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TeamManagementPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Elaide Lossantos")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /new password/i }));

    await waitFor(() => {
      expect(screen.getByText("Temporary password created")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*]).{16}$/)).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Temporary Code Created" }));
  });

  it("links an existing profile when the account was already created without a dealership membership", async () => {
    existingProfileByEmail = { id: "employee-existing-1" };
    vi.mocked(invokeEdgeFunction).mockRejectedValueOnce(new Error("An account with this email already exists."));

    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TeamManagementPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: /add member/i }));
    await user.type(screen.getByPlaceholderText("team@example.com"), "elaidelossantos05@gmail.com");
    await user.type(screen.getByPlaceholderText("John Doe"), "Elaide Lossantos");
    await user.click(screen.getByRole("button", { name: /create employee/i }));

    await waitFor(() => {
      expect(dealershipMembersUpsert).toHaveBeenCalledWith(
        {
          dealership_id: "dealership-1",
          user_id: "employee-existing-1",
          role: "employee",
        },
        { onConflict: "user_id,dealership_id" },
      );
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Member Linked" }));
  });
});
