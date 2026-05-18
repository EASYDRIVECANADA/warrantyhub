import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.hoisted(() => vi.fn());

function insertResult(data: any, error: any = null) {
  return {
    select: () => ({
      single: () => Promise.resolve({ data, error }),
    }),
  };
}

const contractRow = {
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
};

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
    insertMock.mockReturnValue(insertResult(contractRow));
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

  it("retries without optional date columns when the schema cache is missing start_date", async () => {
    insertMock
      .mockReturnValueOnce(
        insertResult(null, {
          message: "Could not find the 'start_date' column of 'contracts' in the schema cache",
        }),
      )
      .mockReturnValueOnce(insertResult(contractRow));

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
      endDate: "2027-05-18",
    });

    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(insertMock.mock.calls[0][0]).toHaveProperty("start_date", "2026-05-18");
    expect(insertMock.mock.calls[0][0]).toHaveProperty("end_date", "2027-05-18");
    expect(insertMock.mock.calls[1][0]).not.toHaveProperty("start_date");
    expect(insertMock.mock.calls[1][0]).not.toHaveProperty("end_date");
  });
});
