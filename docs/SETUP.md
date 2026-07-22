# دليل إعداد مشروع رفد | RAFD Setup Guide

> **الفرع الرسمي للتطوير:** `develop` — لا تعمل على `main` إلا عند دمج نسخة مستقرة
> **المصدر الرسمي:** GitHub `rafdhq/rafd-app`

---

## جدول المحتويات

1. [المتطلبات](#1-المتطلبات)
2. [استنساخ المشروع](#2-استنساخ-المشروع)
3. [إنشاء مشروع Supabase Development](#3-إنشاء-مشروع-supabase-development)
4. [تنفيذ سكربتات SQL](#4-تنفيذ-سكربتات-sql)
5. [إنشاء Storage Bucket](#5-إنشاء-storage-bucket)
6. [ضبط Auth و Google OAuth](#6-ضبط-auth-و-google-oauth)
7. [إعداد متغيرات البيئة](#7-إعداد-متغيرات-البيئة)
8. [التشغيل المحلي](#8-التشغيل-المحلي)
9. [ربط Vercel (Preview)](#9-ربط-vercel-preview)
10. [إنشاء مشروع الإنتاج rafd-prod](#10-إنشاء-مشروع-الإنتاج-rafd-prod)
11. [Checklist قبل أول Beta](#11-checklist-قبل-أول-beta)

---

## 1) المتطلبات

| الأداة | الإصدار | الرابط |
|-------|---------|--------|
| Node.js | 20.x LTS | https://nodejs.org |
| npm | 10+ | `npm -v` |
| Git | latest | https://git-scm.com |
| حساب Supabase | - | https://supabase.com |
| حساب Vercel | - | https://vercel.com |
| حساب GitHub | - | https://github.com/rafdhq/rafd-app |

تحقق محلياً:

```bash
node -v
npm -v
git --version
```

## 2) استنساخ المشروع

```bash
# استنساخ المستودع
git clone https://github.com/rafdhq/rafd-app.git
cd rafd-app

# التحويل لفرع التطوير الرسمي
git checkout develop
git pull origin develop

# تثبيت الاعتماديات
npm ci
```

## 3) إنشاء مشروع Supabase Development

> هذه الخطوة إلزامية الآن حسب خطة البنية، لا تؤجلها.

1. اذهب إلى https://supabase.com/dashboard → **New Project**
2. اختر Organization (أنشئ `rafd-hq` إذا لم توجد)
3. املأ البيانات:
   - **Name:** `rafd-dev`
   - **Database Password:** كلمة مرور قوية (احفظها في 1Password)
   - **Region:** `eu-central-1` (Frankfurt - الأقرب لليمن/السعودية، أقل latency من US)
   - **Plan:** Free للبداية، ثم Pro قبل أول عميل حقيقي لتفعيل PITR
4. انتظر 2-3 دقائق حتى تصبح الحالة **Active**
5. اذهب إلى **Project Settings → API**:
   - انسخ `Project URL` → هذا هو `VITE_SUPABASE_URL` و `NEXT_PUBLIC_SUPABASE_URL`
   - انسخ `anon public` → هذا هو `VITE_SUPABASE_ANON_KEY` و `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - انسخ `service_role secret` → هذا هو `SUPABASE_SERVICE_ROLE_KEY` (سري جداً)

## 4) تنفيذ سكربتات SQL - الطريقة الرسمية (Supabase Migrations)

> **تم التحويل إلى نظام Migrations الرسمي:** جميع ملفات SQL الآن في `supabase/migrations/` بترقيم زمني ووفق معيار Supabase CLI
> **أمر واحد فقط لتنفيذ كل شيء:** `supabase db push`

### 4.1 تثبيت Supabase CLI

```bash
npm install -g supabase
# أو
brew install supabase/tap/supabase

supabase --version
```

### 4.2 تسجيل الدخول وربط المشروع

```bash
supabase login
# يفتح المتصفح لإنشاء Access Token

supabase link --project-ref YOUR_PROJECT_REF
# تجد REF في رابط Dashboard: https://supabase.com/dashboard/project/<REF>
# سيطلب كلمة مرور قاعدة البيانات (Project Settings → Database → Connection String)
```

### 4.3 تنفيذ جميع Migrations بأمر واحد

```bash
# من جذر المشروع:
supabase db push

# سيطبق بالترتيب:
# 20260722000001_base_schema.sql  → الجداول الأساسية
# 20260722000002_storage.sql      → Bucket rafd-media
# 20260722000003_p0_security.sql  → ضريبة، idempotency، RLS
# 20260722000004_p1_features.sql  → ورديات، مرتجعات، جرد، دعوات
# 20260722000005_p2_features.sql  → ولاء، أسعار، BOM، AI
```

**أو عبر npm script (تمت إضافته):**
```bash
npm run db:push         # supabase db push
npm run db:push:linked  # supabase db push --linked
```

### 4.4 التحقق

```bash
npm run db:check
# أو
node scripts/test-supabase-connection.mjs
# سيتحقق من tenants, branches, products, sales, shifts, loyalty, pricing, recipes, ai_conversations, storage bucket
```

أو عبر SQL Editor:

```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema='public' ORDER BY table_name;

SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
-- يجب أن ترى 5 migrations مطبقة
```

### 4.5 الطريقة اليدوية (احتياطي - إذا كان CLI غير متاح)

إذا لم تستطع استخدام CLI، لا يزال بإمكانك النسخ واللصق في SQL Editor كخطة B، لكن الطريقة الرسمية هي `db push`.

افتح `supabase/migrations/` ونفّذ بالترتيب الزمني نفس الملفات السابقة.

### 4.6 إنشاء Migration جديدة مستقبلاً

```bash
supabase migration new add_new_feature
# ينشئ supabase/migrations/<timestamp>_add_new_feature.sql
# عدّل الملف ثم:
supabase db push
```

### 4.7 GitHub Action تلقائي (اختياري)

تم توفير قالب في `docs/workflows/supabase-migrate.yml` - انسخه يدوياً إلى `.github/workflows/supabase-migrate.yml` عبر GitHub UI (لا يمكن دفعه عبر GitHub App بدون صلاحية `workflows`).

يتطلب Secrets:
- `SUPABASE_ACCESS_TOKEN` - من https://supabase.com/dashboard/account/tokens
- `SUPABASE_PROJECT_REF` - e.g. `abcdefghijklmnopqrst`
- `SUPABASE_DB_PASSWORD` - من Project Settings → Database

بعد إنشائه، كل push إلى `develop` سينفذ `supabase db push` تلقائياً.

## 5) إنشاء Storage Bucket

الكود في `api/upload.js` يتوقع bucket باسم `rafd-media`.

**طريقتان:**

**A) عبر Dashboard (أسهل):**
- Storage → New Bucket → Name: `rafd-media` → Public: ✅ Yes → Create

**B) عبر SQL Editor:**

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('rafd-media','rafd-media', true) ON CONFLICT (id) DO NOTHING;

-- سياسات القراءة العامة
CREATE POLICY "Public read rafd-media" ON storage.objects FOR SELECT USING (bucket_id='rafd-media');
CREATE POLICY "Auth insert rafd-media" ON storage.objects FOR INSERT WITH CHECK (bucket_id='rafd-media');
CREATE POLICY "Auth update rafd-media" ON storage.objects FOR UPDATE USING (bucket_id='rafd-media');
CREATE POLICY "Auth delete rafd-media" ON storage.objects FOR DELETE USING (bucket_id='rafd-media');
```

## 6) ضبط Auth و Google OAuth

### 6.1 Site URL و Redirects

- Authentication → URL Configuration
  - **Site URL:** `http://localhost:5173`
  - **Redirect URLs:** أضف كل واحد في سطر:
    ```
    http://localhost:5173/*
    http://localhost:5173/auth/callback
    http://localhost:3000/*
    https://*.vercel.app/*
    https://YOUR_PRODUCTION_DOMAIN/*
    ```

### 6.2 Google OAuth (اختياري لكن مستحسن)

1. اذهب إلى https://console.cloud.google.com → New Project `rafd-oauth` → APIs → Credentials → Create OAuth Client ID
   - Type: Web Application
   - Authorized redirect URIs: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
2. في Supabase → Authentication → Providers → Google → Enable → ضع Client ID/Secret
3. في مشروعك `.env.local` ضع:
   ```
   VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   ```
   > ملاحظة: `VITE_GOOGLE_AUTH_PROXY` كان مخصصاً لـ Design Arena sandbox، اتركه فارغاً في الإنتاج.

## 7) إعداد متغيرات البيئة

```bash
cp .env.example .env.local
```

افتح `.env.local` واملأ القيم الحقيقية من الخطوة 3:

```env
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxx
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx (سري!)
```

**القواعد الأمنية:**
- `VITE_*` مكشوفة للمتصفح (مع RLS تحمي البيانات)
- `SUPABASE_SERVICE_ROLE_KEY` **لا** يجب أن يبدأ بـ `VITE_` ولا يُرفع لـ Git أبداً
- `.env.local` موجود في `.gitignore` ولن يُدفع

للتحقق من كل المتغيرات المطلوبة، راجع `.env.example` (موثق بالكامل).

## 8) التشغيل المحلي

```bash
# تأكد من .env.local موجود
ls -la .env.local

# اختبار
npm run dev
# → http://localhost:5173

# في نافذة أخرى
npm test        # Vitest - 31+ اختبار
npm run build   # يجب أن ينجح بدون أخطاء
```

**Smoke Test يدوي (إلزامي بعد ربط Supabase):**

1. افتح http://localhost:5173
2. سجّل مستخدم جديد أو أنشئ عبر Supabase Auth → Users
3. إذا لم توجد بيانات، اذهب إلى `/onboarding` أو نفّذ SQL seed يدوي (انظر `supabase/README.md`)
4. جرّب: Login → Dashboard → POS بيع نقدي → منتجات → رفع صورة → تقرير
5. تحقق من `api/health`:
   ```bash
   curl http://localhost:5173/api/health
   curl http://localhost:5173/api/db-wake # يوقظ DB إذا كان في وضع السكون
   ```

إذا نجح كل شيء، بيئة Dev جاهزة.

## 9) ربط Vercel (Preview)

1. اذهب إلى https://vercel.com → New Project → Import `rafdhq/rafd-app` → Framework: Vite
2. Build Command: `npm run build` — Output: `dist` — Install: `npm ci`
3. **Environment Variables** (Preview):
   - أضف كل متغيرات `rafd-dev` من `.env.local` **ما عدا** `FULLSTACK_*`
   - تأكد أن `SUPABASE_SERVICE_ROLE_KEY` موجود (يستخدمه `api/*`)
4. Deploy → ستحصل على رابط `*.vercel.app`
5. اختبر مسار `/api/health` على رابط Vercel

## 10) إنشاء مشروع الإنتاج rafd-prod

كرر الخطوة 3 و 4 لكن باسم `rafd-prod` بنفس الـ Region.

- في Vercel → Settings → Environment Variables:
  - **Production:** مفاتيح `rafd-prod`
  - **Preview:** مفاتيح `rafd-dev`
- في Supabase Prod:
  - نفّذ نفس SQL `000_base → p0 → p1 → p2`
  - أنشئ bucket `rafd-media`
  - اضبط Auth URLs على دومين الإنتاج النهائي

## 11) Checklist قبل أول Beta

- [ ] `npm test && npm run build` ينجح محلياً وعلى Vercel
- [ ] SQL `000_base + p0 + p1 + p2` منفذة على `rafd-dev` و `rafd-prod`
- [ ] Bucket `rafd-media` موجود Public
- [ ] Auth Site URL و Redirects مضبوطة
- [ ] `.env.local` لا يُدفع لـ Git (تحقق `git status`)
- [ ] `vercel.json` لا يحتوي `env` بأسرار (تم تنظيفه في هذه المرحلة)
- [ ] Login بريد/كلمة مرور يعمل
- [ ] عزل المستأجر: مستخدم متجر A لا يرى بيانات متجر B
- [ ] POS نقدي + آجل + فاتورة + رفع صورة
- [ ] Sentry (اختياري لكن مستحسن) يستقبل event
- [ ] لا يوجد `tenant_id = 1` ثابت في الكود

---

## مرجع سريع

| ملف | الوصف |
|----|-------|
| `.env.example` | كل المتغيرات المطلوبة موثقة |
| `supabase/README.md` | دليل SQL مفصل |
| `supabase/000_base_schema.sql` | الأساس |
| `supabase/p0_security.sql` | أمان |
| `supabase/p1_features.sql` | P1 |
| `supabase/p2_features.sql` | P2 |
| `docs/Infrastructure-Setup-Plan.md` | خطة قرارات البنية |

---

**تم إعداد هذا الدليل في مرحلة Infrastructure Integration - فرع develop - لا يحتوي تطوير ميزات جديدة.**
