# RAFD | رفد

**منصة SaaS لإدارة متاجر التجزئة والبقالة ونقطة البيع — RTL-first · Multi-tenant · Offline-capable POS**

> آخر تحديث لهذا الملف: **2026-07-25**  
> مصدر الحالة الفنية الحالية: [`docs/RAFD_ENTERPRISE_PRODUCTION_AUDIT.md`](docs/RAFD_ENTERPRISE_PRODUCTION_AUDIT.md)

---

## حالة المشروع الحالية

هذا المشروع يحتوي على نظام Retail/POS واسع يغطي: المتاجر، الفروع، المستخدمين، نقطة البيع، المنتجات، المخزون، العملاء، الموردين، المشتريات، المبيعات، المرتجعات، التقارير، الاشتراكات، لوحة إدارة المنصة، التخزين، الإشعارات، وبعض ميزات Offline.

لكن حسب التدقيق الإنتاجي الأخير، النظام **ليس جاهزًا للإطلاق الإنتاجي الواسع كمنصة SaaS متعددة المستأجرين** قبل معالجة مجموعة من المشاكل الحرجة في قاعدة البيانات والـ API والاشتراكات.

### ملخص Runtime Validation الأخير

| الفحص | النتيجة |
|---|---|
| `npm ci` | نجح |
| `npm test` | نجح — 27 ملف اختبار / 129 اختبار |
| `npm run build` | نجح |
| `npm run lint` | فشل — 53 خطأ و20 تحذيرًا |
| `npm audit --audit-level=high` | فشل — 7 ثغرات high |
| `vite preview` للـ SPA | نجح HTTP 200 للمسارات الأساسية |

---

## أهم التحذيرات قبل الإنتاج

هذه النقاط مثبتة في تقرير التدقيق ويجب التعامل معها كـ Production Blockers:

1. **Schema Drift في قاعدة البيانات**: الكود الحالي يتوقع أعمدة غير موجودة في جداول Platform/Subscription/Backups/Audit.
2. **Migration Ledger Drift**: بعض migrations مطبقة فعليًا وغير مسجلة، وبعضها غير مطبق نهائيًا.
3. **`/api/subscription` غير محمي** رغم أنه ينفذ عمليات حساسة مثل تفعيل الاشتراك ومراجعة المدفوعات وإطلاق الأجهزة.
4. **عدة API modules تستخدم service-role بدون Auth Gate**، وبالتالي تتجاوز RLS.
5. **تكرار `tenant_subscriptions`**: تم رصد tenant لديه 10 اشتراكات، ما يجعل حالة الاشتراك غير حتمية.
6. **Platform Admin مكسور جزئيًا/كليًا** بسبب أعمدة مفقودة مثل `sort_order`, `name_ar`, `is_published`, وغيرها.
7. **Backup/Restore غير جاهز للإنتاج** بسبب عدم تطابق API مع schema الفعلي ولأن الاستعادة جزئية.
8. **Offline-first غير شامل**: الدعم الفعلي قوي في المبيعات والمنتجات/المخزون، لكنه محدود في باقي وحدات ERP.

للتفاصيل والأدلة بالملفات والأسطر ونتائج SQL، راجع تقرير التدقيق الكامل.

---

## نظرة عامة على المنتج

RAFD هو نظام إدارة متجر ونقطة بيع يدعم:

- واجهة عربية RTL مع دعم EN جزئي.
- نقطة بيع POS لمسية.
- منتجات ومخزون كرتون/حبة/وزن.
- عملاء وآجل ودفاتر حسابات.
- موردين ومشتريات.
- مرتجعات.
- ورديات كاشير.
- جرد مخزون.
- تقارير ومؤشرات أداء.
- اشتراكات SaaS ولوحة Super Admin.
- رفع صور وملفات عبر Supabase Storage.
- إشعارات وPush اختياري.
- WhatsApp sharing/deep links.
- طباعة فواتير وإيصالات حرارية ESC/POS.
- ماسح باركود بالكاميرا أو keyboard wedge.
- بعض قدرات Offline عبر IndexedDB Outbox.

---

## التقنية المستخدمة

| الطبقة | التقنية |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Routing | React Router |
| Backend | Vercel-style `api/*.js` serverless functions |
| Database/Auth/Storage | Supabase |
| Offline | IndexedDB + localStorage + Service Worker shell cache |
| Tests | Vitest, Testing Library, fake-indexeddb |
| Build | `tsc -b && vite build` |

---

## المعمارية المختصرة

```text
React SPA
  ├─ AuthContext
  ├─ TenantContext
  ├─ SubscriptionContext
  ├─ SyncContext
  └─ Pages / Components
        ↓ fetch('/api/...') أو apiFetch()
Vercel API Routers
  ├─ api/commerce.js
  ├─ api/transactions.js
  ├─ api/financial.js
  ├─ api/operations.js
  ├─ api/features.js
  ├─ api/platform.js
  ├─ api/support.js
  └─ api/analytics.js
        ↓
api/_lib/modules/*.js
        ↓
Supabase service-role client
        ↓
Postgres + RLS + Storage
```

### ملاحظة أمنية مهمة

الـ API backend يستخدم Supabase service-role key، وهذا يعني أنه **يتجاوز RLS**. لذلك حماية الـ API عبر `withApi`, `requireAuth`, `resolveTenantId`, و`requirePlatformAdmin` هي الحد الأمني الفعلي للمسارات التي تمر عبر `/api/*`.

بعض modules لا تستخدم هذه الحماية حاليًا، وهي موثقة في تقرير التدقيق كقضايا حرجة.

---

## حالة الوحدات الحالية

| الوحدة | الحالة الحالية |
|---|---|
| POS / Sales | يعمل نسبيًا، مع idempotency وخصم مخزون ذري وoffline queue للمبيعات |
| Products / Inventory | من أقوى الوحدات، تدعم cache/outbox عبر IndexedDB |
| Customers | CRUD محمي نسبيًا، لكن customer-ledger endpoint غير محمي |
| Suppliers | يعتمد على endpoints غير محمية حاليًا |
| Purchases | محمي عبر API، لكنه لا يدعم Offline ولا توجد FKs كافية |
| Expenses | endpoint غير محمي حاليًا |
| Bank accounts / Payment terminals | endpoints غير محمية حاليًا |
| Dashboard | غير محمي وفيه fallback إلى tenant 1 وقراءات ثقيلة |
| Reports | محمي، لكن يعتمد على broad reads وفلترة في الذاكرة |
| Subscription | مكسور/غير آمن حاليًا ويحتاج أولوية قصوى |
| Platform Admin | متأثر بشدة بـ Schema Drift |
| Backups | غير جاهز للإنتاج بسبب Schema Drift واستعادة جزئية |
| Offline/Sync | جيد للمبيعات والمنتجات، محدود لباقي النظام |
| Storage/Upload | يعمل، لكن bucket عام ويجب التعامل بحذر مع الملفات الحساسة |

---

## Offline / Sync

النظام يحتوي على IndexedDB:

```text
rafd-offline-v1
  ├─ outbox
  ├─ cache
  └─ meta
```

### مدعوم Offline فعليًا

- Sales create offline.
- Product create/update/delete offline.
- Inventory stock adjustment عبر product update.
- قراءة Products/Inventory من cache عبر `useTenantScopedList`.

### غير مدعوم Offline حاليًا

- Purchases.
- Expenses.
- Suppliers.
- Ledgers.
- Bank accounts.
- Payment terminals.
- Stocktake.
- Shifts.
- Subscription.
- Platform Admin.
- Reports.
- Loyalty/Pricing/Recipes كمنظومات كاملة.

---

## المسارات الرئيسية

| المسار | الوصف |
|---|---|
| `/login` | تسجيل دخول المتجر |
| `/onboarding` | إنشاء متجر جديد |
| `/dashboard` | لوحة تحكم المتجر |
| `/pos` | نقطة البيع |
| `/products` | المنتجات |
| `/inventory` | المخزون |
| `/customers` | العملاء |
| `/suppliers` | الموردون |
| `/purchases` | المشتريات |
| `/invoices` | الفواتير |
| `/refunds` | المرتجعات |
| `/payments` | الحسابات البنكية ونقاط الدفع |
| `/expenses` | المصروفات |
| `/reports` | التقارير |
| `/shifts` | الورديات |
| `/stocktake` | الجرد |
| `/subscription` | الاشتراك والفوترة |
| `/settings` | إعدادات المتجر |
| `/admin/login` | دخول مسؤول المنصة |
| `/admin` | لوحة Super Admin |

---

## متطلبات البيئة

انسخ `.env.example` إلى `.env.local` محليًا، أو اضبط المتغيرات في Vercel/Supabase CI.

### Frontend

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

### Backend/API

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### Optional

```env
VITE_GOOGLE_CLIENT_ID=
VITE_SENTRY_DSN=
SENTRY_DSN=
VITE_VAPID_PUBLIC_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
```

> لا تضع `SUPABASE_SERVICE_ROLE_KEY` في أي متغير يبدأ بـ `VITE_`.

---

## التشغيل المحلي

```bash
npm ci
cp .env.example .env.local
npm run dev
```

ثم افتح:

```text
http://localhost:5173
```

---

## الاختبار والبناء

```bash
npm test
npm run build
npm run lint
npm audit --audit-level=high
```

### الحالة الحالية لهذه الأوامر

| الأمر | الحالة الحالية |
|---|---|
| `npm test` | ينجح |
| `npm run build` | ينجح |
| `npm run lint` | يفشل حاليًا |
| `npm audit --audit-level=high` | يفشل حاليًا بسبب 7 high vulnerabilities |

---

## قاعدة البيانات والمigrations

ملفات migrations موجودة في:

```text
supabase/migrations/
```

أوامر مفيدة:

```bash
npm run db:check
npm run db:push
npm run db:push:linked
npm run db:reset
```

### تنبيه مهم

تم رصد اختلاف بين live DB وملفات migrations:

- بعض migrations غير مسجلة في `supabase_migrations.schema_migrations` رغم وجود آثارها.
- بعض migrations غير مطبقة وآثارها مفقودة.
- الكود يتوقع أعمدة غير موجودة في live DB.

لذلك لا تعتمد على migration ledger وحده كمصدر حقيقة حتى تتم عملية reconciliation.

---

## الأمن والعزل

### الطبقات الموجودة

- Supabase Auth JWT.
- `app_users` profile mapping.
- `withApi` / `requireAuth` / `resolveTenantId` في API.
- RLS policies للـ direct Supabase access.
- Service-role API access.

### الحالة الحالية

- RLS مفعّل غالبًا ويعمل كدفاع ثانٍ للوصول المباشر.
- API service-role يتجاوز RLS.
- بعض API modules لا تملك Auth Gate، وهذا خطر حرِج موثق في تقرير التدقيق.

---

## الملفات التوثيقية المهمة

| الملف | الوصف |
|---|---|
| [`docs/RAFD_ENTERPRISE_PRODUCTION_AUDIT.md`](docs/RAFD_ENTERPRISE_PRODUCTION_AUDIT.md) | تقرير التدقيق الإنتاجي الشامل وخطة الإصلاح |
| `docs/BUSINESS_LOGIC_AUDIT.md` | تدقيق منطق الأعمال السابق |
| `docs/ARCHITECTURE_ANALYSIS.md` | تحليل معماري سابق |
| `docs/FINAL_ARCHITECTURE_ANALYSIS.md` | تحليل معماري سابق موسع |
| `docs/SETUP.md` | إعداد البيئة |
| `supabase/README.md` | ملاحظات Supabase |

---

## خارطة الإصلاح المختصرة

الخطة التفصيلية موجودة في تقرير التدقيق، وملخصها:

1. **Phase 0 — Critical API/Subscription Safety**
   - حماية `/api/subscription` والمسارات غير المحمية.
2. **Phase 1 — Database Schema Alignment**
   - معالجة Schema Drift وMigration Ledger Drift.
3. **Phase 2 — Subscription Stabilization**
   - إزالة التكرار وتعريف invariant واضح للاشتراك.
4. **Phase 3 — API Security**
   - توحيد كل modules تحت Auth/Authz/Tenant checks.
5. **Phase 4 — Referential Integrity**
   - إضافة FKs وindexes وتنظيف البيانات.
6. **Phase 5 — Frontend Stability**
   - توحيد loading/error/no-tenant states.
7. **Phase 6 — Offline/Sync**
   - تحديد وتوسيع نطاق Offline وتطوير conflict handling.
8. **Phase 7 — Performance**
   - تحسين dashboard/reports/import/export/bundle size.
9. **Phase 8 — Backup/DR**
   - جعل النسخ والاستعادة شاملة ومختبرة.
10. **Phase 9 — CI/CD Gates**
   - منع عودة schema drift وAPI auth gaps.

---

## اتفاقيات تطوير مهمة

- لا تضف API جديد يستخدم service-role بدون Auth/Authz واضح.
- لا تعتمد على `tenant_id` القادم من العميل فقط.
- لا تفترض أن RLS يحمي API؛ الـ service-role يتجاوزها.
- أي تعديل schema يجب أن يرافقه migration واختبار/تحقق.
- أي صفحة تعتمد على tenant يجب أن تملك حالة `no-tenant` بدل البقاء في loading.
- أي ميزة Offline يجب أن تحدد: cache, outbox, retry, conflict, recovery.

---

## حالة الاعتمادات الأمنية

آخر `npm audit --audit-level=high` كشف:

- 7 high vulnerabilities.
- أهمها في سلسلة `react-router/react-router-dom` وفي dev tooling مثل ESLint/minimatch/brace-expansion.

يجب مراجعتها ضمن Phase 7/9 قبل الإنتاج.

---

## ملاحظات ختامية

هذا README يعكس حالة النظام الحالية كما ثبتت بالتحقيق، وليس وصفًا تسويقيًا لميزات مأمولة.  
لأي قرار إصلاحي أو إنتاجي، استخدم تقرير التدقيق الشامل كمصدر مرجعي أساسي:

```text
docs/RAFD_ENTERPRISE_PRODUCTION_AUDIT.md
```
