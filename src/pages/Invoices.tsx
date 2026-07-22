import { useEffect, useState } from 'react';
import { Eye, FileText, MessageCircle, Printer, Search } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import Tabs from '../components/ui/Tabs';
import Button from '../components/ui/Button';
import Dialog from '../components/ui/Dialog';
import DetailedInvoice, { saleToInvoiceView } from '../components/ui/DetailedInvoice';
import { Table, THead, TH, TBody, TD } from '../components/ui/Table';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useTenant } from '../contexts/TenantContext';
import type { Customer, Sale } from '../lib/types';
import {
  buildDetailedInvoiceText,
  formatDateTime,
  formatMoney,
  paymentMethodLabel,
  shareWhatsApp,
} from '../lib/utils';

export default function Invoices() {
  const { tenant } = useTenant();
  const currency = tenant?.currency || 'YER';
  const [items, setItems] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<Sale | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const [sRes, cRes] = await Promise.all([
      fetch(`/api/sales?tenant_id=${tenant.id}`),
      fetch(`/api/customers?tenant_id=${tenant.id}`),
    ]);
    if (sRes.ok) setItems(await sRes.json());
    if (cRes.ok) setCustomers(await cRes.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [tenant?.id]);

  const phoneOf = (sale: Sale) => {
    if (!sale.customer_id) return null;
    return customers.find((c) => c.id === sale.customer_id)?.phone || null;
  };

  const openDetail = async (sale: Sale) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/sales?id=${sale.id}`);
      if (res.ok) setDetail(await res.json());
      else setDetail(sale);
    } finally {
      setLoadingDetail(false);
    }
  };

  const viewModel = detail
    ? saleToInvoiceView(detail, phoneOf(detail) || undefined)
    : null;

  const shareDetail = () => {
    if (!detail || !viewModel) return;
    const text = buildDetailedInvoiceText({
      tenantName: tenant?.name_ar || tenant?.name || 'رفد',
      tenantAddress: tenant?.address,
      invoiceNumber: viewModel.invoice_number,
      customerName: viewModel.customer_name,
      customerPhone: viewModel.customer_phone,
      paymentMethod: viewModel.payment_method,
      createdAt: viewModel.created_at,
      items: viewModel.items.map((it) => ({
        name: it.product_name,
        qtyLabel: it.qty_label || String(it.quantity),
        unitPrice: it.unit_price,
        total: it.total,
      })),
      subtotal: viewModel.subtotal,
      discount: viewModel.discount,
      tax: viewModel.tax,
      total: viewModel.total,
      paid: viewModel.paid,
      currency,
      footer: tenant?.invoice_footer,
    });
    shareWhatsApp(viewModel.customer_phone || '', text);
  };

  const filtered = items.filter((s) => {
    if (tab !== 'all' && s.status !== tab) return false;
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return (
      s.invoice_number?.toLowerCase().includes(needle) ||
      s.customer_name?.toLowerCase().includes(needle) ||
      s.payment_method?.toLowerCase().includes(needle)
    );
  });

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader title="الفواتير" description="عرض تفصيلي · طباعة · مشاركة واتساب" />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'all', label: 'الكل', count: items.length },
            {
              id: 'completed',
              label: 'مكتملة',
              count: items.filter((i) => i.status === 'completed').length,
            },
            {
              id: 'suspended',
              label: 'معلقة',
              count: items.filter((i) => i.status === 'suspended').length,
            },
            {
              id: 'refunded',
              label: 'مرتجع',
              count: items.filter((i) => i.status === 'refunded').length,
            },
          ]}
        />
        <div className="relative w-full max-w-sm lg:ms-auto">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث برقم الفاتورة أو العميل..."
            className="h-11 w-full rounded-xl border border-app bg-surface pe-10 ps-3 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
        </div>
      </div>

      {!filtered.length ? (
        <EmptyState icon={FileText} title="لا توجد فواتير" description="ستظهر فواتير نقطة البيع هنا" />
      ) : (
        <Table>
          <THead>
            <TH>رقم الفاتورة</TH>
            <TH>العميل</TH>
            <TH>التاريخ</TH>
            <TH>الدفع</TH>
            <TH>الإجمالي</TH>
            <TH>الحالة</TH>
            <TH></TH>
          </THead>
          <TBody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <TD className="font-mono text-xs font-semibold">{s.invoice_number}</TD>
                <TD>{s.customer_name || 'عميل نقدي'}</TD>
                <TD>{formatDateTime(s.created_at)}</TD>
                <TD>{paymentMethodLabel(s.payment_method)}</TD>
                <TD className="tabular font-semibold">{formatMoney(s.total, currency)}</TD>
                <TD>
                  <Badge
                    tone={
                      s.status === 'completed' ? 'success' : s.status === 'refunded' ? 'danger' : 'warning'
                    }
                  >
                    {s.status}
                  </Badge>
                </TD>
                <TD>
                  <Button size="sm" variant="outline" onClick={() => openDetail(s)} loading={loadingDetail}>
                    <Eye className="h-3.5 w-3.5" />
                    تفاصيل
                  </Button>
                </TD>
              </tr>
            ))}
          </TBody>
        </Table>
      )}

      <Dialog
        open={!!detail}
        onClose={() => setDetail(null)}
        title="فاتورة تفصيلية"
        description={detail?.invoice_number}
        size="lg"
        footer={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                const el = document.getElementById('invoice-detail-doc');
                if (!el) {
                  window.print();
                  return;
                }
                const { printElement } = await import('../lib/documentExport');
                await printElement(el);
              }}
            >
              <Printer className="h-4 w-4" />
              طباعة
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const el = document.getElementById('invoice-detail-doc');
                if (!el) return;
                const { downloadElementAsPng } = await import('../lib/documentExport');
                await downloadElementAsPng(
                  el,
                  `rafd-invoice-${detail?.invoice_number || Date.now()}.png`
                );
              }}
            >
              صورة
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const el = document.getElementById('invoice-detail-doc');
                if (!el) return;
                const { downloadElementAsPdf } = await import('../lib/documentExport');
                await downloadElementAsPdf(
                  el,
                  `rafd-invoice-${detail?.invoice_number || Date.now()}.pdf`
                );
              }}
            >
              PDF
            </Button>
            <Button
              variant="soft"
              onClick={async () => {
                if (!detail || !viewModel) return;
                const text = buildDetailedInvoiceText({
                  tenantName: tenant?.name_ar || tenant?.name || 'رفد',
                  tenantAddress: tenant?.address,
                  invoiceNumber: viewModel.invoice_number,
                  customerName: viewModel.customer_name,
                  customerPhone: viewModel.customer_phone,
                  paymentMethod: viewModel.payment_method,
                  createdAt: viewModel.created_at,
                  items: viewModel.items.map((it) => ({
                    name: it.product_name,
                    qtyLabel: it.qty_label || String(it.quantity),
                    unitPrice: it.unit_price,
                    total: it.total,
                  })),
                  subtotal: viewModel.subtotal,
                  discount: viewModel.discount,
                  tax: viewModel.tax,
                  total: viewModel.total,
                  paid: viewModel.paid,
                  currency,
                  footer: tenant?.invoice_footer,
                });
                const el = document.getElementById('invoice-detail-doc');
                if (el) {
                  const { shareDocumentBundle } = await import('../lib/documentExport');
                  await shareDocumentBundle({
                    element: el,
                    phone: viewModel.customer_phone,
                    text,
                    baseName: `rafd-invoice-${detail.invoice_number}`,
                    mode: 'whatsapp-both',
                  });
                } else {
                  shareDetail();
                }
              }}
            >
              <MessageCircle className="h-4 w-4" />
              واتساب (نص + صورة)
            </Button>
            <Button onClick={() => setDetail(null)}>إغلاق</Button>
          </div>
        }
      >
        {viewModel && (
          <DetailedInvoice
            tenant={tenant}
            invoice={viewModel}
            currency={currency}
            docId="invoice-detail-doc"
          />
        )}
      </Dialog>
    </div>
  );
}
