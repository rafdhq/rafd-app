-- ---------------------------------------------------------------------------
-- Login page content, managed from the SuperAdmin console.
--
-- Adds three columns to the platform_settings singleton:
--   login_features  JSONB  — the feature list shown on the login page's right
--                            panel. Previously hardcoded in Login.tsx as three
--                            generic slogans with no real data behind them.
--   developer_name  TEXT   — optional "developed by" credit line.
--   developer_link  TEXT   — optional contact URL for that credit.
--
-- All three use ADD COLUMN IF NOT EXISTS: developer_name / developer_link may
-- already exist on the live database from an out-of-band change that never had
-- a matching migration in the repository, so this must be safe either way.
-- ---------------------------------------------------------------------------

ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS login_features JSONB;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS developer_name TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS developer_link TEXT;

-- Seed the feature list with the platform's real capabilities, but only where
-- it is still unset. An existing customised list is never overwritten.
--
-- Shape: array of { icon, title, desc }. `icon` is matched against a fixed
-- allow-list in the frontend (src/lib/loginFeatures.ts); anything unknown
-- falls back to a default icon, so this column can never inject markup.
UPDATE platform_settings
SET login_features = '[
  {"icon":"wifi-off","title":"نقطة بيع تعمل بلا إنترنت","desc":"أكمل البيع أثناء الانقطاع والمزامنة تتم تلقائيًا"},
  {"icon":"boxes","title":"مخزون وموردون وعملاء لحظيًا","desc":"أرصدة ودفاتر حسابات محدّثة لحظة بلحظة"},
  {"icon":"printer","title":"طباعة فواتير حرارية","desc":"دعم ESC/POS مباشرة عبر USB أو Serial"},
  {"icon":"message-circle","title":"كشوفات حساب عبر واتساب","desc":"تصدير PDF أو صورة ومشاركتها مع العميل"}
]'::jsonb
WHERE login_features IS NULL;
