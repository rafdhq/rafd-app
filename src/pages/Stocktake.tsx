import { useEffect, useState } from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Input from '../components/ui/Input';
import { Table, THead, TH, TBody, TD } from '../components/ui/Table';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useTenant } from '../contexts/TenantContext';
import { formatDateTime } from '../lib/utils';

interface Line {
  id: number;
  product_name: string;
  sku?: string;
  barcode?: string;
  system_qty: number;
  counted_qty: number | null;
  variance: number | null;
}

interface Session {
  id: number;
  title: string;
  status: string;
  created_at?: string;
  lines?: Line[];
}

export default function Stocktake() {
  const { tenant, currentBranch } = useTenant();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [active, setActive] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<Record<number, string>>({});

  const load = async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const res = await fetch(`/api/stocktakes?tenant_id=${tenant.id}`);
    if (res.ok) setSessions(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [tenant?.id]);

  const create = async () => {
    setBusy(true);
    const res = await fetch('/api/stocktakes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', tenant_id: tenant?.id, branch_id: currentBranch?.id }),
    });
    setBusy(false);
    if (res.ok) {
      const s = await res.json();
      setActive(s);
      const map: Record<number, string> = {};
      for (const l of s.lines || []) map[l.id] = l.counted_qty == null ? '' : String(l.counted_qty);
      setCounts(map);
      load();
    }
  };

  const openSession = async (id: number) => {
    const res = await fetch(`/api/stocktakes?id=${id}&tenant_id=${tenant?.id}`);
    if (!res.ok) return;
    const s = await res.json();
    setActive(s);
    const map: Record<number, string> = {};
    for (const l of s.lines || []) map[l.id] = l.counted_qty == null ? '' : String(l.counted_qty);
    setCounts(map);
  };

  const saveCounts = async () => {
    if (!active) return;
    setBusy(true);
    const lines = Object.entries(counts).map(([id, v]) => ({
      id: Number(id),
      counted_qty: v === '' ? null : Number(v),
    }));
    const res = await fetch('/api/stocktakes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'count', session_id: active.id, lines, tenant_id: tenant?.id }),
    });
    setBusy(false);
    if (res.ok) setActive(await res.json());
  };

  const post = async () => {
    if (!active || !confirm('ترحيل الجرد سيعدّل كميات المخزون. متابعة؟')) return;
    setBusy(true);
    await saveCounts();
    const res = await fetch('/api/stocktakes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'post', session_id: active.id, tenant_id: tenant?.id }),
    });
    setBusy(false);
    if (res.ok) {
      setActive(null);
      load();
    }
  };

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title="جلسات الجرد"
        description="عدّ فعلي مقابل النظام ثم ترحيل التسوية للمخزون"
        actions={
          <Button loading={busy} onClick={create}>
            <Plus className="h-4 w-4" /> جلسة جرد جديدة
          </Button>
        }
      />

      {!active ? (
        <Table>
          <THead>
            <TH>العنوان</TH>
            <TH>الحالة</TH>
            <TH>التاريخ</TH>
            <TH></TH>
          </THead>
          <TBody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <TD className="font-medium">{s.title}</TD>
                <TD>
                  <Badge tone={s.status === 'posted' ? 'success' : s.status === 'counting' ? 'warning' : 'default'}>
                    {s.status}
                  </Badge>
                </TD>
                <TD>{formatDateTime(s.created_at)}</TD>
                <TD>
                  <Button size="sm" variant="outline" onClick={() => openSession(s.id)}>
                    <ClipboardList className="h-3.5 w-3.5" /> فتح
                  </Button>
                </TD>
              </tr>
            ))}
          </TBody>
        </Table>
      ) : (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">{active.title}</h2>
            <Badge>{active.status}</Badge>
            <div className="ms-auto flex gap-2">
              <Button variant="ghost" onClick={() => setActive(null)}>رجوع</Button>
              {active.status !== 'posted' && (
                <>
                  <Button variant="outline" loading={busy} onClick={saveCounts}>حفظ العدّ</Button>
                  <Button loading={busy} onClick={post}>ترحيل للمخزون</Button>
                </>
              )}
            </div>
          </div>
          <Table>
            <THead>
              <TH>المنتج</TH>
              <TH>النظام</TH>
              <TH>العدّ</TH>
              <TH>الفرق</TH>
            </THead>
            <TBody>
              {(active.lines || []).map((l) => {
                const counted = counts[l.id] === '' ? null : Number(counts[l.id]);
                const variance = counted == null ? null : counted - Number(l.system_qty);
                return (
                  <tr key={l.id}>
                    <TD>
                      <div className="font-medium">{l.product_name}</div>
                      <div className="text-xs text-muted font-mono">{l.barcode || l.sku}</div>
                    </TD>
                    <TD className="tabular">{l.system_qty}</TD>
                    <TD>
                      <Input
                        type="number"
                        className="w-28"
                        disabled={active.status === 'posted'}
                        value={counts[l.id] ?? ''}
                        onChange={(e) => setCounts((c) => ({ ...c, [l.id]: e.target.value }))}
                      />
                    </TD>
                    <TD className={`tabular ${variance != null && variance !== 0 ? 'text-warning font-semibold' : ''}`}>
                      {variance == null ? '—' : variance}
                    </TD>
                  </tr>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
