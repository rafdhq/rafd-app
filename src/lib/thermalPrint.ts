import type { InvoiceViewModel } from '../components/ui/DetailedInvoice';
import type { Tenant } from './types';
import { formatDateTime, formatMoney, paymentMethodLabel } from './utils';
import type { PaperWidth } from './posSettings';

function esc(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildThermalReceiptHtml(opts: {
  tenant?: Tenant | null;
  invoice: InvoiceViewModel;
  currency?: string;
  paperWidth?: PaperWidth;
  branchName?: string | null;
  headerNote?: string;
  footerNote?: string;
  copies?: number;
}) {
  const currency = opts.currency || opts.tenant?.currency || 'YER';
  const widthMm = opts.paperWidth === '58' ? 58 : 80;
  const inv = opts.invoice;
  const due = Math.max(0, Number(inv.total) - Number(inv.paid || 0));
  const store = opts.tenant?.name_ar || opts.tenant?.name || 'RAFD';
  const phone = opts.tenant?.phone || '';
  const address = opts.tenant?.address || '';
  const footer =
    opts.footerNote ||
    opts.tenant?.invoice_footer ||
    'شكراً لتسوقكم معنا — رفد | RAFD';

  const itemsHtml = inv.items
    .map((it) => {
      const qty = it.qty_label || String(it.quantity);
      return `
      <tr>
        <td class="name">${esc(it.product_name)}</td>
      </tr>
      <tr class="meta">
        <td>${esc(qty)} × ${esc(formatMoney(it.unit_price, currency))}</td>
        <td class="num">${esc(formatMoney(it.total, currency))}</td>
      </tr>`;
    })
    .join('');

  const logo = opts.tenant?.logo_url
    ? `<img class="logo" src="${esc(opts.tenant.logo_url)}" alt="" />`
    : '';

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${esc(inv.invoice_number)}</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 2mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
    font-family: "IBM Plex Sans Arabic", Tahoma, Arial, sans-serif;
    font-size: ${widthMm === 58 ? 11 : 12}px;
    line-height: 1.35;
  }
  .ticket {
    width: ${widthMm}mm;
    max-width: 100%;
    margin: 0 auto;
    padding: 2mm;
  }
  .center { text-align: center; }
  .logo { width: 42px; height: 42px; object-fit: contain; margin: 0 auto 4px; display: block; }
  .store { font-weight: 800; font-size: ${widthMm === 58 ? 14 : 16}px; }
  .muted { color: #222; opacity: 0.9; font-size: 10px; }
  .line { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .bold { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 1px 0; }
  td.name { font-weight: 600; }
  tr.meta td { font-size: 10px; padding-bottom: 4px; }
  td.num { text-align: left; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .totals td { padding: 2px 0; }
  .total-line td { font-size: ${widthMm === 58 ? 13 : 14}px; font-weight: 800; padding-top: 4px; }
  .footer { text-align: center; margin-top: 8px; font-size: 10px; }
  .barcode {
    text-align: center;
    font-family: "Courier New", monospace;
    letter-spacing: 1px;
    margin-top: 6px;
    font-size: 11px;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="ticket">
    ${logo}
    <div class="center store">${esc(store)}</div>
    ${address ? `<div class="center muted">${esc(address)}</div>` : ''}
    ${phone ? `<div class="center muted" dir="ltr">${esc(phone)}</div>` : ''}
    ${opts.branchName ? `<div class="center muted">${esc(opts.branchName)}</div>` : ''}
    ${opts.headerNote ? `<div class="center muted">${esc(opts.headerNote)}</div>` : ''}
    <div class="line"></div>
    <div class="row"><span>فاتورة</span><span class="bold">${esc(inv.invoice_number)}</span></div>
    <div class="row"><span>التاريخ</span><span>${esc(formatDateTime(inv.created_at || new Date()))}</span></div>
    <div class="row"><span>العميل</span><span>${esc(inv.customer_name || 'عميل نقدي')}</span></div>
    ${inv.customer_phone ? `<div class="row"><span>واتساب</span><span dir="ltr">${esc(inv.customer_phone)}</span></div>` : ''}
    <div class="row"><span>الدفع</span><span>${esc(paymentMethodLabel(inv.payment_method))}</span></div>
    ${inv.created_by ? `<div class="row"><span>الكاشير</span><span>${esc(inv.created_by)}</span></div>` : ''}
    <div class="line"></div>
    <table>${itemsHtml}</table>
    <div class="line"></div>
    <table class="totals">
      <tr><td>المجموع</td><td class="num">${esc(formatMoney(inv.subtotal, currency))}</td></tr>
      ${inv.discount ? `<tr><td>الخصم</td><td class="num">-${esc(formatMoney(inv.discount, currency))}</td></tr>` : ''}
      ${inv.tax ? `<tr><td>الضريبة</td><td class="num">${esc(formatMoney(inv.tax, currency))}</td></tr>` : ''}
      <tr class="total-line"><td>الإجمالي</td><td class="num">${esc(formatMoney(inv.total, currency))}</td></tr>
      <tr><td>المدفوع</td><td class="num">${esc(formatMoney(inv.paid ?? inv.total, currency))}</td></tr>
      ${due > 0 ? `<tr><td>آجل متبقي</td><td class="num">${esc(formatMoney(due, currency))}</td></tr>` : ''}
    </table>
    <div class="line"></div>
    <div class="footer">${esc(footer)}</div>
    <div class="barcode">*${esc(inv.invoice_number)}*</div>
  </div>
</body>
</html>`;
}

/**
 * Print thermal receipt via hidden iframe.
 * Works with USB/network thermal printers set as the system default printer
 * (or chosen in the print dialog). Paper size 58/80mm is set via @page.
 */
export async function printThermalReceipt(opts: {
  tenant?: Tenant | null;
  invoice: InvoiceViewModel;
  currency?: string;
  paperWidth?: PaperWidth;
  branchName?: string | null;
  headerNote?: string;
  footerNote?: string;
  copies?: number;
  silent?: boolean;
}) {
  const copies = Math.max(1, Math.min(3, Number(opts.copies || 1)));
  const html = buildThermalReceiptHtml(opts);

  for (let i = 0; i < copies; i++) {
    await printHtmlDocument(html);
    if (i < copies - 1) await wait(350);
  }
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function printHtmlDocument(html: string) {
  return new Promise<void>((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      resolve();
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    const cleanup = () => {
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch {
          /* ignore */
        }
        resolve();
      }, 400);
    };

    const doPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error(err);
      } finally {
        cleanup();
      }
    };

    // wait for images/fonts
    setTimeout(doPrint, 250);
  });
}
