import type { ReactNode } from 'react';
import type { Tenant } from '../../lib/types';
import { formatDate, formatMoney } from '../../lib/utils';

export interface PurchaseOrderViewModel {
  reference: string;
  supplier_name?: string | null;
  supplier_phone?: string | null;
  purchase_date?: string | null;
  status: string;
  notes?: string | null;
  total: number;
  paid: number;
  items: Array<{
    product_name: string;
    quantity: number;
    received_quantity?: number;
    unit?: string;
    unit_cost: number;
    total: number;
    cartons?: number;
    units_per_carton?: number;
  }>;
}

export default function PurchaseOrderDoc({
  tenant,
  order,
  currency = 'YER',
  actions,
  docId = 'purchase-order-print',
  mode = 'order',
}: {
  tenant?: Tenant | null;
  order: PurchaseOrderViewModel;
  currency?: string;
  actions?: ReactNode;
  docId?: string;
  mode?: 'order' | 'receipt';
}) {
  const due = Math.max(0, Number(order.total) - Number(order.paid || 0));
  const primary = tenant?.primary_color || '#0d9488';
  const secondary = tenant?.secondary_color || '#d97706';
  const isReceipt = mode === 'receipt';

  return (
    <div className="space-y-4">
      {actions}
      <div
        id={docId}
        className="receipt-print mx-auto overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-soft"
        style={{ width: 420, maxWidth: '100%', fontFamily: '"IBM Plex Sans Arabic", Tahoma, Arial, sans-serif' }}
        dir="rtl"
      >
        {/* Brand header */}
        <div
          style={{
            background: `linear-gradient(135deg, ${primary} 0%, #042f2e 60%, ${secondary} 150%)`,
            color: '#fff',
            padding: '20px 20px 18px',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/25 bg-white/15">
                {tenant?.logo_url ? (
                  <img
                    src={tenant.logo_url}
                    alt="logo"
                    crossOrigin="anonymous"
                    className="h-full w-full bg-white object-contain"
                  />
                ) : (
                  <span className="text-xl font-bold">R</span>
                )}
              </div>
              <div>
                <div className="text-lg font-bold leading-tight">
                  {tenant?.name_ar || tenant?.name || 'رفد'}
                </div>
                <div className="mt-1 text-[11px] text-white/80">{tenant?.address}</div>
                {tenant?.phone && (
                  <div className="text-[11px] text-white/75" dir="ltr">{tenant.phone}</div>
                )}
              </div>
            </div>
            <div className="text-left">
              <div className="inline-flex rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold">
                {isReceipt ? 'إيصال استلام' : 'طلبية شراء'}
              </div>
              <div className="mt-2 font-mono text-sm font-bold">{order.reference}</div>
              <div className="text-[11px] text-white/80">{formatDate(order.purchase_date)}</div>
            </div>
          </div>
        </div>

        <div className="p-5 text-sm">
          <div className="mb-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3">
            <div>
              <div className="text-[11px] text-slate-500">المورد</div>
              <div className="font-semibold">{order.supplier_name || '—'}</div>
              {order.supplier_phone && (
                <div className="mt-0.5 text-[11px] text-slate-600" dir="ltr">{order.supplier_phone}</div>
              )}
            </div>
            <div className="text-left">
              <div className="text-[11px] text-slate-500">الحالة</div>
              <div className="font-semibold">
                {order.status === 'received' ? 'مستلم' : order.status === 'pending' ? 'طلبية' : order.status}
              </div>
              {order.notes && <div className="mt-0.5 text-[11px] text-slate-600">{order.notes}</div>}
            </div>
          </div>

          {!isReceipt && order.supplier_name && (
            <div className="mb-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
              الأخوة <strong>{order.supplier_name}</strong>، يرجى تجهيز الطلبية المذكورة أدناه.
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ background: `${primary}12`, color: primary }}>
                  <th className="px-2.5 py-2 text-start font-semibold">#</th>
                  <th className="px-2.5 py-2 text-start font-semibold">الصنف</th>
                  {isReceipt && <th className="px-2.5 py-2 text-start font-semibold">المطلوب</th>}
                  <th className="px-2.5 py-2 text-start font-semibold">{isReceipt ? 'المستلم' : 'الكمية'}</th>
                  <th className="px-2.5 py-2 text-start font-semibold">التكلفة</th>
                  <th className="px-2.5 py-2 text-start font-semibold">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it, idx) => {
                  const showCartons = !isReceipt && (it.unit === 'كرتون' || (Number(it.cartons) > 0 && Number(it.units_per_carton) > 1));
                  const qtyLabel = showCartons
                    ? `${it.cartons} كرتون`
                    : `${isReceipt ? (it.received_quantity ?? it.quantity) : it.quantity} ${it.unit || 'حبة'}`;
                  return (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="px-2.5 py-2 tabular text-slate-500">{idx + 1}</td>
                      <td className="px-2.5 py-2 font-medium">{it.product_name}</td>
                      {isReceipt && (
                        <td className="px-2.5 py-2 tabular">{it.quantity} {it.unit}</td>
                      )}
                      <td className="px-2.5 py-2 tabular">{qtyLabel}</td>
                      <td className="px-2.5 py-2 tabular">{formatMoney(it.unit_cost, currency)}</td>
                      <td className="px-2.5 py-2 tabular font-semibold">{formatMoney(it.total, currency)}</td>
                    </tr>
                  );
                })}
                {!order.items.length && (
                  <tr>
                    <td colSpan={isReceipt ? 6 : 5} className="px-3 py-6 text-center text-slate-500">
                      لا توجد أصناف
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!isReceipt && (
            <div className="mt-2 text-[11px] text-slate-500">
              الأسعار تقريبية وقابلة للتغيير حسب سعر السوق وقت التوريد.
            </div>
          )}

          <div className="mt-4 space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex justify-between text-slate-600">
              <span>الإجمالي</span>
              <span className="tabular font-semibold">{formatMoney(order.total, currency)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>المدفوع</span>
              <span className="tabular font-semibold">{formatMoney(order.paid || 0, currency)}</span>
            </div>
            {due > 0 && (
              <div className="flex justify-between font-semibold" style={{ color: secondary }}>
                <span>المتبقي (له)</span>
                <span className="tabular">{formatMoney(due, currency)}</span>
              </div>
            )}
            {due < 0 && (
              <div className="flex justify-between font-semibold text-success">
                <span>رصيد مسبق (علينا)</span>
                <span className="tabular">{formatMoney(Math.abs(due), currency)}</span>
              </div>
            )}
          </div>

          <div className="mt-5 border-t border-dashed border-slate-200 pt-4 text-center">
            <div className="text-[11px] text-slate-500">
              مع خالص الشكر
            </div>
            <div className="mt-1 text-[10px] font-semibold" style={{ color: primary }}>
              رفد | RAFD
            </div>
            {tenant?.tax_number && (
              <div className="mt-1 text-[10px] text-slate-400">ضريبي: {tenant.tax_number}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
