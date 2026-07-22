import { buildEscPosInvoice, buildOpenDrawerCommand, type ThermalInvoicePayload } from './commands';
import { printThermalReceipt } from '../thermalPrint';
import type { InvoiceViewModel } from '../../components/ui/DetailedInvoice';
import type { Tenant } from '../types';
import { formatDateTime, formatMoney, paymentMethodLabel } from '../utils';
import type { PaperWidth } from '../posSettings';

export type PrintTransport = 'webusb' | 'webserial' | 'browser' | 'auto';

const USB_FILTERS = [
  // Common thermal printer vendors (Epson, Star, Chinese OEM boards)
  { classCode: 7 }, // printer class
];

function hasWebUsb() {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

function hasWebSerial() {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

async function sendBytesWebUsb(data: Uint8Array) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usb = (navigator as any).usb;
  let device = (await usb.getDevices())[0];
  if (!device) {
    device = await usb.requestDevice({ filters: USB_FILTERS });
  }
  if (!device.opened) await device.open();
  if (device.configuration == null) await device.selectConfiguration(1);

  // Find OUT endpoint
  let iface = 0;
  let endpoint = 1;
  const conf = device.configuration;
  for (const i of conf.interfaces) {
    for (const alt of i.alternates) {
      for (const ep of alt.endpoints) {
        if (ep.direction === 'out') {
          iface = i.interfaceNumber;
          endpoint = ep.endpointNumber;
        }
      }
    }
  }
  try {
    await device.claimInterface(iface);
  } catch {
    /* already claimed */
  }
  await device.transferOut(endpoint, data);
}

async function sendBytesWebSerial(data: Uint8Array) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serial = (navigator as any).serial;
  const ports = await serial.getPorts();
  let port = ports[0];
  if (!port) port = await serial.requestPort();
  await port.open({ baudRate: 9600 });
  const writer = port.writable.getWriter();
  await writer.write(data);
  writer.releaseLock();
  await port.close();
}

export async function sendRawToPrinter(data: Uint8Array, transport: PrintTransport = 'auto') {
  const prefer = transport === 'auto' ? (hasWebUsb() ? 'webusb' : hasWebSerial() ? 'webserial' : 'browser') : transport;

  if (prefer === 'webusb' && hasWebUsb()) {
    await sendBytesWebUsb(data);
    return { transport: 'webusb' as const };
  }
  if (prefer === 'webserial' && hasWebSerial()) {
    await sendBytesWebSerial(data);
    return { transport: 'webserial' as const };
  }
  throw new Error('NO_RAW_TRANSPORT');
}

export function invoiceToEscPosPayload(opts: {
  tenant?: Tenant | null;
  invoice: InvoiceViewModel;
  currency?: string;
  paperWidth?: PaperWidth;
  branchName?: string | null;
  openDrawer?: boolean;
}): ThermalInvoicePayload {
  const currency = opts.currency || opts.tenant?.currency || 'YER';
  const inv = opts.invoice;
  const due = Math.max(0, Number(inv.total) - Number(inv.paid || 0));
  const chars = opts.paperWidth === '58' ? 32 : 42;
  return {
    storeName: opts.tenant?.name_ar || opts.tenant?.name || 'RAFD',
    address: opts.tenant?.address || undefined,
    phone: opts.tenant?.phone || undefined,
    branchName: opts.branchName || undefined,
    invoiceNumber: inv.invoice_number,
    createdAtLabel: formatDateTime(inv.created_at || new Date(), 'en-GB'),
    customerName: inv.customer_name || 'Cash',
    cashierName: inv.created_by || undefined,
    paymentLabel: paymentMethodLabel(inv.payment_method),
    lines: inv.items.map((it) => ({
      name: it.product_name,
      qtyLabel: it.qty_label || String(it.quantity),
      unitPriceLabel: formatMoney(it.unit_price, currency, 'en-US'),
      totalLabel: formatMoney(it.total, currency, 'en-US'),
    })),
    subtotalLabel: formatMoney(inv.subtotal, currency, 'en-US'),
    discountLabel: inv.discount ? formatMoney(inv.discount, currency, 'en-US') : undefined,
    taxLabel: inv.tax ? formatMoney(inv.tax, currency, 'en-US') : undefined,
    totalLabel: formatMoney(inv.total, currency, 'en-US'),
    paidLabel: formatMoney(inv.paid ?? inv.total, currency, 'en-US'),
    dueLabel: due > 0 ? formatMoney(due, currency, 'en-US') : undefined,
    footer: opts.tenant?.invoice_footer || 'Thank you — RAFD',
    paperChars: chars,
    openDrawer: opts.openDrawer,
    cut: true,
  };
}

/**
 * Try raw ESC/POS first (real device), fall back to browser thermal HTML print.
 */
export async function printEscPosOrBrowser(opts: {
  tenant?: Tenant | null;
  invoice: InvoiceViewModel;
  currency?: string;
  paperWidth?: PaperWidth;
  branchName?: string | null;
  openDrawer?: boolean;
  transport?: PrintTransport;
  copies?: number;
}) {
  const payload = invoiceToEscPosPayload(opts);
  const bytes = buildEscPosInvoice(payload);
  try {
    await sendRawToPrinter(bytes, opts.transport || 'auto');
    return { mode: 'escpos' as const };
  } catch {
    await printThermalReceipt({
      tenant: opts.tenant,
      invoice: opts.invoice,
      currency: opts.currency,
      paperWidth: opts.paperWidth,
      branchName: opts.branchName,
      copies: opts.copies,
    });
    return { mode: 'browser' as const };
  }
}

export async function openCashDrawer(transport: PrintTransport = 'auto') {
  const bytes = buildOpenDrawerCommand(0);
  try {
    await sendRawToPrinter(bytes, transport);
    return { ok: true, mode: 'escpos' as const };
  } catch (err) {
    // Browser fallback cannot pulse drawer pins — surface clear error
    return {
      ok: false,
      mode: 'unsupported' as const,
      error: err instanceof Error ? err.message : 'Cash drawer requires USB/Serial ESC/POS printer',
    };
  }
}
