# RAFD | رفد

**منصة SaaS لإدارة متاجر التجزئة والبقالة ونقطة البيع — RTL-first · Multi-tenant · Offline-capable POS**

> آخر تحديث لهذا الملف: **2026-07-25**  
> مصادر الحالة الفنية الحالية:
> - [`docs/OPEN_ISSUES_INVESTIGATION_2026-07-25.md`](docs/OPEN_ISSUES_INVESTIGATION_2026-07-25.md) — **المصدر الأحدث والأدق للمشاكل المفتوحة**
> - [`docs/RAFD_ENTERPRISE_PRODUCTION_AUDIT.md`](docs/RAFD_ENTERPRISE_PRODUCTION_AUDIT.md) — تقرير تاريخي؛ **معظم بنوده عولجت بعد دمج PR #12**

---

## حالة المشروع الحالية

هذا المشروع يحتوي على نظام Retail/POS واسع يغطي: المتاجر، الفروع، المستخدمين، نقطة البيع، المنتجات، المخزون، العملاء، الموردين، المشتريات، المبيعات، المرتجعات، التقارير، الاشتراكات، لوحة إدارة المنصة، التخزين، الإشعارات، وبعض ميزات Offline.

بعد دمج **PR #12** في `main`، عولجت الطبقة الحرجة من مشاكل الأمن وسلامة البيانات (تفاصيل في القسم التالي). ما تبقّى مفتوحًا يتركّز في **موثوقية الواجهة الأمامية** — تحديدًا معالجة أخطاء عمليات الكتابة — وليس في أمن الـ API أو سلامة قاعدة البيانات.

**التقييم الحالي:** النظام أقرب بكثير لجاهزية الإنتاج مما كان عليه، لكن **يبقى بند واحد حاجب فعليًا**: عمليات كتابة تفشل صامتًا في مسارات مالية (تحصيل من عميل، سداد لمورد، إغلاق وردية) — راجع «ما هو مفتوح فعليًا» أدناه.

### ✅ ما تم إصلاحه فعليًا (مدموج في `main` عبر PR #12)

تم التحقق من كل بند من هذه بقراءة الكود الحالي، وليس بالاعتماد على وصف الـ PR:

| الإصلاح | الدليل في الشجرة الحالية |
|---|---|
| حماية modules الـ API المكشوفة | 30 module تحت `withApi`؛ الباقي (`tenants`, `users`, `subscription`, `subscription-plans`, `platform-*`) يستخدم `resolveAuth`/`requirePlatformAdmin` يدويًا |
| `/api/tenants` لم يعد مفتوحًا | `api/_lib/modules/tenants.js:126` — `GET`/`PUT` تتطلب مصادقة وعزل tenant؛ `POST` وحده عام للـ Onboarding |
| انحراف السكيما (Schema Drift) | `supabase/migrations/20260725012031_subscription_audit_backups_schema_align.sql` |
| تكرار `tenant_subscriptions` | `20260725012743_tenant_subscriptions_unique.sql` — قيد `UNIQUE (tenant_id)` |
| سلامة مرجعية | `20260725014333_referential_integrity_and_indexes.sql` — 50 FK + 51 index |
| خصم المخزون الذرّي (لا Over-sell) | `api/_lib/modules/sales.js:242` — RPC `pos_apply_stock_delta` بقفل صف |
| تسجيل تدقيق المبيعات | `writeAudit()` يكتب الآن بأعمدة `audit_logs` الحقيقية |
| المرتجع الجزئي التراكمي | `api/_lib/modules/refunds.js:36-53` — يطرح ما سبق إرجاعه |
| ربط المبيعات بالوردية | `sales.js:133-138` — `resolveOpenShiftId()` + ختم `shift_id` |
| Soft-delete للمنتجات ذات السجل البيعي | `api/_lib/modules/products.js:200` |
| إزالة fallback إلى `tenant_id = 1` | `src/contexts/TenantContext.tsx:50` — `?? null` |
| تطبيق قوائم الأسعار في POS | `src/pages/POS.tsx:257-270` — `resolvePrice` مُستدعى فعليًا |
| تسجيل عجز المخزون | `sales.js` — حدث تدقيق `inventory.deficit` بدل القص الصامت إلى صفر |
| باغ الـ loading العالق (حالة لا-tenant) | نمط `if (!tenant?.id) { setLoading(false); return; }` في 12 صفحة |
| خصوصية إثباتات الدفع | `api/_lib/modules/upload.js:30` — bucket خاص `rafd-payment-proofs` + روابط موقَّتة |
| تقييد CORS | `api/_lib/auth-middleware.js:14-24` — allowlist بأنماط regex |

### ⚠️ ما هو مفتوح فعليًا الآن

التفاصيل الكاملة (ملف + سطر + خطوات إعادة الإنتاج + الأثر) في
[`docs/OPEN_ISSUES_INVESTIGATION_2026-07-25.md`](docs/OPEN_ISSUES_INVESTIGATION_2026-07-25.md).

| # | المشكلة | الخطورة |
|---|---|---|
| 1 | **تحصيل من عميل / سداد لمورد يفشل صامتًا** — `Customers.tsx:148`, `Suppliers.tsx:115`. نقود تتحرك فعليًا دون تسجيل مؤكَّد | 🔴 حرجة |
| 2 | **فتح/إغلاق وردية يفشل صامتًا** — `Shifts.tsx:66,84`. تسوية نقدية غير موثوقة | 🔴 حرجة |
| 3 | **توست نجاح كاذب في الإعدادات** — `Settings.tsx:128-141` يعرض «تم الحفظ» دون فحص الاستجابة | 🔴 حرجة |
| 4 | **تفعيل اشتراك من لوحة الإدارة غير محقَّق** — `SuperAdmin.tsx:478`؛ المتجر يظهر `active` بلا أيام اشتراك فعلية | 🟠 عالية |
| 5 | **استلام طلبية شراء غير محقَّق** — `Purchases.tsx:262`؛ يزيد المخزون | 🟠 عالية |
| 6 | **إنشاء موظف / إلغاء دعوة غير محقَّق** — `Users.tsx:69,107`؛ لإلغاء الدعوة بُعد أمني | 🟠 عالية |
| 7 | **انهيار الـ loading عند خطأ شبكي** — `load()` في 17 صفحة بلا `try/finally` → هيكل تحميل دائم | 🟠 متوسطة |
| 8 | **20 عملية تحوّل صامتة أخرى** (الإجمالي 31) في Loyalty/Pricing/Recipes/Notifications/Branches/Expenses/Payments/Backup/Subscription/Onboarding | 🟠 متوسطة |
| 9 | **درج النقد يفشل صامتًا** خارج Chrome/Edge — `POS.tsx:460-463` يتجاهل نتيجة `openCashDrawer` | 🟡 منخفضة-متوسطة |
| 10 | **مشاركة واتساب تتطلب إرفاقًا يدويًا** — لا استخدام لـ `navigator.share` في المستودع | 🟡 منخفضة |
| 11 | **`react-router` 7.x بلا إصدار مُصلَح** — 7.18.1 هو الأحدث وكل السلسلة داخل المدى الضعيف. RSC Mode غير مستخدم فالثغرة غير قابلة للاستغلال هنا، لكنها تُفشل `npm audit` | 🟡 منخفضة عمليًا |
| 12 | **`invoice_number` بلا قيد تفرّد** — الفهرس `idx_sales_invoice` غير فريد؛ التفرّد على `idempotency_key` فقط | 🟡 منخفضة |
| 13 | **53 خطأ lint** — غالبيتها `react-hooks/set-state-in-effect` | 🟡 منخفضة |

### ملخص Runtime Validation (مُنفَّذ فعليًا بتاريخ 2026-07-25)

| الفحص | النتيجة |
|---|---|
| `npm ci` | ✅ نجح |
| `npm test` | ✅ نجح — 27 ملف اختبار / 129 اختبار |
| `npm run build` | ✅ نجح (تحذير حجم chunk: 1,458 kB) |
| `npm run lint` | ❌ فشل — 53 خطأ و20 تحذيرًا |
| `npm audit --audit-level=high` | ❌ فشل — 7 ثغرات high (1 في `react-router`، و6 في أدوات التطوير فقط) |

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

**الحالة الحالية:** جميع الـ modules محمية. 30 module تستخدم `withApi`، والباقي (`tenants`, `users`, `subscription`, `subscription-plans`, `platform-announcements`, `platform-payments`, `platform-settings`) يستدعي `resolveAuth`/`requirePlatformAdmin` يدويًا لأن لها مسارات خاصة (Onboarding، bootstrap المستخدم، صلاحيات المنصة).

الاستثناء الوحيد المقصود: `POST /api/branches` عام لأن الـ Onboarding ينشئ الفرع الأول قبل وجود ملف مستخدم — ومحمي بشرط «الفرع الأول فقط» + rate-limit بالـ IP (`api/_lib/modules/branches.js:50-73`).

---

## حالة الوحدات الحالية

| الوحدة | الحالة الحالية |
|---|---|
| POS / Sales | الأنضج. idempotency + خصم مخزون ذرّي (RPC) + offline queue + ربط بالوردية + تطبيق قوائم الأسعار |
| Products / Inventory | قوية. cache/outbox عبر IndexedDB، soft-delete للمنتجات ذات سجل بيعي |
| Customers | API محمي. ⚠️ **تحصيل الدفعة في الواجهة يفشل صامتًا** (`Customers.tsx:148`) |
| Suppliers | API محمي. ⚠️ **سداد المورد في الواجهة يفشل صامتًا** (`Suppliers.tsx:115`) |
| Purchases | API محمي + FKs مضافة. لا يدعم Offline. ⚠️ **استلام الطلبية غير محقَّق** (`Purchases.tsx:262`) |
| Expenses | API محمي. ⚠️ الحفظ في الواجهة غير محقَّق |
| Bank accounts / Payment terminals | API محمي. ⚠️ الحفظ والحذف في الواجهة غير محقَّقين (4 مواضع) |
| Dashboard | محمي، وأُزيل fallback إلى tenant 1. القراءات ما زالت ثقيلة |
| Reports | محمي، لكن يعتمد على broad reads وفلترة في الذاكرة |
| Subscription | **API آمن الآن** + قيد تفرّد على `tenant_subscriptions`. ⚠️ `choosePlan` غير محقَّق (لكن `submitPayment` محقَّق) |
| Platform Admin | **Schema Drift مُعالَج**. ⚠️ حذف الباقة/الدفع/الإعلان + `admin-activate` غير محقَّقة (5 مواضع) |
| Backups | Schema مُحاذاة الآن؛ `createAndDownload` و`restore` محقَّقان ✅. ⚠️ زر «حفظ سحابي فقط» يعرض نجاحًا كاذبًا. الاستعادة ما زالت **جزئية** (منتجات وعملاء فقط) |
| Offline/Sync | جيد للمبيعات والمنتجات، محدود لباقي النظام (بدون تغيير) |
| Storage/Upload | إثباتات الدفع في bucket **خاص** برابط موقَّت؛ وسائط المنتجات في bucket عام |

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

| الأمر | الحالة الحالية (مُتحقَّق منها 2026-07-25) |
|---|---|
| `npm test` | ✅ ينجح — 27 ملف / 129 اختبار |
| `npm run build` | ✅ ينجح |
| `npm run lint` | ❌ يفشل — 53 خطأ، 20 تحذيرًا (غالبيتها `react-hooks/set-state-in-effect`) |
| `npm audit --audit-level=high` | ❌ يفشل — 7 ثغرات high |

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

### حالة الـ migrations

انحراف السكيما الذي كان موثقًا سابقًا **عولج** عبر ثلاث migrations في 2026-07-25:

| الملف | الغرض |
|---|---|
| `20260725012031_subscription_audit_backups_schema_align.sql` | محاذاة أعمدة Subscription/Audit/Backups مع ما يتوقعه الكود |
| `20260725012743_tenant_subscriptions_unique.sql` | قيد `UNIQUE (tenant_id)` يمنع تكرار الاشتراكات |
| `20260725014333_referential_integrity_and_indexes.sql` | 50 مفتاح أجنبي + 51 فهرس |

**ما زال مطلوبًا:** التحقق من أن الـ migration ledger في بيئة الإنتاج (`supabase_migrations.schema_migrations`) مُطابق لمحتوى `supabase/migrations/` بعد التطبيق. هذا التحقق **لم يُجرَ في بيئة معزولة عن الشبكة** ولا يمكن تأكيده من المستودع وحده.

---

## الأمن والعزل

### الطبقات الموجودة

- Supabase Auth JWT.
- `app_users` profile mapping.
- `withApi` / `requireAuth` / `resolveTenantId` في API.
- RLS policies للـ direct Supabase access.
- Service-role API access.

### الحالة الحالية

- RLS مفعّل ويعمل كدفاع ثانٍ للوصول المباشر من العميل.
- API service-role يتجاوز RLS — لذلك بوابة الـ Auth في `api/_lib/` هي الحد الأمني الفعلي.
- ✅ **كل API modules تملك Auth Gate الآن** (`withApi` أو `resolveAuth`/`requirePlatformAdmin` يدويًا).
- ✅ CORS مقيَّد بـ allowlist بدل `*` (`auth-middleware.js:14-24`).
- ✅ إثباتات الدفع في bucket خاص برابط موقَّت.
- ⚠️ استثناء مقصود واحد: `POST /api/branches` عام للـ Onboarding — مقيَّد بـ «الفرع الأول فقط» + rate-limit (يفشل مفتوحًا عمدًا عند تعطّل جدول السجل).

---

## الملفات التوثيقية المهمة

| الملف | الوصف |
|---|---|
| [`docs/OPEN_ISSUES_INVESTIGATION_2026-07-25.md`](docs/OPEN_ISSUES_INVESTIGATION_2026-07-25.md) | 🟢 **الأحدث** — المشاكل المفتوحة فعليًا بعد PR #12، بدليل ملف+سطر |
| [`docs/BUSINESS_LOGIC_AUDIT.md`](docs/BUSINESS_LOGIC_AUDIT.md) | تدقيق منطق الأعمال — محدَّث بحالة كل بند (11 من 12 مُصلَح) |
| [`docs/RAFD_ENTERPRISE_PRODUCTION_AUDIT.md`](docs/RAFD_ENTERPRISE_PRODUCTION_AUDIT.md) | 🕘 **تاريخي** — تدقيق ما قبل PR #12؛ معظم بنوده عولجت. لا يُستخدم كمصدر للحالة الحالية |
| `docs/audit-for-claude-verification.md` | 🕘 تاريخي — مطالبة تحقق مبنية على التدقيق أعلاه |
| `docs/ARCHITECTURE_ANALYSIS.md` | 🕘 تاريخي — تحليل معماري سابق |
| `docs/FINAL_ARCHITECTURE_ANALYSIS.md` | 🕘 تاريخي — تحليل معماري سابق موسع |
| `docs/SETUP.md` | إعداد البيئة |
| `docs/Infrastructure-Setup-Plan.md` | خطة البنية التحتية |

---

## خارطة الإصلاح — الحالة

المراحل التي كانت مخططة في تقرير التدقيق القديم، وحالتها الفعلية الآن:

| المرحلة | الوصف | الحالة |
|---|---|---|
| Phase 0 | حماية `/api/subscription` والمسارات غير المحمية | ✅ مكتملة |
| Phase 1 | معالجة Schema Drift | ✅ مكتملة (3 migrations) — يتبقّى تأكيد الـ ledger في الإنتاج |
| Phase 2 | إزالة تكرار الاشتراكات | ✅ مكتملة (قيد `UNIQUE`) |
| Phase 3 | توحيد كل modules تحت Auth/Authz | ✅ مكتملة |
| Phase 4 | FKs وindexes | ✅ مكتملة (50 FK + 51 index) |
| Phase 5 | توحيد حالات loading/error/no-tenant | ⚠️ **جزئية** — حالة «لا-tenant» عولجت في 12 صفحة، لكن **حالة الخطأ لم تُعالَج**: `load()` في 17 صفحة بلا `try/finally`، و31 عملية كتابة بلا فحص `res.ok` |
| Phase 6 | توسيع نطاق Offline وconflict handling | ❌ مفتوحة |
| Phase 7 | أداء dashboard/reports/bundle | ❌ مفتوحة (chunk 1,458 kB) |
| Phase 8 | نسخ واستعادة شاملة ومختبرة | ⚠️ جزئية — السكيما مُحاذاة، لكن الاستعادة ما زالت جزئية (منتجات وعملاء فقط) |
| Phase 9 | بوابات CI/CD | ❌ مفتوحة — `lint` و`audit` ما زالا يفشلان |

### الأولوية القادمة المقترحة

بناءً على [تحقيق 2026-07-25](docs/OPEN_ISSUES_INVESTIGATION_2026-07-25.md)، الأولوية الأولى هي **إكمال Phase 5** لأنها تحوي البنود الحرجة الثلاثة المتبقية (دفاتر الحسابات، الورديات، توست الإعدادات الكاذب). الحل الجذري: تمرير مسارات الكتابة عبر `src/lib/apiClient.ts` — وهو موجود ومكتمل بالفعل لكنه غير مستخدم في أي صفحة.

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

آخر `npm audit --audit-level=high` (2026-07-25) كشف **7 ثغرات high**:

**1) `react-router` / `react-router-dom` — تصل إلى حزمة الإنتاج**

- المُثبَّت: `react-router-dom@7.18.1` → `react-router@7.18.1`.
- الثغرة: *React Router: RSC Mode CSRF Bypass Allows Action Execution Before 400 Response*.
- المدى الضعيف `7.12.0 - 8.2.0` يغطي **كل** سلسلة 7.x؛ و`7.18.1` هو أحدث إصدار 7.x متاح. أي: **لا يوجد إصدار مُصلَح دون ترقية كاسرة إلى 8.3+**.
- **قابلية الاستغلال هنا:** الثغرة محصورة بـ RSC Mode. هذا التطبيق **Vite SPA بحت** ولا يستخدم أي من `unstable_*` أو `createStaticHandler` أو `react-router/rsc` (تحقّقنا بالبحث الشامل: صفر نتيجة). فالمسار غير مُفعَّل.
- **الأثر العملي:** بوابة امتثال — أي CI يعتمد `npm audit --audit-level=high` سيحجب النشر.

**2) الست الباقية — أدوات تطوير فقط**

`eslint` → `@eslint/config-array` / `@eslint/eslintrc` → `minimatch` → `brace-expansion` (DoS).
**لا تصل إلى حزمة الإنتاج** ولا تؤثر على المستخدم النهائي.

---

## ملاحظات ختامية

هذا README يعكس حالة النظام الحالية كما ثبتت بقراءة الكود على `main` عند الكوميت `54a9d8c` (دمج PR #12)، وليس وصفًا تسويقيًا لميزات مأمولة ولا نسخًا من تقرير تدقيق قديم.

**للحالة الحالية للمشاكل المفتوحة:**

```text
docs/OPEN_ISSUES_INVESTIGATION_2026-07-25.md
```

**ملاحظة منهجية:** تقارير التدقيق الأقدم في `docs/` تحتفظ بقيمة تاريخية (سياق القرارات وجذور المشاكل)، لكن **معظم بنودها الحرجة عولجت**. لا تُستخدم كمصدر للحالة الحالية دون التحقق من الكود أولًا.
