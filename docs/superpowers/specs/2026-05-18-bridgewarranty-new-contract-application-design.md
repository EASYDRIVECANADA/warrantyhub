# Bridge Warranty New Contract Application Design

## Scope

Update only the new-contract Save & Print Contract preview in `src/pages/dealership/NewContractPage.tsx`.
Do not change existing saved-contract detail pages or dedicated contract print pages.

## Visual Direction

Use the A-Protect reference packet as the visual model, with Bridge Warranty branding and existing WarrantyHub data.
The first printable page should read as a formal warranty application:

- prominent Bridge Warranty contract number
- administrator/contact block
- centered `EXTENDED LIMITED WARRANTY APPLICATION` title
- dark blue section bars
- dense customer, dealership, vehicle, warranty, and pricing grids
- right-side grey coverage panel with selected plan, covered components, and selected add-ons
- customer acknowledgement block
- purchase date, selling dealer, and applicant signature line

## Data Rules

Use only data already collected by the new-contract wizard. Do not invent lienholder, address, business phone, factory warranty, or tax fields.
When a field is unavailable, render `N/A` or leave a signature-style blank where the document expects handwritten completion.

Bridge Warranty replaces A-Protect as the platform brand. Provider name remains visible where product obligation belongs to the provider.

## Implementation Shape

Create a focused printable component under `src/components/contracts/`.
`NewContractPage.tsx` will pass the existing wizard values into that component instead of rendering the full printable contract inline.

## Verification

Add a React test that verifies the new component renders the formal application title, Bridge Warranty branding, the core section headings, the selected coverage sidebar, and signature/acknowledgement areas.
Run the focused test, full test suite, and production build.
