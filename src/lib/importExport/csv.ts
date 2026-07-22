import { toCsv, toExcelXml, downloadCsv, downloadExcel } from '../reports/excel';

export type ImportEntity = 'products' | 'customers' | 'suppliers' | 'inventory' | 'purchases';

export const IMPORT_TEMPLATES: Record<
  ImportEntity,
  { columns: string[]; sample: Record<string, unknown>[]; label_ar: string; label_en: string }
> = {
  products: {
    label_ar: 'المنتجات',
    label_en: 'Products',
    columns: [
      'name_ar',
      'name',
      'sku',
      'barcode',
      'category',
      'price',
      'cost',
      'stock',
      'min_stock',
      'unit',
      'units_per_carton',
      'carton_cost',
    ],
    sample: [
      {
        name_ar: 'منتج تجريبي',
        name: 'Sample product',
        sku: 'SKU-100',
        barcode: '6281007009999',
        category: 'بقالة',
        price: 1000,
        cost: 700,
        stock: 24,
        min_stock: 6,
        unit: 'حبة',
        units_per_carton: 12,
        carton_cost: 8400,
      },
    ],
  },
  customers: {
    label_ar: 'العملاء',
    label_en: 'Customers',
    columns: ['name', 'phone', 'email', 'balance', 'notes'],
    sample: [{ name: 'عميل تجريبي', phone: '+967771234567', email: '', balance: 0, notes: '' }],
  },
  suppliers: {
    label_ar: 'الموردون',
    label_en: 'Suppliers',
    columns: ['name', 'phone', 'email', 'balance', 'notes'],
    sample: [{ name: 'مورد تجريبي', phone: '+967770000000', email: '', balance: 0, notes: '' }],
  },
  inventory: {
    label_ar: 'المخزون',
    label_en: 'Inventory',
    columns: ['sku', 'barcode', 'stock', 'min_stock', 'cost'],
    sample: [{ sku: 'SKU-100', barcode: '6281007009999', stock: 50, min_stock: 10, cost: 700 }],
  },
  purchases: {
    label_ar: 'المشتريات',
    label_en: 'Purchases',
    columns: ['reference', 'supplier_name', 'total', 'paid', 'status', 'purchase_date', 'notes'],
    sample: [
      {
        reference: 'PO-IMPORT-1',
        supplier_name: 'مورد تجريبي',
        total: 10000,
        paid: 5000,
        status: 'received',
        purchase_date: new Date().toISOString().slice(0, 10),
        notes: '',
      },
    ],
  },
};

/** Parse CSV text (supports quoted fields and BOM). */
export function parseCsv(text: string): { columns: string[]; rows: Record<string, string>[] } {
  const raw = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    // ignore completely empty trailing row
    if (row.length === 1 && row[0] === '' && records.length) {
      row = [];
      return;
    }
    records.push(row);
    row = [];
  };

  while (i < raw.length) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushField();
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // last field/row
  if (field.length || row.length) {
    pushField();
    pushRow();
  }

  if (!records.length) return { columns: [], rows: [] };
  const columns = records[0].map((c) => c.trim());
  const rows = records.slice(1).filter((r) => r.some((c) => c !== '')).map((vals) => {
    const obj: Record<string, string> = {};
    columns.forEach((col, idx) => {
      obj[col] = (vals[idx] ?? '').trim();
    });
    return obj;
  });
  return { columns, rows };
}

export function downloadTemplate(entity: ImportEntity, format: 'csv' | 'xls' = 'csv') {
  const t = IMPORT_TEMPLATES[entity];
  if (format === 'xls') downloadExcel(`rafd-template-${entity}.xls`, t.columns, t.sample, entity);
  else downloadCsv(`rafd-template-${entity}.csv`, t.columns, t.sample);
}

export function exportRows(
  entity: ImportEntity,
  rows: Array<Record<string, unknown>>,
  format: 'csv' | 'xls' = 'xls'
) {
  const t = IMPORT_TEMPLATES[entity];
  const cols = t.columns;
  if (format === 'csv') downloadCsv(`rafd-export-${entity}-${Date.now()}.csv`, cols, rows);
  else downloadExcel(`rafd-export-${entity}-${Date.now()}.xls`, cols, rows, entity);
}

export { toCsv, toExcelXml };
