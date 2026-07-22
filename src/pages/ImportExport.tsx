import { useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { useI18n } from '../contexts/I18nContext';
import {
  IMPORT_TEMPLATES,
  downloadTemplate,
  exportRows,
  parseCsv,
  type ImportEntity,
} from '../lib/importExport/csv';
import { downloadExcel } from '../lib/reports/excel';

const ENTITIES: ImportEntity[] = ['products', 'customers', 'suppliers', 'inventory', 'purchases'];

export default function ImportExport() {
  const { locale, t } = useI18n();
  const [entity, setEntity] = useState<ImportEntity>('products');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; errors: Array<{ row: number; error: string }> } | null>(null);

  const doExport = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/import-export?entity=${entity}`);
      if (!res.ok) throw new Error('export failed');
      const data = await res.json();
      exportRows(entity, data.rows || [], 'xls');
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File) => {
    setBusy(true);
    setResult(null);
    try {
      const text = await file.text();
      let rows: Array<Record<string, unknown>> = [];
      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
      } else {
        const parsed = parseCsv(text);
        rows = parsed.rows;
      }
      const res = await fetch('/api/import-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'import failed');
      setResult({ created: data.created || 0, updated: data.updated || 0, errors: data.errors || [] });
    } catch (e: unknown) {
      setResult({
        created: 0,
        updated: 0,
        errors: [{ row: 0, error: e instanceof Error ? e.message : 'failed' }],
      });
    } finally {
      setBusy(false);
    }
  };

  const tpl = IMPORT_TEMPLATES[entity];

  return (
    <div>
      <PageHeader
        title={t('importExport')}
        description={
          locale === 'ar'
            ? 'Excel/CSV احترافي للمنتجات والعملاء والموردين والمخزون والمشتريات'
            : 'Professional Excel/CSV for products, customers, suppliers, inventory, purchases'
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {ENTITIES.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => {
              setEntity(e);
              setResult(null);
            }}
            className={`rounded-full border px-4 py-2 text-sm font-medium ${
              entity === e ? 'border-primary bg-primary-soft text-primary' : 'border-app bg-surface'
            }`}
          >
            {locale === 'ar' ? IMPORT_TEMPLATES[e].label_ar : IMPORT_TEMPLATES[e].label_en}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Download className="h-4 w-4" />
                {t('export')}
              </span>
            }
          />
          <CardBody className="space-y-3">
            <p className="text-sm text-muted">
              {locale === 'ar'
                ? 'تصدير البيانات الحالية كملف Excel متوافق.'
                : 'Export current data as Excel-compatible file.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button loading={busy} onClick={doExport}>
                <FileSpreadsheet className="h-4 w-4" />
                {locale === 'ar' ? 'تصدير Excel' : 'Export Excel'}
              </Button>
              <Button
                variant="outline"
                onClick={() => downloadTemplate(entity, 'csv')}
              >
                {locale === 'ar' ? 'قالب CSV' : 'CSV template'}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  downloadExcel(
                    `rafd-template-${entity}.xls`,
                    tpl.columns,
                    tpl.sample,
                    entity
                  )
                }
              >
                {locale === 'ar' ? 'قالب Excel' : 'Excel template'}
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Upload className="h-4 w-4" />
                {t('import')}
              </span>
            }
          />
          <CardBody className="space-y-3">
            <p className="text-sm text-muted">
              {locale === 'ar'
                ? 'ارفع CSV (UTF-8) أو JSON بنفس أعمدة القالب. المنتجات تُحدَّث حسب SKU إن وُجد.'
                : 'Upload UTF-8 CSV or JSON matching template columns. Products upsert by SKU when present.'}
            </p>
            <label className="inline-flex cursor-pointer">
              <span className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-inverse">
                <Upload className="h-4 w-4" />
                {busy ? t('loading') : locale === 'ar' ? 'اختيار ملف' : 'Choose file'}
              </span>
              <input
                type="file"
                accept=".csv,text/csv,application/json,.json"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
            </label>
            <div className="rounded-xl bg-muted p-3 text-xs text-secondary">
              Columns: {tpl.columns.join(' · ')}
            </div>
          </CardBody>
        </Card>
      </div>

      {result && (
        <Card className="mt-4">
          <CardHeader title={locale === 'ar' ? 'نتيجة الاستيراد' : 'Import result'} />
          <CardBody className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge tone="success">+{result.created}</Badge>
              <Badge tone="info">~{result.updated}</Badge>
              <Badge tone={result.errors.length ? 'warning' : 'default'}>!{result.errors.length}</Badge>
            </div>
            {result.errors.slice(0, 20).map((e, i) => (
              <div key={i} className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                Row {e.row}: {e.error}
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
