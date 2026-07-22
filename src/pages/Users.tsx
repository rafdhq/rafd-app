import { useEffect, useState } from 'react';
import { Copy, Plus, UserCog, UserPlus } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Dialog from '../components/ui/Dialog';
import Badge from '../components/ui/Badge';
import Tabs from '../components/ui/Tabs';
import { Table, THead, TH, TBody, TD } from '../components/ui/Table';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useTenant } from '../contexts/TenantContext';
import type { AppUser } from '../lib/types';
import { ROLES, formatDateTime, roleLabel } from '../lib/utils';

interface Invite {
  id: number;
  email: string;
  full_name?: string;
  role: string;
  status: string;
  token: string;
  expires_at?: string;
  created_at?: string;
}

export default function UsersPage() {
  const { tenant } = useTenant();
  const [items, setItems] = useState<AppUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('users');
  const [open, setOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState('');
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    role: 'cashier',
  });
  const [inviteForm, setInviteForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    role: 'cashier',
  });

  const load = async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const [uRes, iRes] = await Promise.all([
      fetch(`/api/users?tenant_id=${tenant.id}`),
      fetch(`/api/invites?tenant_id=${tenant.id}`),
    ]);
    if (uRes.ok) setItems(await uRes.json());
    if (iRes.ok) setInvites(await iRes.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [tenant?.id]);

  const save = async () => {
    setBusy(true);
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, tenant_id: tenant?.id, status: 'active' }),
    });
    setBusy(false);
    setOpen(false);
    setForm({ full_name: '', email: '', phone: '', role: 'cashier' });
    load();
  };

  const sendInvite = async () => {
    if (!inviteForm.email) return;
    setBusy(true);
    const res = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        tenant_id: tenant?.id,
        ...inviteForm,
      }),
    });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      const link = `${window.location.origin}/login?invite=${data.token}`;
      setLastInviteLink(link);
      setInviteOpen(false);
      setInviteForm({ full_name: '', email: '', phone: '', role: 'cashier' });
      load();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'فشل إرسال الدعوة');
    }
  };

  const revoke = async (id: number) => {
    await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke', id, tenant_id: tenant?.id }),
    });
    load();
  };

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title="المستخدمون والدعوات"
        description="إضافة مباشرة أو دعوة بالبريد مع رابط قبول"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4" /> دعوة
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> مستخدم
            </Button>
          </div>
        }
      />

      {lastInviteLink && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-app bg-success-soft/40 px-4 py-3 text-sm">
          <span className="text-success font-medium">رابط الدعوة:</span>
          <code className="max-w-full truncate text-xs" dir="ltr">
            {lastInviteLink}
          </code>
          <Button
            size="sm"
            variant="soft"
            onClick={() => navigator.clipboard.writeText(lastInviteLink)}
          >
            <Copy className="h-3.5 w-3.5" /> نسخ
          </Button>
        </div>
      )}

      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'users', label: 'المستخدمون', count: items.length },
            { id: 'invites', label: 'الدعوات', count: invites.length },
          ]}
        />
      </div>

      {tab === 'users' &&
        (!items.length ? (
          <EmptyState icon={UserCog} title="لا يوجد مستخدمون" actionLabel="إضافة" onAction={() => setOpen(true)} />
        ) : (
          <Table>
            <THead>
              <TH>الاسم</TH>
              <TH>البريد</TH>
              <TH>الجوال</TH>
              <TH>الدور</TH>
              <TH>الحالة</TH>
            </THead>
            <TBody>
              {items.map((u) => (
                <tr key={u.id}>
                  <TD className="font-medium">{u.full_name}</TD>
                  <TD>{u.email}</TD>
                  <TD dir="ltr">{u.phone || '—'}</TD>
                  <TD>
                    <Badge tone="primary">{roleLabel(u.role)}</Badge>
                  </TD>
                  <TD>
                    <Badge tone={u.status === 'active' ? 'success' : 'default'}>{u.status}</Badge>
                  </TD>
                </tr>
              ))}
            </TBody>
          </Table>
        ))}

      {tab === 'invites' && (
        <Table>
          <THead>
            <TH>البريد</TH>
            <TH>الدور</TH>
            <TH>الحالة</TH>
            <TH>ينتهي</TH>
            <TH></TH>
          </THead>
          <TBody>
            {invites.map((i) => (
              <tr key={i.id}>
                <TD>
                  <div className="font-medium">{i.full_name || i.email}</div>
                  <div className="text-xs text-muted">{i.email}</div>
                </TD>
                <TD>{roleLabel(i.role)}</TD>
                <TD>
                  <Badge
                    tone={
                      i.status === 'accepted' ? 'success' : i.status === 'pending' ? 'warning' : 'default'
                    }
                  >
                    {i.status}
                  </Badge>
                </TD>
                <TD className="text-xs">{formatDateTime(i.expires_at)}</TD>
                <TD>
                  {i.status === 'pending' && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const link = `${window.location.origin}/login?invite=${i.token}`;
                          navigator.clipboard.writeText(link);
                          setLastInviteLink(link);
                        }}
                      >
                        نسخ الرابط
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => revoke(i.id)}>
                        إلغاء
                      </Button>
                    </div>
                  )}
                </TD>
              </tr>
            ))}
          </TBody>
        </Table>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="مستخدم جديد"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button loading={busy} onClick={save}>
              حفظ
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input label="الاسم" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <Input label="البريد" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="الجوال" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Select
            label="الدور"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            options={ROLES.filter((r) => r.id !== 'superadmin').map((r) => ({ value: r.id, label: r.label }))}
          />
        </div>
      </Dialog>

      <Dialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="دعوة مستخدم"
        description="يُنشأ رابط قبول صالح 7 أيام"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              إلغاء
            </Button>
            <Button loading={busy} onClick={sendInvite}>
              إنشاء الدعوة
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label="الاسم"
            value={inviteForm.full_name}
            onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })}
          />
          <Input
            label="البريد"
            type="email"
            value={inviteForm.email}
            onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
          />
          <Input
            label="الجوال / واتساب"
            value={inviteForm.phone}
            onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
          />
          <Select
            label="الدور"
            value={inviteForm.role}
            onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
            options={ROLES.filter((r) => r.id !== 'superadmin').map((r) => ({ value: r.id, label: r.label }))}
          />
        </div>
      </Dialog>
    </div>
  );
}
