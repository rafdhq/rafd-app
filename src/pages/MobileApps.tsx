import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Package,
  ShoppingCart,
  Smartphone,
  Users,
  Warehouse,
  WifiOff,
  Bell,
  Clock3,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { useI18n } from '../contexts/I18nContext';
import { useSync } from '../contexts/SyncContext';
import { useTenant } from '../contexts/TenantContext';
import { formatMoney } from '../lib/utils';

export default function MobileApps() {
  const { locale, t } = useI18n();
  const { connection, pendingChanges, triggerSync } = useSync();
  const { tenant } = useTenant();
  const [stats, setStats] = useState<{ revenue_today?: number; low_stock_count?: number; sales_today?: number } | null>(null);

  useEffect(() => {
    if (!tenant?.id) return;
    fetch(`/api/dashboard?tenant_id=${tenant.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStats(d))
      .catch(() => undefined);
  }, [tenant?.id]);

  const managerLinks = [
    { to: '/dashboard', icon: BarChart3, ar: 'لوحة المدير', en: 'Manager dashboard' },
    { to: '/reports', icon: BarChart3, ar: 'التقارير', en: 'Reports' },
    { to: '/ai', icon: Bell, ar: 'المساعد الذكي', en: 'AI assistant' },
    { to: '/loyalty', icon: Users, ar: 'الولاء', en: 'Loyalty' },
    { to: '/sync', icon: WifiOff, ar: 'المزامنة', en: 'Sync' },
  ];

  const staffLinks = [
    { to: '/pos', icon: ShoppingCart, ar: 'نقطة البيع', en: 'POS' },
    { to: '/products', icon: Package, ar: 'المنتجات', en: 'Products' },
    { to: '/inventory', icon: Warehouse, ar: 'المخزون', en: 'Inventory' },
    { to: '/shifts', icon: Clock3, ar: 'الورديات', en: 'Shifts' },
    { to: '/customers', icon: Users, ar: 'العملاء', en: 'Customers' },
  ];

  return (
    <div>
      <PageHeader
        title={t('mobileApps')}
        description={
          locale === 'ar'
            ? 'واجهات جوال للمدير والموظفين على نفس البنية Offline-First'
            : 'Manager & staff mobile shells on the same offline-first stack'
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={connection === 'offline' ? 'warning' : 'success'}>
          {connection === 'offline' ? t('offline') : t('online')}
        </Badge>
        {pendingChanges > 0 && <Badge tone="accent">{pendingChanges} pending</Badge>}
        <Button size="sm" variant="outline" onClick={() => triggerSync()}>
          {locale === 'ar' ? 'مزامنة' : 'Sync now'}
        </Button>
        <Button size="sm" variant="soft" onClick={() => window.open('/mobile/staff', '_blank')}>
          {t('staffApp')}
        </Button>
        <Button size="sm" onClick={() => window.open('/mobile/manager', '_blank')}>
          {t('managerApp')}
        </Button>
      </div>

      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-app bg-ink-950 p-4 shadow-lift">
          <div className="mb-3 flex items-center justify-between text-teal-100">
            <div className="flex items-center gap-2 font-semibold">
              <Smartphone className="h-4 w-4" />
              {t('managerApp')}
            </div>
            <span className="text-xs opacity-70">PWA</span>
          </div>
          <div className="overflow-hidden rounded-[1.5rem] bg-app">
            <div className="border-b border-app bg-surface px-4 py-3">
              <div className="text-xs text-muted">{tenant?.name_ar || 'RAFD'}</div>
              <div className="text-lg font-bold">{locale === 'ar' ? 'ملخص اليوم' : 'Today'}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3">
              <div className="rounded-2xl bg-primary-soft p-3">
                <div className="text-[11px] text-primary">{locale === 'ar' ? 'مبيعات' : 'Sales'}</div>
                <div className="text-lg font-bold tabular">
                  {formatMoney(stats?.revenue_today || 0, tenant?.currency)}
                </div>
              </div>
              <div className="rounded-2xl bg-warning-soft p-3">
                <div className="text-[11px] text-warning">{locale === 'ar' ? 'تنبيه مخزون' : 'Low stock'}</div>
                <div className="text-lg font-bold">{stats?.low_stock_count ?? '—'}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 px-3 pb-4">
              {managerLinks.map((l) => {
                const Icon = l.icon;
                return (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="flex flex-col items-center gap-1 rounded-2xl border border-app bg-subtle px-2 py-3 text-center text-[11px] font-medium text-secondary"
                  >
                    <Icon className="h-5 w-5 text-primary" />
                    {locale === 'ar' ? l.ar : l.en}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-app bg-[#042f2e] p-4 shadow-lift">
          <div className="mb-3 flex items-center justify-between text-teal-50">
            <div className="flex items-center gap-2 font-semibold">
              <Smartphone className="h-4 w-4" />
              {t('staffApp')}
            </div>
            <span className="text-xs opacity-70">Offline</span>
          </div>
          <div className="overflow-hidden rounded-[1.5rem] bg-app">
            <div className="border-b border-app bg-surface px-4 py-3">
              <div className="text-xs text-muted">{locale === 'ar' ? 'وردية نشطة' : 'Active shift'}</div>
              <div className="text-lg font-bold">{locale === 'ar' ? 'تشغيل سريع' : 'Quick ops'}</div>
            </div>
            <div className="space-y-2 p-3">
              {staffLinks.map((l) => {
                const Icon = l.icon;
                return (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="flex items-center gap-3 rounded-2xl border border-app bg-surface px-3 py-3 text-sm font-medium shadow-soft"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    {locale === 'ar' ? l.ar : l.en}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title={locale === 'ar' ? 'خصائص الجوال' : 'Mobile capabilities'} />
        <CardBody>
          <ul className="grid gap-2 text-sm text-secondary sm:grid-cols-2">
            {[
              locale === 'ar' ? 'نفس JWT والصلاحيات والمزامنة' : 'Same JWT, permissions, and sync',
              locale === 'ar' ? 'Service Worker + outbox offline' : 'Service Worker + offline outbox',
              locale === 'ar' ? 'أهداف لمس كبيرة للموظفين' : 'Large touch targets for staff',
              locale === 'ar' ? 'تبديل لغة فوري AR/EN' : 'Instant AR/EN language switch',
              locale === 'ar' ? 'اختصارات POS والمخزون والورديات' : 'POS, inventory, shifts shortcuts',
              locale === 'ar' ? 'لا يتطلب إعادة بناء كتطبيق أصلي منفصل' : 'No separate native rebuild required',
            ].map((x) => (
              <li key={x} className="rounded-xl bg-muted px-3 py-2">
                {x}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
