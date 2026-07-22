/**
 * ESC/POS binary command builder for real thermal printers.
 * Supports USB (WebUSB), Serial (Web Serial), and Network bridge payloads.
 */

const ESC = 0x1b;
const GS = 0x1d;
const FS = 0x1c;

export type EscPosAlign = 'left' | 'center' | 'right';

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function textEncoder(text: string, encoding: 'utf8' | 'cp864' = 'utf8'): Uint8Array {
  if (encoding === 'utf8') return new TextEncoder().encode(text);
  // Fallback: strip to ASCII-ish for legacy printers without UTF-8
  const cleaned = text.replace(/[^\x20-\x7E\n\r\t]/g, '?');
  return new TextEncoder().encode(cleaned);
}

export class EscPosBuilder {
  private parts: Uint8Array[] = [];
  private encoding: 'utf8' | 'cp864';

  constructor(opts?: { encoding?: 'utf8' | 'cp864' }) {
    this.encoding = opts?.encoding || 'utf8';
    this.init();
  }

  private push(...bytes: number[]) {
    this.parts.push(new Uint8Array(bytes));
    return this;
  }

  private pushBuf(buf: Uint8Array) {
    this.parts.push(buf);
    return this;
  }

  init() {
    // ESC @ — initialize
    return this.push(ESC, 0x40);
  }

  /** Enable UTF-8 on printers that support ESC t / FS & variants */
  codePageUtf8() {
    // ESC t 16 often selects UTF-8 on many modern Chinese boards; also FS &
    this.push(ESC, 0x74, 16);
    this.push(FS, 0x26);
    return this;
  }

  align(a: EscPosAlign) {
    const n = a === 'center' ? 1 : a === 'right' ? 2 : 0;
    return this.push(ESC, 0x61, n);
  }

  bold(on = true) {
    return this.push(ESC, 0x45, on ? 1 : 0);
  }

  doubleSize(on = true) {
    // GS ! n
    return this.push(GS, 0x21, on ? 0x11 : 0x00);
  }

  text(line: string) {
    this.pushBuf(textEncoder(line, this.encoding));
    return this;
  }

  textLine(line = '') {
    return this.text(`${line}\n`);
  }

  separator(char = '-', width = 32) {
    return this.textLine(char.repeat(width));
  }

  feed(lines = 1) {
    return this.push(ESC, 0x64, Math.max(0, Math.min(255, lines)));
  }

  cut(partial = true) {
    // GS V m
    return this.push(GS, 0x56, partial ? 1 : 0);
  }

  /**
   * Open cash drawer via kick pulse on pin 2 or 5.
   * ESC p m t1 t2
   */
  openDrawer(pin: 0 | 1 = 0, onMs = 120, offMs = 240) {
    const t1 = Math.max(0, Math.min(255, Math.round(onMs / 2)));
    const t2 = Math.max(0, Math.min(255, Math.round(offMs / 2)));
    return this.push(ESC, 0x70, pin, t1, t2);
  }

  barcode(data: string) {
    const payload = textEncoder(data, 'cp864');
    // GS h height, GS w width, GS k m d1..dk NUL (CODE39 simplified as CODE128)
    this.push(GS, 0x68, 60);
    this.push(GS, 0x77, 2);
    this.push(GS, 0x6b, 73, payload.length);
    this.pushBuf(payload);
    this.textLine('');
    return this;
  }

  build(): Uint8Array {
    return concatBytes(this.parts);
  }

  toBase64(): string {
    const bytes = this.build();
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
}

export interface ThermalInvoiceLine {
  name: string;
  qtyLabel: string;
  unitPriceLabel: string;
  totalLabel: string;
}

export interface ThermalInvoicePayload {
  storeName: string;
  address?: string;
  phone?: string;
  branchName?: string;
  invoiceNumber: string;
  createdAtLabel: string;
  customerName?: string;
  cashierName?: string;
  paymentLabel?: string;
  lines: ThermalInvoiceLine[];
  subtotalLabel: string;
  discountLabel?: string;
  taxLabel?: string;
  totalLabel: string;
  paidLabel?: string;
  dueLabel?: string;
  footer?: string;
  paperChars?: number;
  openDrawer?: boolean;
  cut?: boolean;
}

export function buildEscPosInvoice(payload: ThermalInvoicePayload): Uint8Array {
  const w = payload.paperChars || 32;
  const b = new EscPosBuilder({ encoding: 'utf8' });
  b.codePageUtf8();
  b.align('center').doubleSize(true).bold(true).textLine(payload.storeName).doubleSize(false).bold(false);
  if (payload.address) b.textLine(payload.address);
  if (payload.phone) b.textLine(payload.phone);
  if (payload.branchName) b.textLine(payload.branchName);
  b.separator('-', w);
  b.align('left');
  b.textLine(`Invoice: ${payload.invoiceNumber}`);
  b.textLine(`Date: ${payload.createdAtLabel}`);
  b.textLine(`Customer: ${payload.customerName || 'Cash'}`);
  if (payload.cashierName) b.textLine(`Cashier: ${payload.cashierName}`);
  if (payload.paymentLabel) b.textLine(`Pay: ${payload.paymentLabel}`);
  b.separator('-', w);
  for (const line of payload.lines) {
    b.bold(true).textLine(line.name).bold(false);
    b.textLine(`  ${line.qtyLabel} x ${line.unitPriceLabel}`);
    b.align('right').textLine(line.totalLabel).align('left');
  }
  b.separator('-', w);
  b.textLine(`Subtotal: ${payload.subtotalLabel}`);
  if (payload.discountLabel) b.textLine(`Discount: ${payload.discountLabel}`);
  if (payload.taxLabel) b.textLine(`Tax: ${payload.taxLabel}`);
  b.bold(true).textLine(`TOTAL: ${payload.totalLabel}`).bold(false);
  if (payload.paidLabel) b.textLine(`Paid: ${payload.paidLabel}`);
  if (payload.dueLabel) b.textLine(`Due: ${payload.dueLabel}`);
  b.separator('-', w);
  b.align('center');
  if (payload.footer) b.textLine(payload.footer);
  b.barcode(payload.invoiceNumber);
  b.feed(3);
  if (payload.openDrawer) b.openDrawer(0);
  if (payload.cut !== false) b.cut(true);
  return b.build();
}

export function buildOpenDrawerCommand(pin: 0 | 1 = 0): Uint8Array {
  return new EscPosBuilder().openDrawer(pin).build();
}
