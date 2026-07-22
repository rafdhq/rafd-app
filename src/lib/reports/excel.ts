/**
 * Lightweight Excel (SpreadsheetML XML) + CSV exporters — no heavy deps.
 * Opens in Microsoft Excel / LibreOffice / Google Sheets.
 */

function escapeXml(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function toCsv(columns: string[], rows: Array<Record<string, unknown>>) {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [columns.map(esc).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => esc(row[c])).join(','));
  }
  // BOM for Excel Arabic
  return `\uFEFF${lines.join('\n')}`;
}

export function toExcelXml(columns: string[], rows: Array<Record<string, unknown>>, sheetName = 'Report') {
  const header = columns
    .map((c) => `<Cell><Data ss:Type="String">${escapeXml(c)}</Data></Cell>`)
    .join('');
  const body = rows
    .map((row) => {
      const cells = columns
        .map((c) => {
          const v = row[c];
          const isNum = typeof v === 'number' || (v != null && v !== '' && !Number.isNaN(Number(v)) && String(v).trim() !== '');
          if (isNum && typeof v !== 'boolean') {
            return `<Cell><Data ss:Type="Number">${escapeXml(String(v))}</Data></Cell>`;
          }
          return `<Cell><Data ss:Type="String">${escapeXml(v == null ? '' : String(v))}</Data></Cell>`;
        })
        .join('');
      return `<Row>${cells}</Row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Worksheet ss:Name="${escapeXml(sheetName)}">
  <Table>
   <Row>${header}</Row>
   ${body}
  </Table>
 </Worksheet>
</Workbook>`;
}

export function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, columns: string[], rows: Array<Record<string, unknown>>) {
  downloadBlob(filename, toCsv(columns, rows), 'text/csv;charset=utf-8');
}

export function downloadExcel(filename: string, columns: string[], rows: Array<Record<string, unknown>>, sheetName?: string) {
  downloadBlob(
    filename.endsWith('.xls') ? filename : `${filename}.xls`,
    toExcelXml(columns, rows, sheetName),
    'application/vnd.ms-excel'
  );
}
