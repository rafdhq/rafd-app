import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Dialog from '../components/ui/Dialog';
import { Table, THead, TH, TBody, TD } from '../components/ui/Table';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useTenant } from '../contexts/TenantContext';
import type { Expense } from '../lib/types';
import { formatDate, formatMoney } from '../lib/utils';

const categories = ['إيجار', 'كهرباء', 'رواتب', 'نقل', 'صيانة', 'تسويق', 'أخرى'];

export default function Expenses() {
  const { tenant } = useTenant();
  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    category: 'إيجار',
    amount: 0,
    description: '',
    payment_method: 'cash',
    expense_date: new Date().toISOString().slice(0, 10),
  });

  const load = async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const res = await fetch(`/api/expenses?tenant_id=${tenant.id}`);
    if (res.ok) setItems(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [tenant?.id]);

  const save = async () => {
    setBusy(true);
    await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, tenant_id: tenant?.id }),
    });
    setBusy(false);
    setOpen(false);
    load();
  };

  const total = items.reduce((a, e) => a + Number(e.amount || 0), 0);

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title="المصروفات"
        description={`إجمالي المسجل: ${formatMoney(total, tenant?.currency)}`}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> مصروف
          </Button>
        }
      />
      <Table>
        <THead>
          <TH>التاريخ</TH>
          <TH>التصنيف</TH>
          <TH>الوصف</TH>
          <TH>الوسيلة</TH>
          <TH>المبلغ</TH>
        </THead>
        <TBody>
          {items.map((e) => (
            <tr key={e.id}>
              <TD>{formatDate(e.expense_date)}</TD>
              <TD>{e.category}</TD>
              <TD>{e.description || '—'}</TD>
              <TD>{e.payment_method}</TD>
              <TD className="tabular font-semibold text-danger">{formatMoney(e.amount, tenant?.currency)}</TD>
            </tr>
          ))}
        </TBody>
      </Table>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="مصروف جديد"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button loading={busy} onClick={save}>حفظ</Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="التصنيف"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            options={categories.map((c) => ({ value: c, label: c }))}
          />
          <Input label="المبلغ" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
          <Input label="التاريخ" type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
          <Select
            label="الوسيلة"
            value={form.payment_method}
            onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
            options={[
              { value: 'cash', label: 'نقدي' },
              { value: 'card', label: 'بطاقة' },
              { value: 'transfer', label: 'تحويل' },
            ]}
          />
          <div className="sm:col-span-2">
            <Input label="الوصف" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
