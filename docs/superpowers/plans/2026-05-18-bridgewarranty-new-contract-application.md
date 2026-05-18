# Bridge Warranty New Contract Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the new-contract Save & Print Contract preview look like the A-Protect warranty application, rebranded for Bridge Warranty.

**Architecture:** Extract the printable new-contract document into a focused React component so the large wizard page only supplies data. The component owns the formal application layout, section bars, dense field grids, coverage sidebar, acknowledgement, and signature footer.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest, Testing Library.

---

## File Structure

- Create `src/components/contracts/BridgeWarrantyApplicationContract.tsx`: pure printable application component and small display helpers.
- Create `src/test/bridgeWarrantyApplicationContract.test.tsx`: regression test for the A-Protect-style Bridge Warranty contract structure.
- Modify `src/pages/dealership/NewContractPage.tsx`: import the component and replace the current inline printable contract markup for `currentStep === 4`.

## Tasks

### Task 1: Component Test

**Files:**
- Create: `src/test/bridgeWarrantyApplicationContract.test.tsx`

- [ ] **Step 1: Write the failing test**

Create a test that renders `BridgeWarrantyApplicationContract` with sample customer, dealer, vehicle, pricing, coverage, add-on, acknowledgement, and signature values. Assert these strings are present:

```tsx
expect(screen.getByText("EXTENDED LIMITED WARRANTY APPLICATION")).toBeInTheDocument();
expect(screen.getByText("Bridge Warranty")).toBeInTheDocument();
expect(screen.getByText("CUSTOMER / LESSEE INFORMATION")).toBeInTheDocument();
expect(screen.getByText("DEALERSHIP / VEHICLE INFORMATION")).toBeInTheDocument();
expect(screen.getByText("COST OF WARRANTY")).toBeInTheDocument();
expect(screen.getByText("CUSTOMER ACKNOWLEDGMENT")).toBeInTheDocument();
expect(screen.getByText("POWERTRAIN PROTECTION")).toBeInTheDocument();
expect(screen.getByText("APPLICANT:")).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test**

Run: `npm test -- src/test/bridgeWarrantyApplicationContract.test.tsx`
Expected: FAIL because `BridgeWarrantyApplicationContract` does not exist yet.

### Task 2: Printable Component

**Files:**
- Create: `src/components/contracts/BridgeWarrantyApplicationContract.tsx`

- [ ] **Step 1: Implement the component**

Create exported types and a component that renders:

- top administrator/header area
- centered application title
- left customer/dealer/vehicle/factory warranty/cost/acknowledgement grid
- right coverage panel
- footer signature/date fields
- optional terms/exclusions block after the application-style first page

- [ ] **Step 2: Run the focused test**

Run: `npm test -- src/test/bridgeWarrantyApplicationContract.test.tsx`
Expected: PASS.

### Task 3: Wire Into New Contract Flow

**Files:**
- Modify: `src/pages/dealership/NewContractPage.tsx`

- [ ] **Step 1: Import the component**

Import `BridgeWarrantyApplicationContract`.

- [ ] **Step 2: Replace inline printable markup**

Inside `currentStep === 4`, replace only the current printable contract document markup with `BridgeWarrantyApplicationContract`, passing the existing wizard values and computed pricing/coverage values.

- [ ] **Step 3: Run focused and full verification**

Run:

```bash
npm test -- src/test/bridgeWarrantyApplicationContract.test.tsx
npm test
npm run build
```

Expected: all pass. `npm run lint` may still fail on pre-existing warnings/errors unrelated to this change.
