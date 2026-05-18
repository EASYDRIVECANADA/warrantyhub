# Dealer Retail-Only Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure dealer admins can change only customer-facing retail prices while provider/base/dealer costs remain provider-owned.

**Architecture:** Keep dealer retail overrides in dealer-owned pricing configuration, remove dealer cost mutation paths from dealer UI/client code, and add a database trigger that rejects non-service/non-super-admin writes to `dealership_product_pricing.dealer_cost`. Provider product pricing remains in provider-owned product/product-pricing tables.

**Tech Stack:** React, TypeScript, Vitest source/behavior tests, Supabase SQL/RLS/trigger hardening.

---

### Task 1: Pin Dealer UI Cost Mutation Risk

**Files:**
- Modify: `src/test/dealerPricingRecommendationDisplay.test.tsx`
- Modify: `src/test/companyAccessToolsSource.test.ts`

- [ ] Add a failing test/source assertion that dealer configuration no longer exposes cost edit controls or writes `dealer_cost`.
- [ ] Run `npm test -- src/test/dealerPricingRecommendationDisplay.test.tsx` and confirm it fails before implementation.

### Task 2: Remove Dealer Cost Writes From Dealer Configuration

**Files:**
- Modify: `src/pages/dealership/settings/ConfigurationPage.tsx`
- Modify: `src/lib/dealershipPricing/types.ts`
- Modify: `src/lib/dealershipPricing/supabaseDealershipPricing.ts`

- [ ] Change dealer pricing persistence to send only `retail_price`, `confidentiality_enabled`, and `sort_order`.
- [ ] Remove cost editing controls from the dealership configuration matrix.
- [ ] Keep cost visible as read-only source data for margin calculations.
- [ ] Run targeted tests until green.

### Task 3: Database Guard

**Files:**
- Modify: `supabase/schema.sql`
- Create: `supabase/migrations/20260519030000_dealer_retail_only_pricing.sql`
- Modify: `src/test/platformHardeningSource.test.ts`

- [ ] Add a trigger function that blocks non-service-role, non-super-admin insert/update attempts that set or change `dealership_product_pricing.dealer_cost`.
- [ ] Add a migration containing the same trigger.
- [ ] Add source tests that assert the trigger and policy guard exist.

### Task 4: Verify

**Commands:**
- `npm test`
- `npm run build`

- [ ] Confirm all tests pass.
- [ ] Confirm the build passes.
