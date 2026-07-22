import { useEffect, useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Dialog from '../components/ui/Dialog';
import Badge from '../components/ui/Badge';
import { Card, CardBody } from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useTenant } from '../contexts/TenantContext';
import type { Branch } from '../lib/types';

export default function Branches() {
  const { tenant, refreshTenant } = useTenant();
  const [items, setItems] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', name_ar: '', address: '', phone: '' });

  const load = async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const res = await fetch(`/api/branches?tenant_id=${tenant.id}`);
    if (res.ok) setItems(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [tenant?.id]);

  const save = async () => {
    setBusy(true);
    await fetch('/api/branches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        name: form.name || form.name_ar,
        tenant_id: tenant?.id,
        is_main: items.length === 0,
        status: 'active',
      }),
    });
    setBusy(false);
    setOpen(false);
    setForm({ name: '', name_ar: '', address: '', phone: '' });
    load();
    refreshTenant();
  };

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title="الفروع"
        description="إدارة مواقع البيع والمستودعات"
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> فرع جديد
          </Button>
        }
      />

      {!items.length ? (
        <EmptyState icon={Building2} title="لا توجد فروع" actionLabel="إضافة فرع" onAction={() => setOpen(true)} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((b) => (
            <Card key={b.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-lg font-semibold text-app">{b.name_ar || b.name}</div>
                    <div className="mt-1 text-sm text-muted">{b.address || '—'}</div>
                    <div className="mt-1 text-sm text-muted" dir="ltr">{b.phone || '—'}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {b.is_main && <Badge tone="primary">رئيسي</Badge>}
                    <Badge tone={b.status === 'active' ? 'success' : 'default'}>{b.status}</Badge>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="فرع جديد"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button loading={busy} onClick={save}>حفظ</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input label="الاسم بالعربي" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
          <Input label="Name EN" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="العنوان" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Input label="الجوال" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
      </Dialog>
    </div>
  );
}
