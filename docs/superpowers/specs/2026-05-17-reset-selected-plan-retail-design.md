# Reset Selected Plan Retail Design

## Context

Dealer admins need a way to put retail prices back to provider defaults if custom retail values were applied by mistake. This is for Dealer Pricing Configuration in `src/pages/dealership/settings/ConfigurationPage.tsx`.

## Behavior

Add a `Reset retail` button for the currently selected plan only.

The button will:

- Clear all custom `retail_price` overrides for the selected product.
- Keep custom `dealer_cost` overrides unchanged.
- Leave provider product pricing unchanged.
- Return visible customer retail values to provider suggested retail defaults.
- Keep `REC` recommendation controls visible after reset.
- Show a confirmation prompt before clearing saved retail overrides.
- Show a success toast after reset.

## Placement

Place the button near the Suggested retail controls because it is a retail-pricing action. It should be visible only to dealership admins, matching the existing pricing action controls.

## Data Flow

The selected product's custom pricing is stored in `dealership_product_pricing.retail_price`. Resetting retail will persist an empty retail map `{}` for the selected product while preserving the existing `dealer_cost` map and `confidentiality_enabled` setting.

After persistence succeeds, local `pricingConfigs` state updates through the existing pricing persistence path, so the table rerenders immediately with provider suggested retail values.

## Error Handling

If no product is selected, the action does nothing.

If persistence fails, show the existing destructive toast style with the error message. Do not clear local state unless the database write succeeds.

## Testing

Add focused coverage that starts with a selected product having a custom retail value, clicks `Reset retail`, confirms the action, and verifies the table returns to the provider suggested retail value while dealer cost remains unchanged.
