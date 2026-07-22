import { useEffect, useMemo, useState } from 'react';
import { ScrollText, Search } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import { Table, THead, TH, TBody, TD } from '../components/ui/Table';
import { PageSkeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { useTenant } from '../contexts/TenantContext';
import { formatDateTime } from '../lib/utils';

interface AuditRow {
  id: number;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  user_id?: number;
  meta?: Record<string, unknown>;
  created_at?: string;
}

export default function AuditLogs() {
  const { tenant } = useTenant();
  const [items, setItems] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!tenant?.id) return;
      setLoading(true);
      const res = await fetch(`/api/audit-logs?tenant_id=${tenant.id}&limit=200`);
      if (res.ok) setItems(await res.json());
      setLoading(false);
    };
    load();
  }, [tenant?.id]);

  const filtered = useMemo(() => {
    if (!q) return items;
    const s = q.toLowerCase();
    return items.filter(
      (r) =>
        r.action?.toLowerCase().includes(s) ||
        r.entity_type?.toLowerCase().includes(s) ||
        r.entity_id?.toLowerCase().includes(s) ||
        JSON.stringify(r.meta || {}).toLowerCase().includes(s)
    );
  }, [items, q]);

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title="سجل التدقيق"
        description="كل العمليات الحساسة: ورديات، مرتجعات، جرد، دعوات، اشتراكات"
      />

      <div className="mb-4 relative max-w-md">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث في الإجراءات..."
          className="h-11 w-full rounded-xl border border-app bg-surface pe-10 ps-3 text-sm"
        />
      </div>

      {!filtered.length ? (
        <EmptyState icon={ScrollText} title="لا توجد سجلات بعد" description="ستظهر هنا عند تنفيذ عمليات إدارية" />
      ) : (
        <Table>
          <THead>
            <TH>الوقت</TH>
            <TH>الإجراء</TH>
            <TH>الكيان</TH>
            <TH>المعرّف</TH>
            <TH>تفاصيل</TH>
          </THead>
          <TBody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <TD className="text-xs whitespace-nowrap">{formatDateTime(r.created_at)}</TD>
                <TD>
                  <Badge tone="primary">{r.action || '—'}</Badge>
                </TD>
                <TD className="text-sm">{r.entity_type || '—'}</TD>
                <TD className="font-mono text-xs">{r.entity_id || '—'}</TD>
                <TD className="max-w-xs truncate text-xs text-muted" title={JSON.stringify(r.meta || {})}>
                  {r.meta ? JSON.stringify(r.meta) : '—'}
                </TD>
              </tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
