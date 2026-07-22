import { useEffect, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { BarChart, DonutChart } from '../components/ui/Chart';
import { PageSkeleton } from '../components/ui/Skeleton';
import StatCard from '../components/ui/StatCard';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { Banknote, Receipt, TrendingUp, Boxes } from 'lucide-react';
import { useTenant } from '../contexts/TenantContext';
import type { DashboardStats } from '../lib/types';
import { formatMoney } from '../lib/utils';
import { downloadCsv, downloadExcel } from '../lib/reports/excel';

interface Pnl {
  revenue: number;
  cogs: number;
  gross_profit: number;
  expenses: number;
  net_profit: number;
  discounts: number;
  tax: number;
  invoices_count: number;
  revenue_by_day: Array<{ day: string; total: number }>;
  expenses_by_category: Array<{ category: string; total: number }>;
}

export default function Reports() {
  const { tenant } = useTenant();
  const currency = tenant?.currency || 'YER';
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [exporting, setExporting] = useState('');

  const load = async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const [dRes, pRes] = await Promise.all([
      fetch(`/api/dashboard?tenant_id=${tenant.id}`),
      fetch(`/api/reports?type=pnl&tenant_id=${tenant.id}&from=${from}&to=${to}`),
    ]);
    if (dRes.ok) setStats(await dRes.json());
    if (pRes.ok) setPnl(await pRes.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [tenant?.id]);

  const exportReport = async (type: 'sales_export' | 'inventory_export', format: 'csv' | 'xls') => {
    setExporting(`${type}-${format}`);
    const res = await fetch(
      `/api/reports?type=${type}&tenant_id=${tenant?.id}&from=${from}&to=${to}`
    );
    if (res.ok) {
      const data = await res.json();
      const name = `${type}-${from}-${to}`;
      if (format === 'csv') downloadCsv(`${name}.csv`, data.columns, data.rows);
      else downloadExcel(name, data.columns, data.rows, type);
    }
    setExporting('');
  };

  const exportPnl = () => {
    if (!pnl) return;
    const columns = ['metric', 'value'];
    const rows = [
      { metric: 'revenue', value: pnl.revenue },
      { metric: 'cogs', value: pnl.cogs },
      { metric: 'gross_profit', value: pnl.gross_profit },
      { metric: 'expenses', value: pnl.expenses },
      { metric: 'net_profit', value: pnl.net_profit },
      { metric: 'discounts', value: pnl.discounts },
      { metric: 'tax', value: pnl.tax },
      { metric: 'invoices_count', value: pnl.invoices_count },
    ];
    downloadExcel(`pnl-${from}-${to}`, columns, rows, 'P&L');
  };

  if (loading || !stats) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title="التقارير"
        description="P&L · Excel/CSV · تحليلات المبيعات"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={exportPnl} disabled={!pnl}>
              <FileSpreadsheet className="h-4 w-4" /> P&L Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={exporting === 'sales_export-xls'}
              onClick={() => exportReport('sales_export', 'xls')}
            >
              <Download className="h-4 w-4" /> مبيعات Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={exporting === 'inventory_export-csv'}
              onClick={() => exportReport('inventory_export', 'csv')}
            >
              مخزون CSV
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-app bg-surface p-4">
        <Input label="من" type="date" value={from} onChange={(e) => setFrom(e.target.value)} containerClassName="w-40" />
        <Input label="إلى" type="date" value={to} onChange={(e) => setTo(e.target.value)} containerClassName="w-40" />
        <Button onClick={load}>تطبيق الفترة</Button>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="إيراد الفترة (P&L)"
          value={formatMoney(pnl?.revenue ?? stats.revenue_month, currency)}
          icon={Banknote}
          tone="primary"
        />
        <StatCard
          title="مجمل الربح"
          value={formatMoney(pnl?.gross_profit ?? stats.profit_month, currency)}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          title="المصروفات"
          value={formatMoney(pnl?.expenses ?? stats.expenses_month, currency)}
          icon={Receipt}
          tone="accent"
        />
        <StatCard
          title="صافي الربح"
          value={formatMoney(pnl?.net_profit ?? stats.profit_month, currency)}
          icon={Boxes}
          tone={Number(pnl?.net_profit ?? 0) >= 0 ? 'success' : 'danger'}
        />
      </div>

      {pnl && (
        <Card className="mb-4">
          <CardHeader title="قائمة الدخل المختصرة (P&L)" description={`${from} → ${to}`} />
          <CardBody className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            {[
              ['الإيرادات', pnl.revenue],
              ['الخصومات', pnl.discounts],
              ['تكلفة البضاعة COGS', pnl.cogs],
              ['مجمل الربح', pnl.gross_profit],
              ['المصروفات التشغيلية', pnl.expenses],
              ['الضريبة المحصّلة', pnl.tax],
              ['صافي الربح', pnl.net_profit],
              ['عدد الفواتير', pnl.invoices_count],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-xl bg-muted px-3 py-2 flex justify-between gap-2">
                <span className="text-muted">{k}</span>
                <span className="font-semibold tabular">
                  {typeof v === 'number' && String(k) !== 'عدد الفواتير'
                    ? formatMoney(v, currency)
                    : v}
                </span>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="اتجاه الإيراد" description="حسب تقرير P&L أو آخر 7 أيام" />
          <CardBody>
            <BarChart
              data={
                pnl?.revenue_by_day?.length
                  ? pnl.revenue_by_day.map((s) => ({ label: s.day.slice(5), value: s.total }))
                  : stats.sales_series.map((s) => ({ label: s.day, value: s.total }))
              }
              height={240}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="المصروفات حسب التصنيف" />
          <CardBody>
            <DonutChart
              segments={
                (pnl?.expenses_by_category || []).map((p, i) => ({
                  label: p.category,
                  value: Math.round(p.total),
                  color: `var(--chart-${(i % 5) + 1})`,
                }))
              }
              centerLabel="مصروف"
              centerValue={formatMoney(pnl?.expenses || 0, currency)}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
