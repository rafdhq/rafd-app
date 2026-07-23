# تقرير هندسي: تحليل معمارية RAFD وحل مشكلة Serverless Functions

**التاريخ:** 2026-07-23  
**المهندس:** Technical Architect  
**الفرع:** develop  
**الحالة:** تحليل أولي - بانتظار الموافقة

---

## 📋 الملخص التنفيذي

### المشكلة
فشل النشر على Vercel Hobby بسبب تجاوز حد **12 Serverless Functions**. المشروع الحالي يحتوي على **39 function** مستقلة (325% من الحد المسموح).

### السبب الجذري
كل ملف في مجلد `api/` يُترجم إلى Serverless Function منفصلة في Vercel. المشروع يحتوي على 39 ملف handler + 7 ملفات مشتركة = 46 ملف إجمالي.

### الحل الموصى به
**Domain-Based Router Pattern** - دمج الدوال في 8-10 functions حسب المجال التجاري، مع الحفاظ على الفصل المنطقي الداخلي.

---

## 1️⃣ تحليل الحالة الحالية

### 1.1 البنية العامة للمشروع

```
rafd-app/
├── api/                    # 46 ملف (39 functions + 7 shared)
├── src/                    # Frontend (React + Vite)
│   ├── components/        # UI components
│   ├── contexts/          # React contexts (Auth, Sync, Tenant)
│   ├── lib/               # Client-side utilities
│   └── pages/             # 40+ صفحة
├── supabase/              # Migrations + config
├── scripts/               # Deployment scripts
└── vercel.json            # Vercel configuration
```

### 1.2 Serverless Functions الحالية (39 function)

| # | الملف | الأسطر | المجال | الاستخدام من Frontend |
|---|-------|--------|--------|----------------------|
| 1 | products.js | 200 | Core Commerce | 6 calls |
| 2 | customers.js | 78 | Core Commerce | 3 calls |
| 3 | sales.js | 287 | Core Commerce | 2 calls |
| 4 | purchases.js | 277 | Core Commerce | 2 calls |
| 5 | suppliers.js | 58 | Core Commerce | 1 call |
| 6 | expenses.js | 58 | Financial | 1 call |
| 7 | bank-accounts.js | 60 | Financial | 2 calls |
| 8 | payment-terminals.js | 65 | Financial | 2 calls |
| 9 | refunds.js | 152 | Financial | 1 call |
| 10 | customer-ledger.js | 72 | Financial | 1 call |
| 11 | supplier-ledger.js | 72 | Financial | 1 call |
| 12 | branches.js | 60 | Operations | 2 calls |
| 13 | users.js | 152 | Operations | 4 calls |
| 14 | shifts.js | 170 | Operations | 2 calls |
| 15 | stocktakes.js | 174 | Operations | 3 calls |
| 16 | invites.js | 178 | Operations | 3 calls |
| 17 | loyalty.js | 265 | Advanced Features | 4 calls |
| 18 | pricing.js | 241 | Advanced Features | 3 calls |
| 19 | recipes.js | 221 | Advanced Features | 3 calls |
| 20 | ai.js | 269 | Advanced Features | 1 call |
| 21 | import-export.js | 291 | Advanced Features | 1 call |
| 22 | tenants.js | 152 | Platform/SaaS | 4 calls |
| 23 | subscription.js | 552 | Platform/SaaS | 9 calls ⚠️ |
| 24 | subscription-plans.js | 72 | Platform/SaaS | 4 calls |
| 25 | platform-announcements.js | 80 | Platform/SaaS | 3 calls |
| 26 | platform-payments.js | 67 | Platform/SaaS | 4 calls |
| 27 | platform-settings.js | 333 | Platform/SaaS | 3 calls |
| 28 | notifications.js | 66 | Supporting | 3 calls |
| 29 | push.js | 145 | Supporting | 2 calls |
| 30 | whatsapp.js | 71 | Supporting | 1 call |
| 31 | upload.js | 48 | Supporting | 4 calls |
| 32 | backups.js | 167 | Supporting | 4 calls |
| 33 | sync.js | 99 | Supporting | 2 calls |
| 34 | reports.js | 161 | Supporting | 1 call |
| 35 | dashboard.js | 199 | Supporting | 0 calls |
| 36 | audit-logs.js | 20 | Supporting | 1 call |
| 37 | tenant-catalog.js | 116 | Supporting | 1 call |
| 38 | health.js | 43 | Infrastructure | 0 calls |
| 39 | env-check.js | 95 | Infrastructure | 0 calls |

### 1.3 الملفات المشتركة (Shared Utilities)

هذه الملفات **لا تُحسب** كـ Serverless Functions لأنها لا تصدر `export default handler`:

| الملف | الأسطر | الوظيفة |
|-------|--------|---------|
| _handler.js | 58 | Wrapper مع CORS + Auth + Tenant Resolution |
| auth-middleware.js | 167 | JWT Verification + Permissions Check |
| db-client.js | 55 | Supabase Service Client (service_role) |
| db-wake.js | 15 | Database Restore Trigger |
| env-check.js | 95 | Environment Variables Validation |
| sentry.js | 67 | Error Tracking (Sentry-compatible) |
| permissions.js | 135 | RBAC Matrix (Roles & Permissions) |

**المجموع:** 592 سطر من الكود المشترك

### 1.4 نمط المعمارية الحالي

كل Serverless Function تتبع نفس النمط:

```javascript
// api/{resource}.js
import supabase from './db-client.js';
import { withApi } from './_handler.js';

export default withApi(
  async function handler(req, res, { auth, tenantId }) {
    // GET, POST, PUT, DELETE handlers
    // Direct Supabase queries
    // Tenant isolation enforcement
  },
  {
    permissions: {
      GET: '{resource}:read',
      POST: '{resource}:write',
      PUT: '{resource}:write',
      DELETE: '{resource}:write',
    },
  }
);
```

### 1.5 آلية الاتصال من Frontend

```typescript
// src/lib/installApiAuthFetch.ts
// Global fetch interceptor يضيف JWT تلقائياً لكل /api/* requests
window.fetch = async (input, init) => {
  if (isApiCall(input)) {
    const token = await supabase.auth.getSession();
    headers.set('Authorization', `Bearer ${token}`);
  }
  return original(input, { ...init, headers });
};
```

---

## 2️⃣ خريطة الاعتماديات (Dependencies Map)

### 2.1 الاعتماديات المشتركة

```
┌─────────────────────────────────────────┐
│         Shared Utilities                │
│  ┌──────────────┐  ┌──────────────┐    │
│  │  db-client   │  │    sentry    │    │
│  │  (Supabase)  │  │  (Errors)    │    │
│  └──────┬───────┘  └──────┬───────┘    │
│         │                 │            │
│  ┌──────▼───────┐  ┌──────▼───────┐    │
│  │ auth-middleware│  │  env-check   │    │
│  │  (JWT+RBAC)  │  │  (Validation)│    │
│  └──────┬───────┘  └──────┬───────┘    │
│         │                 │            │
│  ┌──────▼───────┐  ┌──────▼───────┐    │
│  │  _handler    │  │   db-wake    │    │
│  │  (Wrapper)   │  │  (Restore)   │    │
│  └──────┬───────┘  └──────────────┘    │
│         │                              │
│  ┌──────▼───────┐                      │
│  │ permissions  │                      │
│  │   (RBAC)     │                      │
│  └──────────────┘                      │
└─────────────────────────────────────────┘
              ▲
              │ imports
              │
    ┌─────────┴─────────┐
    │                   │
┌───▼────┐  ┌───▼────┐  ┌───▼────┐
│products│  │customers│  │ sales  │  ... (39 functions)
└────────┘  └────────┘  └────────┘
```

### 2.2 عدم وجود Cross-Imports بين Functions

✅ **نتيجة مهمة:** لا توجد أي imports بين ملفات API نفسها. كل function مستقلة تماماً وتعتمد فقط على الملفات المشتركة.

هذا يعني:
- **سهولة الدمج:** يمكن دمج أي مجموعة functions في ملف واحد دون كسر الاعتماديات
- **سهولة الفصل:** يمكن نقل function إلى ملف منفصل دون تأثير على الآخرين
- **انعدام Coupling:** كل function تعمل بشكل مستقل

### 2.3 الجداول المشتركة في Database

| Function Group | الجداول المستخدمة |
|----------------|-------------------|
| Core Commerce | products, customers, sales, sale_items, purchases, suppliers |
| Financial | expenses, bank_accounts, payment_terminals, refunds, customer_ledger, supplier_ledger |
| Operations | branches, app_users, shifts, stocktakes, invites |
| Advanced Features | loyalty_programs, price_lists, recipes, recipe_items, ai_conversations |
| Platform/SaaS | tenants, tenant_subscriptions, subscription_plans, subscription_payments, device_bindings, platform_settings, platform_announcements |
| Supporting | notifications, push_subscriptions, backups, sync_status, audit_logs |

---

## 3️⃣ مقارنة الحلول المقترحة

### الحل 1: Single Monolithic Function (دالة واحدة شاملة)

**الفكرة:** دمج جميع الـ 39 functions في ملف واحد مع routing داخلي.

```javascript
// api/index.js
export default async function handler(req, res) {
  const path = req.url.split('?')[0].replace('/api/', '');
  
  switch (path) {
    case 'products': return productsHandler(req, res);
    case 'customers': return customersHandler(req, res);
    // ... 37 more cases
  }
}
```

| المعيار | التقييم | التعليق |
|---------|---------|--------|
| عدد Functions | ✅ 1 function | أقل بكثير من الحد (12) |
| سهولة الصيانة | ❌ سيئ جداً | ملف واحد ضخم (~6000 سطر)، صعب الفهم والتعديل |
| الأداء | ❌ بطيء | Cold Start ~3-5 ثواني بسبب حجم الكود الكبير |
| قابلية التوسع | ❌ ضعيف | أي تعديل يؤثر على كل الـ API |
| التوافق مع Supabase | ✅ ممتاز | لا تغيير في منطق Database |
| التوافق مع Offline/Realtime | ✅ ممتاز | لا تأثير على Frontend |
| التوافق مع Vercel Hobby | ✅ ممتاز | 1 function فقط |

**الحكم:** ❌ **مرفوض** - صعوبة صيانة عالية وأداء ضعيف

---

### الحل 2: Catch-all Router مع Internal Modules

**الفكرة:** استخدام Vercel's catch-all route مع modules منفصلة.

```
api/
├── [[...path]].js    # Catch-all router (1 function)
├── modules/
│   ├── products.js
│   ├── customers.js
│   └── ... (39 modules)
```

| المعيار | التقييم | التعليق |
|---------|---------|--------|
| عدد Functions | ✅ 1 function | Catch-all فقط يُحسب |
| سهولة الصيانة | ⚠️ متوسط | الفصل موجود لكن routing معقد |
| الأداء | ⚠️ متوسط | Cold Start ~2-3 ثواني (يحمّل كل modules) |
| قابلية التوسع | ⚠️ متوسط | إضافة modules جديدة سهلة، لكن router يزداد |
| التوافق مع Supabase | ✅ ممتاز | لا تغيير |
| التوافق مع Offline/Realtime | ✅ ممتاز | لا تأثير |
| التوافق مع Vercel Hobby | ✅ ممتاز | 1 function فقط |

**الحكم:** ⚠️ **مقبول لكن ليس الأمثل** - أداء أفضل من الحل 1 لكن لا يزال bottleneck

---

### الحل 3: Domain-Based Grouping (التجميع حسب المجال) ⭐

**الفكرة:** دمج الـ functions في 8-10 مجموعات حسب المجال التجاري.

```
api/
├── commerce.js           # products, customers, suppliers, inventory
├── transactions.js       # sales, purchases, refunds
├── financial.js          # expenses, bank-accounts, payment-terminals, ledgers
├── operations.js         # branches, users, shifts, stocktakes, invites
├── features.js           # loyalty, pricing, recipes, ai, import-export
├── platform.js           # tenants, subscription, plans, platform-*
├── support.js            # notifications, push, whatsapp, upload, backups, sync
├── analytics.js          # reports, dashboard, audit-logs, tenant-catalog
├── health.js             # health check (مستقل)
└── _shared/              # Shared utilities (لا تُحسب كـ functions)
```

**مثال على commerce.js:**

```javascript
import { withApi } from './_shared/handler.js';
import { productsHandler } from './_modules/products.js';
import { customersHandlers } from './_modules/customers.js';
import { suppliersHandlers } from './_modules/suppliers.js';

export default async function handler(req, res) {
  const resource = req.url.split('?')[0].split('/')[2]; // /api/commerce/products → products
  
  switch (resource) {
    case 'products': return productsHandler(req, res);
    case 'customers': return customersHandler(req, res);
    case 'suppliers': return suppliersHandlers(req, res);
    default: return res.status(404).json({ error: 'Not found' });
  }
}
```

| المعيار | التقييم | التعليق |
|---------|---------|--------|
| عدد Functions | ✅ 9 functions | تحت الحد (12) بـ 3 functions احتياط |
| سهولة الصيانة | ✅ ممتاز | كل domain منفصل، سهل الفهم والتعديل |
| الأداء | ✅ جيد جداً | Cold Start ~1-2 ثانية (حسب domain size) |
| قابلية التوسع | ✅ ممتاز | إضافة features جديدة داخل domain موجود |
| التوافق مع Supabase | ✅ ممتاز | لا تغيير في منطق Database |
| التوافق مع Offline/Realtime | ✅ ممتاز | Frontend يحتاج تعديل paths فقط |
| التوافق مع Vercel Hobby | ✅ ممتاز | 9 functions (3 احتياط للنمو المستقبلي) |

**الحكم:** ✅ **موصى به** - توازن مثالي بين الأداء والصيانة والتوسع

---

### الحل 4: Hybrid Approach (مختلط)

**الفكرة:** إبقاء high-traffic functions منفصلة + دمج الباقي.

```
api/
├── subscription.js       # منفصل (9 calls - الأعلى استخداماً)
├── products.js           # منفصل (6 calls)
├── users.js              # منفصل (4 calls)
├── commerce.js           # customers, suppliers
├── transactions.js       # sales, purchases, refunds
├── financial.js          # expenses, bank-accounts, ledgers
├── operations.js         # branches, shifts, stocktakes, invites
├── features.js           # loyalty, pricing, recipes, ai, import-export
├── platform.js           # tenants, plans, platform-*
├── support.js            # notifications, push, upload, backups, sync
└── analytics.js          # reports, dashboard, audit-logs
```

| المعيار | التقييم | التعليق |
|---------|---------|--------|
| عدد Functions | ✅ 11 functions | تحت الحد بـ 1 function فقط (خطير!) |
| سهولة الصيانة | ⚠️ متوسط | مزيج من patterns مختلفة |
| الأداء | ✅ ممتاز | High-traffic functions منفصلة = cold start أسرع |
| قابلية التوسع | ❌ ضعيف | لا مساحة لإضافة functions جديدة |
| التوافق مع Supabase | ✅ ممتاز | لا تغيير |
| التوافق مع Offline/Realtime | ✅ ممتاز | Frontend يحتاج تعديل paths |
| التوافق مع Vercel Hobby | ⚠️ حرج | 11/12 functions (لا مساحة للنمو) |

**الحكم:** ❌ **مرفوض** - لا مساحة للنمو المستقبلي

---

### الحل 5: Vercel Pro (ترقية مدفوعة)

**الفكرة:** الترقية إلى Vercel Pro ($20/شهر) للحصول على functions غير محدودة.

| المعيار | التقييم | التعليق |
|---------|---------|--------|
| عدد Functions | ✅ غير محدود | لا قيود |
| سهولة الصيانة | ✅ ممتاز | لا تغيير في الكود |
| الأداء | ✅ ممتاز | لا تغيير |
| قابلية التوسع | ✅ ممتاز | لا قيود |
| التوافق مع Supabase | ✅ ممتاز | لا تغيير |
| التوافق مع Offline/Realtime | ✅ ممتاز | لا تغيير |
| التوافق مع Vercel Hobby | N/A | ترقية مدفوعة |
| التكلفة | ❌ $20/شهر | غير مبرر تقنياً |

**الحكم:** ❌ **مرفوض** - المستخدم طلب تجنب الحلول المدفوعة ما لم يكن هناك بديل تقني

---

## 4️⃣ الحل الموصى به: Domain-Based Grouping

### 4.1 لماذا هذا الحل؟

1. **توازن مثالي:** 9 functions (3 احتياط للنمو)
2. **منطقي تجارياً:** كل domain يمثل وحدة عمل مستقلة
3. **سهل الصيانة:** كل developer يعمل على domain محدد
4. **أداء جيد:** Cold Start ~1-2 ثانية (مقبول جداً)
5. **قابل للتوسع:** يمكن إضافة features داخل كل domain
6. **متوافق 100%:** لا تغيير في Supabase أو Offline أو Realtime

### 4.2 التجميع المقترح

#### Domain 1: `commerce.js` (Core Commerce)
- products
- customers
- suppliers
- inventory (products stock management)

**السبب:** هذه الموارد مترابطة تجارياً (منتجات + عملاء + موردين = عمليات الشراء والبيع الأساسية)

#### Domain 2: `transactions.js` (Sales & Purchases)
- sales
- purchases
- refunds

**السبب:** كلهم عمليات مالية مباشرة تؤثر على المخزون والحسابات

#### Domain 3: `financial.js` (Financial Operations)
- expenses
- bank-accounts
- payment-terminals
- customer-ledger
- supplier-ledger

**السبب:** كلهم متعلقون بالمحاسبة والحسابات المالية

#### Domain 4: `operations.js` (Operations & HR)
- branches
- users
- shifts
- stocktakes
- invites

**السبب:** إدارة العمليات اليومية والموظفين

#### Domain 5: `features.js` (Advanced Features - P2)
- loyalty
- pricing
- recipes
- ai
- import-export

**السبب:** ميزات متقدمة غير أساسية، يمكن تطويرها بشكل مستقل

#### Domain 6: `platform.js` (Platform/SaaS Management)
- tenants
- subscription
- subscription-plans
- platform-announcements
- platform-payments
- platform-settings

**السبب:** كلهم متعلقون بإدارة المنصة والاشتراكات (SaaS layer)

#### Domain 7: `support.js` (Supporting Services)
- notifications
- push
- whatsapp
- upload
- backups
- sync

**السبب:** خدمات مساعدة غير مباشرة للأعمال

#### Domain 8: `analytics.js` (Reports & Analytics)
- reports
- dashboard
- audit-logs
- tenant-catalog

**السبب:** كلهم متعلقون بالتقارير والتحليلات

#### Domain 9: `health.js` (Infrastructure - مستقل)
- health check

**السبب:** function بسيط ومستقل، يُستخدم للمراقبة

### 4.3 البنية الجديدة المقترحة

```
api/
├── commerce.js              # Domain 1: products, customers, suppliers
├── transactions.js          # Domain 2: sales, purchases, refunds
├── financial.js             # Domain 3: expenses, bank-accounts, ledgers
├── operations.js            # Domain 4: branches, users, shifts, stocktakes
├── features.js              # Domain 5: loyalty, pricing, recipes, ai, import-export
├── platform.js              # Domain 6: tenants, subscription, platform-*
├── support.js               # Domain 7: notifications, push, upload, backups
├── analytics.js             # Domain 8: reports, dashboard, audit-logs
├── health.js                # Domain 9: health check
└── _shared/                 # Shared utilities (لا تُحسب كـ functions)
    ├── handler.js
    ├── auth-middleware.js
    ├── db-client.js
    ├── db-wake.js
    ├── env-check.js
    ├── sentry.js
    ├── permissions.js
    └── modules/             # Internal modules (لا تُحسب كـ functions)
        ├── products.js
        ├── customers.js
        ├── suppliers.js
        ├── sales.js
        ├── purchases.js
        ├── refunds.js
        ├── expenses.js
        ├── bank-accounts.js
        ├── payment-terminals.js
        ├── customer-ledger.js
        ├── supplier-ledger.js
        ├── branches.js
        ├── users.js
        ├── shifts.js
        ├── stocktakes.js
        ├── invites.js
        ├── loyalty.js
        ├── pricing.js
        ├── recipes.js
        ├── ai.js
        ├── import-export.js
        ├── tenants.js
        ├── subscription.js
        ├── subscription-plans.js
        ├── platform-announcements.js
        ├── platform-payments.js
        ├── platform-settings.js
        ├── notifications.js
        ├── push.js
        ├── whatsapp.js
        ├── upload.js
        ├── backups.js
        ├── sync.js
        ├── reports.js
        ├── dashboard.js
        ├── audit-logs.js
        └── tenant-catalog.js
```

### 4.4 التعديلات المطلوبة في Frontend

#### التغيير في `vercel.json`:

```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm ci",
  "devCommand": "npm run dev",
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET,POST,PUT,DELETE,OPTIONS" },
        { "key": "Access-Control-Allow-Headers", "value": "Content-Type, Authorization, X-Tenant-Id" }
      ]
    }
  ]
}
```

**ملاحظة:** لا تغيير في `vercel.json` لأن الـ rewrites موجودة بالفعل وتتعامل مع `/api/:path*`.

#### التغيير في Frontend API Calls:

**قبل:**
```typescript
fetch('/api/products?tenant_id=123')
fetch('/api/customers?tenant_id=123')
fetch('/api/sales?tenant_id=123')
```

**بعد:**
```typescript
fetch('/api/commerce/products?tenant_id=123')
fetch('/api/commerce/customers?tenant_id=123')
fetch('/api/transactions/sales?tenant_id=123')
```

**أو** (الحل الأبسط): استخدام URL mapping في `apiClient.ts`:

```typescript
// src/lib/apiClient.ts
const DOMAIN_MAP: Record<string, string> = {
  products: 'commerce',
  customers: 'commerce',
  suppliers: 'commerce',
  sales: 'transactions',
  purchases: 'transactions',
  refunds: 'transactions',
  expenses: 'financial',
  'bank-accounts': 'financial',
  'payment-terminals': 'financial',
  'customer-ledger': 'financial',
  'supplier-ledger': 'financial',
  branches: 'operations',
  users: 'operations',
  shifts: 'operations',
  stocktakes: 'operations',
  invites: 'operations',
  loyalty: 'features',
  pricing: 'features',
  recipes: 'features',
  ai: 'features',
  'import-export': 'features',
  tenants: 'platform',
  subscription: 'platform',
  'subscription-plans': 'platform',
  'platform-announcements': 'platform',
  'platform-payments': 'platform',
  'platform-settings': 'platform',
  notifications: 'support',
  push: 'support',
  whatsapp: 'support',
  upload: 'support',
  backups: 'support',
  sync: 'support',
  reports: 'analytics',
  dashboard: 'analytics',
  'audit-logs': 'analytics',
  'tenant-catalog': 'analytics',
  health: 'health',
};

function resolveApiPath(path: string): string {
  const match = path.match(/^\/api\/([a-z-]+)/);
  if (!match) return path;
  
  const resource = match[1];
  const domain = DOMAIN_MAP[resource];
  
  if (!domain) return path; // fallback to original
  
  return path.replace(`/api/${resource}`, `/api/${domain}/${resource}`);
}

// في دالة apiFetch:
const resolvedPath = resolveApiPath(path);
const res = await fetch(resolvedPath, { ...rest, headers });
```

**ميزة هذا الحل:** لا حاجة لتعديل أي `fetch()` call في الـ pages! الـ mapping يتم تلقائياً في `apiClient.ts`.

### 4.5 مخاطر محتملة وحلولها

| الخطر | الاحتمال | التأثير | الحل |
|--------|----------|---------|------|
| Cold Start بطيء لبعض domains | منخفض | متوسط | Lazy loading للـ modules داخل كل domain |
| Routing errors | منخفض | عالي | Unit tests شاملة للـ router |
| Frontend path mapping errors | متوسط | عالي | E2E tests + fallback للـ original path |
| Developer confusion | منخفض | منخفض | توثيق واضح + comments في كل domain |
| Performance degradation | منخفض | متوسط | Monitoring + profiling بعد النشر |

---

## 5️⃣ خطة التنفيذ المفصلة

### المرحلة 1: إعادة هيكلة Backend (Commits 1-3)

#### Commit 1: إنشاء البنية الجديدة
```
chore(api): restructure api/ into domain-based architecture

- Create api/_shared/ directory for shared utilities
- Create api/_shared/modules/ for internal handlers
- Move shared utilities to api/_shared/
- Update imports in all files

Files changed:
- api/_shared/handler.js (renamed from api/_handler.js)
- api/_shared/auth-middleware.js (renamed)
- api/_shared/db-client.js (renamed)
- api/_shared/db-wake.js (renamed)
- api/_shared/env-check.js (renamed)
- api/_shared/sentry.js (renamed)
- api/_shared/permissions.js (renamed)
- api/_shared/modules/*.js (39 files moved)
```

#### Commit 2: إنشاء Domain Routers
```
feat(api): add domain-based routers

- Create 9 domain routers (commerce, transactions, financial, etc.)
- Each router handles internal routing for its domain
- Implement lazy loading for better performance

Files added:
- api/commerce.js
- api/transactions.js
- api/financial.js
- api/operations.js
- api/features.js
- api/platform.js
- api/support.js
- api/analytics.js
- api/health.js (moved from old location)
```

#### Commit 3: حذف الملفات القديمة
```
chore(api): remove old individual function files

- Delete 39 old api/*.js files (now in _shared/modules/)
- Keep only domain routers + _shared/

Files deleted:
- api/products.js (moved to _shared/modules/)
- api/customers.js (moved)
- ... (37 more files)
```

### المرحلة 2: تحديث Frontend (Commit 4)

#### Commit 4: إضافة URL Mapping
```
feat(client): add domain-based API path mapping

- Add DOMAIN_MAP to apiClient.ts
- Implement resolveApiPath() function
- Auto-redirect old paths to new domain paths
- Maintain backward compatibility with fallback

Files changed:
- src/lib/apiClient.ts
```

### المرحلة 3: الاختبار والتحقق (Commits 5-6)

#### Commit 5: إضافة Tests
```
test(api): add comprehensive tests for domain routers

- Unit tests for each domain router
- Integration tests for API calls
- Path mapping tests for apiClient

Files added:
- api/commerce.test.js
- api/transactions.test.js
- ... (9 test files)
- src/lib/apiClient.test.ts
```

#### Commit 6: التوثيق
```
docs: update API documentation

- Update README.md with new API structure
- Add API_DOMAINS.md explaining domain grouping
- Update deployment guide

Files changed:
- README.md
- docs/API_DOMAINS.md (new)
- docs/DEPLOYMENT.md
```

### المرحلة 4: النشر والتحقق (Commit 7)

#### Commit 7: Final adjustments
```
fix(api): final adjustments for Vercel deployment

- Update vercel.json if needed
- Add deployment verification script
- Update GitHub Actions workflow

Files changed:
- vercel.json (if needed)
- scripts/verify-deployment.js (new)
- .github/workflows/deploy.yml
```

### ملخص الخطة

| المرحلة | عدد Commits | الملفات المتأثرة | المخاطر |
|---------|-------------|------------------|---------|
| 1. إعادة هيكلة Backend | 3 | ~50 ملف | منخفض |
| 2. تحديث Frontend | 1 | 1 ملف | متوسط |
| 3. الاختبار | 2 | ~10 ملفات | منخفض |
| 4. النشر | 1 | ~3 ملفات | منخفض |
| **المجموع** | **7 commits** | **~64 ملف** | **منخفض-متوسط** |

### الجدول الزمني المقترح

| اليوم | المهمة | المدة المتوقعة |
|-------|--------|----------------|
| 1 | المرحلة 1 (Commits 1-3) | 4-6 ساعات |
| 2 | المرحلة 2 (Commit 4) | 2-3 ساعات |
| 3 | المرحلة 3 (Commits 5-6) | 3-4 ساعات |
| 4 | المرحلة 4 (Commit 7) + Deployment | 2-3 ساعات |
| **المجموع** | **4 أيام عمل** | **11-16 ساعة** |

---

## 6️⃣ الخلاصة والتوصيات

### التوصية النهائية

✅ **اعتماد الحل 3: Domain-Based Grouping**

**الأسباب:**
1. يحل المشكلة فوراً (39 → 9 functions)
2. يحافظ على المعمارية الحالية (لا تغيير في Supabase أو RLS)
3. سهل الصيانة والتوسع
4. أداء ممتاز (Cold Start ~1-2 ثانية)
5. متوافق 100% مع Vercel Hobby
6. لا يحتاج ترقية مدفوعة

### الخطوات التالية

1. **الموافقة على الخطة:** مراجعة هذا التقرير والموافقة على الحل المقترح
2. **بدء التنفيذ:** العمل على فرع develop حسب الخطة المفصلة
3. **الاختبار الشامل:** Unit tests + Integration tests + E2E tests
4. **النشر التجريبي:** Deploy إلى preview environment أولاً
5. **النشر النهائي:** Merge إلى develop → Deploy إلى production

### ملاحظات مهمة

- ✅ **لا تغيير في Database:** كل الـ queries تبقى كما هي
- ✅ **لا تغيير في RLS:** Tenant isolation يعمل كما هو
- ✅ **لا تغيير في Supabase:** لا تأثير على Realtime أو Storage
- ✅ **لا تغيير في Offline First:** Sync engine يعمل كما هو
- ⚠️ **تغيير في Frontend:** URLs تتغير من `/api/{resource}` إلى `/api/{domain}/{resource}`
- ⚠️ **تغيير في Backend:** الملفات تنتقل من `api/` إلى `api/_shared/modules/`

---

## 📎 الملاحق

### الملحق أ: قائمة الملفات الكاملة

<details>
<summary>اضغط هنا لعرض القائمة الكاملة</summary>

**Shared Utilities (7 files):**
1. api/_shared/handler.js
2. api/_shared/auth-middleware.js
3. api/_shared/db-client.js
4. api/_shared/db-wake.js
5. api/_shared/env-check.js
6. api/_shared/sentry.js
7. api/_shared/permissions.js

**Internal Modules (39 files):**
1. api/_shared/modules/products.js
2. api/_shared/modules/customers.js
3. api/_shared/modules/sales.js
4. api/_shared/modules/purchases.js
5. api/_shared/modules/suppliers.js
6. api/_shared/modules/expenses.js
7. api/_shared/modules/bank-accounts.js
8. api/_shared/modules/payment-terminals.js
9. api/_shared/modules/refunds.js
10. api/_shared/modules/customer-ledger.js
11. api/_shared/modules/supplier-ledger.js
12. api/_shared/modules/branches.js
13. api/_shared/modules/users.js
14. api/_shared/modules/shifts.js
15. api/_shared/modules/stocktakes.js
16. api/_shared/modules/invites.js
17. api/_shared/modules/loyalty.js
18. api/_shared/modules/pricing.js
19. api/_shared/modules/recipes.js
20. api/_shared/modules/ai.js
21. api/_shared/modules/import-export.js
22. api/_shared/modules/tenants.js
23. api/_shared/modules/subscription.js
24. api/_shared/modules/subscription-plans.js
25. api/_shared/modules/platform-announcements.js
26. api/_shared/modules/platform-payments.js
27. api/_shared/modules/platform-settings.js
28. api/_shared/modules/notifications.js
29. api/_shared/modules/push.js
30. api/_shared/modules/whatsapp.js
31. api/_shared/modules/upload.js
32. api/_shared/modules/backups.js
33. api/_shared/modules/sync.js
34. api/_shared/modules/reports.js
35. api/_shared/modules/dashboard.js
36. api/_shared/modules/audit-logs.js
37. api/_shared/modules/tenant-catalog.js
38. api/_shared/modules/health.js
39. api/_shared/modules/env-check.js

**Domain Routers (9 files):**
1. api/commerce.js
2. api/transactions.js
3. api/financial.js
4. api/operations.js
5. api/features.js
6. api/platform.js
7. api/support.js
8. api/analytics.js
9. api/health.js

</details>

### الملحق ب: أمثلة على Domain Routers

<details>
<summary>مثال: commerce.js</summary>

```javascript
// api/commerce.js
import { setCors } from './_shared/auth-middleware.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const path = req.url.split('?')[0];
  const resource = path.split('/')[3]; // /api/commerce/products → products

  try {
    switch (resource) {
      case 'products': {
        const { default: productsHandler } = await import('./_shared/modules/products.js');
        return productsHandler(req, res);
      }
      case 'customers': {
        const { default: customersHandler } = await import('./_shared/modules/customers.js');
        return customersHandler(req, res);
      }
      case 'suppliers': {
        const { default: suppliersHandler } = await import('./_shared/modules/suppliers.js');
        return suppliersHandler(req, res);
      }
      default:
        return res.status(404).json({ error: 'Resource not found' });
    }
  } catch (err) {
    console.error('Commerce API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
```

</details>

---

**انتهى التقرير**

بانتظار موافقتكم للبدء في التنفيذ.

