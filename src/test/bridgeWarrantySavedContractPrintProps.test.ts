import { describe, expect, it } from "vitest";

import { buildSavedBridgeWarrantyContractProps } from "../lib/contracts/bridgeWarrantyPrintProps";

describe("buildSavedBridgeWarrantyContractProps", () => {
  it("maps a saved contract into the Bridge Warranty application print template", () => {
    const props = buildSavedBridgeWarrantyContractProps({
      brandName: "Bridge Warranty",
      contract: {
        id: "d3658611-1111-2222-3333-444444444444",
        customer_first_name: "asdf",
        customer_last_name: "asdf",
        customer_email: "buyer@example.com",
        customer_phone: "555-123-4567",
        customer_address: "123 Main Street",
        customer_city: "Toronto",
        customer_province: "ON",
        customer_postal_code: "M1M 1M1",
        vin: "1G1ZK577884203782",
        vehicle_year: 2008,
        vehicle_make: "CHEVROLET",
        vehicle_model: "Malibu",
        vehicle_mileage: 1212,
        vehicle_engine: "2.4L",
        vehicle_transmission: "Automatic",
        contract_price: 609,
        pricing_vehicle_class: "Bronze - $750 Per Claim",
        pricing_term_months: 3,
        pricing_term_km: 3000,
        pricing_base_price_cents: 55900,
        pricing_dealer_cost_cents: 5900,
        addon_snapshot: [{ name: "Unlimited km", retail: 50, retailDisplay: undefined }],
        addon_total_retail_cents: 5000,
        addon_total_cost_cents: 0,
        start_date: "2026-05-18",
        end_date: "2026-08-18",
        created_at: "2026-05-18T12:00:00Z",
      },
      product: {
        name: "Powertrain Warranty",
        product_type: "VSC",
        pricing_json: { deductible: "100" },
        coverage_details_json: {
          categories: [{ name: "Engine" }, { name: "Transmission" }],
          termsSections: [{ title: "Eligibility", content: "Eligible vehicles only." }],
          exclusions: ["Batteries"],
        },
      },
      dealer: {
        name: "EASYDRIVE CANADA",
        phone: "416-555-0000",
        address: "99 Dealer Road",
      },
      providerName: "Aprotect Warranty",
    });

    expect(props.contractNumber).toBe("BW-D3658611");
    expect(props.customer.address).toBe("123 Main Street");
    expect(props.vehicle.mileageKm).toBe("1,212 km");
    expect(props.vehicle.engineSize).toBe("2.4L");
    expect(props.warranty.providerName).toBe("Aprotect Warranty");
    expect(props.warranty.termLabel).toBe("3 Months / 3,000 km");
    expect(props.warranty.deductibleLabel).toBe("$100");
    expect(props.warranty.basePriceLabel).toBe("$559");
    expect(props.warranty.totalPriceLabel).toBe("$609");
    expect(props.coverage.productType).toBe("VSC");
    expect(props.coverage.components).toEqual(["Engine", "Transmission"]);
    expect(props.coverage.addOns).toEqual([{ name: "Unlimited km", priceLabel: "$50" }]);
    expect(props.termsSections).toEqual([{ title: "Eligibility", content: "Eligible vehicles only." }]);
    expect(props.exclusions).toEqual(["Batteries"]);
  });
});
