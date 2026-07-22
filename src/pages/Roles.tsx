import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { ROLES } from '../lib/utils';
import { Check, X } from 'lucide-react';

const matrix: Record<string, string[]> = {
  owner: ['dashboard', 'pos', 'products', 'inventory', 'purchases', 'suppliers', 'customers', 'invoices', 'payments', 'expenses', 'reports', 'branches', 'users', 'roles', 'settings', 'sync', 'backup', 'subscription'],
  manager: ['dashboard', 'pos', 'products', 'inventory', 'purchases', 'suppliers', 'customers', 'invoices', 'payments', 'expenses', 'reports', 'branches', 'users', 'notifications', 'sync'],
  cashier: ['pos', 'products', 'customers', 'invoices', 'notifications'],
  warehouse: ['products', 'inventory', 'purchases', 'suppliers', 'notifications'],
  accountant: ['dashboard', 'purchases', 'suppliers', 'customers', 'invoices', 'payments', 'expenses', 'reports'],
  superadmin: ['*'],
};

const features = [
  { id: 'dashboard', label: 'لوحة التحكم' },
  { id: 'pos', label: 'نقطة البيع' },
  { id: 'products', label: 'المنتجات' },
  { id: 'inventory', label: 'المخزون' },
  { id: 'purchases', label: 'المشتريات' },
  { id: 'reports', label: 'التقارير' },
  { id: 'users', label: 'المستخدمون' },
  { id: 'settings', label: 'الإعدادات' },
  { id: 'subscription', label: 'الاشتراك' },
];

export default function Roles() {
  return (
    <div>
      <PageHeader
        title="الأدوار والصلاحيات"
        description="نموذج صلاحيات واضح لفريق المتجر — بدون تعقيد"
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ROLES.map((r) => (
          <Card key={r.id}>
            <CardBody>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-app">{r.label}</div>
                  <div className="text-xs text-muted">{r.labelEn}</div>
                </div>
                <Badge tone="primary">{r.id}</Badge>
              </div>
              <p className="mt-3 text-sm text-secondary">
                {r.id === 'owner' && 'تحكم كامل بالمتجر والفوترة والاشتراك'}
                {r.id === 'manager' && 'تشغيل يومي وتقارير وفريق'}
                {r.id === 'cashier' && 'بيع سريع وخدمة عملاء'}
                {r.id === 'warehouse' && 'مخزون ومشتريات وموردون'}
                {r.id === 'accountant' && 'مالية وتقارير ومدفوعات'}
                {r.id === 'superadmin' && 'إدارة المنصة وكل المستأجرين'}
              </p>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="مصفوفة الصلاحيات" description="Permissions matrix" />
        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-muted">
                <th className="p-2 text-start font-medium">الميزة</th>
                {ROLES.filter((r) => r.id !== 'superadmin').map((r) => (
                  <th key={r.id} className="p-2 text-center font-medium">{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((f) => (
                <tr key={f.id} className="border-t border-app">
                  <td className="p-2 font-medium text-app">{f.label}</td>
                  {ROLES.filter((r) => r.id !== 'superadmin').map((r) => {
                    const allowed = matrix[r.id]?.includes('*') || matrix[r.id]?.includes(f.id);
                    return (
                      <td key={r.id} className="p-2 text-center">
                        {allowed ? (
                          <Check className="mx-auto h-4 w-4 text-success" />
                        ) : (
                          <X className="mx-auto h-4 w-4 text-muted opacity-40" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
