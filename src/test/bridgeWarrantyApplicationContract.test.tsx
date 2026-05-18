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
    expect(screen.getByText("COST OF COVERAGE")).toBeInTheDocument();
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

    expect(screen.getByText("Bridge Warranty Product Terms")).toBeInTheDocument();
    expect(screen.getByText("Product And Provider Terms")).toBeInTheDocument();
    expect(screen.getByText("Claims And Authorization")).toBeInTheDocument();
    expect(screen.getByText("General Exclusions")).toBeInTheDocument();
    expect(screen.getByText("Cancellation And Transfer")).toBeInTheDocument();
    expect(screen.getByText("Provider-Specific Terms")).toBeInTheDocument();
    expect(screen.getByText("Provider Eligibility")).toBeInTheDocument();
  });

  it("prints product-aware application titles and terms for non-VSC products", () => {
    render(
      <BridgeWarrantyApplicationContract
        brandName="Bridge Warranty"
        contractNumber="BW76024"
        issueDate="May 18, 2026"
        purchaseDate="May 18, 2026"
        customer={{ firstName: "Cyril", lastName: "Warren" }}
        dealer={{ name: "Easy Drive Canada" }}
        vehicle={{ vin: "5N1YT4M98RB503974" }}
        warranty={{
          productName: "Road Hazard Tire and Rim",
          termLabel: "24 Months",
          deductibleLabel: "$0",
          totalPriceLabel: "$499",
          basePriceLabel: "$449",
        }}
        coverage={{
          title: "Road Hazard Tire and Rim",
          productType: "Tire & Rim",
          components: ["Tires", "Rims", "Mounting and balancing"],
          addOns: [{ name: "Cosmetic rim repair", priceLabel: "$50" }],
        }}
        termsSections={[{ title: "Provider Road Hazard Terms", content: "Provider tire and rim terms apply." }]}
        exclusions={["Cosmetic damage unless selected"]}
      />,
    );

    expect(screen.getByText("TIRE AND RIM PROTECTION APPLICATION")).toBeInTheDocument();
    expect(screen.getAllByText(/Road Hazard Tire and Rim/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Selected Product And Services")).toBeInTheDocument();
    expect(screen.getByText(/road hazard tire and rim protection/i)).toBeInTheDocument();
    expect(screen.getByText("Selected Coverage Categories")).toBeInTheDocument();
    expect(screen.getAllByText("Tires").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cosmetic rim repair - $50").length).toBeGreaterThan(0);
    expect(screen.getByText("Provider Road Hazard Terms")).toBeInTheDocument();
  });

  it("does not force mostly blank full-height print pages", () => {
    const { container } = render(
      <BridgeWarrantyApplicationContract
        brandName="Bridge Warranty"
        contractNumber="BW76025"
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
          title: "Powertrain Protection",
          productType: "VSC",
          components: ["Engine", "Transmission"],
          addOns: [],
        }}
      />,
    );

    expect(container.innerHTML).not.toContain("min-h-[260mm]");
  });
});
