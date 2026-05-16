import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    functions: {
      invoke: invokeMock,
    },
  }),
}));

import { invokeEdgeFunction } from "../lib/supabase/functions";

describe("invokeEdgeFunction", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("surfaces JSON error messages returned by edge functions", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: new Response(JSON.stringify({ error: "password is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      },
    });

    await expect(invokeEdgeFunction("dealer-team-tools", { action: "create_employee" })).rejects.toThrow(
      "password is required",
    );
  });
});
