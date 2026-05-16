# BridgeWarranty Product Pricing Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make product-type filters easier to see, add Infinite Auto Care published PPF products, and keep admin pricing recommendations visible after retail prices are applied.

**Architecture:** Move product-type filter definitions into a small shared module so filter behavior can be tested without rendering the page. Add Infinite Auto Care with a repeatable Supabase migration that follows existing provider seed patterns. Update the Dealer Pricing Configuration cell renderer so saved retail and current strategy recommendation are separate visible values.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Supabase SQL migrations.

---

## File Structure

- Create `src/lib/products/productTypeFilters.ts`: Owns dealer product-type filter labels, aliases, and match logic.
- Modify `src/pages/dealership/FindProductsPage.tsx`: Imports shared filter definitions, adds PPF, and moves product-type buttons before provider chips.
- Create `src/test/productTypeFilters.test.ts`: Covers PPF matching and existing aliases.
- Create `supabase/migrations/20260517010000_infinite_auto_care_ppf_products.sql`: Seeds Infinite Auto Care provider/company and three published PPF products.
- Modify `src/pages/dealership/settings/ConfigurationPage.tsx`: Always renders admin `REC $X` recommendation controls when a recommendation exists.
- Create `src/test/dealerPricingRecommendationDisplay.test.tsx`: Renders the configuration table and verifies `REC` remains visible after a custom retail value exists.

---

### Task 1: Product Type Filter Module And Find Products Layout

**Files:**
- Create: `src/lib/products/productTypeFilters.ts`
- Create: `src/test/productTypeFilters.test.ts`
- Modify: `src/pages/dealership/FindProductsPage.tsx`

- [ ] **Step 1: Write the failing product-type filter test**

Create `src/test/productTypeFilters.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { PRODUCT_TYPE_FILTERS, matchesProductTypeFilter } from "../lib/products/productTypeFilters";

describe("dealer product type filters", () => {
  it("includes PPF as a visible product type filter", () => {
    expect(PRODUCT_TYPE_FILTERS.map((filter) => filter.label)).toContain("PPF");
    expect(matchesProductTypeFilter("PPF", "PPF")).toBe(true);
  });

  it("keeps existing aliases for core product types", () => {
    expect(matchesProductTypeFilter("EXTENDED_WARRANTY", "VSC")).toBe(true);
    expect(matchesProductTypeFilter("warranty", "VSC")).toBe(true);
    expect(matchesProductTypeFilter("GAP", "GAP")).toBe(true);
    expect(matchesProductTypeFilter("TIRE_RIM", "Tire & Rim")).toBe(true);
  });

  it("does not match unrelated product types", () => {
    expect(matchesProductTypeFilter("GAP", "PPF")).toBe(false);
    expect(matchesProductTypeFilter("PPF", "GAP")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
npm test -- src/test/productTypeFilters.test.ts
```

Expected: FAIL because `../lib/products/productTypeFilters` does not exist.

- [ ] **Step 3: Create the shared filter module**

Create `src/lib/products/productTypeFilters.ts`:

```ts
export type ProductTypeFilter = {
  value: string;
  label: string;
  aliases: string[];
};

export const PRODUCT_TYPE_FILTERS: ProductTypeFilter[] = [
  { value: "VSC", label: "Extended Warranty", aliases: ["VSC", "EXTENDED_WARRANTY", "warranty"] },
  { value: "GAP", label: "Gap Insurance", aliases: ["GAP"] },
  { value: "Tire & Rim", label: "Tire and Rim", aliases: ["Tire & Rim", "TIRE_RIM", "tire_rim"] },
  { value: "PPF", label: "PPF", aliases: ["PPF"] },
];

export function matchesProductTypeFilter(productType: string, selectedType: string) {
  const filter = PRODUCT_TYPE_FILTERS.find((item) => item.value === selectedType);
  return filter ? filter.aliases.includes(productType) : true;
}
```

- [ ] **Step 4: Update Find Products imports and remove local filter definitions**

In `src/pages/dealership/FindProductsPage.tsx`, add this import near the existing product imports:

```ts
import { compareProductsByConfiguredOrder } from "../../lib/products/defaultProductOrder";
import { PRODUCT_TYPE_FILTERS, matchesProductTypeFilter } from "../../lib/products/productTypeFilters";
```

Remove this local block from `FindProductsPage.tsx`:

```ts
const PRODUCT_TYPE_FILTERS = [
  { value: "VSC", label: "Extended Warranty", aliases: ["VSC", "EXTENDED_WARRANTY", "warranty"] },
  { value: "GAP", label: "Gap Insurance", aliases: ["GAP"] },
  { value: "Tire & Rim", label: "Tire and Rim", aliases: ["Tire & Rim", "TIRE_RIM", "tire_rim"] },
];

const matchesProductTypeFilter = (productType: string, selectedType: string) => {
  const filter = PRODUCT_TYPE_FILTERS.find((item) => item.value === selectedType);
  return filter ? filter.aliases.includes(productType) : true;
};
```

- [ ] **Step 5: Move product-type buttons before provider chips**

Replace the filter bar body in `src/pages/dealership/FindProductsPage.tsx` with this structure:

```tsx
<div className="px-6 md:px-8 py-3 flex flex-wrap items-center gap-3">
  <div className="flex items-center gap-1 overflow-x-auto">
    {PRODUCT_TYPE_FILTERS.map((type) => (
      <button
        key={type.value}
        onClick={() => setSelectedType(type.value)}
        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${selectedType === type.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
      >
        {type.label}
      </button>
    ))}
  </div>

  <div className="flex items-center gap-1 overflow-x-auto">
    <button
      onClick={() => setSelectedProvider("all")}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${selectedProvider === "all" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
    >
      All Providers
    </button>
    {providers.map((prov) => (
      <button
        key={prov}
        onClick={() => setSelectedProvider(prov)}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${selectedProvider === prov ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
      >
        {prov}
      </button>
    ))}
  </div>

  <div className="relative ml-auto">
    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
    <Input placeholder="Search plans..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-44 h-8 pl-8 text-sm" />
  </div>
</div>
```

This keeps product types first, keeps provider chips visible, and leaves search aligned right when space allows.

- [ ] **Step 6: Run product-type tests and commit**

Run:

```bash
npm test -- src/test/productTypeFilters.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/lib/products/productTypeFilters.ts src/test/productTypeFilters.test.ts src/pages/dealership/FindProductsPage.tsx
git commit -m "feat: add visible PPF product filters"
```

---

### Task 2: Infinite Auto Care PPF Seed Migration

**Files:**
- Create: `supabase/migrations/20260517010000_infinite_auto_care_ppf_products.sql`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260517010000_infinite_auto_care_ppf_products.sql`:

```sql
-- Infinite Auto Care - PPF provider and product seed.
-- Source: BridgeWarranty PPF product screenshot supplied May 2026.
--
-- Safe to re-run: provider rows are upserted and Infinite Auto Care products are refreshed.

DO $$
DECLARE
  v_eid CONSTANT uuid := 'a046b4d6-e40b-450b-922e-827b963b0dd2';
  v_company_id CONSTANT uuid := '1aabd3ec-a373-4cfd-be47-ccb69132fccf';
  v_pid uuid;
BEGIN
  INSERT INTO public.provider_companies (
    id,
    provider_company_name,
    legal_business_name,
    business_type,
    contact_email,
    status,
    notes
  )
  VALUES (
    v_company_id,
    'Infinite Auto Care',
    'Infinite Auto Care',
    'WARRANTY_PROVIDER',
    'not-provided@infiniteautocare.local',
    'ACTIVE',
    'Seeded from BridgeWarranty PPF product screenshot. Email was not provided; local fallback email used to satisfy provider_companies.contact_email.'
  )
  ON CONFLICT (id) DO UPDATE SET
    provider_company_name = excluded.provider_company_name,
    legal_business_name = excluded.legal_business_name,
    business_type = excluded.business_type,
    contact_email = excluded.contact_email,
    status = excluded.status,
    notes = excluded.notes,
    updated_at = now();

  SELECT user_id INTO v_pid
  FROM public.provider_members
  WHERE provider_id = v_eid
  LIMIT 1;

  IF v_pid IS NULL THEN
    SELECT legacy_profile_id INTO v_pid
    FROM public.providers
    WHERE id = v_eid
    LIMIT 1;
  END IF;

  IF v_pid IS NULL THEN
    SELECT id INTO v_pid
    FROM public.profiles
    WHERE upper(role) = 'PROVIDER'
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF v_pid IS NULL THEN
    SELECT id INTO v_pid
    FROM public.profiles
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'No profiles found - cannot insert Infinite Auto Care products';
  END IF;

  INSERT INTO public.providers (
    id,
    company_name,
    regions_served,
    description,
    status
  )
  VALUES (
    v_eid,
    'Infinite Auto Care',
    ARRAY['Canada'],
    'Service provider offering Paint Protection Film packages including partial front, full front, and full body coverage.',
    'approved'
  )
  ON CONFLICT (id) DO UPDATE SET
    company_name = excluded.company_name,
    regions_served = excluded.regions_served,
    description = excluded.description,
    status = excluded.status,
    updated_at = now();

  DELETE FROM public.products WHERE provider_entity_id = v_eid;

  INSERT INTO public.products (
    id,
    provider_entity_id,
    provider_id,
    name,
    product_type,
    coverage_details_json,
    pricing_json,
    eligibility_rules,
    published
  )
  VALUES
  (
    '219e737e-f7d0-4362-a8ea-c1d3aedf3aeb',
    v_eid,
    v_pid,
    'PPF - Partial Front',
    'PPF',
    $json$
    {
      "description": "Infinite Auto Care Paint Protection Film partial front package.",
      "categories": [
        { "name": "Coverage", "parts": ["Bumper", "Partial hood", "Partial fenders"] }
      ],
      "termsSections": [
        { "title": "Package", "content": "Bumper, partial hood, partial fenders." }
      ]
    }
    $json$::jsonb,
    $json$
    {
      "source": "BridgeWarranty PPF product screenshot supplied May 2026.",
      "rows": [
        { "label": "PPF Package", "vehicleClass": "Standard", "dealerCost": 540, "suggestedRetail": 899 }
      ]
    }
    $json$::jsonb,
    '{}'::jsonb,
    true
  ),
  (
    'c8f4b556-8d68-4c8e-87dd-e3940edc6836',
    v_eid,
    v_pid,
    'PPF - Full Front',
    'PPF',
    $json$
    {
      "description": "Infinite Auto Care Paint Protection Film full front package.",
      "categories": [
        { "name": "Coverage", "parts": ["Full bumper", "Full hood", "Full fenders", "Mirrors"] }
      ],
      "termsSections": [
        { "title": "Package", "content": "Full bumper, full hood, full fenders, mirrors." }
      ]
    }
    $json$::jsonb,
    $json$
    {
      "source": "BridgeWarranty PPF product screenshot supplied May 2026.",
      "rows": [
        { "label": "PPF Package", "vehicleClass": "Standard", "dealerCost": 1080, "suggestedRetail": 1799 }
      ]
    }
    $json$::jsonb,
    '{}'::jsonb,
    true
  ),
  (
    '6d8f5c3d-0b37-46a5-b582-8d7b0d8072bb',
    v_eid,
    v_pid,
    'PPF - Full Body',
    'PPF',
    $json$
    {
      "description": "Infinite Auto Care Paint Protection Film full body package.",
      "categories": [
        { "name": "Coverage", "parts": ["Self-healing film over the entire painted body"] }
      ],
      "termsSections": [
        { "title": "Package", "content": "Self-healing film over the entire painted body." }
      ]
    }
    $json$::jsonb,
    $json$
    {
      "source": "BridgeWarranty PPF product screenshot supplied May 2026.",
      "rows": [
        { "label": "PPF Package", "vehicleClass": "Standard", "dealerCost": 2997, "suggestedRetail": 4995 }
      ]
    }
    $json$::jsonb,
    '{}'::jsonb,
    true
  );
END $$;
```

- [ ] **Step 2: Sanity-check migration content**

Run:

```bash
rg -n "Infinite Auto Care|PPF - Partial Front|PPF - Full Front|PPF - Full Body|published" supabase/migrations/20260517010000_infinite_auto_care_ppf_products.sql
```

Expected: output includes the provider name, all three product names, and `published` in the insert column list.

- [ ] **Step 3: Commit the migration**

Commit:

```bash
git add supabase/migrations/20260517010000_infinite_auto_care_ppf_products.sql
git commit -m "feat: seed Infinite Auto Care PPF products"
```

---

### Task 3: Persistent REC Recommendation Display

**Files:**
- Create: `src/test/dealerPricingRecommendationDisplay.test.tsx`
- Modify: `src/pages/dealership/settings/ConfigurationPage.tsx`

- [ ] **Step 1: Write the failing pricing recommendation display test**

Create `src/test/dealerPricingRecommendationDisplay.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ConfigurationPage from "../pages/dealership/settings/ConfigurationPage";

vi.mock("../hooks/useDealership", () => ({
  useDealership: () => ({
    dealershipId: "dealership-1",
    dealershipName: "Bridge Warranty Dealer",
    memberRole: "admin",
    loading: false,
    reloadDealership: vi.fn(),
  }),
}));

vi.mock("../hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const productRows = [
  {
    id: "product-1",
    name: "Test Warranty",
    product_type: "VSC",
    provider_entity_id: "provider-1",
    provider_id: null,
    published: true,
    eligibility_rules: {},
    coverage_details_json: {},
    coverage_details: {},
    pricing_json: {
      rows: [
        {
          label: "12 Months / 20,000 km",
          vehicleClass: "$1,000 Per Claim",
          dealerCost: 189,
          suggestedRetail: 889,
        },
      ],
    },
  },
];

const pricingRows = [
  {
    product_id: "product-1",
    dealer_cost: {},
    retail_price: { "t0|m-|r0|term0": 889 },
    confidentiality_enabled: true,
    sort_order: null,
  },
];

function makeSupabaseChain(table: string) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
  chain.update = vi.fn(() => chain);
  chain.upsert = vi.fn(() => Promise.resolve({ data: null, error: null }));

  if (table === "products") {
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn(() => Promise.resolve({ data: productRows, error: null }));
  }

  if (table === "providers") {
    chain.in = vi.fn(() => Promise.resolve({ data: [{ id: "provider-1", company_name: "Provider One" }], error: null }));
  }

  if (table === "dealership_product_pricing") {
    chain.eq = vi.fn(() => Promise.resolve({ data: pricingRows, error: null }));
  }

  return chain;
}

vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => makeSupabaseChain(table)),
  },
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <ConfigurationPage />
    </QueryClientProvider>,
  );
}

describe("dealer pricing recommendation display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps REC visible after a retail price has been applied", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /provider one/i }));
    await user.click(await screen.findByRole("button", { name: /test warranty/i }));

    expect(await screen.findByText("$889")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /REC \$889/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /aggressive/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /REC \$1,089/i })).toBeInTheDocument();
    });
    expect(screen.getByText("$889")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the pricing test and verify it fails**

Run:

```bash
npm test -- src/test/dealerPricingRecommendationDisplay.test.tsx
```

Expected: FAIL because no `REC` button is rendered when `retail_price` already has a custom value.

- [ ] **Step 3: Update the cell renderer to always show REC for admins**

In `src/pages/dealership/settings/ConfigurationPage.tsx`, replace this block near the end of `renderCell`:

```tsx
{isAdmin && recommendation && !hasCustom && !isEditingRetail && (
  <button
    type="button"
    title={recommendation.reason}
    className="w-fit rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-100"
    onClick={() => saveCell("retail", key, recommendation.retail)}
  >
    Rec {fmt(recommendation.retail)} · {recommendation.confidence}
  </button>
)}
```

with:

```tsx
{isAdmin && recommendation && !isEditingRetail && (
  <button
    type="button"
    title={recommendation.reason}
    className={cn(
      "w-fit rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
      hasCustom && recommendation.retail === suggested
        ? "bg-green-50 text-green-700"
        : "bg-amber-50 text-amber-700 hover:bg-amber-100"
    )}
    onClick={() => saveCell("retail", key, recommendation.retail)}
  >
    REC {fmt(recommendation.retail)} · {recommendation.confidence}
  </button>
)}
```

- [ ] **Step 4: Update helper text below the table**

Replace the existing paragraph text below the pricing matrix in `src/pages/dealership/settings/ConfigurationPage.tsx`:

```tsx
Click either pencil to edit dealer cost or customer retail. Grey italic retail values show provider suggested retail until you save a custom price. Rec values are generated from dealer cost, term length, claim tier, and the selected margin profile.
```

with:

```tsx
Click either pencil to edit dealer cost or customer retail. Grey italic retail values show provider suggested retail until you save a custom price. REC values update with the selected margin profile and can be clicked to apply that suggested retail to one cell.
```

- [ ] **Step 5: Run pricing test and commit**

Run:

```bash
npm test -- src/test/dealerPricingRecommendationDisplay.test.tsx
```

Expected: PASS.

Commit:

```bash
git add src/test/dealerPricingRecommendationDisplay.test.tsx src/pages/dealership/settings/ConfigurationPage.tsx
git commit -m "feat: keep dealer pricing recommendations visible"
```

---

### Task 4: Full Verification

**Files:**
- Verify all modified files from Tasks 1-3.

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test
```

Expected: all test files pass.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected: build completes successfully. The existing Vite warning about chunks over 500 kB can remain.

- [ ] **Step 3: Check git status**

Run:

```bash
git status --short
```

Expected: no uncommitted files.

- [ ] **Step 4: Report deployment notes**

Include these notes in the final response:

```text
The migration must be applied to Supabase before Infinite Auto Care appears in production data.
The frontend build must be deployed before the moved filters and persistent REC labels appear in production.
```
