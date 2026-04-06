# WarrantyHub — Comprehensive Gap Analysis, Cleaned PRD, Phased Plan & Risk Register

**Prepared by:** Senior Product Manager & Full-Stack Architect  
**Date:** March 27, 2026  
**Input Documents:** WarrantyHub PRD & QA Audit Report v1.0 (March 26, 2026)  
**Platform Completion at Time of Audit:** 78%  
**Target Soft Launch:** April 12, 2026 (~16 calendar days from this report)

---

---

# OUTPUT 1 — GAP ANALYSIS

---

## 1.1 Contradictions

| # | PRD States | Audit States | Resolution Needed |
|---|-----------|-------------|-------------------|
| C-01 | Module 2 lists "Billing / subscription management" at P0 with 90% completion | Module 6 lists "Subscription checkout" at P0 as Implemented, but "Payment history view" at P1 is only partial (redirects to Stripe portal) | Clarify whether in-app payment history is P0 (required for launch) or P1 (can launch with Stripe portal redirect). The PRD's 90% on billing implies near-complete, but the payments page is only 70% per the audit. |
| C-02 | Module 1 lists "Admin approval of access requests" at P1, status "Partial — DEALER_EMPLOYEE approval disabled in Supabase mode" | Audit Priority Action Plan lists B-04 (DEALER_EMPLOYEE approval) as P0 — Must Fix Before Launch | The PRD rates this P1 but the audit escalates it to P0. Resolution: If dealers cannot onboard employees in production, this is P0. Reclassify to P0. |
| C-03 | Module 2 completion scores: PRD summary says "82%" for Dealer Portal | Audit section 2.1 also says 82%, but individual page scores range from 70% (DealerPaymentsPage) to 95% (DealerAdminPage, DealerConfigurePage) | No true conflict, but the aggregate masks the 70% on payments. Resolution: Flag DealerPaymentsPage separately as a P0 remediation target. |
| C-04 | PRD §1.4 states "Row-level security (RLS) on all DB tables — Implemented" | Audit does not independently verify RLS coverage on every table — only references `phase1_rls.sql` | Resolution: RLS must be verified table-by-table before launch. The PRD claim is unaudited. ⚠️ OPEN QUESTION: Has a security engineer reviewed RLS policies for completeness? |
| C-05 | Provider Portal completion: PRD §2.1 says 80%, §2.6 scorecard says 83% | Minor discrepancy between two sections of the same document | Resolution: Use 83% (the more detailed scorecard). Cosmetic — no impact on planning. |

---

## 1.2 Missing Requirements

### Functional (Features, Flows, Edge Cases)

| # | Missing Requirement | Implied By | Category |
|---|---------------------|-----------|----------|
| MR-F01 | **Contract cancellation / void workflow** — no mention of how a dealer or admin cancels or voids a submitted contract | Contract creation wizard exists (Module 2) — lifecycle must include cancellation | Edge case |
| MR-F02 | **Remittance rejection / dispute flow** — no process defined for when a provider disputes a remittance batch | Remittance tracking exists for both dealer and provider portals | Edge case |
| MR-F03 | **User deactivation / offboarding** — PRD describes approval and role assignment but not how to deactivate a user account or revoke access | Team management (add/edit/disable) exists for dealers — unclear for admin/super-admin level | Flow gap |
| MR-F04 | **Session timeout / inactivity handling** — no requirement for auto-logout after inactivity | B2B SaaS with financial data implies session management is required | Security flow |
| MR-F05 | **Email notification triggers** — no specification of which actions trigger email notifications (contract created, remittance submitted, access approved, etc.) | Forgot/reset password uses email — but transactional emails for business events are undefined | Feature gap |
| MR-F06 | **Bulk operations** — no mention of bulk approve/reject access requests, bulk contract actions, or bulk remittance operations | Admin manages multiple dealers/providers — volume implies bulk actions needed | Scalability |
| MR-F07 | **Data retention and deletion policy** — no specification for how long contracts, remittances, or audit logs are retained | Canadian data privacy requirements (PIPEDA) apply to this B2B platform | Compliance |
| MR-F08 | **Provider onboarding flow** — PRD describes dealer self-registration but no equivalent workflow for provider companies to onboard | Provider portal exists with full CRUD — but how does a new provider get into the system? | Flow gap |

### Non-Functional (Performance, Security, Accessibility, SEO)

| # | Missing Requirement | Implied By |
|---|---------------------|-----------|
| MR-NF01 | **Performance targets** — no page load time, API response time, or Core Web Vitals targets defined | Production SaaS platform requires measurable performance benchmarks |
| MR-NF02 | **Browser / device support matrix** — no specification of supported browsers or minimum versions | Web application — must define what is supported |
| MR-NF03 | **Accessibility standards (WCAG level)** — audit notes "no accessibility audit performed" | Canadian accessibility legislation (ACA) and B2B SaaS best practices |
| MR-NF04 | **Rate limiting** — no mention of API rate limiting on auth endpoints, edge functions, or public-facing routes | Security baseline for any production SaaS |
| MR-NF05 | **Data encryption at rest and in transit** — PRD does not specify encryption requirements | Supabase provides TLS by default, but explicit requirements should be documented |
| MR-NF06 | **Uptime / SLA target** — no availability target defined | B2B platform handling financial transactions implies high availability requirement |
| MR-NF07 | **SEO requirements** — no mention of SEO for the public-facing homepage / marketing pages | HomePage exists with marketing content — SEO is implied for lead generation |

### Operational (Monitoring, Error Handling, Logging, Backups)

| # | Missing Requirement | Implied By |
|---|---------------------|-----------|
| MR-O01 | **Error monitoring service** — audit explicitly flags "No error monitoring (Sentry, LogRocket, etc.) wired in" | Production deployment requires crash/error visibility |
| MR-O02 | **Database backup and recovery plan** — no mention of backup frequency, retention, or recovery procedure | Supabase provides automated backups on paid plans, but RTO/RPO targets are undefined |
| MR-O03 | **Incident response runbook** — no documented process for production incidents | Launching a financial platform requires on-call and incident response |
| MR-O04 | **Health check endpoint** — no mention of a system health or readiness endpoint | Required for deployment monitoring and uptime tracking |
| MR-O05 | **Log aggregation and retention** — audit logging exists (`lib/auditLog.ts`) but no specification for log storage, searchability, or retention period | Audit logs exist but operational use is undefined |
| MR-O06 | **CI/CD pipeline** — audit notes "netlify.toml present but no CI/CD pipeline configuration found" | Automated deployment and testing pipeline is required before launch |

---

## 1.3 Ambiguities

| # | Section | Statement | Needs to Specify | Status |
|---|---------|-----------|-----------------|--------|
| A-01 | Module 2 | "Dealer dashboard with KPIs" at 75% | Which KPIs exactly? What calculations, data sources, and refresh frequency? | ⚠️ OPEN QUESTION: Product owner must define the exact KPI list, formulas, and data sources for the dealer dashboard. |
| A-02 | Module 2 | "Contract creation wizard (multi-step)" at 80% | What are the exact steps? What validation occurs at each step? What happens if the user abandons mid-wizard? | ⚠️ OPEN QUESTION: Define wizard steps, per-step validation rules, and draft/abandon behavior. |
| A-03 | Module 2 | "Remittance batch creation" at 85% | What are the batch size limits? What happens when a batch contains invalid contracts? Can a batch be edited after creation? | ⚠️ OPEN QUESTION: Define batch constraints, validation rules, and edit/delete behavior. |
| A-04 | Module 6 | "Per-contract fee (STANDARD plan only)" | What is the fee amount? Is it configurable? When is it charged — on contract creation or submission? | ⚠️ OPEN QUESTION: Business must confirm per-contract fee amount, trigger event, and whether it is configurable per provider. |
| A-05 | Module 6 | "15-day free trial" | What happens at trial expiration? Is access revoked? Is there a grace period? Are there email reminders? | ⚠️ OPEN QUESTION: Define trial expiration behavior, grace period (if any), and notification sequence. |
| A-06 | Module 3 | "Pricing tiers (FLAT, MILEAGE, CLASS, FINANCE_MATRIX)" | No business rules documented for how each pricing model calculates the final price | ⚠️ OPEN QUESTION: Business must provide pricing formulas for each tier type or confirm they are implemented correctly. |
| A-07 | Module 4 | "Provider company management" at 5% | What functionality is expected? CRUD? Approval workflow? Company profile editing? | ⚠️ OPEN QUESTION: Define the full scope of AdminProvidersPage — what actions should an admin perform on provider companies? |
| A-08 | PRD §1.4 | "Dual-mode operation (local dev / Supabase)" | Is the local dev mode intended to persist post-launch, or should it be stripped for production? The dev bypass auth (B-05 in non-functional findings) is a security risk. | ⚠️ OPEN QUESTION: Confirm whether local dev mode should be removed from production builds or gated behind build flags. |

---

## 1.4 Audit Findings Not Addressed in PRD

| # | Audit Finding | Severity | PRD Coverage |
|---|--------------|----------|-------------|
| UA-01 | Dev bypass auth via `localStorage` key `warrantyhub.dev.bypass_user` must be disabled in production (Non-Functional Findings) | MEDIUM | **Not addressed.** PRD mentions no security hardening checklist or production environment lockdown procedure. |
| UA-02 | `ProviderProductsPage.tsx` is 195KB — needs code-splitting (Non-Functional Findings) | LOW | **Not addressed.** PRD has no performance or bundle-size requirements. |
| UA-03 | `DealerReportingPage.tsx` loads all contracts client-side before filtering — no server-side filter (Non-Functional Findings) | MEDIUM | **Not addressed.** PRD mentions "Reporting & CSV export" at P1/90% but defines no data volume or performance constraints. |
| UA-04 | Three redundant Tailwind config files (Non-Functional Findings) | LOW | **Not addressed.** PRD has no code quality or maintainability standards. |
| UA-05 | `AdminAccessRequestsPage.tsx` has deeply nested conditionals and duplicate profile lookup code (Non-Functional Findings) | LOW | **Not addressed.** PRD has no refactoring or code quality requirements. |
| UA-06 | Zero test coverage — no test files found anywhere (Non-Functional Findings) | HIGH | **Not addressed.** PRD §1.4 lists no testing requirements whatsoever. |
| UA-07 | No CI/CD pipeline configuration found (Non-Functional Findings) | INFO | **Not addressed.** PRD mentions Netlify deployment config but not automated CI/CD. |
| UA-08 | No error monitoring wired in (Non-Functional Findings) | MEDIUM | **Not addressed.** PRD has no observability requirements. |
| UA-09 | No accessibility audit performed (Non-Functional Findings) | INFO | **Not addressed.** PRD has no accessibility requirements. |
| UA-10 | `sanitizeWordsOnly()` applied to emails may strip valid characters (B-11) | LOW | **Not addressed.** PRD does not define input sanitization rules. |
| UA-11 | Business Type field hardcoded to "Warranty Provider" in SuperAdminCompaniesPage (B-12) | LOW | **Not addressed.** PRD does not define company types or extensibility requirements. |
| UA-12 | Plan pricing hardcoded in JSX strings (B-14) | INFO | **Not addressed.** PRD does not specify how pricing/config values should be managed. |

---

---

# OUTPUT 2 — CLEANED-UP PRD

---

## 1. Product Overview

**Product Name:** WarrantyHub  
**Purpose:** B2B SaaS marketplace connecting Canadian automotive dealerships with warranty/insurance providers through digitized contract, remittance, and product management workflows.  
**Problem Statement:** The Canadian automotive aftermarket warranty industry relies on paper-based and email-driven remittance and contract workflows. This causes delays, errors, lack of visibility, and operational inefficiency for both dealerships and warranty providers.  
**Target Users:** Ontario-based automotive dealerships (initial market) and warranty/insurance providers.  
**Target Launch:** April 12, 2026 (soft launch)  

📌 ADDED: Problem statement — implied by the PRD overview but not explicitly stated.

---

## 2. Scope

### 2.1 In-Scope Features

| Priority | Feature | Notes |
|----------|---------|-------|
| **P0** | Email + password authentication | Implemented |
| **P0** | Google OAuth authentication | Implemented |
| **P0** | Password reset flow | Implemented |
| **P0** | Dealership self-registration | Implemented |
| **P0** | Role-based access control (6 roles) | Implemented |
| **P0** | Dealer dashboard with defined KPIs | ~75% — KPIs need specification |
| **P0** | Product marketplace with search/filter | ~85% |
| **P0** | Contract creation wizard (multi-step) | ~80% — steps and validation need documentation |
| **P0** | Contract detail/edit page | ~80% — needs full audit |
| **P0** | Remittance batch creation and tracking | ~85% |
| **P0** | Provider dashboard with health metrics | ~85% |
| **P0** | Provider product catalog management (CRUD) | Implemented |
| **P0** | Provider pricing tiers (4 models) | Implemented |
| **P0** | Provider contract and remittance visibility | Implemented |
| **P0** | Admin dashboard with live KPI data | 70% — 3 of 4 KPI cards broken |
| **P0** | Admin access request approval workflow | 85% — DEALER_EMPLOYEE approval broken in production |
| **P0** | Admin provider company management | **5% — CRITICAL STUB** |
| **P0** | Admin remittance oversight | Implemented |
| **P0** | Super Admin platform dashboard | ~90% |
| **P0** | Super Admin multi-company management | ~95% |
| **P0** | Super Admin user role assignment | ~85% |
| **P0** | Stripe subscription checkout | Implemented |
| **P0** | Stripe webhook handler | Implemented |
| **P0** | Row-level security on all DB tables | Implemented (needs verification) |
| **P0** | Disable dev bypass auth in production builds | 📌 ADDED: Escalated from audit finding — security critical |
| **P0** | Minimum smoke test coverage for auth, contracts, remittances | 📌 ADDED: Escalated from audit finding — zero tests exist |
| **P1** | Dealer employee signup via invite link | Implemented |
| **P1** | VIN decode for vehicle detection | Implemented |
| **P1** | Product comparison tool | Implemented |
| **P1** | Contract print (dealer/customer copy) | Implemented |
| **P1** | Remittance batch print | Implemented |
| **P1** | Dealer admin analytics (charts, employee ranking) | ~95% |
| **P1** | Admin contracts view (dealer admin only) | Implemented |
| **P1** | Team management (dealer + provider) | ~85% |
| **P1** | Pricing configuration (retail overrides) | ~95% |
| **P1** | Reporting & CSV export | ~90% |
| **P1** | Dealer billing/subscription management | ~90% |
| **P1** | Payment history view | Partial — Stripe portal redirect only |
| **P1** | 15-day free trial | Implemented |
| **P1** | Stripe billing portal | Implemented |
| **P1** | Per-contract fee (STANDARD plan) | Implemented |
| **P1** | In-app support chat | ~90% |
| **P1** | Admin support inbox | Implemented |
| **P1** | Conversation status management | Implemented |
| **P1** | Provider add-ons, powertrain eligibility, vehicle rules | Implemented |
| **P1** | Provider document/logo upload | Implemented |
| **P1** | Admin user and dealer management | ~85% |
| **P1** | Super Admin global user search and audit logs | Implemented |
| **P1** | Server-side pagination for reporting | 📌 ADDED: Required for dealers with >200 contracts |
| **P1** | Password strength validation on employee creation | 📌 ADDED: From audit B-08 |
| **P1** | Supabase Realtime for support chat | Partial |
| **P2** | FAQ component | Implemented |
| **P2** | N+1 query optimization for provider dashboard | 📌 ADDED: From audit B-06 |
| **P2** | Externalize hardcoded config (launch date, stats, pricing) | 📌 ADDED: From audit B-10, B-14 |
| **P2** | Remove redundant Tailwind config files | 📌 ADDED: From audit |
| **P2** | Code-split ProviderProductsPage (195KB) | 📌 ADDED: From audit |
| **P2** | Refactor AdminAccessRequestsPage nested logic | 📌 ADDED: From audit |

### 2.2 Out of Scope (v1.0)

- Mobile native apps (iOS/Android)
- Multi-province expansion beyond Ontario
- Third-party warranty claims adjudication
- Direct integration with DMS (Dealer Management Systems)
- Multi-language / localization (English only for v1.0)
- Public API for third-party integrations

📌 ADDED: Out-of-scope list — not present in original PRD. Derived from the product's Ontario focus and B2B SaaS nature. ⚠️ OPEN QUESTION: Confirm out-of-scope items with product owner.

### 2.3 Assumptions

1. Supabase paid plan is active with automated daily backups.
2. Stripe account is fully configured for CAD currency with both STANDARD and EARLY_ADOPTER price IDs.
3. Netlify Pro or higher plan supports the expected traffic.
4. All users access the platform via modern web browsers (Chrome, Firefox, Safari, Edge — latest 2 major versions).
5. Provider companies are onboarded by Super Admin or Admin — there is no self-registration for providers in v1.0.
6. The `VITE_DISABLE_SUBSCRIPTION` flag will be set to `false` in production.

📌 ADDED: Assumptions section — not present in original PRD. Derived from technical stack and product context.

---

## 3. Functional Requirements

### 3.1 Authentication & Onboarding

**User Story:** As a new dealership owner, I can register my dealership, sign in with email/password or Google, and have my team members join via invite links so that we can start using the platform.

**Acceptance Criteria:**

| # | Criterion | Status |
|---|-----------|--------|
| AC-1.1 | User can sign in with email + password; invalid credentials show inline error within 2 seconds | Implemented |
| AC-1.2 | User can sign in via Google OAuth; new Google users are created with `UNASSIGNED` role | Implemented |
| AC-1.3 | User can request a password reset email; link expires after 60 minutes | Implemented |
| AC-1.4 | Dealership owner can self-register with company name, address, contact info; duplicate company names are rejected with a clear message | Implemented |
| AC-1.5 | Dealer admin can generate an invite link; employee clicks link, completes signup, and is assigned `DEALER_EMPLOYEE` role pending approval | Implemented |
| AC-1.6 | New user with `UNASSIGNED` role can submit an access request specifying their company and desired role | Implemented |
| AC-1.7 | Admin can approve or reject access requests for all role types including `DEALER_EMPLOYEE` in both local dev and Supabase production mode | ✏️ REVISED: Added "including DEALER_EMPLOYEE" and "in Supabase production mode" — audit B-04 confirms this is broken. |
| AC-1.8 | Upon approval, user role is updated and user gains access to their role-appropriate portal within one page refresh | Implemented |

**Edge Cases:**
- 📌 ADDED: If Google OAuth account email matches an existing email/password account, system should link accounts or show a clear conflict message. ⚠️ OPEN QUESTION: Define account linking behavior.
- 📌 ADDED: If an invite link is used after the employee has already been deactivated, registration should be rejected with explanation.
- 📌 ADDED: Rate limit login attempts to 5 per minute per IP to prevent brute force. ⚠️ OPEN QUESTION: Confirm rate limiting strategy with engineering.

---

### 3.2 Dealer Portal

#### 3.2.1 Dealer Dashboard

**User Story:** As a dealer admin, I can view a dashboard summarizing my dealership's key business metrics so I can monitor performance at a glance.

**Acceptance Criteria:**

| # | Criterion | Status |
|---|-----------|--------|
| AC-2.1 | Dashboard displays the following KPIs: total active contracts, contracts this month, total remittance value, pending remittances count | ⚠️ OPEN QUESTION: Exact KPI list must be confirmed by product owner. These are inferred from typical dealer operations. |
| AC-2.2 | All KPI values are fetched from live data — no placeholder or hardcoded values | ~75% — needs completion |
| AC-2.3 | Dashboard loads within 3 seconds on a standard broadband connection | 📌 ADDED: Performance target implied by SaaS product type. |

#### 3.2.2 Product Marketplace

**User Story:** As a dealer employee, I can browse, search, and filter available warranty products from all active providers so I can find the right product for my customer.

**Acceptance Criteria:**

| # | Criterion | Status |
|---|-----------|--------|
| AC-2.4 | Marketplace displays only products with `published` status from active providers | Implemented |
| AC-2.5 | User can search by product name, provider name, and filter by vehicle type, coverage type, and price range | ~85% |
| AC-2.6 | User can select up to 3 products for side-by-side comparison | Implemented |
| AC-2.7 | Product detail page shows all pricing tiers, eligibility rules, terms, and add-ons | Implemented |

#### 3.2.3 Contract Creation Wizard

**User Story:** As a dealer employee, I can create a new warranty contract through a guided multi-step process so that all required information is captured accurately.

**Acceptance Criteria:**

| # | Criterion | Status |
|---|-----------|--------|
| AC-2.8 | Wizard progresses through: (1) Customer Info → (2) Vehicle Info + VIN Decode → (3) Product Selection → (4) Coverage Options → (5) Pricing Review → (6) Confirmation | ⚠️ OPEN QUESTION: Confirm exact wizard steps. These are inferred from VIN decode and product selection features. |
| AC-2.9 | Each step validates required fields before allowing progression; user can navigate back without losing data | ~80% |
| AC-2.10 | VIN decode auto-populates year, make, model, and validates vehicle eligibility against product rules | Implemented |
| AC-2.11 | Final confirmation step shows full contract summary; user must explicitly confirm before submission | ⚠️ OPEN QUESTION: Confirm whether contracts are submitted immediately or saved as drafts first. |
| AC-2.12 | Contract creation is recorded in audit log with user ID, timestamp, and contract ID | Implemented (via `lib/auditLog.ts`) |

**Edge Cases:**
- 📌 ADDED: If VIN decode fails (invalid VIN, service unavailable), user should be able to manually enter vehicle details with a warning banner.
- 📌 ADDED: If the selected product becomes unavailable (provider unpublishes) during wizard completion, the user should see an error at confirmation step — not after submission.
- 📌 ADDED: Browser back button and page refresh during wizard should not lose entered data (persist to sessionStorage or equivalent).

#### 3.2.4 Remittance Batch Creation

**User Story:** As a dealer admin, I can create a remittance batch grouping completed contracts for submission to warranty providers.

**Acceptance Criteria:**

| # | Criterion | Status |
|---|-----------|--------|
| AC-2.13 | Dealer admin can select multiple contracts to include in a batch | ~85% |
| AC-2.14 | Batch displays total remittance amount calculated from included contracts | ~85% |
| AC-2.15 | Submitted batch is visible to the corresponding provider in their remittance tracking view | Implemented |
| AC-2.16 | Batch can be printed in a standardized format | Implemented |

**Edge Cases:**
- 📌 ADDED: A contract should not be includable in more than one active (non-void) remittance batch.
- 📌 ADDED: If a batch contains zero contracts, submission should be blocked with an inline message.

#### 3.2.5 Reporting & CSV Export

**User Story:** As a dealer admin, I can view reports on contracts and remittances and export data to CSV.

**Acceptance Criteria:**

| # | Criterion | Status |
|---|-----------|--------|
| AC-2.17 | Report view supports filtering by date range, contract status, provider, and product | ~90% |
| AC-2.18 | Report data is paginated server-side with a default page size of 50 and a maximum retrievable dataset of 10,000 rows | ✏️ REVISED: Changed from client-side 200-row cap to server-side pagination per audit B-09. ⚠️ OPEN QUESTION: Confirm maximum dataset size with business. |
| AC-2.19 | CSV export includes all rows matching current filter, not just the visible page | ~90% |

#### 3.2.6 Team Management

**User Story:** As a dealer admin, I can add, edit, and disable employee accounts for my dealership.

**Acceptance Criteria:**

| # | Criterion | Status |
|---|-----------|--------|
| AC-2.20 | Dealer admin can add a new employee with name, email, and a password that meets strength requirements: minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 number, 1 special character | ✏️ REVISED: Added password strength requirements per audit B-08. |
| AC-2.21 | Password strength is validated client-side with real-time feedback during input | 📌 ADDED: UX requirement for password validation. |
| AC-2.22 | Dealer admin can disable an employee account; disabled employees cannot sign in | Implemented |

#### 3.2.7 Billing & Payments

**User Story:** As a dealer admin, I can subscribe to a plan, manage my billing, and view my payment history.

**Acceptance Criteria:**

| # | Criterion | Status |
|---|-----------|--------|
| AC-2.23 | Two subscription plans available: STANDARD (monthly + annual) and EARLY_ADOPTER (annual only with 50% launch discount) | Implemented |
| AC-2.24 | Clicking "Subscribe" redirects to Stripe Checkout; successful payment redirects to success page | Implemented |
| AC-2.25 | "Manage Billing" opens Stripe Customer Portal for subscription management | Implemented |
| AC-2.26 | "Manage Cards" opens Stripe Customer Portal in the **payment methods** section specifically | ✏️ REVISED: Must differentiate from "View History" per audit B-01. |
| AC-2.27 | "View Payment History" opens Stripe Customer Portal in the **invoices/history** section specifically, or displays an in-app payment history table | ✏️ REVISED: Must differentiate from "Manage Cards" per audit B-01. ⚠️ OPEN QUESTION: Confirm whether Stripe portal supports deep-linking to specific sections, or if an in-app history view is needed. |
| AC-2.28 | 15-day free trial starts on first signup; trial status and days remaining are displayed on the billing page | Implemented |
| AC-2.29 | Plan pricing values are loaded from environment configuration or database, not hardcoded in JSX | 📌 ADDED: Per audit B-14. Pricing changes should not require code deployment. |

#### 3.2.8 Pricing Configuration

**User Story:** As a dealer admin, I can configure retail pricing overrides for products I sell.

**Acceptance Criteria:**

| # | Criterion | Status |
|---|-----------|--------|
| AC-2.30 | Dealer admin can set custom retail prices per product | ~95% |
| AC-2.31 | If sessionStorage write fails during configuration, a user-visible warning is displayed (not silently swallowed) | ✏️ REVISED: Per audit B-05. Empty catch block must be replaced with user notification. |

---

### 3.3 Provider Portal

**User Story:** As a warranty provider, I can manage my product catalog, view contracts sold by dealers, track remittances, and manage my team.

**Acceptance Criteria:**

| # | Criterion | Status |
|---|-----------|--------|
| AC-3.1 | Provider dashboard displays: total active products, total contracts, total remittance value, pricing health status | ~85% |
| AC-3.2 | Provider can create, edit, publish, unpublish, and delete warranty products with full pricing configuration (FLAT, MILEAGE, CLASS, FINANCE_MATRIX) | Implemented |
| AC-3.3 | Provider can configure product add-ons, powertrain eligibility (BEV/HEV/PHEV/ICE), and vehicle eligibility rules (age, mileage, make/model) | Implemented |
| AC-3.4 | Provider can upload and manage terms/disclaimer documents and brand logos | Implemented |
| AC-3.5 | Provider can view all contracts sold under their products with status tracking | Implemented |
| AC-3.6 | Provider can view and track remittance batches submitted by dealers, with print capability | Implemented |
| AC-3.7 | Provider can manage team members (add/edit/disable) | Implemented |
| AC-3.8 | Pricing health check queries are batched — no more than 1 query per dashboard load regardless of product count | 📌 ADDED: Per audit B-06. N+1 pattern must be eliminated. |

---

### 3.4 Admin Portal

**User Story:** As a WarrantyHub admin, I can monitor platform activity, approve access requests, manage users and providers, oversee remittances, and respond to support tickets.

**Acceptance Criteria:**

| # | Criterion | Status |
|---|-----------|--------|
| AC-4.1 | Admin dashboard displays live counts for: total users, pending access requests, total providers, total dealers, open support tickets | ✏️ REVISED: Added all 4 KPI categories. Audit B-03 confirms 3 of 4 show placeholder data. |
| AC-4.2 | Admin can approve or reject access requests for all role types, including DEALER_EMPLOYEE, in Supabase production mode | ✏️ REVISED: Per audit B-04. |
| AC-4.3 | Admin can search, view, and edit user profiles; `sanitizeWordsOnly()` does not strip valid email characters (`+`, `.`, `-`) from search input | ✏️ REVISED: Per audit B-11. |
| AC-4.4 | Admin provider management page allows: viewing all provider companies, viewing their product catalogs, viewing provider team members, and editing provider company details | ✏️ REVISED: Expanded from stub. ⚠️ OPEN QUESTION: Full scope of AdminProvidersPage must be defined. Minimum viable: read-only list of providers with company details, product count, contract count, and active/suspended status. |
| AC-4.5 | Admin can view and manage all remittance batches across all dealers and providers | Implemented |
| AC-4.6 | Admin can view, respond to, and close support conversations | Implemented |
| AC-4.7 | Admin can view and manage dealer records | Implemented |

---

### 3.5 Super Admin Portal

**User Story:** As a WarrantyHub super admin, I have full platform visibility and can manage companies, users, roles, and view audit logs.

**Acceptance Criteria:**

| # | Criterion | Status |
|---|-----------|--------|
| AC-5.1 | Platform dashboard displays aggregate KPIs across all companies | ~90% |
| AC-5.2 | Super admin can create, edit, and suspend companies; Business Type field is selectable (not hardcoded) | ✏️ REVISED: Per audit B-12. Business Type must support at least "Warranty Provider" and "Dealership". |
| AC-5.3 | Super admin can search all users globally and assign/change user roles and company associations | Implemented |
| AC-5.4 | Super admin can view audit logs with filtering by date, user, and action type | Implemented |
| AC-5.5 | Super admin can manage all dealership records | Implemented |

---

### 3.6 Support System

**User Story:** As a user, I can initiate a support conversation from within the app and receive replies from admin without leaving the platform.

**Acceptance Criteria:**

| # | Criterion | Status |
|---|-----------|--------|
| AC-6.1 | User can open support chat widget and send messages | ~90% |
| AC-6.2 | Conversation is created with OPEN status; admin responses change status to PENDING; user closure sets CLOSED | Implemented |
| AC-6.3 | New messages from admin appear in real-time via Supabase Realtime subscription — no manual refresh required | ✏️ REVISED: Per audit B-13. Currently requires manual refresh. |
| AC-6.4 | Race condition on duplicate conversation creation is handled by catching all relevant constraint violation error codes, not just Postgres 23505 | ✏️ REVISED: Per audit B-07. |
| AC-6.5 | FAQ section is accessible from the support page | Implemented |

---

## 4. Non-Functional Requirements

📌 ADDED: This entire section. The original PRD had no non-functional requirements beyond the technical checklist.

### 4.1 Performance

| # | Requirement |
|---|-------------|
| NFR-1 | All pages achieve Largest Contentful Paint (LCP) ≤ 2.5 seconds on a 4G connection |
| NFR-2 | API responses (Supabase queries, edge functions) return within 500ms at P95 under normal load |
| NFR-3 | Time to Interactive (TTI) ≤ 3.5 seconds on initial page load |
| NFR-4 | No single JS bundle chunk exceeds 100KB gzipped (ProviderProductsPage at 195KB must be code-split) |
| NFR-5 | Client-side data tables never load more than 50 rows without server-side pagination |

⚠️ OPEN QUESTION: Define "normal load" — expected concurrent users at launch and at 6-month mark.

### 4.2 Security

| # | Requirement |
|---|-------------|
| NFR-6 | All data transmitted over HTTPS/TLS 1.2+ |
| NFR-7 | Row-level security (RLS) enforced on every Supabase table containing user or company data |
| NFR-8 | Dev bypass auth (`warrantyhub.dev.bypass_user`) is stripped from production builds via build-time environment check |
| NFR-9 | Authentication tokens expire after 1 hour of inactivity; refresh tokens expire after 7 days |
| NFR-10 | Login attempts rate-limited to 5 per minute per IP address |
| NFR-11 | All sensitive mutations (contract create/edit/void, remittance submit, user role change, company suspend) are recorded in audit log |
| NFR-12 | Stripe webhook endpoints validate the webhook signature before processing |
| NFR-13 | File uploads (provider documents, logos) are validated for file type and size (max 10MB) before acceptance |

⚠️ OPEN QUESTION: Confirm token expiry policy with security lead. ⚠️ OPEN QUESTION: Has RLS been verified table-by-table by a security engineer?

### 4.3 Accessibility

| # | Requirement |
|---|-------------|
| NFR-14 | Platform meets WCAG 2.1 Level AA for all interactive elements |
| NFR-15 | All form inputs have associated labels; all images have alt text; all interactive elements are keyboard-navigable |
| NFR-16 | Color contrast ratios meet AA minimum (4.5:1 for normal text, 3:1 for large text) |

⚠️ OPEN QUESTION: Confirm whether WCAG 2.1 AA is the target level with product owner.

### 4.4 Browser Support

| # | Requirement |
|---|-------------|
| NFR-17 | Supported browsers: Chrome, Firefox, Safari, Edge — latest 2 major versions |
| NFR-18 | Minimum viewport: 1024px width (desktop-first B2B application) |

⚠️ OPEN QUESTION: Confirm whether mobile/tablet support is required for v1.0.

---

## 5. Integration Points & Data Flows

| Integration | Direction | Protocol | Purpose | Status |
|------------|-----------|----------|---------|--------|
| Supabase Auth | Bidirectional | REST API + OAuth | User authentication, session management | Implemented |
| Supabase Database | Bidirectional | REST API (PostgREST) | All CRUD operations, RLS-enforced | Implemented |
| Supabase Edge Functions | Client → Edge → Stripe | Deno runtime | Billing operations (checkout, per-contract fee, webhook handling) | Implemented |
| Stripe Checkout | Client → Stripe | Redirect | Subscription purchase flow | Implemented |
| Stripe Customer Portal | Client → Stripe | Redirect | Billing management, payment methods, invoices | Implemented |
| Stripe Webhooks | Stripe → Edge Function | HTTPS POST | Subscription lifecycle events (created, updated, cancelled, payment_failed) | Implemented |
| Supabase Realtime | Server → Client | WebSocket | Live support message updates | Partial (not wired) |
| VIN Decode Service | Client → External API | REST | Vehicle year/make/model lookup | Implemented |
| Supabase Storage | Bidirectional | REST API | Provider document and logo uploads | Implemented |
| Netlify CDN | Deployment | Build + Deploy | Frontend hosting and distribution | Implemented |

📌 ADDED: Integration table — not present in original PRD. Derived from technical requirements and audit findings.

⚠️ OPEN QUESTION: What VIN decode service is being used? Is there an API key or rate limit to manage?

---

## 6. Definition of Done

### 6.1 Per Feature

A feature is "done" when:
1. All acceptance criteria pass manual verification
2. Edge cases are handled with appropriate error messages
3. Audit logging covers all sensitive mutations within the feature
4. Feature works correctly for all authorized roles; unauthorized roles receive a clear denial
5. Feature is tested with at least one automated smoke test covering the happy path
6. No HIGH or MEDIUM bugs remain open against the feature

### 6.2 System-Wide (Launch Readiness)

The platform is launch-ready when:
1. All P0 features are at 100% completion with no HIGH bugs
2. All P1 features are at ≥85% completion with no HIGH bugs
3. Automated smoke tests pass for: auth flow, contract creation, remittance submission, billing checkout
4. Dev bypass auth is confirmed disabled in production environment
5. RLS verified on all tables by a second engineer
6. Error monitoring (Sentry or equivalent) is active and alerting
7. Supabase database backups are confirmed running and restorable
8. Rollback procedure is documented and tested
9. Staging environment passes UAT sign-off

📌 ADDED: Entire Definition of Done section. Not present in original PRD.

---

---

# OUTPUT 3 — PHASED PROJECT PLAN

---

## Phase 1 — Stabilize & Fill Gaps (Days 1–4)

**Objective:** Resolve all P0 bugs, close critical security gaps, and resolve blocking open questions so the existing codebase is solid before completing remaining features.

**What's already done:**
- Core RBAC and RLS infrastructure is in place
- Auth flows (email, Google, reset) are working
- Adapter pattern for dual-mode operation exists
- Audit logging utility exists

**Remaining Tasks:**

| # | Task | Audit Ref | Est. |
|---|------|-----------|------|
| 1.1 | Fix `DealerPaymentsPage.tsx`: Pass distinct Stripe portal configuration parameters for "Manage Cards" (payment methods section) vs "View History" (invoices section). Research Stripe Customer Portal API for `flow_data` parameter to deep-link sections. | B-01 | 0.5 day |
| 1.2 | Enable DEALER_EMPLOYEE approval in `AdminAccessRequestsPage.tsx` for Supabase mode: remove or gate the conditional that disables it (lines 174–175). Test with a real Supabase instance. | B-04 | 0.5 day |
| 1.3 | Wire live data into `AdminDashboardPage.tsx`: write Supabase queries for Support Inbox count (open conversations), Provider count (active companies with type=provider), Dealer count (active companies with type=dealer). | B-03 | 1 day |
| 1.4 | Disable dev bypass auth in production: add build-time environment check that strips the `warrantyhub.dev.bypass_user` localStorage key handler when `NODE_ENV=production` or `VITE_MODE=production`. | NF-Security | 0.5 day |
| 1.5 | Replace empty catch block in `DealerConfigurePage.tsx` (line 95) with a toast/notification informing the user that configuration may not persist. | B-05 | 0.25 day |
| 1.6 | Fix `sanitizeWordsOnly()` in `AdminUsersPage.tsx` to preserve valid email characters (`+`, `.`, `-`). Write or update the regex to only strip genuinely dangerous characters. | B-11 | 0.25 day |
| 1.7 | Resolve all ⚠️ OPEN QUESTION items marked in this document — schedule a 90-minute stakeholder session covering: KPI definitions, wizard steps, AdminProvidersPage scope, trial expiration behavior, per-contract fee details. | — | 0.5 day |

**Definition of Done:**
- B-01, B-03, B-04, B-05, B-11 are verified fixed in staging
- Dev bypass auth confirmed absent from production build output
- Open question resolution document signed off by product owner

**Dependencies:**
- Stripe Customer Portal API documentation for B-01 resolution
- Product owner availability for open question session

**Effort Estimate:** 3–4 dev-days

**Risk Flags:**
- 🔴 RISK: Stripe Customer Portal may not support deep-linking to specific sections (payment methods vs invoices). If not, an in-app payment history view will be needed — adds 2–3 days.
- 🔴 RISK: Open question session may reveal scope changes that affect later phases.

---

## Phase 2 — Complete Core Features (Days 4–10)

**Objective:** Implement or finish all P0 functional requirements that are not yet at 100%.

**What's already done:**
- AdminProvidersPage exists as a stub (5%)
- DealerDashboardPage has card layout (75%)
- Contract creation wizard works at ~80%
- Remittance batch creation works at ~85%

**Remaining Tasks:**

| # | Task | Audit Ref | Est. |
|---|------|-----------|------|
| 2.1 | **Implement AdminProvidersPage.tsx** — build provider company list with: company name, status (active/suspended), product count, contract count, team member count. Add search/filter. Add detail view with read-only company information and product catalog summary. | B-02 | 3–4 days |
| 2.2 | Complete DealerDashboardPage KPIs: implement the exact KPIs defined in the open questions session. Wire to Supabase queries. Add loading skeletons. | Module 2 | 1–1.5 days |
| 2.3 | Harden contract creation wizard: add per-step validation, handle VIN decode failure gracefully (manual fallback), persist wizard state to sessionStorage, handle product unavailability at confirmation step. | Module 2 | 1–1.5 days |
| 2.4 | Complete remittance batch creation: add validation preventing a contract from appearing in multiple active batches, add empty-batch guard, add error-state messaging for submission failures. | Module 2 | 0.5–1 day |
| 2.5 | Complete SuperAdmin user role assignment: bring from 85% to 100% — verify all role transitions work and are audit-logged. | Module 5 | 0.5 day |

**Definition of Done:**
- AdminProvidersPage displays real provider data with search, filter, and detail view
- DealerDashboardPage shows all defined KPIs with live data
- Contract wizard handles all edge cases; no data loss on back-navigation
- Remittance batch prevents duplicate contract inclusion
- All P0 features at 100% in staging

**Dependencies:**
- Phase 1 completion (open questions resolved, P0 bugs fixed)
- AdminProvidersPage scope confirmed in Phase 1 stakeholder session

**Effort Estimate:** 6–8 dev-days

**Risk Flags:**
- 🔴 RISK: AdminProvidersPage scope is undefined — if stakeholders request full CRUD with approval workflow instead of read-only list, this balloons to 6–8 days alone.
- 🔴 RISK: Contract wizard audit may reveal additional issues in the large `DealerContractDetailPage.tsx` file (noted as "needs full audit" in PRD).

---

## Phase 3 — P1 Features & Integrations (Days 10–14)

**Objective:** Complete all P1 features required for a credible beta experience.

**What's already done:**
- Support chat at 90%
- Reporting and CSV export at 90%
- Team management at 85%
- Most P1 features are at 80–95%

**Remaining Tasks:**

| # | Task | Audit Ref | Est. |
|---|------|-----------|------|
| 3.1 | Add password strength validation to `DealerTeamPage.tsx` employee creation form: minimum 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character. Real-time feedback. | B-08 | 0.5 day |
| 3.2 | Wire Supabase Realtime subscription into `SupportPage.tsx`: subscribe to conversation message inserts, update chat UI in real-time, handle connection drops gracefully. | B-13 | 1 day |
| 3.3 | Harden race condition handling in `SupportPage.tsx`: catch all Postgres constraint violation families (not just 23505), add retry logic with exponential backoff for transient failures. | B-07 | 0.5 day |
| 3.4 | Implement server-side pagination for `DealerReportingPage.tsx`: add Supabase range queries, implement page controls, ensure CSV export still captures full filtered dataset. | B-09 | 1.5–2 days |
| 3.5 | Make SuperAdminCompaniesPage Business Type field editable: add dropdown with at least "Warranty Provider" and "Dealership" options, persisted to DB. | B-12 | 0.5 day |
| 3.6 | Externalize hardcoded values: move soft launch date, homepage stats, and subscription pricing to environment variables or a Supabase config table. | B-10, B-14 | 0.5–1 day |

**Definition of Done:**
- Employee creation enforces password strength with real-time feedback
- Support chat updates in real-time without manual refresh
- Reporting page handles 1000+ contracts with pagination; CSV exports all
- All P1 features at ≥85% in staging

**Dependencies:**
- Phase 2 completion
- Supabase Realtime enabled on the project (confirm plan supports it)

**Effort Estimate:** 4–6 dev-days

**Risk Flags:**
- 🔴 RISK: Server-side pagination for reporting may break existing CSV export logic — requires careful integration.

---

## Phase 4 — QA, Hardening & Performance (Days 14–18)

**Objective:** Achieve test coverage, performance targets, and security readiness for production.

**What's already done:**
- TypeScript strict mode enabled
- RLS policies written (`phase1_rls.sql`)
- Audit logging utility exists

**Remaining Tasks:**

| # | Task | Est. |
|---|------|------|
| 4.1 | Write smoke tests for critical paths: auth sign-in/sign-up, contract creation wizard (happy path), remittance batch submission, billing checkout redirect. Use Playwright or Cypress. | 2–3 days |
| 4.2 | Write unit tests for business logic: pricing calculations (all 4 tier types), sanitization functions, role-based route guards. Use Vitest. | 1–2 days |
| 4.3 | Code-split `ProviderProductsPage.tsx` (195KB): break into lazy-loaded sub-components using React.lazy and Suspense. | 0.5 day |
| 4.4 | Batch N+1 pricing health queries in `ProviderDashboardPage.tsx`: replace per-product queries with a single aggregated query. | 0.5 day |
| 4.5 | Set up error monitoring: integrate Sentry, configure source maps, set up alerting for unhandled exceptions and Supabase/Stripe errors. | 0.5 day |
| 4.6 | RLS verification: second engineer reviews all Supabase RLS policies table-by-table against the role matrix. Document findings. | 1 day |
| 4.7 | Security hardening checklist: verify HTTPS everywhere, validate Stripe webhook signatures, confirm file upload type/size validation, verify auth token expiry. | 0.5 day |
| 4.8 | Remove redundant Tailwind config files (keep only `tailwind.config.ts`). | 0.25 day |
| 4.9 | Refactor `AdminAccessRequestsPage.tsx` nested conditionals and duplicate profile lookup code. | 0.5 day |
| 4.10 | Accessibility pass: run axe-core or Lighthouse on all major pages, fix all critical and serious violations. | 1–1.5 days |
| 4.11 | Cross-browser QA: test on Chrome, Firefox, Safari, Edge (latest 2 versions). Document and fix layout/interaction issues. | 0.5–1 day |
| 4.12 | Performance validation: run Lighthouse on key pages, confirm LCP ≤ 2.5s, TTI ≤ 3.5s, no bundle > 100KB gzipped. | 0.5 day |

**Definition of Done:**
- Smoke tests pass in CI for auth, contracts, remittances, billing
- Unit test coverage on pricing logic and role guards at ≥80%
- Sentry captures errors in staging with alerts firing
- RLS verification document completed and signed
- Lighthouse scores ≥ 90 Performance, ≥ 80 Accessibility on key pages
- All browser QA issues resolved
- No redundant config files

**Dependencies:**
- Phase 3 completion
- Sentry account provisioned (or alternative selected)
- Second engineer available for RLS review

**Effort Estimate:** 8–11 dev-days (parallelizable — 2 engineers can cut this to 5–6 calendar days)

**Risk Flags:**
- 🔴 RISK: RLS review may uncover missing policies — could require 1–3 days of additional RLS work.
- 🔴 RISK: Accessibility fixes may be extensive if Radix/Tailwind patterns have systematic gaps.

---

## Phase 5 — Staging Validation (Days 18–20)

**Objective:** Validate the complete platform in a staging environment with real-world-like data and user acceptance testing.

**What's already done:**
- Netlify deployment config exists
- Supabase project presumably has staging/production split (to be confirmed)

**Remaining Tasks:**

| # | Task | Est. |
|---|------|------|
| 5.1 | Seed staging database with realistic test data: 10 dealers, 3 providers, 50+ products, 200+ contracts, 20+ remittance batches, multiple user roles. | 0.5 day |
| 5.2 | Conduct UAT with at least 1 representative from each role (dealer admin, dealer employee, provider, admin). Document pass/fail per acceptance criterion. | 1–2 days |
| 5.3 | Bug triage: categorize all UAT-found bugs as P0 (launch blocker), P1 (fix within 1 week), P2 (backlog). Fix all P0 bugs. | 1–2 days |
| 5.4 | Write production runbook: deployment steps, environment variable checklist, Stripe production mode activation, DNS configuration, monitoring dashboard setup. | 0.5 day |
| 5.5 | Write rollback plan: Netlify deployment rollback procedure, Supabase migration rollback steps, feature flag emergency shutoff. | 0.25 day |
| 5.6 | Configure CI/CD pipeline: automated builds on PR merge to main, automated smoke test run, automated deploy to Netlify staging on main branch push. | 0.5–1 day |
| 5.7 | Final sign-off: product owner and tech lead approve staging for production promotion. | 0.25 day |

**Definition of Done:**
- UAT pass rate ≥ 95% on P0 acceptance criteria
- All P0 UAT bugs fixed and re-verified
- Runbook reviewed by on-call engineer
- Rollback plan tested (deploy, roll back, re-deploy)
- CI/CD pipeline runs successfully for at least 3 consecutive builds
- Written sign-off from product owner and tech lead

**Dependencies:**
- Phase 4 completion
- UAT testers identified and scheduled
- Stripe production credentials ready

**Effort Estimate:** 3–5 dev-days

**Risk Flags:**
- 🔴 RISK: UAT may surface bugs in the contract detail page (noted as "needs full audit" — not yet deeply audited).
- 🔴 RISK: No staging/production environment split is confirmed for Supabase — if only one environment exists, staging testing risks polluting production data.

---

## Phase 6 — Production Launch (Days 20–22)

**Objective:** Deploy to production with zero downtime, canary rollout, and active monitoring.

**What's already done:**
- Netlify config exists
- Stripe integration is functional

**Remaining Tasks:**

| # | Task | Est. |
|---|------|------|
| 6.1 | Switch Stripe to production mode: update API keys, price IDs, webhook endpoints, and webhook signing secret in production environment variables. | 0.25 day |
| 6.2 | Deploy to production via Netlify: promote staging build to production. | 0.25 day |
| 6.3 | Canary rollout: if feature flag infrastructure exists, roll out to 5% of traffic, monitor for 2 hours, then 25%, then 100%. If no feature flags, do a full deploy with immediate monitoring. | 0.5 day |
| 6.4 | Post-deploy verification: manually test auth flow, contract creation, remittance submission, billing checkout, and admin dashboard in production. | 0.5 day |
| 6.5 | Enable monitoring dashboards: Sentry error rates, Supabase query performance, Stripe webhook delivery rates, Netlify deploy status. | 0.25 day |
| 6.6 | Activate on-call rotation: ensure at least 1 engineer is on-call for the first 72 hours post-launch. | 0.25 day |
| 6.7 | Update homepage: replace hardcoded fictional stats with real data or remove them; ensure launch date logic reflects the actual launch. | 0.25 day |

**Definition of Done:**
- Production deployment live and serving traffic
- All critical paths verified working in production
- Sentry capturing events (test a manual error, confirm it appears)
- Stripe production webhooks delivering successfully
- On-call engineer confirmed and reachable
- No P0 bugs within first 24 hours

**Dependencies:**
- Phase 5 sign-off
- DNS configured for production domain
- Stripe production account fully verified and approved
- On-call rotation agreed upon by team

**Effort Estimate:** 1.5–2 dev-days

**Risk Flags:**
- 🔴 RISK: Stripe production approval may require additional business verification — start this process in Phase 1.
- 🔴 RISK: No feature flag infrastructure confirmed — canary rollout may not be possible, requiring a full deploy with heightened monitoring.

---

### Total Effort Summary

| Phase | Estimate | Calendar Days (1 dev) | Calendar Days (2 devs) |
|-------|----------|----------------------|----------------------|
| Phase 1 — Stabilize & Fill Gaps | 3–4 days | 4 | 3 |
| Phase 2 — Complete Core Features | 6–8 days | 8 | 5 |
| Phase 3 — P1 Features & Integrations | 4–6 days | 5 | 3 |
| Phase 4 — QA, Hardening & Performance | 8–11 days | 10 | 6 |
| Phase 5 — Staging Validation | 3–5 days | 4 | 3 |
| Phase 6 — Production Launch | 1.5–2 days | 2 | 2 |
| **TOTAL** | **25.5–36 days** | **~33 days** | **~22 days** |

⚠️ **Timeline Assessment:** The April 12, 2026 soft launch target is **16 calendar days away**. With 2 full-time engineers working in parallel, the optimistic estimate is ~22 calendar days. The launch date is at risk and will require either:
1. Reducing scope (defer Phase 4 items 4.8–4.11 and some Phase 3 items to post-launch)
2. Adding engineering capacity (3rd engineer for Phase 4)
3. Pushing launch to April 26, 2026 (2-week delay)

🔴 RISK: Attempting to hit April 12 without scope reduction will likely result in shipping with insufficient test coverage and skipped security hardening.

---

---

# OUTPUT 4 — RISK REGISTER

---

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R-01 | **AdminProvidersPage scope undefined** — stakeholders may request full CRUD + approval workflow instead of read-only list, expanding Phase 2 by 3–5 days | H | H | Schedule scope decision in Phase 1 stakeholder session. Define minimum viable scope (read-only list) as Phase 2 target; full CRUD as Phase 3 stretch goal. |
| R-02 | **April 12 launch date infeasible** — 25–36 dev-days of work with 16 calendar days remaining, even with 2 engineers | H | H | Present trade-off options to stakeholders immediately: (a) reduced scope launch, (b) 2-week delay, (c) add 3rd engineer. Get decision by end of Day 1. |
| R-03 | **Zero test coverage** — any regression introduced during Phase 2–3 feature work will be undetected until UAT | H | H | Prioritize smoke tests for auth and billing in Phase 1 (parallel track). Run manual regression testing after each phase. |
| R-04 | **RLS policies unverified** — PRD claims "Implemented" but audit did not independently verify. Missing RLS on any table exposes user data across company boundaries | M | H | Schedule dedicated RLS review in Phase 4. If any gaps found, treat as P0 hotfix. |
| R-05 | **Dev bypass auth in production** — if `warrantyhub.dev.bypass_user` localStorage key is not disabled, any user with browser DevTools can impersonate any account | M | H | Fix in Phase 1 (Task 1.4). Add automated test verifying the bypass is absent in production builds. |
| R-06 | **Stripe Customer Portal deep-linking limitation** — may not support separate URLs for payment methods vs invoice history, requiring an in-app payment history view | M | M | Research in Phase 1 (Task 1.1). If not supported, scope a minimal in-app history table pulling from Stripe API — adds 2–3 days to Phase 2. |
| R-07 | **Contract detail page unaudited** — `DealerContractDetailPage.tsx` noted as "needs full audit" — may contain additional bugs discovered late | M | M | Conduct focused audit of this file in Phase 2 before building on it. Budget 1 day contingency. |
| R-08 | **Supabase Realtime availability** — support chat real-time depends on Supabase Realtime feature, which requires specific plan tier and configuration | L | M | Verify Supabase plan includes Realtime before Phase 3. If not available, implement polling as fallback (30-second interval). |
| R-09 | **Stripe production account verification** — switching to production mode may require business identity verification, which can take 2–7 business days | M | H | Initiate Stripe production verification in Phase 1 regardless of development progress. |
| R-10 | **Scope creep from ambiguous requirements** — 8 open questions identified; each resolution could expand scope if stakeholders add features instead of clarifying existing ones | M | M | Time-box stakeholder session to 90 minutes. Frame all questions as "clarify existing scope" not "define new features." Product owner must explicitly approve any scope additions with timeline impact noted. |
| R-11 | **N+1 query performance degradation** — ProviderDashboardPage pricing health check runs a query per product; provider with 100+ products will experience multi-second load times | M | M | Fix in Phase 4 (Task 4.4). For launch, acceptable if provider catalogs are small (<20 products). Monitor in production via Sentry performance tracking. |
| R-12 | **No CI/CD pipeline** — manual deployments increase risk of deploying untested code or wrong branch | M | M | Set up basic CI/CD in Phase 5 (Task 5.6). Until then, enforce manual deployment checklist: verify branch, run tests locally, deploy from main only. |
| R-13 | **No error monitoring** — production issues will be invisible until users report them | M | H | Set up Sentry in Phase 4 (Task 4.5). If Phase 4 is compressed, move Sentry setup to Phase 1 as a parallel track — it takes only 0.5 day and pays dividends immediately. |
| R-14 | **Canadian data privacy compliance (PIPEDA)** — no data retention or deletion policy defined; B2B platform handling personal data may have regulatory obligations | L | H | Add data retention policy as a post-launch P1 item. Consult legal counsel before public beta. |
| R-15 | **Single large file risk** — `ProviderProductsPage.tsx` at 195KB is fragile for maintenance; any refactoring introduces regression risk in the most complex provider feature | L | M | Code-split in Phase 4. Accompany with tests for product CRUD operations. Do not refactor without test coverage. |

---

*End of Document — WarrantyHub Comprehensive Plan v1.0 — March 27, 2026*
