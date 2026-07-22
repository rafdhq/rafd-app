import { useCallback, useEffect, useState } from 'react';
import { Clock, DoorOpen, DoorClosed } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Dialog from '../components/ui/Dialog';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Table, THead, TH, TBody, TD } from '../components/ui/Table';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useTenant } from '../contexts/TenantContext';
import { formatDateTime, formatMoney } from '../lib/utils';

interface Shift {
  id: number;
  user_name?: string;
  opening_float: number;
  closing_counted?: number;
  expected_cash?: number;
  variance?: number;
  sales_count?: number;
  sales_total?: number;
  cash_total?: number;
  card_total?: number;
  transfer_total?: number;
  credit_total?: number;
  status: string;
  opened_at?: string;
  closed_at?: string;
  notes?: string;
}

export default function Shifts() {
  const { tenant, currentBranch } = useTenant();
  const currency = tenant?.currency || 'YER';
  const [items, setItems] = useState<Shift[]>([]);
  const [openShift, setOpenShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [openDlg, setOpenDlg] = useState(false);
  const [closeDlg, setCloseDlg] = useState(false);
  const [floatAmt, setFloatAmt] = useState(0);
  const [counted, setCounted] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const [listRes, openRes] = await Promise.all([
      fetch(`/api/shifts?tenant_id=${tenant.id}`),
      fetch(`/api/shifts?tenant_id=${tenant.id}&open_only=1`),
    ]);
    if (listRes.ok) setItems(await listRes.json());
    if (openRes.ok) {
      const o = await openRes.json();
      setOpenShift(Array.isArray(o) ? o[0] || null : o);
    }
    setLoading(false);
  }, [tenant?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const open = async () => {
    setBusy(true);
    await fetch('/api/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'open',
        opening_float: floatAmt,
        branch_id: currentBranch?.id,
        tenant_id: tenant?.id,
      }),
    });
    setBusy(false);
    setOpenDlg(false);
    load();
  };

  const close = async () => {
    if (!openShift) return;
    setBusy(true);
    await fetch('/api/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'close',
        id: openShift.id,
        closing_counted: counted,
        tenant_id: tenant?.id,
      }),
    });
    setBusy(false);
    setCloseDlg(false);
    load();
  };

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title="ورديات الكاشير"
        description="فتح/إغلاق الوردية · جرد نقدي · فروقات"
        actions={
          openShift ? (
            <Button variant="danger" onClick={() => { setCounted(0); setCloseDlg(true); }}>
              <DoorClosed className="h-4 w-4" /> إغلاق الوردية
            </Button>
          ) : (
            <Button onClick={() => setOpenDlg(true)}>
              <DoorOpen className="h-4 w-4" /> فتح وردية
            </Button>
          )
        }
      />

      {openShift && (
        <Card className="mb-4 border-primary">
          <CardHeader
            title="وردية مفتوحة"
            description={`${openShift.user_name || ''} · منذ ${formatDateTime(openShift.opened_at)}`}
            action={<Badge tone="success" dot>مفتوحة</Badge>}
          />
          <CardBody className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-muted p-3">
              <div className="text-xs text-muted">عهدة افتتاح</div>
              <div className="text-lg font-bold tabular">{formatMoney(openShift.opening_float, currency)}</div>
            </div>
            <div className="rounded-xl bg-muted p-3 sm:col-span-2 flex items-center gap-2 text-sm text-secondary">
              <Clock className="h-4 w-4" />
              تُحسب المبيعات من لحظة الفتح حتى الإغلاق (نقد/بطاقة/تحويل/آجل).
            </div>
          </CardBody>
        </Card>
      )}

      <Table>
        <THead>
          <TH>الكاشير</TH>
          <TH>الافتتاح</TH>
          <TH>المبيعات</TH>
          <TH>نقد متوقع</TH>
          <TH>العدّ</TH>
          <TH>الفرق</TH>
          <TH>الحالة</TH>
        </THead>
        <TBody>
          {items.map((s) => (
            <tr key={s.id}>
              <TD>
                <div className="font-medium">{s.user_name}</div>
                <div className="text-xs text-muted">{formatDateTime(s.opened_at)}</div>
              </TD>
              <TD className="tabular">{formatMoney(s.opening_float, currency)}</TD>
              <TD className="tabular">
                {s.sales_count || 0} · {formatMoney(s.sales_total || 0, currency)}
              </TD>
              <TD className="tabular">{formatMoney(s.expected_cash || 0, currency)}</TD>
              <TD className="tabular">{s.closing_counted != null ? formatMoney(s.closing_counted, currency) : '—'}</TD>
              <TD className="tabular">
                {s.variance != null ? (
                  <span className={Number(s.variance) === 0 ? 'text-success' : 'text-warning'}>
                    {formatMoney(s.variance, currency)}
                  </span>
                ) : (
                  '—'
                )}
              </TD>
              <TD>
                <Badge tone={s.status === 'open' ? 'success' : 'default'}>
                  {s.status === 'open' ? 'مفتوحة' : 'مغلقة'}
                </Badge>
              </TD>
            </tr>
          ))}
        </TBody>
      </Table>

      <Dialog open={openDlg} onClose={() => setOpenDlg(false)} title="فتح وردية" footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpenDlg(false)}>إلغاء</Button>
          <Button loading={busy} onClick={open}>تأكيد الفتح</Button>
        </div>
      }>
        <Input label="عهدة نقدية افتتاحية" type="number" value={floatAmt} onChange={(e) => setFloatAmt(Number(e.target.value) || 0)} />
      </Dialog>

      <Dialog open={closeDlg} onClose={() => setCloseDlg(false)} title="إغلاق الوردية" footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setCloseDlg(false)}>إلغاء</Button>
          <Button loading={busy} onClick={close}>إغلاق وتسوية</Button>
        </div>
      }>
        <Input label="النقد المعدود في الدرج" type="number" value={counted} onChange={(e) => setCounted(Number(e.target.value) || 0)} />
        <p className="mt-2 text-sm text-muted">سيُحسب المتوقع = العهدة + مبيعات النقد خلال الوردية، ويُعرض الفرق.</p>
      </Dialog>
    </div>
  );
}
