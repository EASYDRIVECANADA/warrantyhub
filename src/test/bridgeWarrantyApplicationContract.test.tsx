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
    expect(screen.getAllByText("Bridge Warranty").length).toBeGreaterThan(0);
    expect(screen.getByText("CUSTOMER / LESSEE INFORMATION")).toBeInTheDocument();
    expect(screen.getByText("DEALERSHIP / VEHICLE INFORMATION")).toBeInTheDocument();
    expect(screen.getByText("COST OF WARRANTY")).toBeInTheDocument();
    expect(screen.getByText("CUSTOMER ACKNOWLEDGMENT")).toBeInTheDocument();
    expect(screen.getByText("POWERTRAIN PROTECTION")).toBeInTheDocument();
    expect(screen.getByText("APPLICANT:")).toBeInTheDocument();
  });

  it("prints provided customer, dealer, and optional vehicle details without requiring every vehicle field", () => {
    render(
      <BridgeWarrantyApplicationContract
        brandName="Bridge Warranty"
        contractNumber="BW76022"
        issueDate="May 18, 2026"
        purchaseDate="May 18, 2026"
        customer={{
          firstName: "Cyril",
          lastName: "Warren",
          initials: "CW",
          email: "buyer@example.com",
          phone: "555-123-4567",
          address: "123 Main Street",
          city: "Toronto",
          province: "ON",
          postalCode: "M1M 1M1",
        }}
        dealer={{
          name: "Easy Drive Canada",
          phone: "416-555-0000",
          address: "99 Dealer Road",
        }}
        vehicle={{
          vin: "5N1YT4M98RB503974",
          mileageKm: "72,000 km",
          type: "Personal",
          fuel: "Gas",
        }}
        warranty={{
          productName: "Powertrain Protection",
          termLabel: "6 Months / Unlimited KM",
          deductibleLabel: "$100",
          totalPriceLabel: "$609",
          basePriceLabel: "$589",
          startDateLabel: "May 18, 2026",
        }}
        coverage={{
          title: "POWERTRAIN PROTECTION",
          components: ["Engine"],
          addOns: [],
        }}
      />,
    );

    expect(screen.getByText("123 Main Street")).toBeInTheDocument();
    expect(screen.getByText("Toronto")).toBeInTheDocument();
    expect(screen.getByText("ON")).toBeInTheDocument();
    expect(screen.getByText("M1M 1M1")).toBeInTheDocument();
    expect(screen.getByText("416-555-0000")).toBeInTheDocument();
    expect(screen.getByText("Gas")).toBeInTheDocument();
    expect(screen.getAllByText("Personal").length).toBeGreaterThan(0);
  });

  it("adds Bridge Warranty contract terms pages and keeps provider-specific terms separate", () => {
    render(
      <BridgeWarrantyApplicationContract
        brandName="Bridge Warranty"
        contractNumber="BW76023"
        issueDate="May 18, 2026"
        purchaseDate="May 18, 2026"
        customer={{ firstName: "Cyril", lastName: "Warren" }}
        dealer={{ name: "Easy Drive Canada" }}
        vehicle={{ vin: "5N1YT4M98RB503974" }}
        warranty={{
          productName: "Powertrain Protection",
          termLabel: "6 Months / Unlimited KM",
          deductibleLabel: "$100",
          totalPriceLabel: "$609",
          basePriceLabel: "$589",
        }}
        coverage={{
          title: "POWERTRAIN PROTECTION",
          components: ["Engine", "Transmission"],
          addOns: [],
        }}
        termsSections={[{ title: "Provider Eligibility", content: "Provider eligibility rules apply." }]}
        exclusions={["Provider exclusion"]}
      />,
    );

    expect(screen.getByText("Bridge Warranty Service Contract Terms")).toBeInTheDocument();
    expect(screen.getByText("This Is Not An Insurance Policy")).toBeInTheDocument();
    expect(screen.getByText("Claims And Authorization")).toBeInTheDocument();
    expect(screen.getByText("General Exclusions")).toBeInTheDocument();
    expect(screen.getByText("Cancellation And Transfer")).toBeInTheDocument();
    expect(screen.getByText("Provider-Specific Terms")).toBeInTheDocument();
    expect(screen.getByText("Provider Eligibility")).toBeInTheDocument();
  });
});
