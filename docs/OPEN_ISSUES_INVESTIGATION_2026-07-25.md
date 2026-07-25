# تحقيق المشاكل المتبقية — RAFD

> **التاريخ:** 2026-07-25
> **الأساس:** `main` عند الكوميت `54a9d8c` (دمج PR #12)
> **الطبيعة:** تحليل فقط — **لم يُعدَّل أي ملف كود في هذا التحقيق**
> **منهجية التحقق:** تتبّع كود سطر-بسطر على الشجرة الحالية + تشغيل فعلي لـ `npm ci` / `npm test` / `npm run build` / `npm run lint` / `npm audit`.

## قيود البيئة — إفصاح صريح

بيئة التحقيق **لا تملك وصولًا كاملًا للإنترنت الخارجي**:

- `registry.npmjs.org` متاح (لذلك `npm ci` و`npm audit` و`npm view` نُفِّذت فعليًا ونتائجها أدناه حقيقية).
- بقية الإنترنت محجوب (`example.com` → فشل TLS)، وبالتالي **لا يوجد Supabase حي ولا مفاتيح إنتاج**.

**النتيجة:** لم يكن ممكنًا إجراء اختبار حي (E2E) بـ tenant تجريبي حقيقي. كل بند أدناه مُثبَت بـ **دليل كود** (ملف + سطر + اقتباس)، ولم يُثبت أي بند بالافتراض. البنود التي تحتاج جهازًا/متصفحًا حقيقيًا (طباعة USB، واتساب) مُصنّفة صراحةً كـ «تحليل كود + سلوك منصات موثّق» وليست «مُختبرة حيًا».

---

## 0. تصحيح القائمة الواردة قبل البدء

القائمة المُسلَّمة كانت **دقيقة جزئيًا فقط**. نتيجة الفحص الفعلي:

| البند في القائمة الأصلية | نتيجة التحقق |
|---|---|
| Shifts.tsx | ✅ مؤكَّد |
| Loyalty.tsx | ✅ مؤكَّد (3 مواضع) |
| Pricing.tsx | ✅ مؤكَّد (موضعان) |
| Recipes.tsx | ⚠️ مؤكَّد جزئيًا — `save()` غير محقَّق، لكن `manufacture()` **يتحقق فعلًا** من `res.ok` |
| Notifications.tsx | ✅ مؤكَّد (4 مواضع: تعليم/حذف + push) |
| Users.tsx (حفظ موظف) | ⚠️ مؤكَّد جزئيًا — `save()` و`revoke()` غير محقَّقين، لكن `sendInvite()` **يتحقق فعلًا** |
| Settings.tsx | ✅ مؤكَّد — وأخطر من الوصف (توست نجاح كاذب) |
| ImportExport.tsx | ❌ **غير صحيح** — الملف يتحقق من `res.ok` في المسارين (سطر 29 و56). لا مشكلة هنا |
| Backup.tsx | ⚠️ مؤكَّد جزئيًا — موضعان غير محقَّقين، لكن `createAndDownload()` و`restore()` **يتحققان فعلًا** |
| SuperAdmin.tsx | ✅ مؤكَّد (5 مواضع من أصل ~12؛ الباقي محقَّق) |

**وسّعنا البحث** فوجدنا **13 موضعًا إضافيًا لم تُذكر إطلاقًا** في: `Branches.tsx`, `Customers.tsx`, `Expenses.tsx`, `Payments.tsx` (4 مواضع), `Suppliers.tsx` (2), `Purchases.tsx`, `Subscription.tsx`, `Onboarding.tsx` (3), `SubscriptionContext.tsx`.

**الإجمالي الفعلي: 31 عملية تحوّل صامتة** (وليس 10 ملفات كما ورد).

---

## 1. النمط الأساسي — فشل صامت في عمليات التحوّل (POST/PUT/DELETE)

### جذر المشكلة

يوجد عميل API صحيح ومكتمل في `src/lib/apiClient.ts` يرمي `ApiError` عند `!res.ok`:

```ts
// src/lib/apiClient.ts:44-51
if (!res.ok) {
  const msg = ... ;
  throw new ApiError(msg, res.status);
}
```

لكن **لا صفحة واحدة من الصفحات المتأثرة تستخدمه**. جميعها تستدعي `fetch()` الخام مباشرة. الاعتراض العام في `src/lib/installApiAuthFetch.ts` يحقن الـ JWT فقط — **لا يفحص الاستجابة إطلاقًا** (سطر 38: `return original(input, init);`).

**النتيجة السلوكية الموحّدة:** عند رد الخادم بـ 400/401/403/409/500، الوعد يُحلّ بنجاح (`fetch` لا يرمي إلا على فشل شبكي)، فيُغلق الحوار، تُمسح النموذج، ويُعاد التحميل — والمستخدم يرى الشاشة تتصرف كأن العملية نجحت، بينما لم يُحفظ شيء.

### 1.1 🔴 حرِج — `Settings.tsx`: توست نجاح كاذب صريح

**الملف/السطر:** `src/pages/Settings.tsx:128-143`

```ts
const save = async () => {
  if (!tenant?.id) return;
  setBusy(true);
  await fetch('/api/tenants', {          // ← سطر 128: لا التقاط للنتيجة
    method: 'PUT', ...
  });
  await refreshTenant();
  setBusy(false);
  setSaved(true);                        // ← سطر 141: نجاح غير مشروط
  setTimeout(() => setSaved(false), 2500);
};
```

وسطر 160-164 يعرض `<SuccessToast title="تم الحفظ" description="تم تحديث إعدادات المتجر والفئات" />`.

**لماذا هذا الأخطر:** الصفحات الأخرى «تصمت»؛ هذه الصفحة **تكذب إيجابيًا**. المستخدم يقرأ «تم الحفظ» بينما `/api/tenants` قد ردّ 403.

**إعادة الإنتاج (دليل كود):** `api/_lib/modules/tenants.js:120-131` — مسار `PUT` يستدعي `resolveAuth(req)` ويرد `auth.status` (401/403) إذا فشل. أي كاشير أو مستخدم بدور غير مصرَّح يفتح `/settings`، يغيّر اسم المتجر، يضغط حفظ → يرى «تم الحفظ» → يحدّث الصفحة → الاسم القديم عاد.

**الأثر على تاجر حقيقي:** يغيّر التاجر تذييل الفاتورة أو العملة أو فئات المنتجات، يرى تأكيد النجاح، ثم يكتشف بعد يوم أن الفواتير المطبوعة كلها بالتذييل القديم. تآكل ثقة مباشر بالنظام.

**الخطورة:** 🔴 حرجة.

---

### 1.2 🔴 حرِج — `Shifts.tsx`: فتح/إغلاق وردية بلا تحقق (تسوية نقدية)

**الملف/السطر:** `src/pages/Shifts.tsx:64-77` (فتح) و`80-95` (إغلاق)

```ts
const open = async () => {
  setBusy(true);
  await fetch('/api/shifts', {           // ← سطر 66
    method: 'POST',
    body: JSON.stringify({ action: 'open', opening_float: floatAmt, ... }),
  });
  setBusy(false);
  setOpenDlg(false);                     // ← الحوار يُغلق دائمًا
  load();
};

const close = async () => {
  if (!openShift) return;
  setBusy(true);
  await fetch('/api/shifts', {           // ← سطر 84
    method: 'POST',
    body: JSON.stringify({ action: 'close', id: openShift.id, closing_counted: counted, ... }),
  });
  setBusy(false);
  setCloseDlg(false);
  load();
};
```

**إعادة الإنتاج:** الكاشير يعدّ الدرج، يُدخل المبلغ المعدود، يضغط «إغلاق وتسوية». إذا رفض الخادم (وردية مغلقة مسبقًا من جهاز آخر / صلاحية `shifts:write` مفقودة / خطأ 500)، يُغلق الحوار ويُعاد التحميل. الجدول ما زال يُظهر «مفتوحة» لكن دون أي رسالة خطأ — والكاشير غالبًا يغادر.

**الأثر على تاجر حقيقي:** هذه شاشة **تسوية النقد**. وردية لم تُغلق فعليًا تعني: لا يوجد سجل عهدة/فرق نقدي لتلك الفترة، وتقارير X/Z ناقصة، ولا يمكن محاسبة الكاشير على العجز. هذا الأثر مالي مباشر وغير قابل للاسترجاع (لا يمكن إعادة عدّ الدرج لاحقًا).

**الخطورة:** 🔴 حرجة.

---

### 1.3 🔴 حرِج — دفاتر الحسابات: تحصيل من عميل / سداد لمورد

**الملفات/الأسطر:**
- `src/pages/Customers.tsx:148` — `collectPayment()` → `POST /api/customer-ledger`
- `src/pages/Suppliers.tsx:115` — `collectPayment()` → `POST /api/supplier-ledger`

كلاهما بنفس النمط: `await fetch(...)` بلا التقاط، ثم `setBusy(false)`، ثم إغلاق وإعادة تحميل.

**لماذا هذا حرِج ولم يُذكر أصلًا:** هاتان العمليتان **تحرّكان أموالًا حقيقية**. التاجر يستلم نقدًا من العميل فعليًا في يده، ثم يسجّل التحصيل في النظام. إذا فشل الطلب صامتًا:
- رصيد العميل يبقى مدينًا بمبلغ استلمه التاجر بالفعل.
- العميل يُطالَب مرة ثانية بنفس المبلغ → نزاع مباشر مع الزبون.
- في اتجاه المورد: التاجر يدفع للمورد ولا يُسجَّل السداد → دفتر المورد يُظهر دينًا مسدَّدًا.

**الأثر على تاجر حقيقي:** خسارة مالية مباشرة أو نزاع تجاري. الأخطر أن `reference` مبني على `Date.now()` (سطر 155 في Customers)، فلا توجد idempotency تسمح باكتشاف الازدواج لاحقًا.

**الخطورة:** 🔴 حرجة. **هذا البند لم يكن في القائمة الأصلية وهو على الأرجح الأخطر ماليًا بعد Shifts.**

---

### 1.4 🟠 متوسطة-عالية — `Users.tsx`: إنشاء موظف + إلغاء دعوة

**الملف/السطر:** `src/pages/Users.tsx:69` (`save()`) و`107` (`revoke()`)

```ts
const save = async () => {
  setBusy(true);
  await fetch('/api/users', { method: 'POST', ... });   // ← سطر 69
  setBusy(false);
  setOpen(false);
  setForm({ full_name: '', email: '', phone: '', role: 'cashier' });  // ← النموذج يُمسح
  load();
};
```

**ملاحظة تصحيحية:** `sendInvite()` (سطر 83-101) **يتحقق فعلًا** من `res.ok` ويعرض `alert(err.error || 'فشل إرسال الدعوة')`. المشكلة محصورة في `save()` و`revoke()`.

**الأثر على تاجر حقيقي:** التاجر يضيف كاشيرًا جديدًا صباح يوم عمل، يرى الحوار يُغلق والنموذج يُمسح، ثم يكتشف أن الموظف غير موجود في القائمة ولا يستطيع الدخول. تعطيل تشغيلي. في حالة `revoke()`، دعوة يُظن أنها أُلغيت تبقى صالحة → **مسألة أمنية**: موظف مفصول يمكنه استخدام الرابط للدخول.

**الخطورة:** 🟠 متوسطة-عالية (بُعد أمني في `revoke`).

---

### 1.5 🟠 متوسطة — `SuperAdmin.tsx`: حذف باقة/دفع/إعلان + تفعيل + تحرير جهاز

**الملف/الأسطر:**

| السطر | العملية | التوست الكاذب |
|---|---|---|
| 367 | `deletePlan()` → DELETE `/api/subscription-plans` | نعم — سطر 372 `showToast('تم حذف الباقة')` |
| 426 | `deletePay()` → DELETE `/api/platform-payments` | لا (صامت) |
| 464 | `deleteAnnouncement()` → DELETE `/api/platform-announcements` | لا (صامت) |
| 478 | `saveTenant()` → POST `admin-activate` | جزئي — راجع أدناه |
| 536 | `releaseDevice()` → POST `release-device` | نعم — سطر 541 `showToast('تم تحديث الجهاز')` |

**الحالة الأخطر — `saveTenant()` (سطر 476-503):**

```ts
if (tenantForm.status === 'active') {
  await fetch('/api/subscription', {      // ← سطر 478: التفعيل الفعلي — غير محقَّق
    method: 'POST',
    body: JSON.stringify({ action: 'admin-activate', tenant_id, plan_code, days, ... }),
  });
}
const res = await fetch('/api/tenants', { method: 'PUT', ... });  // ← سطر 490
if (!res.ok) throw new Error('fail');    // ← سطر 495: هذا فقط هو المحقَّق
```

هذا **تحقق جزئي مضلِّل**: النداء الذي يمنح أيام الاشتراك فعليًا (`admin-activate`) غير محقَّق، بينما النداء الثاني (تحديث حقل `status` النصي) محقَّق. فإذا نجح الثاني وفشل الأول، يظهر التوست «تم تحديث المشترك» ويظهر المتجر كـ `active` في الجدول — **بينما لم تُضَف أي أيام اشتراك في `tenant_subscriptions`**.

**إعادة الإنتاج:** تاجر يحوّل مبلغ الاشتراك → المسؤول يفتح لوحة الإدارة → يضبط الحالة `active` ويحفظ → يرى تأكيد النجاح → التاجر ما زال محجوبًا عن نظامه لأن `subscription_ends_at` لم تُحدَّث.

**الأثر على تاجر حقيقي:** التاجر دفع ولا يستطيع العمل. المسؤول يرى في لوحته أن كل شيء سليم فلا يصدّق الشكوى. تعطيل كامل لمتجر دافع + نزاع دعم.

**الخطورة:** 🟠 متوسطة-عالية (تصبح حرجة عند حدوثها فعلًا لأنها تُعطّل متجرًا دافعًا).

---

### 1.6 🟠 متوسطة — `Loyalty.tsx` (3 مواضع)

`src/pages/Loyalty.tsx:64` (`saveProgram`)، `:75` (`createOffer`)، `:87` (`runAdjust`).

الأخطر هو **`runAdjust`** (سطر 87): يضيف/يخصم نقاط ولاء يدويًا لعميل محدد. فشل صامت هنا يعني أن التاجر وعد الزبون بنقاط تعويضية أمامه ولم تُضَف. `saveProgram` (تعديل معدّل النقاط) فشله يعني أن كل المبيعات اللاحقة تُحتسب بالمعدّل القديم.

**الخطورة:** 🟠 متوسطة.

---

### 1.7 🟠 متوسطة — `Pricing.tsx` (موضعان)

`src/pages/Pricing.tsx:63` (`seed`) و`:76` (`saveOne`).

`saveOne` يحفظ سعر منتج في قائمة أسعار (جملة/نصف جملة/VIP). فشل صامت = التاجر يظن أنه حدّث سعر الجملة، والـ POS يبيع بالسعر القديم.

**سياق مهم:** التقرير القديم (BL-11) ادّعى أن POS لا يطبّق قوائم الأسعار إطلاقًا. **هذا لم يعد صحيحًا** — `src/pages/POS.tsx:257-270` يستدعي `resolvePrice` فعليًا مع `priceLists`/`productPrices`/`customerOverrides`/`branchOverrides`. لذلك فشل الحفظ الصامت هنا **يترجم فعليًا** إلى بيع بسعر خاطئ (لم يكن كذلك سابقًا).

**الأثر:** بيع بسعر تجزئة لعميل جملة أو العكس → فقدان هامش أو شكوى عميل.

**الخطورة:** 🟠 متوسطة.

---

### 1.8 🟠 متوسطة — `Payments.tsx` (4 مواضع، لم تُذكر أصلًا)

`src/pages/Payments.tsx:85` (`saveBank`)، `:104` (`saveTerminal`)، `:128` (`removeBank`)، `:138` (`removeTerminal`).

عمليتا الحذف تسبقهما `confirm()` فقط. المستخدم يؤكد الحذف، يختفي التأكيد، تُعاد القائمة — وإذا فشل الحذف يبقى الصف. لكن الأخطر أن حساب بنكي **يُظن أنه حُذف** يبقى معروضًا كخيار دفع في POS.

**الخطورة:** 🟠 متوسطة.

---

### 1.9 🟡 منخفضة-متوسطة — بقية المواضع

| الملف/السطر | العملية | ملاحظة |
|---|---|---|
| `Notifications.tsx:41` | `markAll()` PUT | فشل = الشارة لا تُصفَّر |
| `Notifications.tsx:50` | `markOne()` PUT | نفس الأثر |
| `Notifications.tsx:97` | `subscribe` push | **مضلِّل**: سطر 108 يعرض «تم تفعيل إشعارات الدفع» بلا تحقق |
| `Notifications.tsx:118` | `broadcast` | بث إشعار لكل الموظفين قد لا يصل |
| `Recipes.tsx:79` | `save()` إنشاء وصفة | (`manufacture()` سطر 100-113 محقَّق ✅) |
| `Branches.tsx:36` | `save()` فرع جديد | يستدعي `refreshTenant()` بعده |
| `Customers.tsx:112` | `save()` عميل جديد | |
| `Expenses.tsx:44` | `save()` مصروف | يؤثر على تقرير الأرباح |
| `Suppliers.tsx:81` | `save()` مورد | |
| `Purchases.tsx:262` | `receive()` PUT — استلام طلبية | **يزيد المخزون**؛ فشل صامت = بضاعة مستلمة فعليًا وغير مُدخلة (`create()` سطر 192 محقَّق ✅) |
| `Backup.tsx:57` | نسخة مجدولة تلقائية | `try/catch` فارغ — مقبول لأنها خلفية |
| `Backup.tsx:171` | «حفظ سحابي فقط» | سطر 182 `setDone(...)` = **توست نجاح كاذب** |
| `Subscription.tsx:156` | `choosePlan()` | (`submitPayment()` سطر 219-240 محقَّق ✅) |
| `Onboarding.tsx:297` | تحديث ملف المالك (PUT) | مسار «مستخدم موجود» غير محقَّق بينما مسار الإنشاء (سطر 312-329) محقَّق — **عدم تناسق** |
| `Onboarding.tsx:333` | بذر حالة المزامنة | ثانوي |
| `Onboarding.tsx:340` | إشعار الترحيب | ثانوي |
| `SubscriptionContext.tsx:68` | `init-trial` | `.catch(() => undefined)` صريح — مقصود |

**الأخطر في هذا الجدول: `Purchases.tsx:262`** — استلام طلبية يزيد المخزون. فشل صامت يعني بضاعة على الرف غير موجودة في النظام → نفاد وهمي، وطلب شراء مكرر، وجرد خاطئ.

---

## 2. مشكلة مستقلة مكتشَفة — انهيار حالة الـ loading عند أول خطأ شبكي

**هذه ليست في القائمة المُسلَّمة، وهي متميّزة عن باغ الـ loading الذي أُصلح في PR #12.**

PR #12 عالج الحالة التي يكون فيها `tenant?.id` غائبًا (بإضافة `setLoading(false)` قبل `return`) — وهذا **مُطبَّق فعلًا** في 12 صفحة (تحققنا: `Shifts.tsx:46`, `Branches.tsx:23`, `Customers.tsx:70`, `Expenses.tsx:31`, `Payments.tsx:44`, `Purchases.tsx:70`, `Refunds.tsx:28`, `Reports.tsx:44`, `Stocktake.tsx:39`, `Suppliers.tsx:55`, `AuditLogs.tsx:29`).

**لكن الحالة الثانية ما زالت مفتوحة:** دوال `load()` في **17 صفحة** لا تلفّ الـ `fetch` بـ `try/finally`. نموذج `Shifts.tsx:44-57`:

```ts
const load = useCallback(async () => {
  if (!tenant?.id) { setLoading(false); return; }
  setLoading(true);
  const [listRes, openRes] = await Promise.all([   // ← إذا رمى هذا…
    fetch(`/api/shifts?tenant_id=${tenant.id}`),
    fetch(`/api/shifts?tenant_id=${tenant.id}&open_only=1`),
  ]);
  if (listRes.ok) setItems(await listRes.json());
  ...
  setLoading(false);                                // ← …لا يُنفَّذ أبدًا
}, [tenant?.id]);
```

`fetch` يرمي فعليًا عند انقطاع الشبكة أو فشل DNS/TLS. عندها `setLoading(false)` لا يُستدعى، و`if (loading) return <PageSkeleton />` يُبقي الصفحة على هيكل تحميل **إلى الأبد** بلا رسالة ولا زر إعادة محاولة.

**الصفحات المتأثرة (17):** `AuditLogs`, `Branches`, `Customers`, `Expenses`, `Invoices`, `Loyalty`, `Notifications`, `Payments`, `Pricing`, `Purchases`, `Recipes`, `Refunds`, `Reports`, `Shifts`, `Stocktake`, `Suppliers`, `Users`.

**الأثر على تاجر حقيقي:** متجر بإنترنت متقطع (شائع جدًا في السوق المستهدف). الكاشير يفتح «الورديات» أثناء انقطاع لحظي → شاشة هيكلية دائمة → يظن أن النظام معطّل → يعيد تشغيل الجهاز. لا يوجد أي مؤشر يقول «تعذّر الاتصال، أعد المحاولة».

**ملاحظة مقارنة:** `Backup.tsx` (سطر 39-41) و`SubscriptionContext.tsx` (سطر 55-62) **يستخدمان `finally` بشكل صحيح** — فالنمط الصحيح موجود في المستودع لكنه غير معمَّم.

**الخطورة:** 🟠 متوسطة (عالية التكرار في بيئة إنترنت ضعيف).

---

## 3. WebUSB / WebSerial — الطباعة الحرارية الحقيقية

**التصنيف:** تحليل كود + سلوك منصات موثّق. **لم يُختبر حيًا** (لا متصفح ولا طابعة في البيئة).

**الملف:** `src/lib/escpos/printer.ts`

```ts
// سطر 15-21
function hasWebUsb() { return typeof navigator !== 'undefined' && 'usb' in navigator; }
function hasWebSerial() { return typeof navigator !== 'undefined' && 'serial' in navigator; }

// سطر 67-78
export async function sendRawToPrinter(data, transport = 'auto') {
  const prefer = transport === 'auto'
    ? (hasWebUsb() ? 'webusb' : hasWebSerial() ? 'webserial' : 'browser') : transport;
  ...
  throw new Error('NO_RAW_TRANSPORT');
}
```

**التقييم:** كشف القدرات مُنفَّذ بشكل صحيح، والتدهور التدريجي (graceful degradation) **موجود ويعمل**: `printEscPosOrBrowser` (سطر 121-149) يلتقط الفشل ويسقط تلقائيًا إلى `printThermalReceipt` (طباعة HTML عبر المتصفح). فالفاتورة تُطبع في كل الحالات.

**الفجوة الحقيقية — درج النقد فقط:**

```ts
// printer.ts:151-162
export async function openCashDrawer(transport = 'auto') {
  try { await sendRawToPrinter(buildOpenDrawerCommand(0), transport); return { ok: true, ... }; }
  catch (err) {
    return { ok: false, mode: 'unsupported', error: '...Cash drawer requires USB/Serial ESC/POS printer' };
  }
}
```

الدالة تُرجع كائن خطأ منظّمًا — **لكن المستدعي يتجاهله**:

```ts
// src/pages/POS.tsx:460-463
if (result.mode === 'browser' && posSettings.openCashDrawer) {
  await openCashDrawer('auto');     // ← القيمة المُعادة مُهمَلة تمامًا
}
```

**الأثر على تاجر حقيقي:** التاجر يفعّل «فتح الدرج تلقائيًا» في الإعدادات. على Chrome/Edge سطح المكتب يعمل. على **Safari أو Firefox أو أي متصفح جوال** (`navigator.usb`/`navigator.serial` غير موجودين) الدرج لا يُفتح ولا تظهر أي رسالة — الكاشير يقف أمام الزبون ينتظر درجًا لن يُفتح. الإعداد يبدو مُفعَّلًا في الواجهة بينما هو غير قابل للتنفيذ على هذه المنصة.

**الخطورة:** 🟡 منخفضة-متوسطة (الفاتورة تُطبع؛ الفجوة في الدرج + غياب أي إفصاح للمستخدم عن عدم دعم متصفحه).

---

## 4. مشاركة واتساب — خطوات يدوية

**التصنيف:** تحليل كود. مؤكَّد بالكامل.

**الملف:** `src/lib/documentExport.ts:124-171`

```ts
export function openWhatsAppWithText(phone, text) {
  const url = cleaned ? `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}` : ...;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function shareDocumentBundle({ element, phone, text, baseName, mode }) {
  ...
  await downloadElementAsPng(element, baseName);        // 1) ينزّل الصورة
  openWhatsAppWithText(phone,
    `${text}\n\n📎 تم تنزيل الصورة — أرفقها من المعرض في المحادثة.`);   // 2) يطلب من المستخدم الإرفاق يدويًا
}
```

**التأكيد:** الرسالة النصية نفسها تعترف بالقيد. لا يوجد أي استخدام لـ `navigator.share` أو `navigator.canShare` في المستودع بأكمله (تحققنا بالبحث الشامل — صفر نتيجة).

**لماذا هذا قيد حقيقي:** Web Share API Level 2 (`navigator.share({ files })`) مدعوم على Chrome Android وiOS Safari، وكان سيسمح بمشاركة الصورة **مباشرة** إلى محادثة واتساب في خطوة واحدة. البنية التحتية موجودة (`getElementDataUrl` في سطر 118 يُنتج canvas بالفعل) لكن المسار غير مستخدم.

**الأثر على تاجر حقيقي:** إرسال كشف حساب لعميل = 4 خطوات يدوية (تنزيل → فتح واتساب → مرفق → تصفح المعرض). على سطح المكتب أسوأ: الملف في مجلد التنزيلات وواتساب ويب يحتاج سحبًا يدويًا. تاجر يرسل 30 كشفًا شهريًا يفقد وقتًا معتبرًا، والاحتمال الأكبر أنه يتوقف عن استخدام الميزة.

**نقطة إضافية:** `documentExport.ts:143` يحتوي خطأ إملائيًا في النص العربي الظاهر للمستخدم: `"(صفحة واحدةحدة)"` — تكرار «حدة».

**الخطورة:** 🟡 منخفضة (وظيفي/تجربة استخدام، لا فقدان بيانات).

---

## 5. ثغرة react-router — تأكيد فعلي

**التصنيف:** مُختبَر فعليًا (`npm audit` نُفِّذ ضد registry حي).

```
react-router      high  7.12.0 - 8.2.0
  → React Router: RSC Mode CSRF Bypass Allows Action Execution Before 400 Response
react-router-dom  high  >=7.12.0-pre.0
```

**المُثبَّت فعليًا:** `react-router-dom@7.18.1` → `react-router@7.18.1`.

**أحدث إصدار متاح في سلسلة 7.x:** `7.18.1` (تحققنا عبر `npm view react-router versions`). أي: **لا يوجد إصدار مُصلَح ضمن 7.x**. المدى الضعيف `7.12.0 - 8.2.0` يغطي كل الإصدارات المتاحة، والخروج منه يتطلب ترقية إلى 8.3+ (تغيير كاسر).

**✅ تأكيد ادعاء المستخدم:** «المدى الضعيف يغطي كل سلسلة 7.x المستخدمة» — **صحيح تمامًا**.

**لكن — تقييم قابلية الاستغلال الفعلية في هذا التطبيق:**

الثغرة محصورة بـ **RSC Mode** (React Server Components). فحصنا المستودع:

- كل الاستيرادات من `react-router-dom` فقط، ومحصورة في: `BrowserRouter`, `Navigate`, `Route`, `Routes`, `Link`, `NavLink`, `Outlet`, `useNavigate`, `useLocation`.
- **صفر** استخدام لـ `unstable_*` أو `createStaticHandler` أو `react-router/rsc` أو `@react-router/server` (بحث شامل — لا نتائج).
- البناء هو Vite SPA بحت (`npm run build` = `tsc -b && vite build`)، والراوتر يعمل على العميل فقط. الخادم عبارة عن دوال `api/*.js` منفصلة لا تمرّ بالراوتر إطلاقًا.

**الخلاصة الدقيقة:** الثغرة **حقيقية وغير قابلة للحل بالترقية داخل 7.x**، لكن **مسار الاستغلال غير مُفعَّل في هذا التطبيق** لأن RSC Mode غير مستخدم. الأثر العملي الحالي: `npm audit --audit-level=high` يفشل → أي بوابة CI/CD تعتمد عليه ستحجب النشر.

**الخطورة:** 🟡 منخفضة عمليًا (بوابة امتثال) / 🟠 متوسطة كدَين تقني يجب تتبّعه.

**بقية الثغرات السبع** كلها في أدوات التطوير فقط (`eslint` → `@eslint/config-array`/`@eslint/eslintrc` → `minimatch` → `brace-expansion` DoS). **لا تصل إلى حزمة الإنتاج** ولا تؤثر على المستخدم النهائي.

---

## 6. ملاحظة أمنية إضافية — `branches.js` POST عام

**اكتُشف أثناء التوسّع، لم يُذكر في القائمة.**

`api/_lib/modules/branches.js:118-121` يعلن `publicMethods: ['POST']`.

هذا **قرار تصميمي مقصود وموثَّق** (التعليق سطر 50-51): الـ Onboarding ينشئ الفرع الأول قبل وجود ملف مستخدم. والحماية معقولة:

- إذا كان الطلب غير مصادَق، يُحسب عدد الفروع الموجودة للـ tenant؛ إذا كان > 0 → 401 (سطر 56-63). فالمسار العام يعمل **مرة واحدة فقط** لكل tenant.
- يوجد rate-limit بالـ IP: 10 محاولات/ساعة (`ONBOARDING_MAX_PER_HOUR`, سطر 5, 13-29).

**الفجوة المتبقية:** الـ rate-limit يفشل مفتوحًا عمدًا (`catch { return false; }`, سطر 26-28) و«fail open» موثَّق في التعليق سطر 12. فإذا تعطّل جدول `onboarding_ip_log` يسقط الحد بالكامل. الأثر محدود (يظل الفرع الأول فقط لكل tenant موجود مسبقًا).

**الخطورة:** 🟡 منخفضة. **مقبول كما هو** — مذكور للاكتمال، ليس عيبًا.

---

## 7. تأكيد أن إصلاحات PR #12 موجودة فعليًا

تحققنا من كل بند ادّعاه المستخدم بدل افتراضه:

| الإصلاح المُدَّعى | التحقق الفعلي |
|---|---|
| حماية modules مكشوفة | ✅ 30 module تحت `withApi`؛ الـ 7 الباقية (`tenants`, `users`, `subscription`, `subscription-plans`, `platform-*`) تستخدم `resolveAuth`/`requirePlatformAdmin` يدويًا — تحققنا من كل واحد |
| إصلاح انحراف السكيما | ✅ `20260725012031_subscription_audit_backups_schema_align.sql` |
| تكرار بيانات الاشتراك | ✅ `20260725012743_tenant_subscriptions_unique.sql` — قيد `UNIQUE (tenant_id)` |
| 50 FK + 51 index | ✅ `20260725014333_referential_integrity_and_indexes.sql` — عددنا 50 `REFERENCES` و51 `CREATE INDEX` |
| باغ loading بـ11 صفحة | ✅ نمط `if (!tenant?.id) { setLoading(false); return; }` في 12 صفحة (راجع §2 للجزء المتبقي) |
| خصوصية إثباتات الدفع | ✅ `upload.js:30` — bucket خاص `rafd-payment-proofs`؛ `SuperAdmin.tsx:768` يجلب رابطًا موقَّتًا عبر `action=proof-url` |
| تقييد CORS | ✅ `auth-middleware.js:14-24` — allowlist بأنماط regex |

**كما تحققنا من بطلان بنود قديمة في `docs/BUSINESS_LOGIC_AUDIT.md`:** BL-01 (مُصلَح، `tenants.js:126`)، BL-02 (مُصلَح، RPC ذرّي `pos_apply_stock_delta` في `sales.js:242`)، BL-03 (مُصلَح، `writeAudit` بأعمدة صحيحة)، BL-04 (مُصلَح، تراكمي `refunds.js:36-53`)، BL-06 (مُصلَح، `resolveOpenShiftId` + `shift_id` في `sales.js:133-138`)، BL-07 (مُصلَح، soft-delete `products.js:200`)، BL-09 (مُصلَح، `sold_by_weight` عمود صريح)، BL-10 (مُصلَح، `?? null` بدل `?? 1` في `TenantContext.tsx:50`)، BL-11 (مُصلَح، `POS.tsx:257-270`)، BL-12 (مُصلَح، تسجيل `inventory.deficit`).

**ما زال مفتوحًا من التقرير القديم:** BL-05 فقط — لا يوجد قيد فريد على `invoice_number`؛ الفهرس الوحيد `idx_sales_invoice` (في `20260722000001_base_schema.sql:220`) **غير فريد**. التفرّد مضمون على `idempotency_key` فقط.

---

## 8. نتائج التحقق الآلي (مُنفَّذة فعليًا)

| الأمر | النتيجة |
|---|---|
| `npm ci` | ✅ نجح |
| `npm test` | ✅ نجح — 27 ملف / 129 اختبار |
| `npm run build` | ✅ نجح (تحذير حجم chunk: 1,458 kB) |
| `npm run lint` | ❌ فشل — 53 خطأ، 20 تحذير |
| `npm audit --audit-level=high` | ❌ فشل — 7 ثغرات high |

**تفصيل أخطاء الـ lint:** الغالبية العظمى (~31) من `react-hooks/set-state-in-effect` («Calling setState synchronously within an effect»)، إضافة إلى 4 من `Cannot call impure function during render`، و3 `Compilation Skipped: Existing memoization could not be preserved`، و5 `react-refresh/only-export-components`، وخطآن في `vite.config.ts` (`@ts-ignore` بدل `@ts-expect-error`، وكتلة فارغة).

**ملاحظة:** لا يوجد أي خطأ lint في `api/`. كلها في `src/`.

---

## 9. الخلاصة المرتبة حسب الأولوية

| # | المشكلة | الخطورة | الملفات |
|---|---|---|---|
| 1 | تحصيل/سداد دفاتر الحسابات بلا تحقق — نقود حقيقية | 🔴 حرجة | `Customers.tsx:148`, `Suppliers.tsx:115` |
| 2 | فتح/إغلاق وردية بلا تحقق — تسوية نقدية | 🔴 حرجة | `Shifts.tsx:66,84` |
| 3 | توست نجاح كاذب في الإعدادات | 🔴 حرجة | `Settings.tsx:128-141` |
| 4 | تفعيل اشتراك من لوحة الإدارة بلا تحقق | 🟠 عالية | `SuperAdmin.tsx:478` |
| 5 | استلام طلبية شراء بلا تحقق — يزيد المخزون | 🟠 عالية | `Purchases.tsx:262` |
| 6 | إنشاء موظف / إلغاء دعوة بلا تحقق (أمني) | 🟠 عالية | `Users.tsx:69,107` |
| 7 | انهيار الـ loading عند خطأ شبكي — 17 صفحة | 🟠 متوسطة | راجع §2 |
| 8 | 20 عملية تحوّل صامتة أخرى | 🟠 متوسطة | راجع §1.6-1.9 |
| 9 | درج النقد يفشل صامتًا خارج Chrome/Edge | 🟡 منخفضة-متوسطة | `POS.tsx:460-463` |
| 10 | واتساب يتطلب إرفاقًا يدويًا (لا Web Share API) | 🟡 منخفضة | `documentExport.ts:136-171` |
| 11 | react-router 7.x بلا إصدار مُصلَح (RSC غير مستخدم) | 🟡 منخفضة عمليًا | `package.json` |
| 12 | `invoice_number` بلا قيد تفرّد (BL-05 المتبقي) | 🟡 منخفضة | `base_schema.sql:220` |
| 13 | 53 خطأ lint | 🟡 منخفضة | `src/` |

---

> **لم يُعدَّل أي ملف كود في هذا التحقيق.** المخرجات: هذا التقرير + تحديث ملفات التوثيق فقط.
