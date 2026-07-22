# RAFD Supabase - دليل قاعدة البيانات

> **RAFD | رفد - Retail ERP - Supabase Development Setup**
> هذا المجلد يحتوي على كل سكربتات تهيئة قاعدة البيانات.

## الترتيب الإلزامي للتنفيذ

نفّذ الملفات **بالترتيب التالي** في Supabase SQL Editor. جميع الملفات **idempotent** (آمنة لإعادة التنفيذ).

```text
1) 000_base_schema.sql   → الجداول الأساسية (متاجر، فروع، مستخدمون، منتجات، مبيعات...)
2) p0_security.sql      → أعمدة الضريبة + idempotency + تفعيل RLS
3) p1_features.sql      → ورديات، مرتجعات، جرد، دعوات، دفع، اشتراكات
4) p2_features.sql      → ولاء، أسعار متعددة، وصفات/BOM، AI
```

## لماذا هذا الترتيب؟

| الملف | يعتمد على | ماذا يفعل |
|------|----------|----------|
| `000_base` | لا شيء | ينشئ كل الجداول الأساسية المطلوبة لـ P0. بدونها ستفشل P0 لأنه يعتمد `ALTER TABLE sales` |
| `p0_security` | `000_base` | يضيف `idempotency_key`, `tax_rate`, `weight_g`, `server_version` + يفعل RLS على الجداول الحساسة |
| `p1_features` | `p0_security` | جداول P1 التجارية (cashier_shifts, refunds, stocktake, invites, push, whatsapp...) |
| `p2_features` | `p1_features` | جداول P2 التميزية (loyalty_*, price_lists, recipes, manufacturing_orders, ai_conversations) |

## كيفية التنفيذ على Supabase مشروع جديد (rafd-dev)

### الخطوة 1: إنشاء مشروع Supabase

1. اذهب إلى https://supabase.com/dashboard
2. New Project → الاسم المقترح `rafd-dev` (للتطوير) + Region `eu-central-1` (أقرب لليمن/السعودية)
3. انتظر 2-3 دقائق حتى يصبح جاهزاً
4. انسخ `Project URL` و `anon key` و `service_role key` من Settings → API

### الخطوة 2: تنفيذ SQL

1. افتح Supabase Dashboard → SQL Editor → New Query
2. انسخ محتوى `000_base_schema.sql` كاملاً → Run (يجب أن ترى Success)
3. انسخ `p0_security.sql` → Run
4. انسخ `p1_features.sql` → Run
5. انسخ `p2_features.sql` → Run

> **نصيحة**: يمكنك تشغيلها جميعاً كملف واحد بدمجها، لكن الترتيب مهم.

### الخطوة 3: إنشاء Storage Bucket

الكود يتوقع bucket باسم `rafd-media` لصور المنتجات وشعارات المتاجر.

```sql
-- تنفيذ في SQL Editor أو عبر Dashboard → Storage → New Bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('rafd-media', 'rafd-media', true) ON CONFLICT (id) DO NOTHING;

-- سياسة قراءة عامة (الصور عامة)
CREATE POLICY "Public read rafd-media" ON storage.objects FOR SELECT USING (bucket_id = 'rafd-media');

-- سياسة كتابة للمستخدمين المصادق عليهم (عبر service_role سيتجاوزها، لكن نضيفها للحماية)
CREATE POLICY "Authenticated write rafd-media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'rafd-media');
CREATE POLICY "Authenticated update rafd-media" ON storage.objects FOR UPDATE USING (bucket_id = 'rafd-media');
CREATE POLICY "Authenticated delete rafd-media" ON storage.objects FOR DELETE USING (bucket_id = 'rafd-media');
```

أو أنشئه من Dashboard → Storage → New Bucket → Name: `rafd-media` → Public: Yes.

### الخطوة 4: ضبط Auth

- Dashboard → Authentication → URL Configuration
  - Site URL: `http://localhost:5173` (للتطوير) أو `https://YOUR_DOMAIN`
  - Redirect URLs: أضف `http://localhost:5173/*` و `http://localhost:5173/auth/callback`
  - و `https://*.vercel.app/*` للـ Preview

- إذا تستخدم Google OAuth:
  - Authentication → Providers → Google → Enable
  - ضع Client ID و Client Secret من Google Cloud Console

## التحقق من الجاهزية

شغّل هذا الاستعلام للتأكد من وجود كل الجداول:

```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- يجب أن ترى على الأقل:
-- tenants, branches, app_users, products, product_packaging, customers, customer_ledger,
-- suppliers, supplier_ledger, sales, sale_items, expenses, bank_accounts, payment_terminals,
-- purchases, purchase_items, backups, audit_logs, sync_status, notifications, tenant_catalog,
-- cashier_shifts, refunds, refund_items, stocktake_sessions, stocktake_lines, user_invites,
-- push_subscriptions, whatsapp_outbox, loyalty_programs, loyalty_accounts, loyalty_ledger,
-- loyalty_offers, price_lists, product_prices, customer_price_overrides, branch_price_overrides,
-- recipes, recipe_items, manufacturing_orders, ai_conversations, platform_settings,
-- subscription_plans, tenant_subscriptions, subscription_payments, platform_announcements,
-- platform_payment_methods, device_bindings
```

## إنشاء مستخدم تجريبي (اختياري)

```sql
-- 1. أنشئ مستخدم في Auth → Users → Add User (email: demo@rafd.app / password: password123)
-- 2. انسخ auth id من Auth
-- 3. أنشئ tenant ثم app_user:

INSERT INTO tenants (name, name_ar, currency, plan, status) 
VALUES ('متجر تجريبي', 'متجر تجريبي', 'YER', 'growth', 'active') RETURNING id;

INSERT INTO branches (tenant_id, name, name_ar, is_main) VALUES (1, 'Main Branch', 'الفرع الرئيسي', true);

INSERT INTO app_users (tenant_id, auth_id, email, full_name, role, status) 
VALUES (1, 'AUTH_ID_FROM_SUPABASE_AUTH', 'demo@rafd.app', 'Demo Owner', 'owner', 'active');
```

أو استخدم شاشة Onboarding في `/onboarding` إذا كانت مفعلة.

## الانتقال إلى الإنتاج (rafd-prod)

كرر نفس الخطوات لمشروع ثانٍ باسم `rafd-prod` بنفس الـ Region.
- لا تستخدم نفس مفاتيح Dev في Prod.
- في Vercel → Production env ضع مفاتيح Prod فقط.
- في Vercel → Preview env ضع مفاتيح Dev.

## مشاكل شائعة

| المشكلة | الحل |
|---------|------|
| `relation does not exist` | تأكد أنك نفذت `000_base_schema.sql` أولاً |
| `RLS policy blocks` | API يستخدم `service_role` ويتجاوز RLS. للواجهة المباشرة، تحقق من `p0_security.sql` سياسات `deny anon` |
| `storage bucket not found` | أنشئ `rafd-media` كـ public bucket |
| `idempotency_key duplicate` | طبيعي، حماية تكرار البيع. استخدم key مختلف لكل فاتورة |

## ملاحظات أمن

- `SUPABASE_SERVICE_ROLE_KEY` لا يجب أن يظهر أبداً في المتصفح أو في Git.
- جميع جداول `products, customers, sales...` مفعّل عليها RLS (`ENABLE ROW LEVEL SECURITY`) لمنع الوصول المباشر بـ anon key. الـ API يستخدم service_role.
- في الإنتاج، فعّل Point-in-Time Recovery من Dashboard → Database → Backups (يتطلب خطة Pro).

---

**آخر تحديث**: 2026-07-22 - Infrastructure Integration Phase - develop branch
