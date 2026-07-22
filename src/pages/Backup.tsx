import { useCallback, useEffect, useState } from 'react';
import { CloudUpload, Download, HardDrive, RotateCcw, ShieldCheck } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { useTenant } from '../contexts/TenantContext';
import { downloadText, formatDateTime, formatNumber } from '../lib/utils';
import { SuccessToast, ErrorState } from '../components/ui/States';
import { PageSkeleton } from '../components/ui/Skeleton';

interface BackupRow {
  id: number;
  label?: string;
  created_at?: string;
  created_by?: string | null;
  size_bytes?: number;
  kind?: string;
}

export default function Backup() {
  const { tenant } = useTenant();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<BackupRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/backups?tenant_id=${tenant.id}`);
      if (!res.ok) throw new Error('تعذر تحميل سجل النسخ');
      setHistory(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ');
    } finally {
      setLoading(false);
    }
  }, [tenant?.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // scheduled client checkpoint every 6h while app open
  useEffect(() => {
    if (!tenant?.id) return;
    const key = `rafd-last-auto-backup:${tenant.id}`;
    const tick = async () => {
      const last = Number(localStorage.getItem(key) || 0);
      if (Date.now() - last < 6 * 60 * 60 * 1000) return;
      if (!navigator.onLine) return;
      try {
        await fetch('/api/backups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_id: tenant.id,
            scheduled: true,
            kind: 'scheduled',
            label: `auto-${new Date().toISOString().slice(0, 13)}`,
            include_snapshot: false,
          }),
        });
        localStorage.setItem(key, String(Date.now()));
        loadHistory();
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(tick, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, [tenant?.id, loadHistory]);

  const createAndDownload = async () => {
    if (!tenant?.id) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenant.id,
          kind: 'manual',
          label: `manual-${new Date().toISOString().slice(0, 19)}`,
          include_snapshot: true,
        }),
      });
      if (!res.ok) throw new Error('فشل إنشاء النسخة');
      const data = await res.json();
      const snap = data.snapshot || data;
      downloadText(
        `rafd-backup-${tenant.id}-${Date.now()}.json`,
        JSON.stringify(snap, null, 2)
      );
      setDone(data.created_at || new Date().toISOString());
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ');
    } finally {
      setBusy(false);
    }
  };

  const restore = async (id: number) => {
    if (!confirm('استعادة المنتجات والعملاء من هذه النسخة؟ (المبيعات لا تُحذف)')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/backups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, restore: true, tenant_id: tenant?.id }),
      });
      if (!res.ok) throw new Error('فشلت الاستعادة');
      setDone(new Date().toISOString());
      alert('تمت الاستعادة الجزئية بنجاح');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title="النسخ الاحتياطي"
        description="لقطات مشفّرة منطقيًا على السحابة + تنزيل محلي · جدولة تلقائية كل 6 ساعات"
      />

      {done && (
        <div className="mb-4">
          <SuccessToast title="تم" description={`آخر عملية: ${formatDateTime(done)}`} />
        </div>
      )}
      {error && (
        <div className="mb-4">
          <ErrorState description={error} onRetry={loadHistory} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="نسخة يدوية + تنزيل"
            description="تُحفظ في السحابة ويُنزَّل ملف JSON محليًا"
            action={<Badge tone="success">P0</Badge>}
          />
          <CardBody className="space-y-4">
            <div className="flex h-20 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <HardDrive className="h-10 w-10" />
            </div>
            <Button size="lg" className="w-full" loading={busy} onClick={createAndDownload}>
              <Download className="h-4 w-4" />
              إنشاء وتنزيل نسخة
            </Button>
            <Button
              size="md"
              variant="outline"
              className="w-full"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                await fetch('/api/backups', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    tenant_id: tenant?.id,
                    kind: 'cloud',
                    label: `cloud-${Date.now()}`,
                    include_snapshot: false,
                  }),
                });
                setBusy(false);
                setDone(new Date().toISOString());
                loadHistory();
              }}
            >
              <CloudUpload className="h-4 w-4" />
              حفظ سحابي فقط
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="السياسة" />
          <CardBody className="space-y-3 text-sm text-secondary">
            {[
              'النسخ السحابية مرتبطة بالمستأجر فقط (tenant isolation)',
              'الجدولة التلقائية تعمل أثناء فتح التطبيق كل 6 ساعات',
              'الاستعادة تعيد المنتجات والعملاء دون مسح المبيعات',
              'لا تشارك ملفات JSON مع أطراف غير موثوقة',
              'فعّل RLS على جدول backups في الإنتاج',
            ].map((t) => (
              <div key={t} className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span>{t}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="سجل النسخ" description={`${history.length} نسخة`} />
        <CardBody className="space-y-2">
          {!history.length && <div className="text-sm text-muted">لا توجد نسخ محفوظة بعد</div>}
          {history.map((b) => (
            <div
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-app px-4 py-3"
            >
              <div>
                <div className="font-medium text-app">{b.label || `#${b.id}`}</div>
                <div className="text-xs text-muted">
                  {formatDateTime(b.created_at)} · {b.kind || 'manual'} ·{' '}
                  {b.size_bytes ? `${formatNumber(Math.round(b.size_bytes / 1024))} KB` : '—'}
                </div>
              </div>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => restore(b.id)}>
                <RotateCcw className="h-3.5 w-3.5" />
                استعادة
              </Button>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
