# BridgeWarranty Product And Pricing Updates Design

## Context

BridgeWarranty needs three focused updates in the dealer product and pricing workflow:

- Make the product category filters easier to see on the dealer Find Products page.
- Add Infinite Auto Care as a service provider with three published PPF products.
- Keep per-cell recommended retail values visible after a dealer applies prices, so admins can still compare the saved retail price with the current Conservative, Standard, or Aggressive suggestion.

The relevant code paths are:

- `src/pages/dealership/FindProductsPage.tsx` for dealer product discovery filters.
- `src/pages/dealership/settings/ConfigurationPage.tsx` for dealer retail pricing configuration.
- Supabase provider/product seed migrations for adding service providers and product pricing.

## Product Discovery Filters

The Find Products filter bar currently places provider filters first and product-type filters to the right beside search. Extended Warranty and Gap Insurance can be visually missed.

Move product-type filters to the front of the sticky filter bar, before provider chips. The visible filter set will include:

- Extended Warranty
- Gap Insurance
- Tire and Rim
- PPF

PPF will match products with `product_type = 'PPF'`. Existing aliases for Extended Warranty, Gap Insurance, and Tire and Rim remain supported.

The provider chips and search input remain in the same filter bar. The layout should wrap cleanly on smaller widths without hiding the product-type controls.

## Infinite Auto Care Provider And Products

Add Infinite Auto Care as an active provider/company. Seed three PPF products as published/customer-visible immediately:

| Product | Description | Type | Dealer Cost | Suggested Retail |
| --- | --- | --- | --- | --- |
| PPF - Partial Front | Bumper, partial hood, partial fenders. | PPF | $540 | $899 |
| PPF - Full Front | Full bumper, full hood, full fenders, mirrors. | PPF | $1,080 | $1,799 |
| PPF - Full Body | Self-healing film over the entire painted body. | PPF | $2,997 | $4,995 |

The migration should follow the existing provider seed style:

- Upsert provider company data.
- Upsert provider data with approved/active status.
- Associate products with the provider entity.
- Store the pricing in the existing `pricing_json` structure so dealer product discovery and configuration can parse dealer cost and suggested retail.
- Make products published by default.

Use `not-provided@infiniteautocare.local` as the provider company contact email unless a real contact email is supplied later, consistent with existing seed migrations.

## Pricing Configuration Recommendation Display

In Dealer Pricing Configuration, each price cell currently shows an admin-only `Rec $X` action only when no custom retail price is saved. After `Fill empty` or `Apply to all`, the recommendation disappears, which makes it hard to see what the selected Conservative, Standard, or Aggressive mode would recommend next.

Change the cell behavior for admin users:

- Keep the saved/applied retail price as the main blue value.
- Always show a small `REC $X` recommendation reference when a recommendation can be calculated.
- Update the `REC $X` value whenever the selected strategy changes.
- Keep the `REC $X` control clickable so it applies that recommendation to the individual cell.
- If no custom retail exists, keep the existing behavior of showing the provider suggested retail as the default visible retail price.

This keeps saved values and recommendation previews distinct:

- Main price = currently saved/customer retail value.
- `REC $X` = calculated recommendation for the selected strategy.

The explanatory helper text below the table should be updated so admins understand that `REC` values update with the selected margin profile and can be clicked to apply to a cell.

## Data Flow

Find Products reads published products from Supabase, enriches them with provider names, applies product-type and provider filters, and displays customer-facing price ranges. Adding PPF to the product-type filter is a frontend-only filter update, assuming products are seeded with `product_type = 'PPF'`.

The Infinite Auto Care migration creates the provider and products. Once the migration runs, published PPF products appear in provider filters, product discovery, and dealer configuration based on existing queries.

Dealer Pricing Configuration parses product pricing into structured tiers and matrix rows. For each cell, it already computes:

- Effective dealer cost.
- Current retail value.
- Current recommendation for the selected strategy.

The UI change keeps rendering the recommendation even after `retailMap[key]` has a saved value.

## Error Handling

The seed migration should be safe to re-run with `ON CONFLICT` upserts. Product IDs should be stable so updates replace the seeded products rather than duplicating them.

If Infinite Auto Care cannot be associated with a provider member, use the same fallback approach as existing provider migrations so seed data remains deployable in the current project.

For the pricing UI, if a recommendation cannot be calculated for a cell, do not show `REC`. Existing non-numeric and included cells keep their current display behavior.

## Testing

Add focused tests where practical:

- Product-type filter logic includes PPF.
- Dealer pricing cells continue showing a `REC` recommendation after a custom retail value is applied.
- Existing employee/team tests are not part of this feature and should remain unaffected.

Run the full test suite and production build after implementation.
