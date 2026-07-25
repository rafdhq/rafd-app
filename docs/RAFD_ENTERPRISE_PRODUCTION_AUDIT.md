# RAFD Enterprise Production Audit — Investigation Log

> ## ⚠️ حالة هذا المستند: تاريخي (pre-PR #12)
>
> **كُتب قبل** دمج PR #12 في `main`. **معظم بنوده الحرجة عولجت فعليًا** منذ ذلك الحين:
>
> | ما ورد في هذا التقرير كمشكلة | الحالة الآن |
> |---|---|
> | modules تستخدم service-role بلا Auth Gate | ✅ عولج — كل module محمي |
> | `/api/subscription` غير محمي | ✅ عولج — `resolveAuth`/`requirePlatformAdmin` |
> | `/api/tenants` مفتوح | ✅ عولج — `tenants.js:126` |
> | Schema Drift | ✅ عولج — `20260725012031_...schema_align.sql` |
> | تكرار `tenant_subscriptions` | ✅ عولج — قيد `UNIQUE (tenant_id)` |
> | نقص FKs وindexes | ✅ عولج — 50 FK + 51 index |
> | Platform Admin مكسور بأعمدة مفقودة | ✅ عولج مع محاذاة السكيما |
> | CORS مفتوح | ✅ عولج — allowlist |
> | إثباتات الدفع في bucket عام | ✅ عولج — bucket خاص + رابط موقَّت |
> | باغ الـ loading العالق (حالة لا-tenant) | ✅ عولج في 12 صفحة |
> | Backup/Restore غير متوافق مع السكيما | ⚠️ السكيما عولجت؛ **الاستعادة ما زالت جزئية** |
> | Offline محدود خارج المبيعات/المنتجات | ❌ ما زال مفتوحًا |
> | أداء dashboard/reports/bundle | ❌ ما زال مفتوحًا |
> | `lint` و`audit` يفشلان | ❌ ما زالا يفشلان |
>
> **لا تستخدم هذا الملف كمصدر للحالة الحالية.** المصدر المعتمد:
> [`OPEN_ISSUES_INVESTIGATION_2026-07-25.md`](OPEN_ISSUES_INVESTIGATION_2026-07-25.md)
>
> يُحتفظ بهذا المستند لقيمته في توثيق **جذور** المشاكل والقرارات التي بُنيت عليها الإصلاحات.

> Mode: Investigation / Architecture + Software + Database + Production Stability Audit  
> Rule: This document is the only file intentionally created/updated during investigation. No application code, migrations, configs, commits, pushes, merges, or PRs are changed.  
> Repository branch: `arena/019f95a6-rafd-app`  
> Baseline commit observed: `0822b5ffcc83af42eb5c53774d6bbad6a8ccb3dc`

---

## 0. Purpose

This document accumulates all audit findings discovered during the investigation. It is intended to become the source document for the later repair roadmap after investigation is complete.

It records:

- Root causes.
- Evidence from code/runtime/database where available.
- Impact.
- Affected files/functions/flows.
- Relationships between problems.
- Pending analysis areas.

No fixes are proposed here until the investigation is complete, except where explicitly marked as future roadmap placeholders.

---

## 1. Investigation Progress

| Area | Status | Completion Estimate |
|---|---:|---:|
| Project structure map | In progress | 65% |
| Database schema audit | Mostly complete | 90% |
| Migration drift audit | Mostly complete | 95% |
| Data integrity audit | Mostly complete | 88% |
| RLS / DB security audit | Mostly complete | 82% |
| API audit | Mostly complete | 78% |
| Data Flow Map / Runtime Journey Map | In progress | 85% |
| Frontend page audit | Pending / starting next | 0% |
| Offline / Sync audit final pass | In progress | 60% |
| Security consolidation | Pending | 40% |
| Final report assembly | In progress | 45% |

Overall investigation estimate at this checkpoint: **81 / 100**.

---

## 2. Architecture Snapshot

### 2.1 Frontend

- React 19 + Vite.
- Routes in `src/App.tsx`.
- Main shell: `AppShell`, `AdminShell`.
- Contexts:
  - `AuthContext`
  - `TenantContext`
  - `SubscriptionContext`
  - `SyncContext`
  - `I18nContext`
  - `ThemeContext`

### 2.2 Backend/API

- Vercel serverless API files in `api/`.
- Domain routers:
  - `api/commerce.js`
  - `api/transactions.js`
  - `api/financial.js`
  - `api/operations.js`
  - `api/features.js`
  - `api/platform.js`
  - `api/support.js`
  - `api/analytics.js`
- Module handlers in `api/_lib/modules/`.
- Most DB access uses Supabase service-role client from `api/_lib/db-client.js`.

### 2.3 Database / Supabase

- Supabase PostgreSQL migrations in `supabase/migrations/`.
- RLS is generally enabled.
- API service role bypasses RLS, making API auth gates critical.

### 2.4 Offline

- IndexedDB database: `rafd-offline-v1`.
- Object stores:
  - `outbox`
  - `cache`
  - `meta`
- Offline support currently focuses mainly on products and sales.
- Service Worker caches shell/static assets and does not cache API responses.

---

## 3. Confirmed Root Cause Clusters

### Cluster A — Cloud DB Schema Drift

**Status:** Confirmed.

The live database does not match code expectations.

Confirmed missing or mismatched columns:

- `platform_settings.app_name`
- `platform_settings.app_name_ar`
- `platform_settings.support_whatsapp`
- `platform_settings.default_currency`
- `platform_settings.allow_registration`
- `platform_payment_methods.name_ar`
- `platform_payment_methods.provider`
- `platform_payment_methods.sort_order`
- `platform_announcements.audience`
- `platform_announcements.is_published`
- `platform_announcements.publish_at`
- `subscription_plans.name_ar`
- `subscription_plans.is_popular`
- `subscription_plans.sort_order`
- `subscription_plans.features` is `text`, while code expects JSON array / `jsonb` behavior.
- `subscription_payments.plan_code`
- `subscription_payments.billing_cycle`
- `subscription_payments.payment_method_id`
- `subscription_payments.payment_method_name`
- `subscription_payments.proof_url`
- `subscription_payments.sender_name`
- `subscription_payments.admin_notes`
- `subscription_payments.reviewed_by`
- `subscription_payments.reviewed_at`
- `tenant_subscriptions.last_payment_at`
- `audit_logs.actor_email`
- `audit_logs.entity`

**Impact:**

- Platform Admin settings/plans/payments/announcements are partially or fully broken.
- Subscription proof/payment/review flow is broken.
- Some audit writes silently fail.

**Evidence:**

- SQL Code Contract Columns results from live DB.
- Code references in:
  - `api/_lib/modules/platform-settings.js`
  - `api/_lib/modules/subscription-plans.js`
  - `api/_lib/modules/platform-payments.js`
  - `api/_lib/modules/platform-announcements.js`
  - `api/_lib/modules/subscription.js`
  - `api/_lib/modules/loyalty.js`
  - `api/_lib/modules/recipes.js`
  - `api/_lib/modules/import-export.js`

---

### Cluster B — Migration Ledger Drift

**Status:** Confirmed.

The live `supabase_migrations.schema_migrations` ledger is not consistent with actual schema artifacts.

| Migration | Ledger Status | Artifact Status |
|---|---|---|
| `20260722000009_bl01_onboarding_ratelimit.sql` | Missing | Table exists |
| `20260722000010_bl_inventory_sales_integrity.sql` | Missing | Key artifacts exist |
| `20260722000011_storage_media_policy_hardening.sql` | Missing | Storage policies exist |
| `20260722000012_app_users_auth_unique.sql` | Missing | Unique index missing |
| `20260722000013_platform_schema_align.sql` | Missing | Schema changes missing |

**Impact:**

- Database cannot be trusted as a clean replay of repository migrations.
- Some changes were applied manually or partially.
- Some necessary migrations were not applied.

---

### Cluster C — Duplicate Tenant Subscription State

**Status:** Confirmed.

Tenant `1` (`RAFD Store` / `متجر رفد`) has **10 rows** in `tenant_subscriptions`.

**Impact:**

- `ensureSubscription()` uses `.maybeSingle()` and assumes one row per tenant.
- Updates by `.eq('tenant_id', tenantId).select().single()` become unsafe with duplicates.
- Subscription access state becomes non-deterministic.

**Evidence:**

- Live SQL result: `DUPLICATE_TENANT_SUBSCRIPTIONS` for tenant `1` with 10 rows.
- Code:
  - `api/_lib/modules/subscription.js`
  - `supabase/migrations/20260722000001_base_schema.sql` has only non-unique index on `tenant_id`.

---

### Cluster D — Tenant Without Active Owner / Role Model Divergence

**Status:** Confirmed.

Tenant `1` has no `app_users` row with:

```sql
role = 'owner' AND status = 'active'
```

The bootstrap migration comments say "Owner + Super Admin", but inserts `role = 'superadmin'`.

**Impact:**

- Owner-dependent UI and business rules may not recognize the tenant as owner-managed.
- `ProtectedRoute` treats superadmin with tenant as store-capable.
- `Sidebar` filters menu items by role arrays that do not include `superadmin`.

**Evidence:**

- Live SQL result: `TENANT_WITHOUT_ACTIVE_OWNER` for tenant `1`.
- `supabase/migrations/20260722000008_admin_bootstrap.sql`.
- `src/components/ProtectedRoute.tsx`.
- `src/components/layout/Sidebar.tsx`.

---

### Cluster E — API Service-Role Exposure / Missing Auth Gates

**Status:** Confirmed.

Several API modules use service-role DB access with no module-level auth gate.

Confirmed unprotected modules:

- `branches.js`
- `bank-accounts.js`
- `expenses.js`
- `payment-terminals.js`
- `customer-ledger.js`
- `supplier-ledger.js`
- `suppliers.js`
- `notifications.js`
- `dashboard.js`
- `tenant-catalog.js`
- `subscription.js`

**Impact:**

- RLS does not protect these paths because API uses service role.
- Client-provided `tenant_id` can drive reads/writes.
- Financial and ledger endpoints are especially risky.

**Critical Examples:**

- `/api/subscription` controls payment review, admin activation, device release, and subscription status without auth gate in the module.
- `/api/customer-ledger` and `/api/supplier-ledger` mutate financial balances directly without auth gate.
- `/api/dashboard` has `tenant_id || 1` fallback and reads `sale_items` without direct tenant scoping.

---

### Cluster F — Missing Foreign Keys / Referential Integrity Weakness

**Status:** Confirmed.

Many P1/P2 tables have relationship columns but no FK constraints.

Affected areas:

- cashier shifts
- refunds
- refund items
- stocktake sessions/lines
- loyalty
- pricing
- recipes
- manufacturing
- AI conversations
- push subscriptions
- WhatsApp outbox
- several base schema weak references such as `products.supplier_id`, `sales.bank_account_id`, `audit_logs.user_id`

**Current data state:**

- Current data checks did not reveal orphan/cross-tenant rows in sampled active relations.
- Several P1/P2 tables are empty, so no current corruption exists there.

**Impact:**

- Future writes can create orphan or cross-tenant references.
- Database is not the true enforcer of business relationships.

---

### Cluster G — Offline / Sync Is Partial

**Status:** Confirmed.

Offline system supports mainly:

- products
- sales
- product cache
- customer/sales/product snapshots

Out of scope or not fully covered:

- purchases
- expenses
- suppliers
- bank accounts
- payment terminals
- pricing
- loyalty
- recipes
- branches
- detailed ledgers

**Sync behavior:**

- Push outbox in chronological order.
- Pull snapshots for products/customers/sales only.
- Conflict resolution is minimal.

---

## 4. Positive Findings

- Current sales data integrity checks passed:
  - no completed sales without items
  - no subtotal/item total mismatch
  - no duplicate invoice per tenant/branch
  - no negative sales totals
- Current inventory/catalog checks passed:
  - no negative stock
  - no duplicate SKU/barcode per tenant
  - no products without packaging rows
  - no invalid packaging units
- Customer ledger currently matches customer balances.
- No duplicate app user emails or auth IDs currently.
- Storage bucket `rafd-media` exists, is public-read, and has 1 object.
- POS critical columns exist:
  - `sales.idempotency_key`
  - `sales.shift_id`
  - `sales.tax_rate`
  - `sales.tax_mode`
  - `sale_items.weight_g`
  - `sale_items.sold_by_weight`
  - `sync_status.server_version`

---

## 5. Data Flow Map — Current Snapshot

### 5.1 Auth / Profile

```text
Login/AdminLogin/Onboarding
↓
Supabase Auth
↓
AuthContext
↓
/api/users?email=...
↓
app_users
↓
AuthContext.profile
↓
localStorage cached profile
↓
ProtectedRoute / SuperAdminRoute / Sidebar
```

Breakpoints:

- Cached profile can become stale.
- Role model divergence: `superadmin` with tenant behaves as owner in some places but not in Sidebar or DB owner checks.

---

### 5.2 Tenant / Branch

```text
AuthContext.profile.tenant_id
↓
TenantContext.refreshTenant()
↓
/api/tenants?id=...
/api/branches?tenant_id=...
↓
tenants / branches
↓
TenantContext + localStorage cache
↓
AppShell / Sidebar / TopBar / all tenant pages
```

Breakpoints:

- `/api/branches` is unprotected service-role endpoint.

---

### 5.3 Subscription

```text
SubscriptionContext / ProtectedRoute / Subscription / SuperAdmin
↓
/api/subscription
↓
tenant_subscriptions / subscription_payments / subscription_plans / device_bindings / tenants
↓
access state
↓
route allowed or blocked
```

Breakpoints:

- `/api/subscription` has no auth gate.
- duplicate tenant subscription rows exist.
- payment/review columns missing.
- ProtectedRoute fails open when subscription check fails.

---

### 5.4 Product / Inventory

```text
Products page
↓
useTenantScopedList('products')
↓
/api/products
↓
products + product_packaging
↓
React state + IndexedDB cache
↓
Create/update/delete via offline wrappers
↓
Online API or IndexedDB outbox
↓
SyncEngine replay
```

Breakpoints:

- UI sends `supplier_id` on product create, but `products.js` insert does not persist it.
- product supplier FK missing.

---

### 5.5 POS Sale

```text
POS page
↓
load products/customers/banks/terminals/pricing
↓
cart state
↓
completeSale()
↓
createSaleWithOffline()
↓
/api/sales or outbox
↓
sales + sale_items + products stock RPC + customer_ledger
↓
receipt/print/WhatsApp
```

Breakpoints:

- POS depends on unprotected bank accounts/payment terminals APIs.
- API does not verify `customer_id` and `product_id` tenant ownership before updates/RPC.
- Offline conflict model is minimal.

---

### 5.6 Platform Admin

```text
SuperAdmin
↓
/api/tenants / users / platform-settings / subscription-plans / platform-payments / platform-announcements / subscription actions
↓
platform tables + tenant/subscription tables
↓
admin state
↓
mutations
```

Breakpoints:

- Platform schema drift breaks settings/plans/payments/announcements.
- `/api/subscription` admin actions are not protected.

---

## 6. Runtime Journey Findings

### 6.1 Onboarding

Findings:

- Multi-step non-transactional creation can leave partial tenant state.
- Observed tenant without active owner.
- Trial/init subscription can duplicate rows due `.maybeSingle()` assumptions and no unique constraint.
- Uses several unprotected endpoints during flow: subscription, branches, notifications.

### 6.2 Login / Tenant / Subscription Gate

Findings:

- Auth profile and tenant can fall back to localStorage offline cache.
- Subscription gate is fail-open on API failure.
- Superadmin bypasses subscription check.

### 6.3 POS Online/Offline

Findings:

- Online sale flow is relatively mature: idempotency, discount cap, stock RPC, weighted items, credit ledger.
- Tenant ownership validation inside sale operations is incomplete for customer/product IDs.
- Offline sales are queued and replayed, with optimistic local stock updates.

### 6.4 Product Offline

Findings:

- Products page has strong offline wrapper compared to most pages.
- Create/update/delete have IndexedDB outbox paths.
- Supplier association bug on create path.

### 6.5 Subscription Payment

Findings:

- Catalog loading currently broken by missing `sort_order` columns.
- Payment proof insert currently broken by missing `subscription_payments` columns.
- Payment review/activation broken by missing `last_payment_at` and duplicate subscription rows.

---

## 7. Pending Audit Sections

Next sections to complete:

1. Frontend Page Audit.
2. Offline final pass.
3. Security consolidation.
4. Performance audit.
5. Final production readiness classification.
6. Final repair roadmap after investigation completion.

---

## 8. Running Issue Register

| ID | Severity | Title | Status |
|---|---|---|---|
| DB-001 | Critical | Platform schema drift / migration 13 not applied | Confirmed |
| DB-002 | Critical | Subscription payments schema missing columns | Confirmed |
| DB-003 | Critical | Duplicate tenant_subscriptions | Confirmed |
| DB-004 | High | Tenant without active owner | Confirmed |
| DB-005 | High | Missing FK constraints across P1/P2 | Confirmed |
| DB-006 | Medium | Missing tenant_id indexes on feature tables | Confirmed |
| API-001 | Critical | Service-role endpoints without auth gate | Confirmed |
| API-002 | Critical | `/api/subscription` unprotected and schema-broken | Confirmed |
| API-003 | High | `/api/dashboard` public fallback to tenant 1 | Confirmed |
| API-004 | Critical | Financial ledger endpoints unprotected | Confirmed |
| FLOW-001 | High | Onboarding is non-transactional | Confirmed |
| FLOW-002 | High | Product create drops supplier_id | Confirmed |
| FLOW-003 | Medium | Offline coverage partial | Confirmed |
| AUDIT-001 | Medium | Some audit writers target non-existent columns | Confirmed |
| ROLE-001 | High | Superadmin/owner role divergence | Confirmed |

---

## 9. Next Update Target

Next document update should append findings from: **Frontend Page Audit**.

---

## 10. Frontend Page Audit v0.1

### 10.1 Scope

This audit pass reviewed page-level data loading, loading states, error states, empty states, tenant guards, offline hooks, and frontend dependency on API endpoints.

Reviewed areas:

- All files in `src/pages/**/*.tsx`.
- Critical UI support components for states/skeleton/empty states.
- Context dependencies already mapped in Data Flow Map.

### 10.2 General Frontend Pattern

Most pages follow a simple pattern:

```text
Page component
↓
useTenant() / useAuth() / useSubscription()
↓
local React state: loading/items/form/error
↓
fetch('/api/...')
↓
if res.ok then setState
↓
PageSkeleton or table/cards/dialogs
```

Only a smaller set uses the stronger offline/error-state architecture:

- `Products.tsx`
- `Inventory.tsx`
- POS sale flow via `createSaleWithOffline`

### 10.3 Pages with Robust Loading/Error/Offline Handling

#### Products

Evidence:

- Uses `useTenantScopedList`.
- Handles `loading`, `no-tenant`, `permission`, `network`, and generic server error states.
- Uses `OfflineBanner` when data served from cache.
- Mutations use offline wrappers.

Primary evidence:

- `src/pages/Products.tsx`
- `src/hooks/useTenantScopedList.ts`
- `src/lib/offline/productsQueue.ts`

Status: relatively strong.

#### Inventory

Evidence:

- Uses `useTenantScopedList` with explicit error states.
- Uses `updateProductWithOffline` for stock adjustment.
- Shows offline banner when cached.

Status: relatively strong.

#### Dashboard / Backup / AIAssistant / SuperAdmin

These pages have explicit error states or error messages:

- `Dashboard.tsx` uses `ErrorState`.
- `Backup.tsx` uses `ErrorState` and `PageSkeleton`.
- `AIAssistant.tsx` uses `ErrorState`.
- `SuperAdmin.tsx` uses `ErrorState`.

However, these pages still depend on backend endpoints that may be insecure or schema-broken.

### 10.4 Pages with Weak Error Handling

Several pages silently ignore failed API responses or only use `alert()`.

Examples:

| Page | Finding |
|---|---|
| `Branches.tsx` | Only checks `res.ok` on load; no user-facing error state. Depends on unprotected `/api/branches`. |
| `Customers.tsx` | No load error state; customer ledger endpoint unprotected. |
| `Suppliers.tsx` | No load error state; supplier and supplier-ledger APIs unprotected. |
| `Expenses.tsx` | No user-facing error state; API unprotected. |
| `Payments.tsx` | No user-facing error state; bank/payment terminal APIs unprotected. |
| `Reports.tsx` | No explicit error state despite depending on broken/unprotected dashboard endpoint. |
| `Pricing.tsx` | No tenant guard in page code; request relies on API auth; no visible error state. |
| `Loyalty.tsx` | No tenant guard in page code; no visible error state. |
| `Recipes.tsx` | No tenant guard in page code; errors mostly alert-only. |
| `Stocktake.tsx` | No user-facing error state for load failures. |
| `Shifts.tsx` | No user-facing error state for load failures. |
| `AuditLogs.tsx` | If no tenant, loading can remain true because load returns before `setLoading(false)`. |

### 10.5 Repeated Loading Bug Pattern

Multiple pages use this pattern:

```ts
const load = async () => {
  if (!tenant?.id) return;
  setLoading(true);
  ...
  setLoading(false);
};
```

If `tenant?.id` never resolves, the initial `loading = true` can remain forever.

Observed in pages such as:

- `Branches.tsx`
- `Customers.tsx`
- `Suppliers.tsx`
- `Expenses.tsx`
- `Payments.tsx`
- `Purchases.tsx`
- `Reports.tsx`
- `Refunds.tsx`
- `Shifts.tsx`
- `Stocktake.tsx`
- `AuditLogs.tsx`

`Products.tsx` and `Inventory.tsx` avoid this through `useTenantScopedList` and `NoTenantState`.

### 10.6 Frontend Pages Depending on Unprotected API Modules

The following frontend pages depend on API modules previously confirmed as missing auth gates:

| Page | API dependency | Risk |
|---|---|---|
| `Branches.tsx` | `/api/branches` | Service-role, no auth gate. |
| `TenantContext.tsx` | `/api/branches` | Core tenant loading depends on unprotected API. |
| `Payments.tsx` | `/api/bank-accounts`, `/api/payment-terminals` | Financial setup endpoints unprotected. |
| `POS.tsx` | `/api/bank-accounts`, `/api/payment-terminals` | POS payment methods depend on unprotected APIs. |
| `Expenses.tsx` | `/api/expenses` | Financial expenses endpoint unprotected. |
| `Suppliers.tsx` | `/api/suppliers`, `/api/supplier-ledger` | Supplier and ledger flows unprotected. |
| `Customers.tsx` | `/api/customer-ledger` | Customer ledger balance mutation unprotected. |
| `Notifications.tsx` | `/api/notifications` | Notification read/update unprotected. |
| `Dashboard.tsx` / `Reports.tsx` / `MobileApps.tsx` | `/api/dashboard` | Dashboard endpoint unprotected and has tenant 1 fallback. |
| `Subscription.tsx` / `SuperAdmin.tsx` | `/api/subscription` | Subscription endpoint unprotected and schema-broken. |

### 10.7 Mobile Pages

#### `MobileApps.tsx`

- Fetches `/api/dashboard?tenant_id=...` directly.
- Does not expose loading/error state for dashboard stats.
- Uses same unprotected dashboard endpoint.

#### `MobileManager.tsx`

- Mostly navigation shell.
- Uses `useSync` and `useTenant`.
- No direct data load except inherited context.

#### `MobileStaff.tsx`

- Mostly navigation shell.
- Uses `useAuth`.
- No role-based filtering inside page; displays fixed staff links.

### 10.8 Frontend Runtime Breakpoints

| ID | Severity | Breakpoint |
|---|---|---|
| FE-001 | High | Repeated loading-stuck pattern when `tenant?.id` is missing. |
| FE-002 | Critical | Several pages depend on unprotected service-role APIs. |
| FE-003 | High | Subscription and Platform Admin pages depend on schema-broken endpoints. |
| FE-004 | Medium | Many pages use `alert()` or silent `res.ok` checks instead of structured error states. |
| FE-005 | Medium | Offline UX is inconsistent: strong in Products/Inventory/POS, weak elsewhere. |
| FE-006 | High | Dashboard and MobileApps depend on unprotected `/api/dashboard`. |
| FE-007 | High | Superadmin-with-tenant role can pass route but may see no Sidebar items due role filtering. |

### 10.9 Frontend Positive Findings

- Products and Inventory have mature error/offline state handling.
- POS has a comprehensive payment/receipt/printing UI and offline sale queue integration.
- Several pages have `PageSkeleton` and `EmptyState` components.
- SuperAdmin has a top-level `ErrorState`, though its dependencies are schema-broken.
- Auth and Tenant contexts have offline fallback through cached profile/tenant/branches.

### 10.10 Frontend Audit Status

Frontend Page Audit completion estimate: **65%**.

Remaining frontend work:

- Responsive/layout visual validation in browser.
- Runtime console error capture.
- Suspense/hook dependency review in more detail.
- Role-based navigation and route accessibility matrix.
- Empty/error state consistency table by page.


---

## 11. Offline / Sync Audit Final Pass v0.1

### 11.1 Offline Storage Architecture

The app uses two offline persistence layers:

1. `localStorage` for identity, preferences, device identity, POS settings, and suspended carts.
2. IndexedDB for operational offline cache and outbox.

#### IndexedDB

Database: `rafd-offline-v1`

Stores:

- `outbox`
- `cache`
- `meta`

Evidence:

- `src/lib/offline/db.ts`

Outbox fields include:

- `tenant_id`
- `type`
- `method`
- `url`
- `body`
- `status`
- `attempts`
- `last_error`
- `idempotency_key`

### 11.2 Outbox Lifecycle

```text
Offline-capable mutation
↓
try online API first if navigator.onLine
↓
on network/server failure or offline:
  enqueueOutbox()
  update IndexedDB cache optimistically
↓
SyncContext detects online or manual sync
↓
runSyncEngine()
↓
list pending + failed outbox items
↓
for each item in chronological order:
  mark syncing
  apiFetch(item.url, method, body, headers)
  remove item on success
  mark failed on error
↓
pullTenantSnapshots()
↓
update cache products/customers/sales
↓
POST /api/sync server clock
↓
meta last_sync_at
```

Evidence:

- `src/lib/offline/db.ts`
- `src/lib/offline/syncEngine.ts`
- `src/contexts/SyncContext.tsx`

### 11.3 Supported Offline Mutations

| Entity | Offline create | Offline update | Offline delete | Evidence |
|---|---:|---:|---:|---|
| Sale | Yes | No | No | `src/lib/offline/salesQueue.ts` |
| Product | Yes | Yes | Yes | `src/lib/offline/productsQueue.ts` |
| Inventory stock adjustment | Partial via product update | Yes | No | `Inventory.tsx` + `productsQueue.ts` |
| Customer | No | No | No | page uses raw fetch |
| Supplier | No | No | No | page uses raw fetch |
| Purchase | No | No | No | page uses raw fetch |
| Expense | No | No | No | page uses raw fetch |
| Bank account | No | No | No | page uses raw fetch |
| Payment terminal | No | No | No | page uses raw fetch |
| Customer ledger | No | No | No | page uses raw fetch |
| Supplier ledger | No | No | No | page uses raw fetch |
| Subscription | No | No | No | page uses raw fetch |
| Platform Admin | No | No | No | raw fetch |
| Stocktake | No | No | No | raw fetch |
| Shift | No | No | No | raw fetch |
| Pricing | No | No | No | raw fetch |
| Loyalty | No | No | No | raw fetch |
| Recipes | No | No | No | raw fetch |

### 11.4 Offline Read Cache Coverage

`pullTenantSnapshots()` pulls only:

- products
- customers
- sales

Evidence:

- `src/lib/offline/syncEngine.ts`

`useTenantScopedList()` provides offline cached reads for pages that opt into it. Currently the main consumers are:

- Products
- Inventory

Other pages generally use raw `fetch()` and do not use the IndexedDB cache directly.

### 11.5 Service Worker Behavior

The service worker:

- caches shell routes: `/`, `/index.html`, `/favicon.svg`, `/mobile/manager`, `/mobile/staff`
- uses network-first for navigations
- uses stale-while-revalidate for static assets
- explicitly does not cache `/api/*`

Evidence:

- `public/sw.js`

Important lines:

```js
if (url.pathname.startsWith('/api/')) return;
```

Therefore API offline behavior is entirely handled by app-level IndexedDB code, not the service worker.

### 11.6 Identity Offline Cache

Identity/session-related data is cached in localStorage:

- `rafd.session.profile`
- `rafd.session.tenant`
- `rafd.session.branches`

Evidence:

- `src/lib/offline/localSession.ts`

This allows the app to keep routing and tenant context when offline.

Risk:

- role/status/tenant data may become stale.
- disabled users or changed permissions may keep old cached access while offline.

### 11.7 Device Identity

Device ID is stored in localStorage under:

- `rafd_device_id_v1`

Evidence:

- `src/lib/device.ts`

This participates in subscription/trial anti-abuse checks via `/api/subscription?action=check-device`.

Risk:

- device identity is client-controlled localStorage.
- check-device endpoint is public through subscription module.

### 11.8 Sales Offline Flow

Offline sales are queued when:

- browser is offline, or
- online request fails with network-ish / server error.

Sale offline behavior:

- creates local sale ID `local-${Date.now()}`
- queues POST `/api/sales`
- stores local sale in `sales:list:{tenantId}`
- applies optimistic stock decrement to cached products

Evidence:

- `src/lib/offline/salesQueue.ts`

Strengths:

- idempotency key is added by outbox.
- server also supports idempotency via `idempotency_key` / `client_local_id`.
- optimistic stock update improves POS UX.

Weaknesses:

- no local validation of all server-side constraints.
- no explicit conflict resolution except chronological replay.
- if replay fails due schema/auth/validation, item remains failed and must retry later.
- only product cache is adjusted optimistically; ledger/customer cache may not fully reflect offline credit effects until pull.

### 11.9 Product Offline Flow

Product offline behavior:

- create/update/delete wrappers attempt online API first.
- queue only network/server-ish failures.
- do not queue real client/server rejections such as 401/403/validation.
- local-only product updates merge into queued create body.
- local-only delete removes pending create rather than queueing a DELETE against a server ID that does not exist.

Evidence:

- `src/lib/offline/productsQueue.ts`

Strengths:

- More mature than most pages.
- Handles local-only IDs carefully.
- Surfaces real rejection errors instead of hiding them.

Weaknesses:

- Supplier relation bug still exists in product create API path: UI sends `supplier_id`, API create omits it.
- Conflict resolution remains last replay order, not merge-aware.

### 11.10 Sync Engine

Sync steps:

1. If offline, return current pending count and last local sync time.
2. If online, collect pending and failed outbox items for tenant.
3. Sort by `created_at` ascending.
4. Push one by one.
5. Remove successful items.
6. Mark failures as `failed` and increment attempts.
7. Pull snapshots for products/customers/sales.
8. Save `last_sync_at` locally.

Evidence:

- `src/lib/offline/syncEngine.ts`

Weaknesses:

- no exponential backoff
- no max attempts
- no dead-letter state
- no conflict resolution strategy beyond chronological replay
- no per-entity merge policy
- failed item stays retryable indefinitely
- pull snapshots are limited to three entities

### 11.11 Server Sync Endpoint

`/api/sync` is protected by `withApi` and permission `sync:use`.

It stores:

- status
- last_sync_at
- message
- pending_changes
- server_version

It returns limited product pull hints.

Evidence:

- `api/_lib/modules/sync.js`

Weaknesses:

- server_version is just timestamp or client pull version, not a true per-row cursor.
- pull hints only include products count/watermark by id.
- no server-side conflict detection.
- no central sync log of individual outbox items.

### 11.12 Offline Coverage Gaps

Critical gaps:

- purchases not offline
- expenses not offline
- suppliers not offline
- customer/supplier ledgers not offline
- bank accounts/payment terminals not offline
- stocktake not offline
- shifts not offline
- subscription/platform admin not offline
- pricing/loyalty/recipes not offline
- reports not cache-first except dashboard raw fetch has no offline support

### 11.13 Offline / Sync Breakpoints

| ID | Severity | Finding |
|---|---|---|
| OFF-001 | High | Offline claim is broader than implementation; only products/sales are operationally offline. |
| OFF-002 | High | Conflict resolution is chronological replay only. |
| OFF-003 | Medium | Pull snapshots include only products/customers/sales. |
| OFF-004 | Medium | Failed outbox items have no max attempts/dead-letter path. |
| OFF-005 | Medium | Service Worker does not cache API responses; all data offline depends on IndexedDB coverage. |
| OFF-006 | High | Offline identity cache can become stale for role/status changes. |
| OFF-007 | Medium | Server sync endpoint stores status but does not provide true delta sync or conflict detection. |
| OFF-008 | Medium | Sales offline updates product cache but not full customer ledger/credit cache. |
| OFF-009 | Medium | Product offline create/update handles local IDs well but API create loses supplier_id. |
| OFF-010 | Low | Local device ID is localStorage-based and client-controlled. |

### 11.14 Offline Positive Findings

- Dedicated IndexedDB wrapper exists.
- Outbox has tenant/status indexes.
- Products and sales have meaningful offline wrappers.
- Product local-only create/update/delete behavior is thoughtfully handled.
- SyncContext automatically flushes when browser comes online.
- Service worker properly avoids caching API responses, preventing stale API cache confusion.
- Identity fallback makes offline navigation possible.

### 11.15 Offline Audit Status

Offline / Sync Audit completion estimate: **85%**.

Remaining offline work:

- Browser runtime test for outbox replay.
- Simulated failed replay / schema error test.
- Validate actual IndexedDB contents after offline sale/product create.
- Confirm UI visibility of failed outbox details for users/admins.


---

## 12. Security Audit Consolidation v0.1

### 12.1 Security Architecture Snapshot

Security is split across several layers:

1. Supabase Auth JWT.
2. `app_users` profile lookup and role model.
3. API middleware (`requireAuth`, `withApi`, `resolveTenantId`).
4. Supabase RLS policies for direct client/PostgREST access.
5. Service-role API access that bypasses RLS.
6. Frontend route guards.
7. Storage bucket policies.
8. Offline local caches.

The strongest layer is the `withApi` wrapper plus RLS for direct access. The weakest layer is unprotected service-role API modules.

---

### 12.2 JWT / Auth Resolution

API authentication uses bearer token resolution from `Authorization` header.

Flow:

```text
Authorization: Bearer <JWT>
↓
supabase.auth.getUser(token)
↓
lookup app_users by email
↓
if not found lookup by auth_id
↓
reject inactive/missing profile
↓
return auth object with role/profile
```

Evidence:

- `api/_lib/auth-middleware.js`

Important behavior:

- profile lookup first by email, then auth_id.
- inactive profile rejected.
- missing app profile rejected.

Risk:

- Email-first lookup can be fragile if email changes in Supabase Auth and `app_users.email` is stale.
- `idx_app_users_auth_unique` is missing in live DB, so uniqueness of `auth_id` is not currently enforced at DB level.

Confirmed DB result:

- No duplicate `auth_id` currently.
- But unique partial index expected by migration 12 is missing.

---

### 12.3 API Authorization Wrapper

`withApi` provides:

- CORS handling.
- permission lookup by HTTP method.
- `requireAuth`.
- `resolveTenantId`.
- tenant mismatch prevention for request body.

Evidence:

- `api/_lib/handler.js`

Strength:

- Non-superadmin tenant escalation is blocked in protected modules.
- Body tenant mismatch is rejected for mutations.

Risk:

- Protection only applies to modules that actually use `withApi`.

---

### 12.4 Service Role Bypass

Backend DB access uses the Supabase service-role key.

Evidence:

- `api/_lib/db-client.js`

Impact:

- Service-role bypasses RLS.
- Any API module without auth/tenant checks becomes the effective security boundary.
- RLS cannot compensate for unprotected service-role endpoints.

Confirmed unprotected service-role modules:

- `branches.js`
- `bank-accounts.js`
- `expenses.js`
- `payment-terminals.js`
- `customer-ledger.js`
- `supplier-ledger.js`
- `suppliers.js`
- `notifications.js`
- `dashboard.js`
- `tenant-catalog.js`
- `subscription.js`

Security status: **Critical**.

---

### 12.5 Tenant Isolation

#### Direct DB / RLS

RLS policies generally use:

```sql
tenant_id = current_tenant_id() OR is_superadmin()
```

For tenant-scoped tables, direct Supabase access appears protected.

Evidence:

- live RLS SQL results
- `supabase/migrations/20260722000007_rls_tenant_isolation.sql`

#### API Layer

Protected `withApi` modules enforce tenant resolution. However, unprotected modules accept `tenant_id` from query/body and use service-role.

Critical difference:

| Layer | Tenant isolation status |
|---|---|
| Direct Supabase client | mostly protected by RLS |
| API modules using `withApi` | generally protected |
| API modules not using `withApi` | not protected |

---

### 12.6 Superadmin / Owner Role Model

Current permissions model:

- `owner`: wildcard `*`
- `superadmin`: `['*', 'platform:*']`

Evidence:

- `api/_lib/permissions.js`

Route behavior:

- `SuperAdminRoute` allows only `role === 'superadmin'`.
- `ProtectedRoute` allows superadmin with tenant into store, but redirects superadmin without tenant to admin.

Frontend navigation issue:

- Sidebar role filters do not include `superadmin` in store menu roles.
- A superadmin with tenant can pass route guard but may not see store navigation items.

DB/data issue:

- Tenant 1 has no active `owner` role.
- Bootstrap inserts `role='superadmin'` while describing Owner + Super Admin.

Security impact:

- Role semantics are inconsistent between DB, route guards, permissions, and UI navigation.

---

### 12.7 Subscription Security

`/api/subscription` is the most critical security gap found.

Public/unprotected actions include:

- `GET action=payments`
- `GET action=devices`
- `GET action=check-device`
- default GET subscription status by tenant_id
- `POST action=init-trial`
- `POST action=select-plan`
- `POST action=submit-payment`
- `POST action=review-payment`
- `POST action=admin-activate`
- `POST action=release-device`

Evidence:

- `api/_lib/modules/subscription.js`

Critical impact:

- payment review and admin activation are exposed at module level.
- device release is exposed at module level.
- subscription state controls store access.
- endpoint is already schema-broken and duplicate subscription rows exist.

Security status: **Critical**.

---

### 12.8 ProtectedRoute Subscription Gate

`ProtectedRoute` checks subscription status but fails open.

Behavior:

```text
if subscription API returns non-ok → allow
if subscription API throws → allow
if role superadmin → allow
```

Evidence:

- `src/components/ProtectedRoute.tsx`

Impact:

- Subscription system failure does not block access.
- This masks backend/schema failures.
- Superadmin bypass is explicit.

Security status: **High**.

---

### 12.9 CORS / Public API Surface

CORS is permissive:

```http
Access-Control-Allow-Origin: *
```

Evidence:

- `api/_lib/auth-middleware.js`
- `vercel.json`

Impact:

- Public/unprotected endpoints can be called from any origin.
- For protected endpoints, bearer token still required.
- For unprotected service-role endpoints, wildcard CORS amplifies exposure.

Security status: **High** when combined with missing auth gates.

---

### 12.10 Storage Security

Storage bucket:

- `rafd-media`
- public read
- object count observed: 1

Policies observed from live DB:

- public read for bucket
- authenticated-only write/update/delete

Migration 11 hardens storage policies to `TO authenticated`.

API upload:

- `api/_lib/modules/upload.js`
- protected with `withApi`
- requires `products:write`
- server-side max bytes guard default 2.5MB
- sanitizes filename
- uses service-role storage upload

Risks:

- Upload API permission is always `products:write`, even for subscription proof uploads and platform logos.
- Folder path can be provided by client body.
- Bucket is intentionally public-read, so sensitive files should not be stored there unless intended public.
- Subscription proof upload currently stores proof in a public bucket path; the DB flow for proof is broken by missing `proof_url` column.

Security status: **Medium / High for subscription proof privacy depending on business expectation**.

---

### 12.11 Offline Identity Security

Offline profile/tenant/branches are cached in localStorage.

Evidence:

- `src/lib/offline/localSession.ts`

Benefits:

- offline app access after prior login.

Risks:

- stale role/status can persist while offline.
- disabled or downgraded users may continue local access until sign-out or online refresh.
- localStorage can be inspected/modified by client-side code/user.

Security status: **High for strict permission environments; acceptable only with defined offline policy**.

---

### 12.12 Device Trial Security

Device identity uses localStorage and browser fingerprint seed.

Evidence:

- `src/lib/device.ts`

Risk:

- `rafd_device_id_v1` is client-controlled.
- Device trial checks happen through public `/api/subscription?action=check-device`.
- This is anti-abuse, not strong identity/security control.

Security status: **Medium**.

---

### 12.13 Public Test / Health Endpoints

Public endpoints:

- `/api/test`
- `/api/test-import`
- `/api/health`

`/api/health` exposes:

- db status
- dbDetails sample accessibility result
- backend env key names/status, not values
- version

Security impact:

- No secrets exposed directly.
- Public operational metadata is still exposed.

Security status: **Low / Medium**.

---

### 12.14 Security Risk Register

| ID | Severity | Finding | Status |
|---|---|---|---|
| SEC-001 | Critical | Service-role API modules without auth gates | Confirmed |
| SEC-002 | Critical | `/api/subscription` unprotected for admin-grade actions | Confirmed |
| SEC-003 | Critical | Financial ledger endpoints mutate balances without auth gate | Confirmed |
| SEC-004 | High | CORS wildcard amplifies unprotected API exposure | Confirmed |
| SEC-005 | High | ProtectedRoute subscription gate fails open | Confirmed |
| SEC-006 | High | Superadmin/owner role model divergence | Confirmed |
| SEC-007 | High | API tenant isolation bypass possible in unprotected modules | Confirmed |
| SEC-008 | Medium/High | Public storage bucket used for uploaded media/proofs | Confirmed |
| SEC-009 | High | Offline cached identity can become stale | Confirmed |
| SEC-010 | Medium | Device trial identity is localStorage-controlled | Confirmed |
| SEC-011 | Medium | Missing `idx_app_users_auth_unique` DB constraint | Confirmed |
| SEC-012 | Low/Medium | Public health/test endpoints expose operational metadata | Confirmed |
| SEC-013 | Medium | Push notify uses internal role check while POST permission is `notifications:read` | Confirmed |

### 12.15 Security Positive Findings

- RLS is generally enabled on public tables.
- Tenant-scoped direct DB access has tenant/superadmin policies.
- `withApi` is a solid pattern where used.
- JWT validation uses Supabase `auth.getUser()`.
- Inactive app_users are rejected in auth middleware.
- Upload endpoint has size guard and filename sanitization.
- Storage write/update/delete policies are authenticated-only in live DB.

### 12.16 Security Audit Status

Security consolidation completion estimate: **88%**.

Remaining work:

- Browser/runtime verification of unauthenticated API access.
- Check deployed environment headers and cookies in browser/network.
- Validate whether subscription proof files are considered sensitive.
- Full role/page access matrix.


---

## 13. Production Readiness + Performance Audit v0.1

### 13.1 Build / Test / Tooling

Package scripts:

- `npm run build` → `tsc -b && vite build`
- `npm run lint` → `eslint .`
- `npm test` → `vitest run`
- `npm run db:check` → `node scripts/test-supabase-connection.mjs`

Evidence:

- `package.json`

Testing inventory observed:

- 18 test files under `src/`
- 9 test files under `api/`
- Total observed test files: 27

Strengths:

- There are tests for tax, pricing, loyalty engine, offline local session/products queue, AuthContext, BarcodeScanner, API audit writer, auth permissions, refund math, discount policy, upload/platform/users/products integration-style modules.

Weaknesses:

- No full browser E2E test suite observed as a required CI gate.
- Runtime page rendering and network behavior are not validated end-to-end.
- API modules are JavaScript and are not TypeScript-checked by the `tsconfig.app.json` include, which includes only `src`.
- ESLint config applies only to `**/*.{ts,tsx}`, so `api/**/*.js` is not linted by the provided config.

Production impact:

- Several API security/schema issues exist in JS modules without static type/lint coverage.
- Build success alone does not prove API production correctness.

---

### 13.2 CI / Deployment Workflow

Observed workflow:

- `.github/workflows/supabase-migrate.yml`
- Trigger branch: `develop`
- Executes `supabase db push --linked --include-all`
- Runs DB connection check, tests, and build.

Strengths:

- Migrations can be applied via GitHub Actions.
- Tests and build are intended to run after migration.

Weaknesses / Observed Risk:

- Workflow triggers on `develop`, while current working branch is `arena/019f95a6-rafd-app` and baseline is from `main`.
- Live database migration ledger is already drifted from repository migrations.
- This proves that migration automation is either not used for this DB, not pointed at the audited DB, or not sufficient to guarantee drift-free state.

Production impact:

- Deployment/migration process is not currently trustworthy as a source of truth for live DB state.
- CI gates do not prevent schema drift already observed.

---

### 13.3 Runtime Observability

Observed components:

- `api/health.js`
- `api/_lib/sentry.js`
- `src/lib/sentry.ts`
- `api/_lib/db-wake.js`

#### Health endpoint

`/api/health` returns:

- service name
- time
- DB status
- DB detail string
- version
- env check validity/missing/warnings/present key names

Strength:

- Useful for basic environment and DB reachability checks.

Risk:

- Public health endpoint exposes operational metadata and env key status names.
- Does not verify schema compatibility, migration status, critical API auth gates, or subscription/platform schema contract.

#### Sentry-like capture

Both frontend and backend have lightweight Sentry-compatible capture functions.

Strength:

- Errors can be reported if DSNs are configured.

Weakness:

- Reporting is optional and no central operational dashboard is confirmed.
- Many code paths still swallow optional failures silently, especially audit writes.

#### DB Wake / Restore

`db-client.js` triggers `triggerRestore()` on Supabase fetch 5xx.

Risk:

- This is legacy/restore behavior controlled by `FULLSTACK_PROJECT_REF` and `FULLSTACK_RESTORE_API_URL`.
- It is not a general database resilience strategy.

---

### 13.4 Performance Hotspots

#### Dashboard endpoint

`api/_lib/modules/dashboard.js` loads:

- all sales for tenant
- all expenses for tenant
- all products for tenant
- customer ids
- all `sale_items` without direct tenant filter

Then aggregates in JavaScript.

Risks:

- No pagination/windowing for sales/products/expenses.
- `sale_items` full-table read can grow unbounded.
- Heavy in-memory aggregation on serverless function.
- Endpoint is also unprotected and falls back to tenant 1.

Severity: **High**.

#### Reports endpoint

`api/_lib/modules/reports.js` loads broad datasets and filters dates in JavaScript:

- all sales for tenant
- all expenses for tenant
- all products for tenant
- all sale_items
- all purchases for tenant

Risks:

- Date filtering happens in application memory.
- `sale_items` not tenant-scoped at query time.
- Exports load full datasets.

Severity: **High for growth**.

#### AI endpoint

`api/_lib/modules/ai.js` loads:

- up to 2000 sales
- all products for tenant
- all expenses for tenant
- sale_items for sale IDs

Risks:

- Large payload/in-memory analysis.
- No caching of analysis.
- Can become expensive if invoked frequently.

Severity: **Medium/High**.

#### Backups endpoint

`api/_lib/modules/backups.js` snapshots:

- tenant
- products
- customers
- up to 2000 sales
- expenses
- suppliers
- bank_accounts
- branches

Risks:

- Partial backup: sales limited to 2000, no sale_items included in snapshot.
- Restore only upserts products/customers.
- Reads and serializes large payloads into API response.

Severity: **High for production backup/restore correctness**.

#### Import/Export endpoint

`api/_lib/modules/import-export.js` processes rows sequentially in loops.

Risks:

- Per-row DB operations.
- Potential slow imports for large files.
- No explicit maximum row count observed.
- Audit insert uses non-existent columns and fails silently.

Severity: **Medium/High**.

---

### 13.5 Database Performance Risks

Confirmed missing tenant indexes for:

- `ai_conversations.tenant_id`
- `branch_price_overrides.tenant_id`
- `customer_price_overrides.tenant_id`
- `loyalty_ledger.tenant_id`
- `loyalty_offers.tenant_id`
- `loyalty_programs.tenant_id`
- `price_lists.tenant_id`
- `product_prices.tenant_id`
- `push_subscriptions.tenant_id`
- `recipe_items.tenant_id`
- `recipes.tenant_id`
- `user_invites.tenant_id`
- `whatsapp_outbox.tenant_id`

Current row counts are low for many tables, so this is mostly a scale risk, but it will degrade tenant-scoped queries as adoption grows.

Severity: **Medium**.

---

### 13.6 Backup / Restore Readiness

The backup module appears schema-drifted against the live base schema.

Code expects backup columns such as:

- `label`
- `created_by`
- `size_bytes`
- `kind`
- `payload`
- `payload_json`

But live/base schema observed earlier includes only:

- `id`
- `tenant_id`
- `user_id`
- `file_url`
- `file_size`
- `type`
- `status`
- `created_at`

Impact:

- `GET /api/backups` selects non-existent columns and likely fails in the current DB.
- Backup persistence likely fails or returns unpersisted fallback.
- Restore is partial and only upserts products/customers.
- Backup is not a full disaster recovery strategy.

Severity: **High**.

---

### 13.7 Production Readiness Classification

#### Critical Production Blockers

- Platform Admin schema drift.
- Subscription payment/review schema drift.
- `/api/subscription` unprotected admin-grade actions.
- Service-role modules without auth gates for financial/operational data.
- Duplicate tenant subscription rows.
- Backup module schema drift if backup/restore is required for production.

#### High Risks

- Dashboard public/unprotected and full-data aggregation.
- Reports heavy in-memory aggregation.
- Missing FK constraints across feature modules.
- Role model divergence between owner and superadmin.
- ProtectedRoute subscription fail-open.
- Onboarding non-transactional partial tenant creation.
- Offline identity stale-role risk.

#### Medium Risks

- Missing tenant indexes on feature tables.
- Offline coverage partial.
- Sync conflict resolution minimal.
- Import/export row-by-row processing.
- Audit writers silently fail in some modules.
- Public storage for potentially sensitive files.

#### Low Risks

- Public `/api/test` and `/api/test-import` endpoints.
- Public health metadata exposure.
- Service worker only caches shell/static and not data; acceptable but should be understood.

---

### 13.8 Production Readiness Positives

- There is a build/test/lint script set.
- There is a Supabase migration workflow, although current DB drift shows it is not sufficient/consistent with audited environment.
- There is health endpoint and environment validation.
- There is optional frontend/backend Sentry-style capture.
- Core POS sales/inventory current data is clean.
- Products and Inventory have better offline UX than other pages.
- RLS is generally enabled and direct DB tenant isolation exists.

---

### 13.9 Production Readiness Audit Status

Production Readiness + Performance Audit completion estimate: **85%**.

Remaining work:

- Actual `npm test`, `npm run build`, and `npm run lint` execution if runtime validation is requested.
- Browser network and console validation.
- Deployed API unauthenticated request verification.
- Performance profiling with realistic dataset sizes.
- Backup/restore runtime proof.


---

## 14. Cross-Problem Relationships / Root Cause Tree v0.1

This section links the discovered problems into root-cause clusters so the later repair plan can avoid patching symptoms one by one.

### 14.1 Root Cause Tree — Database / Migration Drift

```text
Migration process inconsistent with live DB
├── Some migrations exist in schema but are not in migration ledger
│   ├── 20260722000009 artifacts exist but ledger missing
│   ├── 20260722000010 artifacts exist but ledger missing
│   └── 20260722000011 storage hardening exists but ledger missing
├── Some migrations missing from both ledger and schema
│   ├── 20260722000012 app_users auth unique index missing
│   └── 20260722000013 platform schema alignment missing
└── Application code assumes latest schema
    ├── Platform Admin endpoints fail on missing columns
    ├── Subscription payment/review fails on missing columns
    ├── Backup endpoint expects non-existent columns
    └── Audit writers in some modules target non-existent columns
```

#### Derived Problems

- Platform Admin cannot reliably save settings/plans/payments/announcements.
- Subscription proof upload/review/activation flow cannot reliably complete.
- `subscription_plans.features` is stored as text while the app treats it as an array/json structure.
- Backup/restore is not production-ready because the API contract does not match the live table.
- Schema drift is not being caught by CI/CD before runtime.

#### Evidence Sources

- Live SQL: missing columns and type mismatch.
- Live SQL: migration ledger status.
- Code references in platform/subscription/backups/audit modules.

---

### 14.2 Root Cause Tree — Subscription System Instability

```text
Subscription system has no single enforced DB invariant
├── tenant_subscriptions has no unique tenant_id constraint
│   └── tenant 1 has 10 subscription rows
├── ensureSubscription() assumes maybeSingle()
│   ├── duplicate rows can produce errors/no data
│   └── function may insert yet another row
├── subscription endpoint is unauthenticated
│   ├── admin-activate exposed
│   ├── review-payment exposed
│   ├── release-device exposed
│   └── payments/devices listing exposed
├── subscription payment schema columns missing
│   └── proof/review flow fails
└── ProtectedRoute fails open on subscription API failure
    └── broken subscription API can still allow store access
```

#### Derived Problems

- Store access control is unreliable.
- Payment review and activation paths are both insecure and schema-broken.
- Duplicate subscription rows can make every subscription query non-deterministic.
- Trial/device anti-abuse is weakened by public API and localStorage device identity.

#### Evidence Sources

- Live SQL: duplicate subscription rows for tenant 1.
- Code: `api/_lib/modules/subscription.js`.
- Code: `src/components/ProtectedRoute.tsx`.
- Code: `src/lib/device.ts`.

---

### 14.3 Root Cause Tree — API Service Role / Security Boundary Collapse

```text
Backend uses Supabase service-role client
├── RLS is bypassed by backend by design
├── Protected modules rely on withApi for security
│   └── these are generally safer
└── Unprotected modules become direct DB access APIs
    ├── branches
    ├── bank accounts
    ├── expenses
    ├── payment terminals
    ├── suppliers
    ├── customer ledger
    ├── supplier ledger
    ├── notifications
    ├── dashboard
    ├── tenant catalog
    └── subscription
```

#### Derived Problems

- Tenant isolation is only as strong as each module's auth gate.
- RLS is not sufficient protection for API calls.
- Financial data can be mutated through unprotected ledger endpoints.
- Wildcard CORS increases risk surface.
- Dashboard exposes tenant data patterns and defaults to tenant 1.

#### Evidence Sources

- Code: `api/_lib/db-client.js` service-role client.
- Code: unprotected modules listed in API audit.
- Code: wildcard CORS in `auth-middleware.js` and `vercel.json`.

---

### 14.4 Root Cause Tree — Role / Permission Model Divergence

```text
Role is represented as a single string in app_users
├── owner has wildcard permission
├── superadmin has wildcard + platform permission
├── bootstrap uses role=superadmin for tenant user
│   └── comments describe Owner + Super Admin
├── ProtectedRoute allows superadmin with tenant into store
├── Sidebar role matrix does not include superadmin
└── DB owner checks expect role='owner'
```

#### Derived Problems

- Tenant can appear to have no active owner.
- Superadmin tenant user can pass route checks but lose store navigation.
- Permission semantics differ between backend and frontend.
- Owner responsibility is not cleanly modeled.

#### Evidence Sources

- Live SQL: tenant 1 has no active owner.
- Code: `supabase/migrations/20260722000008_admin_bootstrap.sql`.
- Code: `ProtectedRoute.tsx`.
- Code: `Sidebar.tsx`.
- Code: `permissions.js`.

---

### 14.5 Root Cause Tree — Referential Integrity Gap

```text
Many tables contain relationship columns without FK constraints
├── P1 feature tables
│   ├── shifts
│   ├── refunds
│   └── stocktakes
├── P2 feature tables
│   ├── loyalty
│   ├── pricing
│   ├── recipes
│   └── manufacturing
├── base weak references
│   ├── products.supplier_id
│   ├── sales.bank_account_id
│   ├── audit_logs.user_id
│   └── ledger sale/purchase references
└── API often validates only the primary row, not all tenant relationships
```

#### Derived Problems

- Future orphan rows are possible.
- Future cross-tenant references are possible.
- Business calculations can become unreliable as data grows.
- RLS cannot enforce relational consistency.

#### Current Data Status

- Current sampled operational data is mostly clean.
- Many feature tables are empty, so corruption has not appeared yet.
- This is primarily a production hardening risk, not current data damage in most areas.

---

### 14.6 Root Cause Tree — Offline-First Scope Mismatch

```text
Product and sales offline flows are implemented
├── IndexedDB outbox/cache/meta exist
├── Product create/update/delete has wrappers
├── Sales create has queue and optimistic stock update
└── SyncEngine replays pending/failed items

But broader ERP modules use raw fetch
├── purchases
├── expenses
├── suppliers
├── ledgers
├── bank accounts/payment terminals
├── stocktake
├── shifts
├── subscription/platform
├── pricing/loyalty/recipes
└── reports
```

#### Derived Problems

- Offline-first claim is not system-wide.
- Users can perform some operations offline but not others.
- Cache coverage is inconsistent.
- Conflict handling is minimal and entity-specific.

---

### 14.7 Root Cause Tree — Performance / Scalability Risk

```text
Several analytics/reporting endpoints aggregate in application memory
├── dashboard loads broad datasets
│   └── sale_items full-table read
├── reports loads broad datasets and filters dates in JS
├── AI loads up to 2000 sales + all products/expenses
├── backup snapshots broad datasets but only partial sales
├── import/export processes rows sequentially
└── feature tables lack tenant indexes
```

#### Derived Problems

- Works on small demo data but can degrade rapidly.
- Serverless execution time/memory risk as tenants grow.
- Reports/dashboards may become slow or fail.
- Current tests/data do not represent production load.

---

## 15. Consolidated Issue Register v0.2

### 15.1 Critical Issues

| ID | Area | Title | Root Cause | Evidence Summary | Impact |
|---|---|---|---|---|---|
| CRIT-001 | Database | Platform schema drift | Migration 13 missing from live DB | Missing platform columns and `features` type mismatch | Platform Admin broken |
| CRIT-002 | Subscription | Payment/review schema missing | `subscription_payments` lacks required columns | SQL code contract check | Payment proof/review broken |
| CRIT-003 | Subscription/Security | `/api/subscription` unprotected | Module does not use `withApi`/`requireAuth` | API audit | Admin-grade actions exposed |
| CRIT-004 | API Security | Service-role modules without auth | Backend uses service-role and modules omit auth gates | API audit | RLS bypass / tenant exposure |
| CRIT-005 | Finance | Ledger endpoints mutate balances unauthenticated | `customer-ledger.js`, `supplier-ledger.js` have no auth gate | API audit | Financial data integrity risk |
| CRIT-006 | Subscription Data | Duplicate tenant subscriptions | No unique tenant subscription invariant | Live SQL tenant 1 has 10 rows | Access state non-deterministic |
| CRIT-007 | Backup/DR | Backup API schema drift | Backup code expects columns absent in live DB | Code vs live schema | Backup/restore unreliable |

### 15.2 High Issues

| ID | Area | Title | Root Cause | Impact |
|---|---|---|---|---|
| HIGH-001 | API/Analytics | Dashboard unprotected + tenant 1 fallback | No auth gate + `tenant_id || 1` | Tenant data exposure and wrong stats |
| HIGH-002 | Auth/Role | Superadmin/owner divergence | Single role string overloaded | Tenant without active owner, broken navigation |
| HIGH-003 | Routing | ProtectedRoute subscription fail-open | Non-ok/catch sets access ok | Subscription enforcement unreliable |
| HIGH-004 | Onboarding | Non-transactional setup | Multi-step client flow | Partial tenant state |
| HIGH-005 | DB Integrity | Missing FKs across P1/P2 | Migrations create integer columns without references | Future orphan/cross-tenant data |
| HIGH-006 | Offline/Auth | Cached identity can become stale | localStorage profile/tenant cache | Disabled users may retain offline access |
| HIGH-007 | Platform | Platform public GET via service-role bypasses RLS semantics | API uses service-role | API may expose more than direct RLS would |
| HIGH-008 | Performance | Dashboard/reports aggregate in memory | Broad selects + JS filters | Slow/failing analytics at scale |

### 15.3 Medium Issues

| ID | Area | Title | Root Cause | Impact |
|---|---|---|---|---|
| MED-001 | DB Performance | Missing tenant indexes | Feature tables lack tenant_id indexes | Scale degradation |
| MED-002 | Offline | Partial offline coverage | Only products/sales implemented deeply | Inconsistent UX |
| MED-003 | Sync | Minimal conflict resolution | Chronological replay only | Conflicts not explicitly resolved |
| MED-004 | Audit | Audit writers target missing columns | Legacy inline audit rows | Silent missing audit trail |
| MED-005 | Upload/Storage | Public media bucket may hold proofs | Shared public bucket | Potential proof privacy concern |
| MED-006 | Import | Row-by-row imports | Sequential DB operations | Slow large imports |
| MED-007 | Push | POST permission mismatch | POST uses `notifications:read` | Permission semantics unclear |
| MED-008 | Product Flow | Product create drops supplier_id | UI sends supplier_id but API insert omits it | Supplier linkage lost on create |

### 15.4 Low Issues

| ID | Area | Title | Root Cause | Impact |
|---|---|---|---|---|
| LOW-001 | Public Surface | `/api/test` and `/api/test-import` public | Debug endpoints retained | Low metadata exposure |
| LOW-002 | Health | Public health endpoint exposes env key status names | Operational metadata public | Low/Medium information disclosure |
| LOW-003 | Device Trial | localStorage device ID | Client-controlled identifier | Weak anti-abuse control |

---

## 16. Investigation Coverage Matrix

| Domain | Evidence Coverage | Confidence |
|---|---:|---:|
| Database schema drift | SQL + code | High |
| Migration drift | SQL + migration files | High |
| RLS policies | SQL + migrations | High |
| API auth gaps | Code audit | High |
| Subscription data bugs | SQL + code | High |
| POS sale flow | Code + DB columns + data checks | High |
| Product/inventory flow | Code + DB data checks | High |
| Offline/sync | Code audit | Medium/High |
| Frontend page states | Code audit | Medium/High |
| Runtime browser errors | Not executed | Low |
| Performance under load | Static/code audit only | Medium |
| Backup runtime | Code/schema audit only | Medium/High for drift finding |
| Security exploitability | Static/code + DB policy audit | High for missing gates; runtime proof pending |

---

## 17. Remaining Before Repair Roadmap

The investigation is now sufficient to draft the final report and prioritized repair roadmap.

Optional runtime validation still not performed:

- Browser console and network trace.
- Direct unauthenticated API request proof in deployed/local environment.
- Actual build/test/lint execution.
- Offline replay simulation.
- Backup/restore runtime test.

Given the amount of confirmed code + DB evidence, the next phase can be final report assembly unless runtime validation is explicitly requested.


---

## 18. Runtime Validation v0.1

### 18.1 Scope

Runtime validation performed in this pass:

- Dependency installation via `npm ci`.
- Unit/integration test execution via `npm test`.
- Static lint execution via `npm run lint`.
- Production build via `npm run build` with placeholder non-secret env values.
- Dependency vulnerability scan via `npm audit --audit-level=high --json`.
- Static bundle serving check via `npm run preview` and HTTP requests to core SPA paths.

Not performed in this pass:

- Real browser console trace.
- Real Supabase cloud API calls from browser.
- Vercel serverless runtime validation.
- Unauthenticated deployed API exploit proof.
- Offline replay simulation in a real browser.

### 18.2 Dependency Install

Command:

```bash
npm ci
```

Result:

- Completed successfully.
- Installed 339 packages.
- npm reported 7 high severity vulnerabilities.

### 18.3 Test Runtime

Command:

```bash
npm test
```

Result:

- Passed.
- 27 test files passed.
- 129 tests passed.

Important runtime observation:

- The `platform-admin.integration.test.js` suite intentionally includes pre-fix schema failure reproduction logs such as missing `app_name`, `name_ar`, `audience`, etc.
- These logs align with live DB schema drift found earlier.

Interpretation:

- Existing tests validate several domain utilities and selected API behaviors.
- Tests do not currently fail despite live-like schema drift being represented in test scenarios, so passing tests do not prove production DB compatibility.

### 18.4 Lint Runtime

Command:

```bash
npm run lint
```

Result:

- Failed.
- Reported 73 problems:
  - 53 errors
  - 20 warnings

Observed categories:

- React hooks purity errors.
- React hooks set-state-in-effect errors.
- React refresh export warnings/errors.
- Hook dependency warnings.
- TypeScript ESLint issue in `vite.config.ts`.
- Empty block statement in `vite.config.ts`.

Notable files mentioned in lint output:

- `src/components/ui/BarcodeScanner.tsx`
- `src/components/ui/Chart.tsx`
- `src/components/ui/DetailedInvoice.tsx`
- `src/contexts/AuthContext.tsx`
- `src/contexts/I18nContext.tsx`
- `src/contexts/SubscriptionContext.tsx`
- `src/contexts/SyncContext.tsx`
- `src/contexts/TenantContext.tsx`
- `src/pages/Subscription.tsx`
- `src/pages/SuperAdmin.tsx`
- `src/pages/Suppliers.tsx`
- `src/pages/Users.tsx`
- `vite.config.ts`

Interpretation:

- The project is not lint-clean.
- React Compiler / hooks lint rules reveal runtime-stability and render-purity concerns.
- This supports previous Frontend Audit findings about repeated effect/load patterns and inconsistent frontend robustness.

### 18.5 Production Build Runtime

Command:

```bash
VITE_SUPABASE_URL=https://test-placeholder.supabase.co \
VITE_SUPABASE_ANON_KEY=test-placeholder-anon-key \
NEXT_PUBLIC_SUPABASE_URL=https://test-placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=test-placeholder-anon-key \
SUPABASE_SERVICE_ROLE_KEY=test-placeholder-service-role-key \
npm run build
```

Result:

- Passed.
- `tsc -b` completed.
- `vite build` completed.

Bundle output highlights:

- Main large chunk: approximately `1,457.73 kB` minified / `416.26 kB` gzip.
- Vite warned that some chunks are larger than 500 kB.
- Vite warned that `documentExport.ts` is both dynamically and statically imported, preventing it from moving into a separate dynamic chunk.

Interpretation:

- Production bundle can be produced.
- Bundle size and chunking need performance attention.
- Build success does not cover API JS modules or live DB schema compatibility.

### 18.6 Dependency Vulnerability Runtime

Command:

```bash
npm audit --audit-level=high --json
```

Result:

- Failed audit threshold.
- 7 high severity vulnerabilities.
- 0 critical vulnerabilities.

Important vulnerability areas:

- `react-router-dom` direct production dependency via `react-router` advisories.
- `eslint` / `minimatch` / `brace-expansion` dev dependency chain advisories.

Audit metadata:

- High: 7
- Critical: 0
- Total vulnerabilities: 7

Interpretation:

- Production dependency risk exists due `react-router-dom` / `react-router` advisory chain.
- Dev tooling vulnerability exists through ESLint dependency chain.

### 18.7 Static Bundle Serving Runtime

Command:

```bash
npm run preview -- --host 127.0.0.1 --port 4173
```

HTTP checks:

- `/` → 200
- `/dashboard` → 200
- `/login` → 200
- `/admin` → 200

Interpretation:

- The built SPA serves core routes successfully under Vite preview.
- This does not validate Vercel rewrites/API runtime or browser console behavior.

### 18.8 Runtime Validation Findings

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| RUN-001 | Positive | Test suite passes | 27 files / 129 tests passed |
| RUN-002 | High | Lint fails | 53 errors / 20 warnings |
| RUN-003 | Positive | Production build succeeds | `npm run build` success |
| RUN-004 | Medium/High | Large production chunk | Vite >500kB warning, ~1.46MB main chunk |
| RUN-005 | Medium | Mixed static/dynamic import prevents chunk split | `documentExport.ts` warning |
| RUN-006 | High | npm audit high vulnerabilities | 7 high vulnerabilities |
| RUN-007 | Positive | Built SPA serves core paths via preview | HTTP 200 for `/`, `/dashboard`, `/login`, `/admin` |
| RUN-008 | Medium | Passing tests do not catch live DB drift | tests pass while live DB drift confirmed separately |

### 18.9 Runtime Validation Status

Runtime validation completion estimate: **65%**.

Remaining runtime validation options:

- Browser console + React runtime validation.
- Vercel serverless API local/deployed validation.
- Direct unauthenticated API request proof.
- Offline replay simulation in browser.
- Real Supabase DB connection test against intended production project.


---

# 19. Final Enterprise Production Audit Report

## 19.1 Executive Summary

The RAFD application has a strong product direction and several mature parts, especially POS sale handling, product/inventory offline support, and basic tenant-aware RLS for direct Supabase access. However, the system is **not production-ready for a large enterprise/SaaS launch** in its current state.

The main blockers are not isolated UI bugs; they are architectural and operational consistency problems:

1. **Live database schema drift** from repository migrations and code expectations.
2. **Migration ledger drift**, making migration history unreliable.
3. **Critical API endpoints using service-role without authentication/authorization gates.**
4. **Subscription system instability**, including duplicate subscription rows and broken schema.
5. **Platform Admin broken by missing columns.**
6. **Missing database constraints** that leave referential integrity to application code.
7. **Partial offline coverage**, despite the system being presented as offline-first.
8. **Production validation failures**, especially lint failure and dependency high vulnerabilities.

The clean current state of core sales/products data is a positive signal, but it does not offset the production blockers in security, subscription, platform admin, and migration consistency.

### Production Readiness Verdict

**Current status: Not production ready.**

Recommended launch decision:

- Do not launch as a multi-tenant SaaS production system before completing Phase 0 and Phase 1 of the roadmap.
- POS/product workflows can be used as a controlled pilot only if API exposure and subscription/platform blockers are isolated or disabled.

---

## 19.2 Confirmed Critical Issues

### CRIT-001 — Platform Admin Schema Drift

**Severity:** Critical  
**Area:** Database / Platform Admin / API / Frontend

#### Root Cause

The live database is missing columns expected by the current Platform Admin code. Migration `20260722000013_platform_schema_align.sql` exists in the repository but is not recorded in the live migration ledger and its schema artifacts are absent.

#### Evidence

Database proof:

- Missing `platform_settings.app_name`
- Missing `platform_settings.app_name_ar`
- Missing `platform_settings.support_whatsapp`
- Missing `platform_settings.default_currency`
- Missing `platform_settings.allow_registration`
- Missing `subscription_plans.name_ar`
- Missing `subscription_plans.is_popular`
- Missing `subscription_plans.sort_order`
- `subscription_plans.features` is `text`, expected json-like array behavior / `jsonb`
- Missing `platform_payment_methods.name_ar`
- Missing `platform_payment_methods.provider`
- Missing `platform_payment_methods.sort_order`
- Missing `platform_announcements.audience`
- Missing `platform_announcements.is_published`
- Missing `platform_announcements.publish_at`

Migration ledger proof:

- `20260722000013_platform_schema_align.sql` = `MISSING_IN_DATABASE`

Code evidence:

- `api/_lib/modules/platform-settings.js` writes `app_name`, `app_name_ar`, `support_whatsapp`, `default_currency`, `allow_registration`.
- `api/_lib/modules/subscription-plans.js` orders by `sort_order`, writes `name_ar`, `is_popular`, `features`.
- `api/_lib/modules/platform-payments.js` orders by `sort_order`, writes `name_ar`, `provider`.
- `api/_lib/modules/platform-announcements.js` reads/writes `is_published`, `audience`, `publish_at`.
- `src/pages/SuperAdmin.tsx` calls these APIs for platform settings, plans, payment methods, and announcements.

#### Impact

- Platform Admin cannot reliably load or save platform settings.
- Subscription package management is broken.
- Platform payment method management is broken.
- Platform announcement management is broken.
- SuperAdmin UI surfaces generic failure messages rather than the real schema root cause.

---

### CRIT-002 — Subscription Payment / Review Flow Broken

**Severity:** Critical  
**Area:** Subscription / Billing / Platform Admin / Database

#### Root Cause

The `subscription_payments` live table lacks columns written by the subscription payment and review flow. `tenant_subscriptions.last_payment_at` is also missing.

#### Evidence

Database proof:

Missing from `subscription_payments`:

- `plan_code`
- `billing_cycle`
- `payment_method_id`
- `payment_method_name`
- `proof_url`
- `sender_name`
- `admin_notes`
- `reviewed_by`
- `reviewed_at`

Missing from `tenant_subscriptions`:

- `last_payment_at`

Code evidence:

- `api/_lib/modules/subscription.js` inserts `plan_code`, `billing_cycle`, `payment_method_id`, `payment_method_name`, `proof_url`, `sender_name` during `submit-payment`.
- `api/_lib/modules/subscription.js` writes `admin_notes`, `reviewed_by`, `reviewed_at` during `review-payment`.
- `api/_lib/modules/subscription.js` writes `last_payment_at` during payment approval and admin activation.
- `src/pages/Subscription.tsx` sends these payment proof fields.
- `src/pages/SuperAdmin.tsx` sends review/admin activation actions.

#### Impact

- Customers cannot reliably submit subscription payment proofs.
- Admins cannot reliably review/approve payments.
- Manual activation can fail.
- Store lock/unlock state becomes unreliable.

---

### CRIT-003 — `/api/subscription` is Unprotected but Performs Admin-Grade Actions

**Severity:** Critical  
**Area:** API Security / Subscription / Platform Admin

#### Root Cause

`api/_lib/modules/subscription.js` does not use `withApi`, `requireAuth`, `resolveAuth`, or `requirePlatformAdmin`, yet it reads and mutates subscription, payment, tenant, device, and notification tables using the service-role Supabase client.

#### Evidence

Code evidence:

- `api/_lib/modules/subscription.js` defines a raw handler with CORS but no auth gate.
- Public/unprotected actions include:
  - `GET action=payments`
  - `GET action=devices`
  - `GET action=check-device`
  - default subscription status by `tenant_id`
  - `POST action=init-trial`
  - `POST action=select-plan`
  - `POST action=submit-payment`
  - `POST action=review-payment`
  - `POST action=admin-activate`
  - `POST action=release-device`

Runtime/data evidence:

- Duplicate subscription rows already exist for tenant 1.
- Subscription schema is missing required fields.

#### Impact

- Payment review and admin activation paths are exposed at module level.
- Device release and trial/device data are exposed at module level.
- Subscription status can be read or influenced through an endpoint that bypasses RLS.
- This is a direct SaaS platform security boundary failure.

---

### CRIT-004 — Service-Role API Modules Without Auth Gates

**Severity:** Critical  
**Area:** API Security / Tenant Isolation

#### Root Cause

The backend Supabase client uses `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS. Multiple API modules use this client without any authentication or authorization middleware.

#### Evidence

Service-role evidence:

- `api/_lib/db-client.js` creates Supabase client using `SUPABASE_SERVICE_ROLE_KEY`.

Unprotected modules confirmed:

- `branches.js`
- `bank-accounts.js`
- `expenses.js`
- `payment-terminals.js`
- `customer-ledger.js`
- `supplier-ledger.js`
- `suppliers.js`
- `notifications.js`
- `dashboard.js`
- `tenant-catalog.js`
- `subscription.js`

Frontend dependencies:

- TenantContext depends on `/api/branches`.
- POS and Payments depend on `/api/bank-accounts` and `/api/payment-terminals`.
- Customers/Suppliers pages depend on ledger endpoints.
- Dashboard/Reports/MobileApps depend on `/api/dashboard`.

#### Impact

- RLS does not protect these API routes.
- Tenant isolation can be bypassed by supplying query/body tenant IDs.
- Financial and operational data can be read/written without proper authorization.

---

### CRIT-005 — Financial Ledger Endpoints Mutate Balances Without Auth Gate

**Severity:** Critical  
**Area:** Financial / Ledger / API Security

#### Root Cause

`customer-ledger.js` and `supplier-ledger.js` are raw service-role modules with no auth gate, but they update customer/supplier balances and insert ledger rows.

#### Evidence

Code evidence:

- `api/_lib/modules/customer-ledger.js` reads customer by `id`, updates `customers.balance`, inserts `customer_ledger`.
- `api/_lib/modules/supplier-ledger.js` reads supplier by `id`, updates `suppliers.balance`, inserts `supplier_ledger`.

DB integrity evidence:

- Ledger balances are currently clean for existing data.
- Missing FKs still leave future corruption risk.

#### Impact

- Financial balances can be changed without role enforcement.
- Accounting integrity depends on client honesty and API invisibility, not security controls.

---

### CRIT-006 — Duplicate Tenant Subscription Rows

**Severity:** Critical  
**Area:** Subscription / Data Integrity

#### Root Cause

There is no unique DB invariant preventing more than one `tenant_subscriptions` row per tenant. The application uses `.maybeSingle()` and `.single()` patterns that assume uniqueness.

#### Evidence

Live DB proof:

- Tenant `1` has 10 rows in `tenant_subscriptions`.

Code evidence:

- `ensureSubscription()` calls `.eq('tenant_id', tenantId).maybeSingle()`.
- Several updates call `.eq('tenant_id', tenantId).select().single()`.
- Base migration only creates non-unique index `idx_tenant_sub_tenant`.

#### Impact

- Subscription state is non-deterministic.
- Access gate can behave unpredictably.
- Payment/admin activation flows can update multiple rows or fail on `.single()`.

---

### CRIT-007 — Backup API Schema Drift / DR Not Production-Ready

**Severity:** Critical/High  
**Area:** Backup / Disaster Recovery

#### Root Cause

The backup API expects columns not present in the live/base `backups` schema.

#### Evidence

Code expects:

- `label`
- `created_by`
- `size_bytes`
- `kind`
- `payload`
- `payload_json`

Live/base schema observed earlier has:

- `id`
- `tenant_id`
- `user_id`
- `file_url`
- `file_size`
- `type`
- `status`
- `created_at`

Code evidence:

- `api/_lib/modules/backups.js` selects/inserts these drifted fields.

#### Impact

- Backup listing/persistence likely fails.
- Restore is partial and only upserts products/customers.
- Full tenant recovery is not production-ready.

---

## 20. Professional Repair Roadmap

> This roadmap starts only after the investigation phase. It is ordered to reduce production risk and avoid chasing symptoms.

### Phase 0 — Critical Production Blockers / Freeze Unsafe Surfaces

Goal: Stop active security and production-breakage risk.

Priority tasks:

1. Protect or disable unprotected service-role endpoints.
2. Protect `/api/subscription` admin-grade actions immediately.
3. Block public mutation of financial ledgers and operational setup data.
4. Disable or guard broken Platform Admin write flows until schema is aligned.
5. Add emergency checks for duplicate `tenant_subscriptions` before any subscription read/update path.
6. Remove or restrict public test/debug endpoints if not required.
7. Decide whether subscription proof files are sensitive; if yes, prevent storage in public bucket paths.

Exit criteria:

- No unauthenticated service-role mutations for tenant/financial/subscription data.
- `/api/subscription` admin actions require platform admin authorization.
- Unsafe public paths either protected or intentionally documented.

---

### Phase 1 — Database Schema Alignment and Migration Ledger Recovery

Goal: Make live database, migration ledger, and application code consistent.

Priority tasks:

1. Establish the live DB as an audited baseline.
2. Reconcile migration ledger with actual schema artifacts.
3. Apply missing platform schema alignment.
4. Add missing subscription payment/review columns or align code to actual schema.
5. Resolve `subscription_plans.features` type mismatch.
6. Add missing `tenant_subscriptions.last_payment_at` or remove code dependency.
7. Add missing backup schema columns or align backup API to actual schema.
8. Add `idx_app_users_auth_unique` partial unique index if still desired.
9. Establish a repeatable migration verification script.

Exit criteria:

- Code contract columns all pass.
- Migration ledger state is explainable and reproducible.
- Platform and subscription APIs no longer fail due missing columns.

---

### Phase 2 — Subscription System Stabilization

Goal: Make subscription state deterministic and secure.

Priority tasks:

1. Define subscription cardinality: one active/current subscription per tenant or full historical model.
2. Clean duplicate `tenant_subscriptions` rows for tenant 1 after backup.
3. Add DB invariant matching the chosen model.
4. Refactor subscription reads away from unsafe `.maybeSingle()` assumptions if history is retained.
5. Ensure payment proof submission, review, approval, rejection, admin activation, and device release are authenticated and authorized.
6. Align tenant status and subscription status with one defined source of truth.
7. Revisit ProtectedRoute fail-open behavior.

Exit criteria:

- One deterministic subscription access result per tenant.
- Payment review and activation flow works in runtime.
- Store locking/unlocking behavior is predictable.

---

### Phase 3 — API Security and Tenant Isolation

Goal: Make API the true security boundary since it uses service role.

Priority tasks:

1. Migrate raw modules to `withApi` or equivalent:
   - branches
   - bank accounts
   - expenses
   - payment terminals
   - customer ledger
   - supplier ledger
   - suppliers
   - notifications
   - dashboard
   - tenant catalog
2. Assign proper permissions for each method.
3. Enforce tenant ownership for all entity IDs, not only `tenant_id` in request.
4. Ensure customer/product/supplier/bank IDs are validated against tenant before mutation.
5. Review superadmin access semantics separately from tenant owner access.
6. Add API integration tests for unauthorized access and cross-tenant attempts.

Exit criteria:

- Unauthenticated API tests fail with 401/403 for protected resources.
- Cross-tenant API tests fail.
- RLS and API security semantics are aligned.

---

### Phase 4 — Referential Integrity and Data Model Hardening

Goal: Move relationship integrity from application assumptions into the database.

Priority tasks:

1. Add missing FKs in P1/P2/base weak relationships after data cleanup.
2. Add necessary tenant-aware uniqueness constraints:
   - price lists
   - product prices
   - customer/branch overrides
   - tenant catalog
   - subscription model
3. Add tenant_id indexes for feature tables.
4. Validate no orphan/cross-tenant rows before constraints.
5. Decide soft-delete semantics for referenced entities.

Exit criteria:

- FK audit passes or has documented intentional exceptions.
- Tenant index coverage passes.
- Current data validates against constraints.

---

### Phase 5 — Frontend Stability and Role UX

Goal: Make UI behavior deterministic and transparent.

Priority tasks:

1. Standardize loading/no-tenant/error states using the `useTenantScopedList` style across pages.
2. Fix loading-stuck pattern when tenant is missing.
3. Add visible error handling for raw fetch pages.
4. Align Sidebar/menu role matrix with backend permission model.
5. Resolve superadmin-with-tenant navigation behavior.
6. Improve Platform Admin and Subscription error messages to surface actionable causes.
7. Validate responsive behavior and browser console.

Exit criteria:

- Every page has defined loading/empty/error/no-tenant states.
- Role-based navigation matches authorized access.
- No obvious browser console errors in core journeys.

---

### Phase 6 — Offline / Sync Expansion and Conflict Model

Goal: Make offline-first scope explicit and reliable.

Priority tasks:

1. Define which modules are officially offline-capable.
2. Add outbox/cache support for selected additional entities if required.
3. Add conflict resolution policy per entity.
4. Add max attempts/dead-letter handling for outbox failures.
5. Add user/admin visibility into failed outbox records.
6. Expand pull snapshots beyond products/customers/sales if business requires.
7. Validate offline sale/product replay in browser runtime.

Exit criteria:

- Offline scope is documented and matches product messaging.
- Failed sync items are observable and recoverable.
- Conflict behavior is deterministic.

---

### Phase 7 — Performance, Reporting, and Scalability

Goal: Prepare for multi-tenant growth and real production loads.

Priority tasks:

1. Replace full-table dashboard/report reads with scoped/date-filtered queries.
2. Avoid unscoped `sale_items` reads.
3. Add database-side aggregation or RPC/views for dashboard/report heavy metrics.
4. Add pagination/ranges to exports and admin lists.
5. Optimize AI analysis inputs and caching.
6. Optimize import/export batching.
7. Reduce production bundle chunk size and improve code splitting.
8. Resolve npm audit high vulnerabilities.

Exit criteria:

- Dashboard/report queries scale with date/tenant filters.
- No unbounded tenant data loads in critical paths.
- Bundle warnings are addressed or accepted with justification.

---

### Phase 8 — Backup / Disaster Recovery and Operational Readiness

Goal: Make production recovery real, tested, and complete.

Priority tasks:

1. Align backup API schema with DB.
2. Define backup scope: full tenant or partial operational backup.
3. Include sales, sale_items, purchases, ledgers, products, customers, suppliers, settings as required.
4. Make restore safe, tenant-scoped, and auditable.
5. Add restore dry-run validation.
6. Add operational runbooks for migration, restore, rollback, and incident response.
7. Harden health checks to include schema contract checks.

Exit criteria:

- Backup and restore tested end-to-end.
- Health check detects critical schema drift.
- Production runbook exists.

---

### Phase 9 — CI/CD and Validation Gates

Goal: Prevent recurrence.

Priority tasks:

1. Add schema contract tests against migrations and live-like DB.
2. Add API JS lint/type checking coverage.
3. Add security tests for unauthenticated endpoints.
4. Add migration drift verification to CI.
5. Add build/lint/test gates required before deployment.
6. Add browser E2E smoke tests for:
   - login
   - tenant load
   - POS sale
   - subscription page
   - platform admin page
   - products offline path

Exit criteria:

- CI fails on schema drift, API auth gaps, lint errors, and critical route failures.
- Deployment cannot proceed with missing migrations or critical vulnerabilities.

---

## 21. Recommended Execution Order Summary

1. **Phase 0:** Freeze/protect dangerous API surfaces.
2. **Phase 1:** Align DB schema and migration ledger.
3. **Phase 2:** Stabilize subscription model and data.
4. **Phase 3:** Secure API tenant boundary.
5. **Phase 4:** Add relational integrity and indexes.
6. **Phase 5:** Stabilize frontend/role UX.
7. **Phase 6:** Clarify/expand offline and sync.
8. **Phase 7:** Scale reporting/performance.
9. **Phase 8:** Backup/DR readiness.
10. **Phase 9:** CI/CD prevention gates.

