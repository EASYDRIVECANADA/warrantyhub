import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: "user-1" } } },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      insert: insertMock,
    })),
  }),
}));

import { supabaseContractsV2Api } from "../lib/contracts/supabaseContractsV2";

describe("supabaseContractsV2Api", () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockReturnValue({
      select: () => ({
        single: () =>
          Promise.resolve({
            data: {
              id: "contract-1",
              dealership_id: "dealership-1",
              provider_entity_id: "provider-1",
              product_id: "product-1",
              customer_first_name: "Ada",
              customer_last_name: "Lovelace",
              vin: "1HGCM82633A004352",
              vehicle_make: "Honda",
              vehicle_model: "Accord",
              vehicle_year: "2024",
              status_new: "draft",
              created_at: "2026-05-18T00:00:00.000Z",
              updated_at: "2026-05-18T00:00:00.000Z",
            },
            error: null,
          }),
      }),
    });
  });

  it("omits end_date from new contract inserts when no end date is provided", async () => {
    await supabaseContractsV2Api.create({
      dealershipId: "dealership-1",
      providerEntityId: "provider-1",
      productId: "product-1",
      customerFirstName: "Ada",
      customerLastName: "Lovelace",
      vehicleVin: "1HGCM82633A004352",
      vehicleMake: "Honda",
      vehicleModel: "Accord",
      vehicleYear: 2024,
      startDate: "2026-05-18",
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).not.toHaveProperty("end_date");
  });
});
