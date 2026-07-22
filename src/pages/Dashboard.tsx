import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Banknote,
  Boxes,
  Package,
  Receipt,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
  AlertTriangle,
  ArrowUpLeft,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { BarChart, DonutChart } from '../components/ui/Chart';
import { PageSkeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/States';
import { useTenant } from '../contexts/TenantContext';
import type { DashboardStats } from '../lib/types';
import { formatDateTime, formatMoney } from '../lib/utils';

export default function Dashboard() {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    if (!tenant?.id) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/dashboard?tenant_id=${tenant.id}`);
      if (!res.ok) throw new Error('فشل تحميل لوحة التحكم');
      setStats(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطأ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tenant?.id]);

  if (loading) return <PageSkeleton />;
  if (error || !stats) return <ErrorState description={error} onRetry={load} />;

  const currency = tenant?.currency || 'YER';

  return (
    <div>
      <PageHeader
        title="لوحة التحكم"
        description={`نظرة شاملة على أداء ${tenant?.name_ar || 'المتجر'} اليوم`}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/reports')}>
              التقارير
            </Button>
            <Button onClick={() => navigate('/pos')}>
              <ShoppingCart className="h-4 w-4" />
              فتح نقطة البيع
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="إيرادات اليوم"
          value={formatMoney(stats.revenue_today, currency)}
          change={`${stats.invoices_today} فاتورة اليوم`}
          trend="up"
          icon={Banknote}
          tone="primary"
        />
        <StatCard
          title="إيرادات الشهر"
          value={formatMoney(stats.revenue_month, currency)}
          change="مقارنة بالأيام السابقة"
          trend="up"
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          title="الربح التقديري"
          value={formatMoney(stats.profit_month, currency)}
          change={`مصروفات: ${formatMoney(stats.expenses_month, currency)}`}
          trend={stats.profit_month >= 0 ? 'up' : 'down'}
          icon={Receipt}
          tone="accent"
        />
        <StatCard
          title="تنبيهات المخزون"
          value={String(stats.low_stock_count)}
          change={`${stats.products_count} منتج · ${stats.customers_count} عميل`}
          trend={stats.low_stock_count > 0 ? 'down' : 'neutral'}
          icon={Boxes}
          tone={stats.low_stock_count > 0 ? 'danger' : 'info'}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="المبيعات — آخر 7 أيام"
            description="اتجاه الإيرادات اليومي"
            action={<Badge tone="primary">Live</Badge>}
          />
          <CardBody>
            <BarChart
              data={stats.sales_series.map((s) => ({ label: s.day, value: s.total }))}
              height={220}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="أفضل المنتجات" description="حسب الإيراد" />
          <CardBody>
            <DonutChart
              centerLabel="Top"
              centerValue={String(stats.top_products.length)}
              segments={stats.top_products.map((p, i) => ({
                label: p.name,
                value: Math.round(p.revenue),
                color: `var(--chart-${(i % 5) + 1})`,
              }))}
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="آخر الفواتير"
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate('/invoices')}>
                عرض الكل
                <ArrowUpLeft className="h-4 w-4" />
              </Button>
            }
          />
          <CardBody className="pt-2">
            <div className="divide-y divide-[var(--border)]">
              {stats.recent_sales.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="font-medium text-app">{s.invoice_number}</div>
                    <div className="truncate text-xs text-muted">
                      {s.customer_name || 'عميل نقدي'} · {formatDateTime(s.created_at)}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="font-semibold tabular text-app">{formatMoney(s.total, currency)}</div>
                    <Badge tone={s.payment_method === 'cash' ? 'success' : 'info'}>
                      {s.payment_method === 'cash' ? 'نقدي' : s.payment_method === 'card' ? 'بطاقة' : s.payment_method}
                    </Badge>
                  </div>
                </div>
              ))}
              {!stats.recent_sales.length && (
                <div className="py-8 text-center text-sm text-muted">لا توجد فواتير بعد</div>
              )}
            </div>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" />
                  رؤى ذكية
                </span>
              }
              description="AI Insights"
            />
            <CardBody className="space-y-3">
              {stats.insights.map((insight, i) => (
                <div key={i} className="rounded-xl bg-muted/70 px-3 py-2.5 text-sm text-secondary">
                  {insight}
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="إجراءات سريعة" />
            <CardBody className="grid grid-cols-2 gap-2">
              {[
                { label: 'POS', icon: ShoppingCart, to: '/pos' },
                { label: 'منتج', icon: Package, to: '/products' },
                { label: 'عميل', icon: Users, to: '/customers' },
                { label: 'مخزون', icon: AlertTriangle, to: '/inventory' },
              ].map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.to}
                    onClick={() => navigate(a.to)}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-app bg-subtle px-3 py-4 text-sm font-medium text-secondary transition hover:border-primary hover:text-primary"
                  >
                    <Icon className="h-5 w-5" />
                    {a.label}
                  </button>
                );
              })}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
