import type { InvoiceViewModel } from './DetailedInvoice';
import type { Tenant } from '../../lib/types';
import { formatDateTime, formatMoney, paymentMethodLabel } from '../../lib/utils';
import type { PaperWidth } from '../../lib/posSettings';

/** On-screen preview of thermal ticket (also printable). */
export default function ThermalReceipt({
  tenant,
  invoice,
  currency = 'YER',
  paperWidth = '80',
  branchName,
  docId = 'thermal-receipt-print',
}: {
  tenant?: Tenant | null;
  invoice: InvoiceViewModel;
  currency?: string;
  paperWidth?: PaperWidth;
  branchName?: string | null;
  docId?: string;
}) {
  const width = paperWidth === '58' ? 220 : 300;
  const due = Math.max(0, Number(invoice.total) - Number(invoice.paid || 0));

  return (
    <div
      id={docId}
      className="receipt-print mx-auto bg-white text-black shadow-soft"
      style={{
        width,
        maxWidth: '100%',
        fontFamily: '"IBM Plex Sans Arabic", Tahoma, Arial, sans-serif',
        fontSize: paperWidth === '58' ? 11 : 12,
        padding: 10,
        borderRadius: 12,
        border: '1px solid #e2e8f0',
      }}
      dir="rtl"
    >
      <div className="text-center">
        {tenant?.logo_url && (
          <img
            src={tenant.logo_url}
            alt=""
            className="mx-auto mb-1 h-10 w-10 object-contain"
            crossOrigin="anonymous"
          />
        )}
        <div className="text-base font-extrabold">{tenant?.name_ar || tenant?.name || 'رفد'}</div>
        {tenant?.address && <div className="text-[10px] opacity-80">{tenant.address}</div>}
        {branchName && <div className="text-[10px] opacity-80">{branchName}</div>}
      </div>

      <div className="my-2 border-t border-dashed border-black/40" />

      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between gap-2">
          <span>فاتورة</span>
          <span className="font-bold">{invoice.invoice_number}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>التاريخ</span>
          <span>{formatDateTime(invoice.created_at || new Date())}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>العميل</span>
          <span>{invoice.customer_name || 'عميل نقدي'}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>الدفع</span>
          <span>{paymentMethodLabel(invoice.payment_method)}</span>
        </div>
      </div>

      <div className="my-2 border-t border-dashed border-black/40" />

      <div className="space-y-2">
        {invoice.items.map((it, i) => (
          <div key={i}>
            <div className="font-semibold leading-tight">{it.product_name}</div>
            <div className="flex justify-between text-[10px] tabular-nums opacity-90">
              <span>
                {it.qty_label || it.quantity} × {formatMoney(it.unit_price, currency)}
              </span>
              <span className="font-bold">{formatMoney(it.total, currency)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="my-2 border-t border-dashed border-black/40" />

      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>المجموع</span>
          <span className="tabular-nums">{formatMoney(invoice.subtotal, currency)}</span>
        </div>
        {!!invoice.discount && (
          <div className="flex justify-between">
            <span>الخصم</span>
            <span className="tabular-nums">-{formatMoney(invoice.discount, currency)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-extrabold">
          <span>الإجمالي</span>
          <span className="tabular-nums">{formatMoney(invoice.total, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span>المدفوع</span>
          <span className="tabular-nums">{formatMoney(invoice.paid ?? invoice.total, currency)}</span>
        </div>
        {due > 0 && (
          <div className="flex justify-between font-semibold">
            <span>آجل متبقي</span>
            <span className="tabular-nums">{formatMoney(due, currency)}</span>
          </div>
        )}
      </div>

      <div className="my-2 border-t border-dashed border-black/40" />
      <div className="text-center text-[10px]">
        {tenant?.invoice_footer || 'شكراً لتسوقكم معنا — رفد | RAFD'}
      </div>
      <div className="mt-1 text-center font-mono text-[11px] tracking-wider">
        *{invoice.invoice_number}*
      </div>
    </div>
  );
}
