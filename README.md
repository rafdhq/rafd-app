# رفد | RAFD

**منصة إدارة متاجر التجزئة والبقالة — Offline-first · RTL-first · multi-tenant SaaS · Retail ERP**

> Premium Grocery / Retail / F&B Store Management Platform for **Yemen** and **Saudi Arabia**.

> **حالة هذا المستند:** محدَّث بعد مراجعة منطق الأعمال (`docs/BUSINESS_LOGIC_AUDIT.md`، BL-01..BL-12) وإصلاح جذري لصفحتَي المنتجات/المخزون، Offline-first، رفع الصور، والجلسات. كل بند موثَّق هنا إمّا **مُنفَّذ ومُختبَر فعلياً** (اختبار Vitest حقيقي أو تحقّق مباشر من قاعدة بيانات `rafd-dev`)، أو موسوم صراحةً كقيد/عمل متبقٍّ. لا يوجد وصف لميزة لم تُثبَت.

---

## جدول المحتويات

1. [رؤية المنتج](#1-رؤية-المنتج)
2. [الوعد والمبادئ](#2-الوعد-والمبادئ)
3. [الهوية البصرية](#3-الهوية-البصرية)
4. [المستخدمون والأدوار](#4-المستخدمون-والأدوار)
5. [المعمارية التقنية](#5-المعمارية-التقنية)
6. [حالة الوحدات (Modules)](#6-حالة-الوحدات-modules)
7. [Offline-First والمزامنة](#7-offline-first-والمزامنة)
8. [المصادقة والجلسات](#8-المصادقة-والجلسات)
9. [رفع الملفات والصور](#9-رفع-الملفات-والصور)
10. [المنتجات والمخزون](#10-المنتجات-والمخزون)
11. [الصلاحيات وRLS](#11-الصلاحيات-وrls)
12. [قاعدة البيانات — Migrations](#12-قاعدة-البيانات--migrations)
13. [إصلاحات منطق الأعمال (BL-01..BL-12)](#13-إصلاحات-منطق-الأعمال-bl-01bl-12)
14. [نظام التصميم](#14-نظام-التصميم)
15. [المسارات](#15-المسارات)
16. [المتغيرات البيئية](#16-المتغيرات-البيئية)
17. [التشغيل والاختبار](#17-التشغيل-والاختبار)
18. [النشر](#18-النشر)
19. [حساب الدخول الفعلي](#19-حساب-الدخول-الفعلي)
20. [اتفاقيات التطوير](#20-اتفاقيات-التطوير)
21. [القيود والمشاكل المتبقية](#21-القيود-والمشاكل-المتبقية)
22. [Changelog](#22-changelog)

---

## 1. رؤية المنتج

**رفد** منصة تشغيل يومي + **Retail ERP ذكي** لمتاجر البقالة والتجزئة والمطاعم الخفيفة في اليمن والسعودية: POS لمسي، مخزون كرتون/حبة/وزن، آجل، ولاء، تعدد أسعار، BOM/تصنيع، مساعد AI، i18n AR/EN، تطبيقات جوال، SaaS متعدد المستأجرين.

### العملة الافتراضية
- **YER — الريال اليمني** (مع SAR / USD من الإعدادات).

---

## 2. الوعد والمبادئ

| المبدأ | المعنى | الحالة |
|--------|--------|--------|
| Offline First | Outbox + IndexedDB cache + مزامنة عند عودة الشبكة | ✅ للمبيعات والمنتجات/المخزون (انظر §7) |
| RTL First + i18n | عربية أصيلة + إنجليزية فورية بدون إعادة تشغيل | ✅ |
| Touch First | أهداف لمس ≥ 44px + أصداف جوال | ✅ |
| 3 Clicks Max | وصول سريع من الشريط | ✅ |
| WCAG AA | تباين وتركيز | ✅ |
| Multi-tenant isolation | `tenant_id` + JWT + صلاحيات على طبقة API (المصدر الفعلي للعزل) + RLS كطبقة دفاع ثانية | ✅ — انظر §11 |

---

## 3. الهوية البصرية

- الاسم: `رفد | RAFD`
- Primary Teal `#0d9488` · Accent Sand `#d97706`
- خط: IBM Plex Sans Arabic
- `src/components/brand/Logo.tsx` · `/brand`

---

## 4. المستخدمون والأدوار

| الدور | `role` | مصدر الصلاحيات |
|-------|--------|----------------|
| المالك | `owner` | `*` |
| المدير | `manager` | تشغيل + تقارير + AI + ولاء + أسعار + استيراد |
| الكاشير | `cashier` | POS + ولاء قراءة/كتابة + جوال — **خصم يدوي محدود بسقف 10% من المجموع الفرعي (مفروض على الخادم، انظر BL-08)** |
| المستودع | `warehouse` | مخزون + وصفات/تصنيع + استيراد |
| المحاسب | `accountant` | مالية + AI + تصدير |
| سوبر أدمن | `superadmin` | المنصة كاملة (`*` + `platform:*`) — قد يملك متجراً خاصاً به أيضاً (مالك + سوبر أدمن معاً) |

**مصفوفة الخادم:** `api/_lib/permissions.js`. تُفرض عبر `withApi`/`requireAuth` على كل مسار API حساس (`api/_lib/handler.js` + `api/_lib/auth-middleware.js`).

---

## 5. المعمارية التقنية

```
React 19 + Vite + TS + Tailwind v4
  I18nProvider · AuthContext · TenantContext · SyncContext · SubscriptionContext
        │ installApiAuthFetch يحقن JWT تلقائياً في كل fetch('/api/*')
        ▼
Vercel api/*.js (domain routers) → api/_lib/modules/*.js (handlers)
  withApi(handler, {permissions}) → requireAuth → resolveTenantId → business logic
        │ service-role client (api/_lib/db-client.js) — يتجاوز RLS بتصميم
        ▼
Supabase Auth · Postgres (RLS كطبقة دفاع ثانية) · Storage (bucket عام rafd-media)

Offline: IndexedDB (src/lib/offline/db.ts) — outbox + cache
  ↳ salesQueue.ts (مبيعات) · productsQueue.ts (منتجات/مخزون) · syncEngine.ts (دفع/سحب دوري)
Devices: WebUSB/Serial → ESC/POS
AI/Loyalty/Pricing/BOM: tenant-scoped domain services
Mobile: نفس مسارات SPA بأصداف touch-first
```

### مبدأ عزل المستأجرين — كيف يعمل فعلياً
العزل بين المستأجرين مفروض على **طبقتين مستقلتين**:
1. **طبقة API (الفعلية وقت التشغيل):** كل استدعاء حسّاس يمر عبر `requireAuth`/`resolveTenantId` في `api/_lib/auth-middleware.js`، والتي تشتق `tenant_id` من ملف `app_users` المرتبط بتوكن JWT الحالي، وتمنع أي طلب يحاول تحديد `tenant_id` مغاير (إلا لسوبر أدمن). طبقة الـ API تستخدم مفتاح **service-role** الذي **يتجاوز RLS بالكامل**.
2. **طبقة RLS في Postgres (دفاع ثانٍ):** مفعّلة على كل الجداول الأساسية عبر دوال `current_tenant_id()`/`is_superadmin()` (`SECURITY DEFINER`)، وتحمي فقط من وصول مباشر بمفتاح `anon` (مثل تسريب مفتاح أو استعلام PostgREST مباشر) — لا تُستدعى في المسار الطبيعي للتطبيق لأن الـ API يتجاوزها.

**الخلاصة الصادقة:** إن كانت هناك ثغرة عزل في منطق الـ API نفسه (كما كان الحال في BL-01)، **فإن RLS لا تلتقطها** لأن الـ API لا يمرّ عبرها أصلاً. لذلك ضبط منطق الـ API هو خط الدفاع الحقيقي، وRLS تحمي فقط سيناريو "تسريب مفتاح anon".

---

## 6. حالة الوحدات (Modules)

| الوحدة | الحالة | الدليل |
|--------|--------|--------|
| POS (نقطة البيع) | ✅ يعمل — لمس، باركود، وزن، دفع مقسّم/آجل/تحويل، طباعة ESC/POS، قوائم أسعار (BL-11) | `src/pages/POS.tsx` |
| المنتجات | ✅ مُصلَح جذرياً هذه الدورة (كان عالقاً على التحميل بلا نهاية) — انظر §10 | `src/pages/Products.tsx` + اختبارات §17 |
| المخزون | ✅ مُصلَح جذرياً + Offline-first — انظر §10 | `src/pages/Inventory.tsx` |
| المبيعات/الفواتير | ✅ خصم مخزون ذرّي (BL-02)، رقم فاتورة فريد (BL-05)، ربط وردية (BL-06)، سقف خصم (BL-08) | `api/_lib/modules/sales.js` |
| المرتجعات | ✅ حارس تراكمي يمنع تجاوز الكمية المباعة (BL-04) | `api/_lib/modules/refunds.js` |
| الورديات | ✅ فتح/إغلاق + تسوية نقدية X/Z | `api/_lib/modules/shifts.js` |
| الموردون/المشتريات | ✅ | `api/_lib/modules/suppliers.js`, `purchases.js` |
| العملاء/الآجل | ✅ رصيد + دفتر حركات | `api/_lib/modules/customers.js`, `customer-ledger.js` |
| الجرد (Stocktake) | ✅ | `api/_lib/modules/stocktakes.js` |
| التقارير/P&L | ✅ Excel export | `api/_lib/modules/reports.js` |
| التدقيق (Audit) | ✅ audit المبيعات مُصلَح (BL-03) — كان يفشل صامتاً | `api/_lib/audit.js` (كاتب موحّد) |
| الاشتراكات/SaaS | ✅ ربط جهاز يمنع تكرار التجربة المجانية | `api/_lib/modules/subscription.js` |
| مساعد AI | ✅ محرك قواعد/إحصاء حتمي — ليس LLM سحابي | `api/_lib/modules/ai.js` |
| الولاء | ✅ نقاط/استبدال/مستويات — الربط التلقائي من POS غير منفّذ | `api/_lib/modules/loyalty.js` |
| تعدد الأسعار | ✅ يُطبَّق تلقائياً في POS الآن (BL-11) | `api/_lib/modules/pricing.js` |
| BOM/التصنيع | ✅ خصم مكونات + زيادة منتج نهائي؛ الخصم التلقائي عند بيع المنتج النهائي غير مربوط | `api/_lib/modules/recipes.js` |
| استيراد/تصدير | ✅ CSV/JSON — ملفات `.xlsx` الثنائية تحتاج تحويلاً مسبقاً | `api/_lib/modules/import-export.js` |
| i18n | ✅ هيكل وتنقل مترجم؛ بعض شاشات P0/P1 نصوص عربية ثابتة جزئياً | `src/contexts/I18nContext.tsx` |
| جوال | ✅ أصداف touch-first بنفس الـ SPA | `src/pages/mobile/*` |
| لوحة سوبر أدمن | ✅ منفصلة عبر `/admin/login` | `src/pages/SuperAdmin.tsx` |

---

## 7. Offline-First والمزامنة

### الوضع قبل هذه الدورة
كانت آلية الـ Outbox/IndexedDB موجودة **للمبيعات فقط** (`src/lib/offline/salesQueue.ts`). صفحتا **المنتجات والمخزون لم يكن لديهما أي دعم Offline إطلاقاً**: أي طلب `fetch` مباشر بلا `try/catch` على الشبكة، وبلا قراءة احتياطية من الـ cache.

### الوضع الحالي (مُنفَّذ ومُختبَر)
| الطبقة | الوصف | الملف |
|--------|-------|-------|
| IndexedDB wrapper | `outbox` (طوابير عمليات معلّقة) + `cache` (نسخ محلية للجداول) + `meta` | `src/lib/offline/db.ts` |
| قراءة موحّدة بحالة واضحة | Hook يفرّق بين: لا يوجد متجر / جاهز (قد يكون فارغاً) / خطأ مصادقة (401) / خطأ صلاحية (403) / خطأ خادم / خطأ اتصال — ويسقط تلقائياً لبيانات الـ cache عند الأوفلاين أو فشل الشبكة | `src/hooks/useTenantScopedList.ts` |
| مزامنة المبيعات | إنشاء بيع أوفلاين → outbox + خصم مخزون محلي تفاؤلي (BL-02) | `src/lib/offline/salesQueue.ts` |
| مزامنة المنتجات (جديد) | إنشاء/تعديل/حذف منتج أوفلاين → outbox + تحديث cache تفاؤلي؛ حذف منتج أُنشئ أوفلاين ولم يُزامَن بعد **يُلغي طلب الإنشاء المُعلَّق بدل إرسال حذف لمعرّف لا يعرفه الخادم** | `src/lib/offline/productsQueue.ts` |
| محرك المزامنة | يدفع كل عناصر outbox المعلّقة/الفاشلة بترتيب زمني عند عودة الاتصال، ثم يسحب لقطة حديثة للجداول (منتجات/عملاء/مبيعات) إلى الـ cache | `src/lib/offline/syncEngine.ts` |
| الجلسة | تبقى صالحة أوفلاين عبر `localStorage` (ملف تعريف/متجر/فروع مخزَّنة) | `src/lib/offline/localSession.ts` + §8 |

### إثبات (Vitest حقيقي — ليس افتراضاً)
- `src/hooks/useTenantScopedList.test.tsx` — 9 اختبارات: لا-متجر / جاهز-بلا-عناصر / 401 / 403 / خطأ-خادم / خطأ-اتصال / سقوط أوفلاين على cache دافئ / أوفلاين بلا cache → خطأ واضح بدل تعليق أبدي.
- `src/lib/offline/productsQueue.test.ts` — 10 اختبارات بـ `fake-indexeddb` حقيقي: إنشاء أونلاين/أوفلاين، رفض حقيقي (403) لا يُطابَر، تعديل أوفلاين يُصحّح cache، **حذف منتج أوفلاين قبل المزامنة يُلغي الإنشاء المعلّق بدل تصيير حذف خاطئ**، حذف/تعديل منتج مُزامَن سابقاً يُطابَر بشكل صحيح.

---

## 8. المصادقة والجلسات

- بريد/كلمة مرور + Google OAuth عبر Supabase Auth (`persistSession: true, autoRefreshToken: true`).
- بعد أول دخول أونلاين ناجح، يُخزَّن ملف المستخدم/المتجر/الفروع في `localStorage` (`src/lib/offline/localSession.ts`) بمعزل عن جلسة Supabase نفسها.
- عند إعادة تشغيل المتصفح: `AuthContext` يستدعي `getSession()`؛ إن نجحت (جلسة Supabase مستعادة من `localStorage`) يُعاد جلب الملف الشخصي وتحديث الـ cache. إن فشلت (بلا اتصال، تجديد التوكن تعذّر) **وكان هناك ملف مخزَّن مسبقاً**، يبقى المستخدم داخل النظام بهوية أوفلاين بدل رميه لصفحة الدخول.
- `signOut()` يمسح الـ cache (`clearCachedSession`) **قبل** استدعاء `supabase.auth.signOut()` — يمنع تسريب هوية سابقة لجلسة تالية على نفس الجهاز.
- توكن JWT يُحقَن تلقائياً في أي `fetch('/api/*')` عبر `installApiAuthFetch` (اعتراض عام لـ `window.fetch`) — لا حاجة لتمريره يدوياً من كل صفحة.

**إثبات:** `src/contexts/AuthContext.test.tsx` (5 اختبارات) يمرّر فعلياً حالات: استعادة جلسة بعد "إعادة تشغيل"، أوفلاين مع ملف مخزَّن يبقي الجلسة، `signOut` يمسح الـ cache فعلياً (تحقّق مباشر من `localStorage`)، دخول جديد بعد خروج يُعيد حل ملف جديد. `src/lib/offline/localSession.test.ts` (4 اختبارات) يغطي التخزين/الاسترجاع/المسح.

---

## 9. رفع الملفات والصور

**السلسلة الكاملة (مُتحقَّق منها):** الواجهة تضغط الصورة محلياً (`src/lib/imageCompress.ts` → قماش HTML يعيد الترميز JPEG/WebP بحد أقصى 1024-1280px) → ترميز base64 → `POST /api/upload` (`api/_lib/modules/upload.js`، صلاحية `products:write`، حارس حجم خادم 2.5MB افتراضياً) → `supabase.storage.from('rafd-media').upload()` بمفتاح service-role → رابط عام عبر `getPublicUrl()` → يُحفَظ الرابط في `image_url` (منتج) أو `logo_url` (متجر) عبر `POST/PUT` على `/api/products` أو `/api/tenants` → يُعرَض فوراً في الواجهة (`ProductThumb`, شعار الشريط الجانبي).

### مشكلة أمنية اكتُشفت وأُصلحت هذه الدورة
سياسات RLS على `storage.objects` لحاوية `rafd-media` كانت باسم "Authenticated write/update/delete" لكنها **أُنشئت بلا `TO authenticated`**، فتطبَّق افتراضياً على `public` (يشمل `anon`) — أي أن أي حامل لمفتاح anon العام كان يستطيع الكتابة/التعديل/الحذف مباشرة في الحاوية عبر Storage API، متجاوزاً تحقق الحجم والصلاحية في `upload.js` بالكامل. **لا يؤثر على مسار الرفع الفعلي للتطبيق** (يستخدم service-role الذي يتجاوز RLS أصلاً) لكنه كان ثغرة وصول مباشر حقيقية.
**الإصلاح:** `supabase/migrations/20260722000011_storage_media_policy_hardening.sql` يعيد إنشاء السياسات الثلاث بـ `TO authenticated` — مُطبَّق ومُتحقَّق منه على `rafd-dev` (القراءة تبقى عامة عمداً لعرض الصور بلا مصادقة).

**إثبات:** `api/_lib/modules/upload.integration.test.js` (5 اختبارات على الـ handler الحقيقي غير المعدَّل) — رفع صورة منتج، رفع شعار متجر، رفض ملف أكبر من الحد، تعقيم اسم الملف، رفض بلا مصادقة. `api/_lib/modules/tenants.integration.test.js` يثبت أن حفظ الشعار (`PUT /api/tenants`) لا يزال يعمل بعد تشديد BL-01.

---

## 10. المنتجات والمخزون

### السبب الجذري للمشكلة المُبلَّغ عنها ("الصفحة تفشل")
`Products.tsx`/`Inventory.tsx` كانا يستدعيان:
```js
const load = async () => {
  if (!tenant?.id) return;   // ← خروج بلا setLoading(false)
  setLoading(true); ...
```
عندما لا يُحلّ `tenant` (مثلاً env ناقص على النشر، أو توكن منتهي، أو حساب لم يكتمل إعداده)، تخرج الدالة **دون** إنهاء التحميل، فتبقى الصفحة عالقة على الهيكل الشبحي (Skeleton) **إلى الأبد**. أما فشل الشبكة/الصلاحية/الخادم فكانت جميعها تُختزل لرسالة عامة واحدة "فشل التحميل" بلا تمييز، وبلا أي سقوط احتياطي على بيانات محلية.

### الإصلاح
Hook مشترك جديد (`src/hooks/useTenantScopedList.ts`) يحوّل كل حالة إلى نتيجة نهائية واضحة:

| الحالة | السلوك المعروض | متى تحدث |
|--------|------------------|----------|
| `no-tenant` | شاشة "لا يوجد متجر مرتبط بحسابك بعد" + زر إعادة محاولة | `tenant?.id` غير محلول |
| `ready` (بلا عناصر) | `EmptyState` "لا توجد منتجات" — حالة سليمة وليست خطأ | نجح الجلب، القائمة فارغة فعلياً |
| `error` / `auth` | رسالة "انتهت الجلسة" | 401 من الخادم |
| `error` / `permission` | شاشة صلاحية مميّزة بصرياً | 403 من الخادم |
| `error` / `server` | شاشة خطأ خادم + إعادة محاولة | أي استجابة HTTP فاشلة أخرى |
| `error` / `network` | شاشة اتصال مميّزة + إعادة محاولة | `fetch` نفسه فشل (لا استجابة HTTP) **ولا توجد بيانات محفوظة محلياً** |
| `ready` (من الـ cache) | شريط "أنت تعمل دون اتصال" + البيانات المحفوظة تُعرَض فعلياً | أوفلاين أو فشل شبكي **مع** وجود نسخة محلية سابقة |

كذلك: إنشاء/تعديل/حذف منتج وتوريد/تسوية مخزون تمر الآن عبر `src/lib/offline/productsQueue.ts` (outbox + cache تفاؤلي بدل `fetch` خام صامت الفشل)، وأي خطأ حفظ حقيقي (تحقق/صلاحية) يظهر الآن رسالة مرئية في الحوار بدل الفشل الصامت السابق (`catch(err){console.error(err)}` فقط، بلا أي إشعار للمستخدم).

**إثبات:** انظر §7 (الاختبارات مشتركة مع Offline-First) + `api/_lib/modules/products.integration.test.js` (11 اختباراً على الـ handler الحقيقي): إنشاء يحسب المخزون من الكراتين، بحث بالعربية، فلترة `low_stock`، توريد كراتين (PUT `add_cartons`)، إعادة الجلب بعد "تحديث الصفحة"، حذف صلب لمنتج بلا مبيعات، **Soft-delete لمنتج له مبيعات (BL-07)**، عزل المستأجرين على PUT/DELETE، منع الكاشير من الحذف، وعمل الجلسة الجديدة (محاكاة خروج/دخول) بشكل مطابق.

---

## 11. الصلاحيات وRLS

**السؤال: هل RLS تعمل بانتظام مع نظام المستأجرين بحيث لكل مستأجر مساحة عمل خاصة؟**
**الجواب المُتحقَّق منه مباشرة على `rafd-dev`:** نعم من ناحية تعريف RLS نفسه — مفعّلة على كل الجداول الأساسية (`tenants, app_users, products, sales, sale_items, branches, customers, product_packaging, purchase_items, refund_items, stocktake_lines, recipe_items, ...`) بسياستين لكل جدول:
- `deny_anon_*`: `TO anon USING (false)` — يمنع أي وصول مجهول.
- `tenant_isolation_*`: `TO authenticated USING (tenant_id = current_tenant_id() OR is_superadmin())` — كل مستخدم يرى صفوف مستأجره فقط؛ السوبر أدمن يرى الكل.

الدوال المساعدة `current_tenant_id()`/`is_superadmin()` (`SECURITY DEFINER`) تشتق الهوية من `app_users` عبر `auth_id = auth.uid()` أو `email = jwt.email` بشرط `status='active'`.

**لكن التنفيذ الفعلي للعزل وقت التشغيل يمر عبر طبقة الـ API** (`api/_lib/auth-middleware.js`) لأن كل استدعاءات `/api/*` تستخدم مفتاح **service-role** الذي **يتجاوز RLS بالكامل** (تصميم متعمَّد ليتحكم الخادم بمنطق أعمال أدق من عبارة RLS البسيطة). لذلك RLS طبقة دفاع ثانية تحمي فقط من وصول مباشر بمفتاح anon (تسريب مفتاح، استعلام PostgREST يدوي) — لا تلتقط ثغرة عزل داخل منطق الـ API نفسه، كما ثبت من BL-01 (واجهة `tenants` كانت بلا أي تحقق مصادقة رغم وجود RLS على الجدول) وثغرة سياسات `storage.objects` (§9).

**ثغرة Storage RLS المكتشفة هذه الدورة مُصلَحة** (§9، migration `...011`). **لم تُكتشَف أي ثغرة عزل إضافية** في سياسات RLS الحالية على جداول Postgres نفسها أثناء هذه المراجعة.

---

## 12. قاعدة البيانات — Migrations

جميع الملفات في `supabase/migrations/` **idempotent** ومرقّمة زمنياً؛ آخرها `20260722000011`. الترتيب:

| # | الملف | المحتوى |
|---|-------|---------|
| 1 | `20260722000001_base_schema.sql` | الجداول الأساسية (tenants, branches, app_users, products, sales...) |
| 2 | `20260722000002_storage.sql` | Bucket `rafd-media` + سياسات Storage الأولية |
| 3 | `20260722000003_p0_security.sql` | أعمدة ضريبة/idempotency + RLS أولي |
| 4 | `20260722000004_p1_features.sql` | ورديات، مرتجعات، جرد، دعوات، push |
| 5 | `20260722000005_p2_features.sql` | ولاء، أسعار، BOM، AI |
| 6 | `20260722000006_rls_hardening.sql` | تفعيل RLS على كل الجداول |
| 7 | `20260722000007_rls_tenant_isolation.sql` | سياسات `deny_anon_*` + `tenant_isolation_*` + دوال `current_tenant_id()`/`is_superadmin()` |
| 8 | `20260722000008_admin_bootstrap.sql` | ربط حساب المالك الحقيقي (§19) — متجر حقيقي + فرع + ملف Owner+SuperAdmin + اشتراك فعّال، بلا إنشاء حساب Auth جديد |
| 9 | `20260722000009_bl01_onboarding_ratelimit.sql` | جدول `onboarding_ip_log` لتقييد معدّل POST `/api/tenants` العام (BL-01) |
| 10 | `20260722000010_bl_inventory_sales_integrity.sql` | RPC `pos_apply_stock_delta` (خصم/إضافة مخزون ذرّي)، عمود `sales.shift_id`، فهرس تفرّد رقم الفاتورة |
| 11 | `20260722000011_storage_media_policy_hardening.sql` | تقييد INSERT/UPDATE/DELETE على `storage.objects` لحاوية `rafd-media` إلى دور `authenticated` (§9) |

```bash
supabase login
supabase link --project-ref YOUR_REF
supabase db push   # أو npm run db:push
```

> **ملاحظة تشغيلية:** `.github/workflows/supabase-migrate.yml` يُطبّق الترحيلات تلقائياً عند push إلى فرع `develop` — وهذا الفرع **لم يعد موجوداً** بعد دمجه في `main` (انظر §18). الترحيلات أعلاه طُبِّقت يدوياً على `rafd-dev` عبر Supabase MCP والتحقّق مباشر من قاعدة البيانات. **يلزم تحديث مُشغّل الـ workflow ليشمل `main`** قبل الاعتماد الكلي على النشر التلقائي.

---

## 13. إصلاحات منطق الأعمال (BL-01..BL-12)

مصدر البنود: `docs/BUSINESS_LOGIC_AUDIT.md`. كل بند مُنفَّذ ومُختبَر (Vitest + تحقق مباشر من `rafd-dev` حيث ينطبق).

| # | العنوان | الخطورة | الإصلاح | الملفات |
|---|---------|---------|---------|---------|
| BL-01 | واجهة `tenants` مفتوحة بلا مصادقة | 🔴 | `GET`/`PUT` خلف `resolveAuth` + عزل tenant؛ `POST` يبقى عاماً للـ onboarding مع rate-limit لكل IP | `api/_lib/modules/tenants.js`, migration `...009` |
| BL-02 | خصم مخزون غير ذرّي + لا خصم أوفلاين محلي | 🔴 | RPC `pos_apply_stock_delta` (UPDATE مقفول ذرّي) + خصم تفاؤلي محلي في `salesQueue.ts` | `api/_lib/modules/sales.js`, migration `...010` |
| BL-03 | تدقيق المبيعات معطّل (أعمدة خاطئة) | 🔴 | كاتب تدقيق موحّد على الأعمدة الفعلية + اختبار يكشف انحراف الأعمدة | `api/_lib/audit.js` |
| BL-04 | مرتجع جزئي تراكمي يتجاوز الكمية المباعة | 🟠 | حارس تراكمي (مباع − مُرجَع سابقاً − بنود الطلب) | `api/_lib/refund-math.js`, `refunds.js` |
| BL-05 | رقم فاتورة بلا ضمان تفرّد | 🟠 | فهرس فريد `(tenant_id, branch_id, invoice_number)` + إعادة توليد عند التصادم | migration `...010` |
| BL-06 | مبيعات غير مرتبطة بوردية | 🟠 | ربط تلقائي مرن بالوردية المفتوحة (`sales.shift_id`) — لا يمنع البيع | migration `...010`, `sales.js` |
| BL-07 | حذف منتج صلب رغم ارتباطه بفواتير | 🟠 | Soft-delete (`is_active=false`) عند وجود مبيعات؛ حذف صلب فقط لغير المُباع | `api/_lib/modules/products.js` |
| BL-08 | خصم بلا حد أعلى ولا اعتماد صلاحية | 🟠 | سقف خصم بحسب الدور مفروض على الخادم (كاشير ≤10%، مدير/مالك بلا حد) + رفض 403 + تدقيق | `api/_lib/discount-policy.js` |
| BL-09 | غموض وحدة مخزون الوزن (جرام/كجم) | 🟡 | توحيد على الكجم، إزالة الاستدلال النصي | `sales.js`, `src/lib/inventory/stockDelta.ts` |
| BL-10 | fallback إلى `tenant_id=1` | 🟡 | إزالة الافتراضي؛ الواجهة تُحجَب حتى يُحلّ tenant حقيقي | `TenantContext.tsx`, `POS.tsx` |
| BL-11 | قوائم الأسعار لا تُطبَّق في POS | 🟡 | حلّ السعر تلقائياً (عميل→فرع→قائمة→أساسي) + مُنتقي قائمة | `POS.tsx`, `src/lib/pricing/resolvePrice.ts` |
| BL-12 | لا فحص كفاية مخزون عند البيع | 🟡 | سياسة "بِع ما على الرف" مع تسجيل العجز في `audit_logs` | `sales.js` |

---

## 14. نظام التصميم

التوكنات في `src/index.css` · المكونات في `src/components/ui/*` · الدليل `/brand` · دعم `dir=rtl|ltr` ديناميكي.

---

## 15. المسارات

| المسار | الوصف |
|--------|-------|
| `/pos` | نقطة البيع |
| `/products` | المنتجات |
| `/inventory` | المخزون |
| `/ai` | المساعد الذكي |
| `/loyalty` | الولاء والنقاط |
| `/pricing` | تعدد الأسعار |
| `/recipes` | الوصفات والتصنيع |
| `/import-export` | استيراد/تصدير |
| `/mobile` `/mobile/manager` `/mobile/staff` | تطبيقات الجوال |
| `/shifts` `/refunds` `/stocktake` `/audit` | تشغيل المتجر |
| `/reports` `/subscription` | تقارير/SaaS |
| `/admin/login` `/admin` | بوابة إدارة المنصة (منفصلة عن واجهة المتجر) |

---

## 16. المتغيرات البيئية

> المرجع الرسمي: `.env.example` + `docs/SETUP.md`. لا تغييرات جديدة على المتغيرات المطلوبة هذه الدورة.

### Frontend (Vite — مكشوفة للمتصفح، محمية بـ RLS كطبقة دفاع ثانية)
| المتغير | مطلوب؟ | الوصف |
|---------|--------|-------|
| `VITE_SUPABASE_URL` | ✅ | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Anon key (publishable) |
| `VITE_GOOGLE_CLIENT_ID` | اختياري | Google OAuth Client ID |
| `VITE_SENTRY_DSN` | اختياري | Frontend Sentry |
| `VITE_VAPID_PUBLIC_KEY` | اختياري | Web Push public key |

### Backend (Vercel `api/*` — سري)
| المتغير | مطلوب؟ | الوصف |
|---------|--------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | يطابق `VITE_SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | يطابق `VITE_SUPABASE_ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ سري | يتجاوز RLS — أساس عزل المستأجرين الفعلي (§5، §11) |
| `SENTRY_DSN` | اختياري | Backend Sentry |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | اختياري | Web Push |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | اختياري | WhatsApp Cloud API |

**تحذير تشغيلي مُثبَت هذه الدورة:** إن غاب `SUPABASE_SERVICE_ROLE_KEY` أو `NEXT_PUBLIC_SUPABASE_URL` على بيئة النشر، تفشل **كل** استدعاءات `/api/*` بصمت جزئي (تُسجَّل رسالة خطأ في السجلات فقط) — وهذا يظهر للمستخدم كصفحات منتجات/مخزون عالقة أو فاشلة. تحقّق من هذين المتغيّرين أولاً عند أي إبلاغ عن "الصفحة لا تعمل".

---

## 17. التشغيل والاختبار

```bash
npm install
npm run dev
npm test          # Vitest — 97 اختباراً (23 ملف اختبار)
npm run build     # tsc + vite — إلزامي قبل النشر
npm run preview
```

### تفصيل الاختبارات المضافة/المحدَّثة هذه الدورة
| الملف | يغطي | نوع الإثبات |
|-------|------|--------------|
| `api/_lib/modules/products.integration.test.js` | CRUD منتجات كامل (إنشاء/بحث/فلترة/توريد/حذف صلب/Soft-delete/عزل مستأجرين/صلاحيات/إعادة دخول) | Handler حقيقي غير معدَّل + Supabase وهمي في الذاكرة |
| `api/_lib/modules/upload.integration.test.js` | رفع صورة منتج/شعار متجر، حارس الحجم، تعقيم الاسم، رفض بلا مصادقة | Handler حقيقي |
| `api/_lib/modules/tenants.integration.test.js` | BL-01 (401/403/عزل) + استمرار عمل حفظ الشعار بعده | Handler حقيقي |
| `src/hooks/useTenantScopedList.test.tsx` | 5 حالات تحميل الصفحة + سقوط أوفلاين على cache | Hook حقيقي + `fake-indexeddb` |
| `src/lib/offline/productsQueue.test.ts` | CRUD منتجات أوفلاين + outbox + إلغاء إنشاء معلّق عند الحذف قبل المزامنة | كود حقيقي + `fake-indexeddb` |
| `src/contexts/AuthContext.test.tsx` | استمرار الجلسة عبر إعادة التشغيل/الأوفلاين/الخروج/إعادة الدخول | Context حقيقي |
| `api/audit.test.js` | يكشف انحراف أعمدة `audit_logs` (BL-03) | |
| `api/refund-math.test.js` | حارس المرتجع التراكمي (BL-04) | |
| `api/discount-policy.test.js` | سقف الخصم بحسب الدور (BL-08) | |
| `src/lib/inventory/stockDelta.test.ts` | وحدة مخزون الوزن (BL-09) | |

> **قيد بيئة معروف:** بروكسي الشبكة الصادرة في بعض بيئات التشغيل الآلي (sandboxes) يمنع اتصال HTTPS مباشر بمضيف Supabase (سياسة تنظيمية، تحقّقنا منها عبر نقطة تشخيص البروكسي نفسها). لذلك اختبارات API أعلاه تستخدم عميل Supabase وهمياً في الذاكرة يُشغِّل **كود الـ handler الحقيقي غير المعدَّل** بدل شبكة حقيقية؛ أما حقائق مستوى RLS/المخطط فتحقَّقت مباشرة عبر أدوات Supabase MCP (`execute_sql`/`apply_migration`) الموثَّقة في هذا المستند. في بيئة CI/تطوير عادية بلا هذا القيد، `scripts/acceptance-live.mjs` و`scripts/e2e-acceptance.mjs` يُشغِّلان تدفقات مشابهة عبر شبكة حقيقية فعلياً.

---

## 18. النشر

> **الفرع الرسمي الآن:** `main`. فرع `develop` **دُمِج في `main` وحُذف** — أي مرجع سابق لـ `develop` كفرع تطوير نشط لم يعد صحيحاً.

### النشر المحلي

```bash
git checkout main
cp .env.example .env.local  # املأ مفاتيح rafd-dev
npm ci
npm test && npm run build
npm run dev  # http://localhost:5173
```

### تنفيذ SQL على Supabase

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push   # يطبّق كل ملفات supabase/migrations/ بالترتيب الزمني (§12)
npm run db:check   # يتحقق من tenants, products, sales, bucket rafd-media
```

### نشر Vercel
1. Vercel Dashboard → Import `rafdhq/rafd-app` → Branch `main`.
2. Environment Variables: مفاتيح `rafd-dev` للـ Preview، `rafd-prod` للـ Production.
3. Build: `npm run build` → Output: `dist`.

### Checklist قبل النشر
- [x] `.env.example` موجود وموثّق
- [x] `vercel.json` بدون أسرار
- [x] SQL مرتَّبة ومجرَّبة على `rafd-dev` (§12)
- [ ] تحديث `.github/workflows/supabase-migrate.yml` ليشمل `main` بدل `develop` المحذوف
- [ ] تشغيل SQL على `rafd-prod` قبل أول Beta (إن وُجد مشروع إنتاج منفصل)
- [ ] ضبط Auth Redirect URLs + Google OAuth على الدومين النهائي

---

## 19. حساب الدخول الفعلي

**لا يوجد حساب تجريبي وهمي على هذا الفرع.** الحساب الحقيقي الوحيد المُهيَّأ في `app_users`:

| البريد | الدور | ملاحظة |
|--------|-------|--------|
| `malek9art@gmail.com` | `owner` + `superadmin` معاً | مربوط بحساب Supabase Auth حقيقي موجود مسبقاً (migration `...008`)؛ كلمة المرور مُدارة في Supabase Auth ولا تظهر هنا |

يدخل هذا الحساب عبر `/login` (واجهة المتجر، بصفته owner) **أو** عبر `/admin/login` (بوابة إدارة المنصة، بصفته superadmin) — كلاهما يعمل لأنه يجمع الدورين. أي جدول "حسابات تجريبية" (`demo@rafd.app`/`admin@rafd.app`) في وثائق سابقة كان نصاً افتراضياً غير حقيقي وأُزيل من هذا المستند.

---

## 20. اتفاقيات التطوير

- لا `tenant_id = 1` كافتراضي صامت في منطق الإنتاج (BL-10) — يُحجَب العرض حتى يُحلّ tenant حقيقي.
- كل API حساس: JWT + permission + tenant عبر `withApi`/`requireAuth`.
- بعد أي mutation في صفحة: إعادة جلب أو تحديث cache متفائل واضح — لا فشل صامت بلا رسالة للمستخدم.
- أي صفحة تعتمد على `tenant?.id` يجب أن تُميّز صراحة بين "لا يوجد متجر" و"خطأ" و"قائمة فارغة" (نمط `useTenantScopedList`) — لا إرجاع مبكر يترك `loading=true` للأبد.
- لا Placeholder/TODO في مسارات مكتملة.
- إصلاح أمني/بنيوي حقيقي يُرفَق بدليل (ملف:سطر) وسبب جذري واختبار يكشف رجوعه.

---

## 21. القيود والمشاكل المتبقية

مرتّبة حسب الأولوية:

1. **🔴 نمط "تعليق عند عدم حل tenant" لا يزال موجوداً في ~19 صفحة أخرى** (`Settings.tsx`, `Shifts.tsx`, `Customers.tsx`, `Suppliers.tsx`, ...) بنفس الشكل الذي أُصلح في المنتجات/المخزون فقط. لم يُصلَح هذه الدورة لأنه خارج نطاق الطلب الصريح (المنتجات والمخزون فقط) — `useTenantScopedList` جاهز لإعادة الاستخدام على بقية الصفحات.
2. **🟠 مُشغّل CI للترحيلات (`supabase-migrate.yml`) لا يزال يستهدف فرع `develop` المحذوف** — لن تُطبَّق ترحيلات مستقبلية تلقائياً عند الدفع لـ `main` حتى يُحدَّث.
3. **🟠 اختبارات API الحقيقية عبر الشبكة (`scripts/acceptance-live.mjs`, `scripts/e2e-acceptance.mjs`) لا يمكن تشغيلها من بيئات sandbox تمنع الوصول المباشر لمضيف Supabase** — تعمل فقط من جهاز/CI بلا هذا القيد.
4. **🟡 ربط الولاء التلقائي من POS** غير منفّذ (API جاهز فقط).
5. **🟡 خصم مكونات BOM تلقائياً عند بيع منتج نهائي** غير مربوط بمسار البيع (منفَّذ فقط عند أمر تصنيع صريح).
6. **🟡 استيراد ملفات `.xlsx` الثنائية** يحتاج تحويلاً مسبقاً لـ CSV/XML.
7. **🟡 حجم حزمة الواجهة** > 500kB بعد minification — مرشَّح code-splitting لاحق.
8. **🟡 اعتماد المدير التفاعلي لتجاوز سقف خصم الكاشير (BL-08)** غير منفَّذ — السلوك الحالي رفض صريح (403) بدل تدفّق طلب/اعتماد.

---

## 22. Changelog

### غير مُصدَّر بعد — إصلاحات ما بعد مراجعة منطق الأعمال

#### أمن (🔴)
- BL-01: تأمين `GET`/`PUT` على `/api/tenants` بمصادقة وعزل مستأجرين؛ `POST` العام محمي بـ rate-limit
- تشديد سياسات RLS على `storage.objects` (حاوية `rafd-media`) من `public` إلى `authenticated` للكتابة/التعديل/الحذف

#### موثوقية المبيعات/المخزون (🔴/🟠/🟡)
- BL-02: خصم/إضافة مخزون ذرّي عبر RPC بدل قراءة-ثم-كتابة؛ خصم أوفلاين تفاؤلي للمبيعات
- BL-03: إصلاح تدقيق المبيعات المعطَّل (أعمدة خاطئة)
- BL-04: حارس مرتجع تراكمي يمنع تجاوز الكمية المباعة
- BL-05: تفرّد رقم الفاتورة لكل (مستأجر، فرع)
- BL-06: ربط المبيعات بوردية الكاشير المفتوحة
- BL-07: Soft-delete للمنتجات ذات المبيعات بدل حذف صلب يقطع ربط الفواتير
- BL-08: سقف خصم بحسب الدور مفروض على الخادم
- BL-09: توحيد وحدة مخزون الوزن على الكجم
- BL-10: إزالة fallback `tenant_id=1`
- BL-11: تطبيق قوائم الأسعار تلقائياً في POS
- BL-12: تسجيل عجز المخزون عند السماح بالبيع رغم النقص

#### المنتجات والمخزون + Offline-First (جديد بالكامل)
- إصلاح جذري لتعليق صفحتَي المنتجات/المخزون على التحميل عند عدم حل tenant
- تمييز 5 حالات تحميل مختلفة (لا-متجر/فارغ/مصادقة/صلاحية/خادم/اتصال) بدل رسالة عامة واحدة
- Hook مشترك قابل لإعادة الاستخدام: `useTenantScopedList`
- Offline-first كامل للمنتجات: قراءة من cache عند الأوفلاين، كتابة (إنشاء/تعديل/حذف/توريد) عبر outbox مع تفاؤل متفائل وإلغاء ذكي للإنشاء المعلّق عند الحذف قبل المزامنة
- رسائل خطأ مرئية للمستخدم عند فشل الحفظ/الحذف (كانت تفشل صامتاً)

#### الاختبارات (جديد)
- 97 اختباراً (كانت 31) عبر 23 ملف — إضافات: تكامل handlers حقيقية (products/upload/tenants)، Offline hooks وqueues بـ `fake-indexeddb`، جلسة AuthContext، منطق أعمال بحت (audit/refund-math/discount-policy/stockDelta)

#### قاعدة البيانات
- 3 ترحيلات جديدة idempotent (`...009`, `...010`, `...011`) — مُطبَّقة ومُتحقَّق منها على `rafd-dev`

---

**بُني ليُكمل — لا ليُعاد اختراعه.**
