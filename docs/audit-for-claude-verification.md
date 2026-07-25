# RAFD Enterprise Production Audit — Verification Prompt for Claude

> **⚠️ HISTORICAL DOCUMENT — superseded.**
>
> This was a verification prompt built on the pre-PR #12 audit. **Most findings it asks to verify have since been fixed and merged into `main`** (API auth gates, schema drift, subscription duplication, referential integrity, CORS, payment-proof privacy).
>
> Do not treat its findings as the current state. For the current state see
> [`OPEN_ISSUES_INVESTIGATION_2026-07-25.md`](OPEN_ISSUES_INVESTIGATION_2026-07-25.md) and [`../README.md`](../README.md).

> **Original purpose:** Send this entire document to Claude (Anthropic) as a single prompt. Claude will review the audit findings, reason about their accuracy based on the provided evidence, and produce a verification report confirming, challenging, or refining each finding.

---

## Instructions for Claude

You are acting as an independent audit verifier. Your job is to:

1. Read and understand all audit findings below.
2. For each finding, determine whether:
   - **VERIFIED** — the evidence provided logically supports the finding
   - **LIKELY** — the evidence supports it but runtime proof may be needed
   - **NEEDS MORE EVIDENCE** — the finding is plausible but evidence is not conclusive
   - **MISINTERPRETED** — the finding appears to be wrong based on the evidence chain
3. Identify any logical gaps, missing verification steps, or assumptions that should be validated.
4. Confirm or challenge the severity classification of each issue.
5. Provide a final summary of:
   - Which findings are most solidly confirmed
   - Which need additional runtime or production environment validation
   - Whether the overall "not production-ready" verdict is justified

**Do not produce generic advice.** Stay focused on the specific evidence provided and reason about its logical validity. If something is ambiguous, say so explicitly rather than guessing.

---

## 1. Project Overview

**RAFD (رفد)** is a multi-tenant SaaS POS/Retail management platform.

### Stack

| Layer | Technology |
|---|---|
| Frontend | React 19.2.0, TypeScript ~5.9.3, Vite 7.3.x, Tailwind CSS v4 |
| Routing | React Router DOM ^7.13.1 |
| Backend API | Vercel-style serverless functions in `api/*.js` |
| Database/Auth/Storage | Supabase (PostgreSQL) |
| Offline | IndexedDB (`rafd-offline-v1`) + localStorage + Service Worker |
| Testing | Vitest, Testing Library, fake-indexeddb |

### Architecture (simplified)

```
React SPA → fetch('/api/...') → Vercel API Routers → api/_lib/modules/*.js → Supabase service-role client → Postgres
```

Key point: The backend uses `SUPABASE_SERVICE_ROLE_KEY`, which **bypasses Row-Level Security (RLS)**. Therefore, the API layer's auth middleware (`withApi`, `requireAuth`, `resolveTenantId`) is the **only** security boundary for API calls.

### Repository Structure

- `src/` — React frontend
- `api/` — Vercel serverless API functions
- `api/_lib/modules/` — Business logic modules per domain
- `supabase/migrations/` — Database migrations (13 files, numbered `20260722000001` through `20260722000013`)
- `public/sw.js` — Service Worker
- `src/lib/offline/` — IndexedDB, sync engine, sales/products queues

---

## 2. Audit Methodology

The audit was performed with the following sources:

1. **Static code analysis** — all API modules, all frontend pages, all contexts, all migrations, all offline code.
2. **Live database SQL queries** — schema introspection, data integrity checks, RLS policy enumeration, migration ledger inspection.
3. **Runtime validation** — `npm ci`, `npm test`, `npm run build`, `npm run lint`, `npm audit`, `vite preview` HTTP checks.
4. **Data flow mapping** — tracing every major user journey (login, POS sale, subscription payment, platform admin, offline sync).

**Not performed:** Real browser console/network traces, Vercel serverless runtime validation, unauthenticated deployed API exploit proof, offline replay simulation in browser.

---

## 3. Core Findings (all confirmed by evidence)

### Finding 1: Database Schema Drift (Platform & Subscription)

**Severity:** Critical

The live database is missing columns that the current application code expects.

#### Missing Columns (confirmed by live SQL schema introspection)

**`platform_settings` table:**
- `app_name`
- `app_name_ar`
- `support_whatsapp`
- `default_currency`
- `allow_registration`

**`platform_announcements` table:**
- `audience`
- `is_published`
- `publish_at`

**`platform_payment_methods` table:**
- `name_ar`
- `provider`
- `sort_order`

**`subscription_plans` table:**
- `name_ar`
- `is_popular`
- `sort_order`
- `features` column exists but is `text` type instead of expected `jsonb`

**`subscription_payments` table:**
- `plan_code`
- `billing_cycle`
- `payment_method_id`
- `payment_method_name`
- `proof_url`
- `sender_name`
- `admin_notes`
- `reviewed_by`
- `reviewed_at`

**`tenant_subscriptions` table:**
- `last_payment_at`

**`audit_logs` table:**
- `actor_email`
- `entity`

#### Code Evidence (modules that write these missing columns)

- `api/_lib/modules/platform-settings.js` — writes `app_name`, `app_name_ar`, etc.
- `api/_lib/modules/subscription-plans.js` — orders by `sort_order`, writes `features` as JSON array
- `api/_lib/modules/platform-payments.js` — orders by `sort_order`, writes `name_ar`, `provider`
- `api/_lib/modules/platform-announcements.js` — reads/writes `audience`, `is_published`, `publish_at`
- `api/_lib/modules/subscription.js` — inserts `plan_code`, `billing_cycle`, `proof_url`, `admin_notes`, `reviewed_by`, `reviewed_at`, writes `last_payment_at`
- `api/_lib/modules/loyalty.js` — audit insert targets `audit_logs.actor_email` and `audit_logs.entity`
- `api/_lib/modules/recipes.js` — same audit pattern
- `api/_lib/modules/import-export.js` — same audit pattern

#### Logical Chain

1. Application code writes to these columns (proven by code inspection).
2. Live database does not have these columns (proven by SQL schema introspection).
3. Therefore: writes to these columns will fail at runtime → Platform Admin, Subscription management, audit trails are broken.

---

### Finding 2: Migration Ledger Drift

**Severity:** Critical/High

The `supabase_migrations.schema_migrations` table does not match actual database artifacts.

| Migration File | In Ledger? | Artifacts Exist in DB? | Status |
|---|---|---|---|
| `20260722000001` through `0008` | Yes | Yes | OK |
| `20260722000009` (onboarding rate limit) | No | Yes — `public.onboarding_ip_log` table exists | Drifted |
| `20260722000010` (inventory/sales integrity) | No | Yes — `sales.shift_id` column, FK, RPC, indexes exist | Drifted |
| `20260722000011` (storage policy hardening) | No | Yes — storage write/update/delete policies are authenticated-only | Drifted |
| `20260722000012` (app_users auth unique) | No | **No** — index `idx_app_users_auth_unique` is missing | Drifted |
| `20260722000013` (platform schema alignment) | No | **No** — platform columns and type changes are missing | Drifted |

#### Logical Chain

1. Migrations 09-11 were applied at some point (artifacts exist) but the ledger was not updated.
2. Migrations 12-13 were never applied (artifacts missing).
3. This means the migration ledger is an **unreliable source of truth**.
4. Migration 13 being missing explains Finding 1 (schema drift).

---

### Finding 3: `/api/subscription` is Unprotected but Performs Admin-Grade Actions

**Severity:** Critical

#### Code Evidence

The module `api/_lib/modules/subscription.js` defines a raw handler function with CORS headers but **no call to `withApi`, `requireAuth`, or `requirePlatformAdmin`**.

Publicly accessible actions include:

- `GET action=payments` — lists subscription payments
- `GET action=devices` — lists device bindings
- `GET action=check-device` — checks if device already used for trial
- Default GET — returns subscription status by `tenant_id` query param
- `POST action=init-trial` — creates trial subscription
- `POST action=select-plan` — selects a plan for a tenant
- `POST action=submit-payment` — submits payment proof (inserts into `subscription_payments`)
- `POST action=review-payment` — admin reviews/approves/rejects payment
- `POST action=admin-activate` — admin activates subscription
- `POST action=release-device` — releases device binding

The module uses the service-role Supabase client (bypasses RLS).

#### Logical Chain

1. No auth middleware is applied in this module.
2. The module mutates subscription state, payment records, device bindings, and tenant status.
3. CORS is set to `*` (wildcard).
4. Therefore: these admin-grade actions are callable without authentication from any origin.

---

### Finding 4: Multiple API Modules Use Service-Role Without Auth Gates

**Severity:** Critical

#### Confirmed Unprotected Modules

These modules use the service-role Supabase client but have **no `withApi` / `requireAuth` wrapper**:

| Module | Operations | Risk |
|---|---|---|
| `branches.js` | CRUD branches | Tenant structure exposure |
| `bank-accounts.js` | CRUD bank accounts | Financial setup exposure |
| `expenses.js` | CRUD expenses | Financial data exposure |
| `payment-terminals.js` | CRUD payment terminals | Financial setup exposure |
| `customer-ledger.js` | Update customer balance, insert ledger rows | Financial mutation |
| `supplier-ledger.js` | Update supplier balance, insert ledger rows | Financial mutation |
| `suppliers.js` | CRUD suppliers | Operational data exposure |
| `notifications.js` | Read/update notifications | User data exposure |
| `dashboard.js` | Read broad datasets (sales, products, expenses, sale_items) | Aggregated data exposure; has `tenant_id \|\| 1` fallback |
| `tenant-catalog.js` | Read tenant public catalog | Tenant enumeration |
| `subscription.js` | Full subscription lifecycle | Covered in Finding 3 |

#### Frontend Dependency Chain

Multiple frontend pages depend on these unprotected endpoints:

- `TenantContext` → `/api/branches`
- `POS.tsx` → `/api/bank-accounts`, `/api/payment-terminals`
- `Customers.tsx` → `/api/customer-ledger`
- `Suppliers.tsx` → `/api/suppliers`, `/api/supplier-ledger`
- `Dashboard.tsx`, `Reports.tsx`, `MobileApps.tsx` → `/api/dashboard`
- `Subscription.tsx`, `SuperAdmin.tsx` → `/api/subscription`
- `Expenses.tsx`, `Payments.tsx`, `Notifications.tsx` → their respective endpoints

#### Logical Chain

1. These modules create `supabase` client via `db-client.js` which uses `SUPABASE_SERVICE_ROLE_KEY`.
2. Service role bypasses RLS.
3. These modules accept `tenant_id` from query parameters or request body.
4. Without auth middleware, the caller supplies their own `tenant_id`.
5. Therefore: tenant isolation is entirely bypassable on these endpoints.

---

### Finding 5: Duplicate Tenant Subscriptions

**Severity:** Critical

#### Live Database Evidence

SQL query confirmed: Tenant ID `1` (RAFD Store / متجر رفد) has **10 rows** in `tenant_subscriptions`:

- IDs: 22-31
- Statuses: mostly `trial`
- Plan codes: `growth`, `starter`
- Created: July 24, 2026

#### Code Evidence

The base migration (`20260722000001_base_schema.sql`) creates a non-unique index on `tenant_subscriptions.tenant_id`:

```sql
CREATE INDEX idx_tenant_sub_tenant ON tenant_subscriptions(tenant_id);
```

No UNIQUE constraint on `tenant_id`.

Application code in `api/_lib/modules/subscription.js`:

```javascript
// ensureSubscription() uses maybeSingle() — assumes 0 or 1 row
await supabase.from('tenant_subscriptions')
  .select('*')
  .eq('tenant_id', tenantId)
  .maybeSingle()

// Updates use single() — assumes exactly 1 row
await supabase.from('tenant_subscriptions')
  .update({...})
  .eq('tenant_id', tenantId)
  .select()
  .single()
```

#### Logical Chain

1. No unique constraint prevents multiple rows per tenant.
2. 10 rows currently exist for tenant 1.
3. `maybeSingle()` can return `null` (if >1 row) or error.
4. `.single()` will throw when multiple rows match.
5. Therefore: subscription state is non-deterministic for any tenant with >1 row.

---

### Finding 6: Tenant Without Active Owner / Role Model Divergence

**Severity:** High

#### Live Database Evidence

Tenant 1 has **no** row matching:

```sql
SELECT * FROM app_users WHERE tenant_id = 1 AND role = 'owner' AND status = 'active'
```

#### Code Evidence

Bootstrap migration (`20260722000008_admin_bootstrap.sql`):

```sql
-- Comment says: "Owner + Super Admin for tenant 1"
-- But inserts:
INSERT INTO app_users (...) VALUES (..., 'superadmin', ...);
```

So the bootstrap inserts `role='superadmin'`, not `role='owner'`.

Frontend evidence:

- `ProtectedRoute.tsx` — allows superadmin with tenant to access store routes.
- `Sidebar.tsx` — filters menu items by role arrays like `['owner','admin','cashier','inventory_manager']` — does NOT include `'superadmin'`.
- `api/_lib/permissions.js` — `owner` has wildcard `*`; `superadmin` has `['*', 'platform:*']`.

#### Logical Chain

1. Tenant 1's only user has `role='superadmin'`, not `'owner'`.
2. Any code that checks `role === 'owner'` will not find this user.
3. Sidebar won't render menu items for superadmin-with-tenant.
4. Role semantics diverge between backend permissions, frontend routing, and UI navigation.

---

### Finding 7: Missing Foreign Key Constraints

**Severity:** High

#### Tables with Relationship Columns but No FK Constraints

**P1 (Core Operations):**
- `cashier_shifts` — references to `tenant_id`, `branch_id`, `user_id` lack FKs
- `refunds` — references to `sale_id`, `tenant_id`, `branch_id`, `user_id` lack FKs
- `refund_items` — references to `refund_id`, `sale_item_id`, `product_id` lack FKs
- `stocktake_sessions` and `stocktake_lines` — references lack FKs

**P2 (Feature Modules):**
- `loyalty_ledger`, `loyalty_offers`, `loyalty_programs` — no FKs
- `price_lists`, `product_prices`, `branch_price_overrides`, `customer_price_overrides` — no FKs
- `recipes`, `recipe_items` — no FKs
- `manufacturing_orders`, `manufacturing_order_items` — no FKs
- `ai_conversations` — no FKs

**Base Weak References:**
- `products.supplier_id` — references `suppliers.id` but no FK
- `sales.bank_account_id` — references `bank_accounts.id` but no FK
- `audit_logs.user_id` — references `app_users.id` but no FK
- `backups.user_id` — references `app_users.id` but no FK

#### Current Data State (mitigating factor)

- Current data integrity checks passed (0 issues across sales, inventory, and current ledger).
- Many feature tables (loyalty, recipes, manufacturing) are empty.
- This is a **future corruption risk** rather than current data damage.

#### Logical Chain

1. Migrations create `integer` columns named like references but without `REFERENCES` clauses.
2. The application code assumes these relationships.
3. Database does not enforce them.
4. Application bugs or concurrent writes could create orphan/cross-tenant rows.

---

### Finding 8: Offline / Sync Coverage Is Partial

**Severity:** High

#### What is Implemented

**Offline mutations supported:**
- Sales create (via `salesQueue.ts`)
- Products create/update/delete (via `productsQueue.ts`)
- Inventory stock adjustment (via product update in `productsQueue.ts`)

**Read cache snapshots pulled:**
- Products
- Customers
- Sales

**Not supported offline:**
- Purchases, Expenses, Suppliers, Customer/Supplier ledgers
- Bank accounts, Payment terminals
- Stocktake, Shifts
- Subscription, Platform Admin
- Pricing, Loyalty, Recipes, Manufacturing
- Reports

#### Sync Engine Limitations

- Chronological replay only, no entity-specific conflict resolution.
- No exponential backoff.
- No max attempts / dead-letter queue.
- Failed items remain retryable indefinitely with no admin visibility.
- Service Worker explicitly skips `/api/*` caching (correct behavior, but means all offline data depends on IndexedDB).

---

### Finding 9: Runtime Validation Results

| Check | Result |
|---|---|
| `npm ci` | ✅ Passed — 339 packages, 7 high vuln warnings |
| `npm test` | ✅ Passed — 27 files, 129 tests |
| `npm run build` | ✅ Passed — bundle ~1.46MB minified / ~416KB gzip |
| `npm run lint` | ❌ Failed — 53 errors, 20 warnings |
| `npm audit --audit-level=high` | ❌ Failed — 7 high vulnerabilities |
| `vite preview` HTTP checks | ✅ 200 for `/`, `/dashboard`, `/login`, `/admin` |

#### Logical Interpretation

1. **Tests pass but don't catch live DB drift.** Test files intentionally reproduce platform schema failures (missing `app_name`, `name_ar`, `audience`) in test stderr, meaning the test suite already knows about these schema gaps but does not fail on them.
2. **Lint failure** has 73 problems across contexts, pages, and components — indicating React hooks purity issues, setState-in-effect patterns, and hook dependency problems.
3. **npm audit** shows 7 high vulnerabilities, including in `react-router-dom`/`react-router` production dependency chain.
4. **Build succeeds** but with large chunk warnings (>500KB) and mixed static/dynamic import on `documentExport.ts` that prevents chunk splitting.

---

### Finding 10: ProtectedRoute Subscription Gate Fails Open

**Severity:** High

#### Code Evidence (`src/components/ProtectedRoute.tsx`)

```typescript
// If subscription API returns non-ok → allow access
// If subscription API throws → allow access  
// If role is superadmin → allow access
```

#### Logical Chain

1. If the subscription backend is broken (which it is — schema drift + duplicate rows), the API returns an error.
2. ProtectedRoute catches the error and allows access anyway.
3. Therefore: subscription enforcement is unreliable.

---

### Finding 11: Dashboard/Dashboard Endpoint Has Tenant Fallback

**Severity:** High

#### Code Evidence (`api/_lib/modules/dashboard.js`)

The dashboard module:
- Accepts `tenant_id` from query
- Uses `tenant_id || 1` fallback
- Reads all sales, expenses, products, and `sale_items` (without direct tenant filter on sale_items)
- Aggregates in JavaScript memory
- Is **unprotected** (no auth gate)

---

### Finding 12: Backup Module Schema Drift

**Severity:** High

#### Code Evidence (`api/_lib/modules/backups.js`)

Backup code expects columns: `label`, `created_by`, `size_bytes`, `kind`, `payload`, `payload_json`

#### Live Database Evidence

Base `backups` table has: `id`, `tenant_id`, `user_id`, `file_url`, `file_size`, `type`, `status`, `created_at`

These column sets do not match. Backup persistence likely fails.
Restore only upserts products and customers — not a full tenant recovery.

---

## 4. Additional Confirmed Issues

### Medium Severity

| ID | Finding |
|---|---|
| MED-001 | 13 feature tables lack `tenant_id` indexes (will degrade at scale) |
| MED-002 | Product create API omits `supplier_id` that UI sends (supplier linkage lost) |
| MED-003 | Audit log writers in loyalty/recipes/import-export target non-existent columns |
| MED-004 | Storage bucket `rafd-media` is public-read; subscription proof uploads may expose sensitive files |
| MED-005 | Device trial identity is localStorage-based and client-controlled |
| MED-006 | Import/Export processes rows sequentially with no batching |
| MED-007 | Multiple frontend pages have "loading stuck" pattern when `tenant?.id` is undefined |
| MED-008 | CORS wildcard amplifies exposure of unprotected endpoints |

### Low Severity

| ID | Finding |
|---|---|
| LOW-001 | `/api/test` and `/api/test-import` are public debug endpoints |
| LOW-002 | `/api/health` exposes operational metadata (env key names, DB status) publicly |
| LOW-003 | Offline cached identity (profile, tenant, branches in localStorage) can become stale |

---

## 5. Positive Findings (Confirmed)

These are areas where the system is solid:

1. **POS sales flow** — idempotency keys, atomic stock decrement RPC, tax calculation, weighted items, offline queue integration.
2. **Products/Inventory offline** — mature IndexedDB wrappers, `useTenantScopedList` with error/empty/no-tenant states.
3. **Current operational data is clean** — no duplicate SKU/barcode, no negative stock, no sales integrity violations, customer ledger balances match.
4. **RLS is generally enabled** on tenant-scoped tables with `tenant_id = current_tenant_id() OR is_superadmin()` patterns.
5. **`withApi` middleware pattern** is solid where it is actually used — proper auth, tenant resolution, body tenant mismatch prevention.
6. **Tests exist** (129 tests across 27 files) and pass, covering tax, pricing, loyalty engine, offline, AuthContext, API modules.
7. **Storage upload** has filename sanitization, size guard (2.5MB), and permission-based access.

---

## 6. The "Not Production-Ready" Verdict

The audit concluded: **this system is not production-ready for multi-tenant SaaS launch.**

The verdict is based on:

1. **7 critical issues** (schema drift, unprotected subscriptions, service-role exposure, duplicate subscription data, broken platform admin, broken backup/DR).
2. **8 high issues** (unprotected dashboard, role divergence, fail-open subscription gate, non-transactional onboarding, missing FKs, stale offline identity, performance at scale).
3. **Runtime validation failures** (lint, npm audit) and passing tests that do not catch live DB drift.
4. **No proven CI/CD gates** to prevent recurrence of schema drift or API auth gaps.

### Proposed Repair Roadmap (summarized)

| Phase | Goal |
|---|---|
| Phase 0 | Protect/disconnect critical unsafe API surfaces |
| Phase 1 | Align DB schema + migration ledger |
| Phase 2 | Stabilize subscription model + data |
| Phase 3 | Secure all API modules (auth gates) |
| Phase 4 | Add referential integrity (FKs, indexes) |
| Phase 5 | Frontend state/error/role consistency |
| Phase 6 | Define + expand offline/sync scope |
| Phase 7 | Scale reporting + performance |
| Phase 8 | Production backup/DR readiness |
| Phase 9 | CI/CD prevention gates |

---

## 7. Verification Tasks for Claude

Please verify the following and respond with a structured report:

### A. Schema Drift (Findings 1 & 2)
- Is the evidence chain (code writes column X → live DB lacks column X) logically sound for each module?
- Could there be alternative explanations for the migration ledger drift?
- Is the `features` type mismatch (`text` vs expected `jsonb`) correctly reasoned?

### B. API Security (Findings 3, 4, 10, 11)
- Are the unprotected modules correctly identified based on the described pattern (service-role client + no `withApi`/`requireAuth`)?
- Is the "fail-open" behavior of `ProtectedRoute` correctly characterized?
- Is the `tenant_id || 1` fallback in dashboard correctly identified as a risk?
- Could CORS wildcard amplify these issues?

### C. Data Integrity (Findings 5, 6, 7)
- Is the duplicate subscription analysis (no unique constraint + `.maybeSingle()` assumptions) logically consistent?
- Is the role divergence (bootstrap inserts `superadmin` vs comments say "Owner") correctly reasoned?
- Are the missing FK constraints correctly categorized as "future risk" rather than current data corruption?

### D. Offline/Sync (Finding 8)
- Is the offline coverage characterization accurate?
- Are the sync engine limitations correctly identified?

### E. Runtime Validation (Finding 9)
- Are the interpretations of test/lint/build/audit results reasonable?
- Is it valid to conclude that passing tests do not guarantee production DB compatibility?

### F. Overall Verdict
- Is the "not production-ready" classification justified by the evidence?
- Are there any findings that appear overstated?
- Are there any gaps in evidence that would require additional verification (e.g., runtime browser traces, real API calls against deployed environment)?
- Is the repair roadmap ordering (Phase 0 → Phase 9) logically sound?

---

## 8. Response Format Requested

Please structure your response as:

1. **Executive Summary** — overall assessment of audit quality and accuracy
2. **Finding-by-Finding Verification** — for each finding, state VERIFIED / LIKELY / NEEDS MORE EVIDENCE / MISINTERPRETED with reasoning
3. **Evidence Gaps** — what additional verification would strengthen confidence
4. **Roadmap Assessment** — whether the proposed repair phases are correctly ordered and scoped
5. **Final Verdict** — whether you agree, disagree, or partially agree with the "not production-ready" conclusion

---

**End of audit verification prompt.**
