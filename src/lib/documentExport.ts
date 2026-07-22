import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export async function captureElement(el: HTMLElement, scale = 2) {
  try {
    await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
  } catch {
    /* ignore */
  }

  // Expand overflow so multi-page content is fully captured
  const prev = {
    height: el.style.height,
    maxHeight: el.style.maxHeight,
    overflow: el.style.overflow,
  };
  el.style.height = 'auto';
  el.style.maxHeight = 'none';
  el.style.overflow = 'visible';

  try {
    const canvas = await html2canvas(el, {
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 20000,
      windowWidth: el.scrollWidth,
      windowHeight: el.scrollHeight,
      onclone: (_doc, cloned) => {
        cloned.style.width = `${el.scrollWidth}px`;
        cloned.style.maxWidth = 'none';
        cloned.style.height = 'auto';
        cloned.style.maxHeight = 'none';
        cloned.style.overflow = 'visible';
        cloned.style.transform = 'none';
        cloned.querySelectorAll('*').forEach((node) => {
          const n = node as HTMLElement;
          if (n.style) {
            n.style.fontFamily = '"IBM Plex Sans Arabic", Tahoma, Arial, sans-serif';
          }
        });
      },
    });
    return canvas;
  } finally {
    el.style.height = prev.height;
    el.style.maxHeight = prev.maxHeight;
    el.style.overflow = prev.overflow;
  }
}

export async function downloadElementAsPng(el: HTMLElement, filename: string) {
  const canvas = await captureElement(el, 2.4);
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  a.click();
  return url;
}

/**
 * Multi-page PDF with clean page slices (no overlapping / cut headers mess).
 * Each page is a cropped horizontal band of the full canvas.
 */
export async function downloadElementAsPdf(el: HTMLElement, filename: string) {
  const canvas = await captureElement(el, 2);
  const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 18;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;

  const imgW = usableW;
  const pxPerPt = canvas.width / imgW;
  const pageHeightPx = Math.floor(usableH * pxPerPt);

  let yPx = 0;
  let pageIndex = 0;

  while (yPx < canvas.height) {
    if (pageIndex > 0) pdf.addPage();

    const sliceH = Math.min(pageHeightPx, canvas.height - yPx);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceH;
    const ctx = pageCanvas.getContext('2d');
    if (!ctx) break;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, yPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

    const imgData = pageCanvas.toDataURL('image/jpeg', 0.94);
    const sliceImgH = sliceH / pxPerPt;
    pdf.addImage(imgData, 'JPEG', margin, margin, imgW, sliceImgH, undefined, 'FAST');

    // page footer number
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    pdf.text(`صفحة ${pageIndex + 1}`, pageW / 2, pageH - 8, { align: 'center' });

    yPx += sliceH;
    pageIndex += 1;

    // safety
    if (pageIndex > 40) break;
  }

  const name = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  pdf.save(name);
  return name;
}

export async function getElementDataUrl(el: HTMLElement, type: 'png' | 'jpeg' = 'png') {
  const canvas = await captureElement(el, 2.2);
  return type === 'png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92);
}

export function openWhatsAppWithText(phone: string | null | undefined, text: string) {
  const cleaned = String(phone || '').replace(/\D/g, '');
  const url = cleaned
    ? `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * WhatsApp: share ONE-PAGE summary image only (+ short text).
 * Full multi-page detail stays in PDF.
 */
export async function shareWhatsAppSummaryImage(opts: {
  summaryElement: HTMLElement;
  phone?: string | null;
  text: string;
  baseName: string;
}) {
  await downloadElementAsPng(opts.summaryElement, opts.baseName);
  openWhatsAppWithText(
    opts.phone,
    `${opts.text}\n\n📎 تم تنزيل صورة ملخص كشف الحساب (صفحة واحدةحدة) — أرفقها من المعرض.`
  );
}

/** Back-compat helper used by POS/Invoices */
export async function shareDocumentBundle(opts: {
  element: HTMLElement;
  phone?: string | null;
  text: string;
  baseName: string;
  mode: 'pdf' | 'image' | 'whatsapp-both';
}) {
  const { element, phone, text, baseName, mode } = opts;
  if (mode === 'pdf') {
    await downloadElementAsPdf(element, baseName);
    return;
  }
  if (mode === 'image') {
    await downloadElementAsPng(element, baseName);
    return;
  }
  await downloadElementAsPng(element, baseName);
  openWhatsAppWithText(
    phone,
    `${text}\n\n📎 تم تنزيل الصورة — أرفقها من المعرض في المحادثة.`
  );
}

export async function printElement(el: HTMLElement) {
  const printWin = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1000');
  if (!printWin) {
    window.print();
    return;
  }
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML)
    .join('\n');

  printWin.document.write(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>طباعة كشف حساب</title>
${styles}
<style>
  @page { size: A4; margin: 12mm; }
  html, body {
    background: #fff !important;
    margin: 0;
    padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body { padding: 0; }
  .print-root { width: 100%; }
  table { page-break-inside: auto; }
  tr, .avoid-break { page-break-inside: avoid; break-inside: avoid; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  h1, h2, h3, .section-title { page-break-after: avoid; }
  .page-break { page-break-before: always; break-before: page; }
</style>
</head>
<body>
<div class="print-root">${el.outerHTML}</div>
<script>
  window.onload = function () {
    setTimeout(function () {
      window.focus();
      window.print();
    }, 350);
  };
</script>
</body>
</html>`);
  printWin.document.close();
}
