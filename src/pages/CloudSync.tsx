import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import { SyncIndicator } from '../components/ui/States';
import { useSync } from '../contexts/SyncContext';
import { formatDateTime } from '../lib/utils';
import { Cloud, RefreshCw, Wifi, WifiOff, AlertTriangle, CheckCircle2 } from 'lucide-react';

const states = [
  { id: 'online', title: 'متصل', desc: 'السحابة متاحة وجاهزة', icon: Wifi, tone: 'text-success' },
  { id: 'offline', title: 'دون اتصال', desc: 'العمل مستمر محلياً', icon: WifiOff, tone: 'text-warning' },
  { id: 'syncing', title: 'جاري المزامنة', desc: 'رفع/سحب التغييرات', icon: RefreshCw, tone: 'text-info' },
  { id: 'failed', title: 'فشل المزامنة', desc: 'إعادة المحاولة تلقائياً', icon: AlertTriangle, tone: 'text-danger' },
];

export default function CloudSync() {
  const { connection, lastSyncAt, pendingChanges, message, triggerSync } = useSync();

  return (
    <div>
      <PageHeader
        title="المزامنة السحابية"
        description="Offline-First مع مزامنة موثوقة عند عودة الشبكة"
        actions={
          <Button onClick={triggerSync} disabled={connection === 'offline'}>
            <RefreshCw className="h-4 w-4" />
            مزامنة الآن
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SyncIndicator
          status={connection}
          lastSyncAt={lastSyncAt ? formatDateTime(lastSyncAt) : null}
          pending={pendingChanges}
          onSync={triggerSync}
        />
        {message && <span className="text-sm text-muted">{message}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="الحالة الحالية" />
          <CardBody className="space-y-3">
            <div className="flex items-center gap-3 rounded-2xl bg-muted p-4">
              <Cloud className="h-8 w-8 text-primary" />
              <div>
                <div className="font-semibold text-app">
                  {connection === 'online' && 'متصل بالسحابة'}
                  {connection === 'offline' && 'وضع دون اتصال'}
                  {connection === 'syncing' && 'جاري المزامنة...'}
                  {connection === 'failed' && 'تعذرت المزامنة'}
                </div>
                <div className="text-xs text-muted">
                  آخر مزامنة: {lastSyncAt ? formatDateTime(lastSyncAt) : '—'}
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-app p-4">
              <div className="text-sm text-muted">تغييرات بانتظار الرفع</div>
              <div className="mt-1 text-3xl font-bold tabular">{pendingChanges}</div>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="حالات المزامنة البصرية" description="مصممة لتكون واضحة للكاشير غير التقني" />
          <CardBody className="grid gap-3 sm:grid-cols-2">
            {states.map((s) => {
              const Icon = s.icon;
              const active = connection === s.id;
              return (
                <div
                  key={s.id}
                  className={`rounded-2xl border p-4 ${active ? 'border-primary bg-primary-soft/40' : 'border-app bg-surface'}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${s.tone} ${s.id === 'syncing' && active ? 'spin-slow' : ''}`} />
                    <div className="font-semibold text-app">{s.title}</div>
                    {active && <CheckCircle2 className="ms-auto h-4 w-4 text-primary" />}
                  </div>
                  <p className="mt-2 text-sm text-muted">{s.desc}</p>
                </div>
              );
            })}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
