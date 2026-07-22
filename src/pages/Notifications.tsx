import { useEffect, useState } from 'react';
import { Bell, BellRing, Send } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Input from '../components/ui/Input';
import Dialog from '../components/ui/Dialog';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import type { NotificationItem } from '../lib/types';
import { formatDateTime, cn } from '../lib/utils';

export default function Notifications() {
  const { tenant } = useTenant();
  const { profile } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushStatus, setPushStatus] = useState('');
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const canBroadcast = profile?.role === 'owner' || profile?.role === 'manager' || profile?.role === 'superadmin';

  const load = async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const res = await fetch(`/api/notifications?tenant_id=${tenant.id}`);
    if (res.ok) setItems(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [tenant?.id]);

  const markAll = async () => {
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark_all: true, tenant_id: tenant?.id }),
    });
    load();
  };

  const markOne = async (id: number) => {
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_read: true }),
    });
    load();
  };

  const enablePush = async () => {
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        setPushStatus('المتصفح لا يدعم إشعارات الدفع');
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setPushStatus('تم رفض إذن الإشعارات');
        return;
      }

      const reg = await navigator.serviceWorker.ready.catch(async () => {
        return navigator.serviceWorker.register('/sw.js');
      });

      const meta = await fetch(`/api/push?tenant_id=${tenant?.id}`);
      const metaJson = meta.ok ? await meta.json() : {};
      const vapid = metaJson.vapid_public_key as string | null;

      let subscription: PushSubscription | null = null;
      if (vapid && reg.pushManager) {
        const key = urlBase64ToUint8Array(vapid);
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
      } else {
        // Store a synthetic endpoint so server tracks device interest without VAPID
        subscription = {
          endpoint: `local://${tenant?.id}/${profile?.id || 'user'}/${Date.now()}`,
          toJSON: () => ({
            endpoint: `local://${tenant?.id}/${profile?.id || 'user'}`,
            keys: { p256dh: 'local', auth: 'local' },
          }),
        } as unknown as PushSubscription;
      }

      const json = subscription.toJSON();
      await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'subscribe',
          tenant_id: tenant?.id,
          endpoint: json.endpoint,
          keys: json.keys,
          user_agent: navigator.userAgent,
        }),
      });
      setPushStatus(vapid ? 'تم تفعيل إشعارات الدفع' : 'تم التسجيل — أضف VAPID للإرسال الشبكي');
    } catch (err) {
      console.error(err);
      setPushStatus('تعذر تفعيل الدفع');
    }
  };

  const broadcast = async () => {
    if (!title.trim()) return;
    setBusy(true);
    await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'notify',
        tenant_id: tenant?.id,
        title,
        body,
        type: 'info',
      }),
    });
    setBusy(false);
    setBroadcastOpen(false);
    setTitle('');
    setBody('');
    load();
  };

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title="الإشعارات"
        description="تنبيهات داخلية + اشتراك Push + بث للفريق"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={enablePush}>
              <BellRing className="h-4 w-4" /> تفعيل Push
            </Button>
            {canBroadcast && (
              <Button variant="soft" onClick={() => setBroadcastOpen(true)}>
                <Send className="h-4 w-4" /> بث تنبيه
              </Button>
            )}
            <Button variant="outline" onClick={markAll}>
              تعليم الكل كمقروء
            </Button>
          </div>
        }
      />

      {pushStatus && (
        <div className="mb-4 rounded-xl border border-app bg-muted px-3 py-2 text-sm text-secondary">{pushStatus}</div>
      )}

      {!items.length ? (
        <EmptyState icon={Bell} title="لا إشعارات" description="كل شيء هادئ الآن" />
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => markOne(n.id)}
              className={cn(
                'flex w-full items-start gap-3 rounded-2xl border border-app px-4 py-3 text-start transition hover:shadow-soft',
                n.is_read ? 'bg-surface' : 'bg-primary-soft/40'
              )}
            >
              <div className="mt-0.5">
                <Badge
                  tone={
                    n.type === 'warning'
                      ? 'warning'
                      : n.type === 'success'
                        ? 'success'
                        : n.type === 'danger'
                          ? 'danger'
                          : 'info'
                  }
                >
                  {n.type}
                </Badge>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-app">{n.title}</div>
                <div className="mt-0.5 text-sm text-secondary">{n.body}</div>
                <div className="mt-1 text-xs text-muted">{formatDateTime(n.created_at)}</div>
              </div>
              {!n.is_read && <span className="mt-2 h-2 w-2 rounded-full bg-primary" />}
            </button>
          ))}
        </div>
      )}

      <Dialog
        open={broadcastOpen}
        onClose={() => setBroadcastOpen(false)}
        title="بث إشعار للفريق"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBroadcastOpen(false)}>
              إلغاء
            </Button>
            <Button loading={busy} onClick={broadcast}>
              إرسال
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input label="العنوان" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input label="النص" value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
      </Dialog>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
