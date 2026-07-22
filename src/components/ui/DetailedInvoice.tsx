import type { ReactNode } from 'react';
import type { Sale, SaleItem, Tenant } from '../../lib/types';
import { formatDateTime, formatMoney, formatWeightLabel, paymentMethodLabel } from '../../lib/utils';

export interface InvoiceViewModel {
  invoice_number: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  payment_method?: string | null;
  created_at?: string | null;
  subtotal: number;
  discount: number;
  tax?: number;
  total: number;
  paid?: number;
  created_by?: string | null;
  items: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    total: number;
    qty_label?: string;
    weight_g?: number;
  }>;
}

export function saleToInvoiceView(
  sale: Sale & { items?: SaleItem[] },
  phone?: string | null
): InvoiceViewModel {
  return {
    invoice_number: sale.invoice_number,
    customer_name: sale.customer_name,
    customer_phone: phone,
    payment_method: sale.payment_method,
    created_at: sale.created_at,
    subtotal: Number(sale.subtotal || 0),
    discount: Number(sale.discount || 0),
    tax: Number(sale.tax || 0),
    total: Number(sale.total || 0),
    paid: Number(sale.paid ?? sale.total ?? 0),
    created_by: sale.created_by,
    items: (sale.items || []).map((it) => {
      const qty = Number(it.quantity);
      const name = String(it.product_name || '');
      // Prefer embedded weight label from POS: "طماطم (500 غرام)"
      const embedded = name.match(/\(([^)]*(?:غرام|كجم)[^)]*)\)/);
      let qty_label = embedded?.[1] || '';
      if (!qty_label) {
        // weight lines stored as kg (can be fractional or >= 1)
        const looksWeighted =
          !Number.isInteger(qty) ||
          name.includes('كجم') ||
          name.includes('غرام');
        if (looksWeighted && qty > 0) {
          qty_label = formatWeightLabel(Math.round(qty * 1000));
        } else {
          qty_label = `${qty}`;
        }
      }
      return {
        product_name: name.replace(/\s*\([^)]*(?:غرام|كجم)[^)]*\)\s*$/, '').trim() || name,
        quantity: qty,
        unit_price: Number(it.unit_price),
        total: Number(it.total),
        qty_label,
      };
    }),
  };
}

export default function DetailedInvoice({
  tenant,
  invoice,
  currency = 'YER',
  actions,
  docId = 'detailed-invoice-print',
}: {
  tenant?: Tenant | null;
  invoice: InvoiceViewModel;
  currency?: string;
  actions?: ReactNode;
  docId?: string;
}) {
  const due = Math.max(0, Number(invoice.total) - Number(invoice.paid || 0));
  const primary = tenant?.primary_color || '#0d9488';
  const secondary = tenant?.secondary_color || '#d97706';

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
              <div
                className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/25 bg-white/15"
              >
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
                  <div className="text-[11px] text-white/75" dir="ltr">
                    {tenant.phone}
                  </div>
                )}
              </div>
            </div>
            <div className="text-left">
              <div className="inline-flex rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold">
                فاتورة مبيعات
              </div>
              <div className="mt-2 font-mono text-sm font-bold">{invoice.invoice_number}</div>
              <div className="text-[11px] text-white/80">{formatDateTime(invoice.created_at)}</div>
            </div>
          </div>
        </div>

        <div className="p-5 text-sm">
          <div className="mb-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3">
            <div>
              <div className="text-[11px] text-slate-500">العميل</div>
              <div className="font-semibold">{invoice.customer_name || 'عميل نقدي'}</div>
              {invoice.customer_phone && (
                <div className="mt-0.5 text-[11px] text-slate-600" dir="ltr">
                  {invoice.customer_phone}
                </div>
              )}
            </div>
            <div className="text-left">
              <div className="text-[11px] text-slate-500">الدفع</div>
              <div className="font-semibold">{paymentMethodLabel(invoice.payment_method)}</div>
              {invoice.created_by && (
                <div className="mt-0.5 text-[11px] text-slate-600">الكاشير: {invoice.created_by}</div>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ background: `${primary}12`, color: primary }}>
                  <th className="px-2.5 py-2 text-start font-semibold">#</th>
                  <th className="px-2.5 py-2 text-start font-semibold">الصنف</th>
                  <th className="px-2.5 py-2 text-start font-semibold">الكمية</th>
                  <th className="px-2.5 py-2 text-start font-semibold">السعر</th>
                  <th className="px-2.5 py-2 text-start font-semibold">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((it, idx) => (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className="px-2.5 py-2 tabular text-slate-500">{idx + 1}</td>
                    <td className="px-2.5 py-2 font-medium">{it.product_name}</td>
                    <td className="px-2.5 py-2 tabular">
                      {it.qty_label ||
                        (Number(it.quantity) < 1 && Number(it.quantity) > 0
                          ? formatWeightLabel(Math.round(Number(it.quantity) * 1000))
                          : it.quantity)}
                    </td>
                    <td className="px-2.5 py-2 tabular">{formatMoney(it.unit_price, currency)}</td>
                    <td className="px-2.5 py-2 tabular font-semibold">{formatMoney(it.total, currency)}</td>
                  </tr>
                ))}
                {!invoice.items.length && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                      لا توجد بنود تفصيلية
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex justify-between text-slate-600">
              <span>المجموع الفرعي</span>
              <span className="tabular">{formatMoney(invoice.subtotal, currency)}</span>
            </div>
            {!!invoice.discount && (
              <div className="flex justify-between text-red-600">
                <span>الخصم</span>
                <span className="tabular">-{formatMoney(invoice.discount, currency)}</span>
              </div>
            )}
            {!!invoice.tax && (
              <div className="flex justify-between text-slate-600">
                <span>الضريبة</span>
                <span className="tabular">{formatMoney(invoice.tax, currency)}</span>
              </div>
            )}
            <div
              className="mt-1 flex items-center justify-between rounded-xl px-3 py-2 text-white"
              style={{ background: primary }}
            >
              <span className="font-bold">الإجمالي</span>
              <span className="text-lg font-extrabold tabular">{formatMoney(invoice.total, currency)}</span>
            </div>
            <div className="flex justify-between pt-1 text-slate-600">
              <span>المدفوع</span>
              <span className="tabular font-semibold">{formatMoney(invoice.paid || 0, currency)}</span>
            </div>
            {due > 0 && (
              <div className="flex justify-between font-semibold" style={{ color: secondary }}>
                <span>المتبقي (آجل)</span>
                <span className="tabular">{formatMoney(due, currency)}</span>
              </div>
            )}
          </div>

          <div className="mt-5 border-t border-dashed border-slate-200 pt-4 text-center">
            <div className="text-[11px] text-slate-500">
              {tenant?.invoice_footer || 'شكراً لتسوقكم معنا'}
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
