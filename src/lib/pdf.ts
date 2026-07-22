import type { Customer, Sale, Tenant } from './types';
import { formatMoney } from './utils';

export interface LedgerRow {
  id: number;
  type: string;
  amount: number;
  balance_after: number;
  reference?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface StatementExportInput {
  tenant: Tenant | null;
  customer: Customer;
  ledger: LedgerRow[];
  sales: Sale[];
  currency?: string;
  element?: HTMLElement | null;
  periodLabel?: string;
}

/** Full multi-page PDF from detailed statement DOM */
export async function downloadCustomerStatementPdf(opts: StatementExportInput) {
  if (!opts.element) {
    throw new Error('element required for statement PDF');
  }
  const { downloadElementAsPdf } = await import('./documentExport');
  const period = opts.periodLabel ? `-${opts.periodLabel.replace(/\s+/g, '_')}` : '';
  await downloadElementAsPdf(
    opts.element,
    `rafd-statement-${opts.customer.id}${period}-${Date.now()}.pdf`
  );
}

export function buildStatementWhatsAppText(opts: {
  tenantName: string;
  customerName: string;
  phone?: string | null;
  openingBalance?: number;
  closingBalance: number;
  periodDebit?: number;
  periodCredit?: number;
  periodLabel?: string;
  currency: string;
  invoicesCount: number;
  productsLines?: number;
}) {
  return [
    `📋 *ملخص كشف حساب*`,
    `المتجر: ${opts.tenantName}`,
    `العميل: ${opts.customerName}`,
    opts.phone ? `واتساب: ${opts.phone}` : '',
    opts.periodLabel ? `الفترة: ${opts.periodLabel}` : '',
    opts.openingBalance != null
      ? `الرصيد السابق: ${formatMoney(opts.openingBalance, opts.currency)}`
      : '',
    `الرصيد الحالي/الختامي: ${formatMoney(opts.closingBalance, opts.currency)}`,
    opts.periodDebit != null ? `مدين الفترة: ${formatMoney(opts.periodDebit, opts.currency)}` : '',
    opts.periodCredit != null ? `دائن الفترة: ${formatMoney(opts.periodCredit, opts.currency)}` : '',
    `الفواتير: ${opts.invoicesCount}${opts.productsLines != null ? ` · أصناف: ${opts.productsLines}` : ''}`,
    '',
    '📄 للتفاصيل الكاملة اطلب ملف PDF من المتجر',
    'رفد | RAFD',
  ]
    .filter(Boolean)
    .join('\n');
}
