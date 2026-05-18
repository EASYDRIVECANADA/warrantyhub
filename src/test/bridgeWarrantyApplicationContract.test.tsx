import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BridgeWarrantyApplicationContract } from "../components/contracts/BridgeWarrantyApplicationContract";

describe("BridgeWarrantyApplicationContract", () => {
  it("renders the Bridge Warranty application-style contract structure", () => {
    render(
      <BridgeWarrantyApplicationContract
        brandName="Bridge Warranty"
        contractNumber="BW76021"
        issueDate="May 18, 2026"
        purchaseDate="2026-05-18"
        expiryDate="2027-05-18"
        customer={{
          firstName: "Cyril",
          lastName: "Warren",
          email: "buyer@example.com",
          phone: "555-123-4567",
        }}
        dealer={{
          name: "Easy Drive Canada",
        }}
        vehicle={{
          year: 2024,
          make: "Honda",
          model: "Pilot",
          vin: "5N1YT4M98RB503974",
          mileageKm: "72,000",
        }}
        warranty={{
          productName: "Powertrain Protection",
          providerName: "Bridge Provider",
          termLabel: "6 Months / Unlimited KM",
          deductibleLabel: "$100",
          totalPriceLabel: "$609",
          basePriceLabel: "$589",
          startDateLabel: "2026-05-18",
        }}
        coverage={{
          title: "POWERTRAIN PROTECTION",
          components: ["Engine", "Transmission", "Differential"],
          addOns: [{ name: "Seals & Gaskets", priceLabel: "Included" }],
        }}
        termsSections={[{ title: "Eligibility", content: "Available on eligible vehicles." }]}
        exclusions={["Batteries"]}
      />,
    );

    expect(screen.getByText("EXTENDED LIMITED WARRANTY APPLICATION")).toBeInTheDocument();
    expect(screen.getByText("Bridge Warranty")).toBeInTheDocument();
    expect(screen.getByText("CUSTOMER / LESSEE INFORMATION")).toBeInTheDocument();
    expect(screen.getByText("DEALERSHIP / VEHICLE INFORMATION")).toBeInTheDocument();
    expect(screen.getByText("COST OF WARRANTY")).toBeInTheDocument();
    expect(screen.getByText("CUSTOMER ACKNOWLEDGMENT")).toBeInTheDocument();
    expect(screen.getByText("POWERTRAIN PROTECTION")).toBeInTheDocument();
    expect(screen.getByText("APPLICANT:")).toBeInTheDocument();
  });
});
