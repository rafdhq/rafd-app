import type { Customer, CustomerLedger, Sale, SaleItem, Tenant } from '../../lib/types';
import { formatDate, formatDateTime, formatMoney, paymentMethodLabel } from '../../lib/utils';

function ledgerLabel(type: string) {
  if (type === 'sale_credit') return 'بيع آجل';
  if (type === 'payment') return 'تحصيل';
  if (type === 'debit') return 'مدين';
  if (type === 'credit') return 'دائن';
  if (type === 'adjustment') return 'تسوية';
  if (type === 'opening') return 'رصيد سابق';
  return type;
}

function qtyLabel(it: SaleItem) {
  const q = Number(it.quantity || 0);
  // weight stored as kg fraction when < 50 often means kg; show smart
  if (q > 0 && q < 50 && !Number.isInteger(q)) {
    return `${q} كجم`;
  }
  return `${q}`;
}

export interface StatementDocProps {
  tenant?: Tenant | null;
  customer: Customer;
  ledger: CustomerLedger[];
  sales: Sale[];
  currency?: string;
  docId?: string;
  periodLabel?: string;
  openingBalance?: number;
  closingBalance?: number;
  showOpening?: boolean;
  periodDebit?: number;
  periodCredit?: number;
  /** compact one-page summary for WhatsApp image */
  mode?: 'full' | 'summary';
}

export default function CustomerStatementDoc({
  tenant,
  customer,
  ledger,
  sales,
  currency = 'YER',
  docId = 'customer-statement-doc',
  periodLabel = 'كل الفترات',
  openingBalance = 0,
  closingBalance,
  showOpening = false,
  periodDebit = 0,
  periodCredit = 0,
  mode = 'full',
}: StatementDocProps) {
  const primary = tenant?.primary_color || '#0d9488';
  const secondary = tenant?.secondary_color || '#d97706';
  const balance =
    closingBalance != null ? Number(closingBalance) : Number(customer.balance || 0);
  const purchases = Number(customer.total_purchases || 0);
  const generatedAt = formatDateTime(new Date());
  const isSummary = mode === 'summary';

  const productRows = sales.flatMap((s) =>
    (s.items || []).map((it) => ({
      sale: s,
      item: it,
    }))
  );

  const header = (
    <div
      className="stmt-header avoid-break"
      style={{
        background: `linear-gradient(135deg, ${primary} 0%, #042f2e 55%, ${secondary} 140%)`,
        color: '#fff',
        padding: isSummary ? '20px 24px' : '28px 32px',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          insetInlineEnd: -40,
          top: -40,
          width: 180,
          height: 180,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div
            style={{
              width: isSummary ? 52 : 64,
              height: isSummary ? 52 : 64,
              borderRadius: 16,
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {tenant?.logo_url ? (
              <img
                src={tenant.logo_url}
                alt="logo"
                crossOrigin="anonymous"
                style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff' }}
              />
            ) : (
              <span style={{ fontWeight: 700, fontSize: 22 }}>R</span>
            )}
          </div>
          <div>
            <div style={{ fontSize: isSummary ? 18 : 22, fontWeight: 700 }}>
              {tenant?.name_ar || tenant?.name || 'رفد | RAFD'}
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{tenant?.address || ''}</div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2, direction: 'ltr', textAlign: 'right' }}>
              {[tenant?.phone, tenant?.email].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'left' }}>
          <div
            style={{
              display: 'inline-block',
              background: 'rgba(255,255,255,0.14)',
              border: '1px solid rgba(255,255,255,0.22)',
              borderRadius: 999,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {isSummary ? 'ملخص كشف حساب' : 'كشف حساب تفصيلي'}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, opacity: 0.85 }}>الفترة</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{periodLabel}</div>
          <div style={{ marginTop: 6, fontSize: 11, opacity: 0.8 }}>إصدار: {generatedAt}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      id={docId}
      className="customer-statement-root"
      dir="rtl"
      style={{
        width: 794,
        maxWidth: '100%',
        margin: '0 auto',
        background: '#ffffff',
        color: '#0f172a',
        fontFamily: '"IBM Plex Sans Arabic", Tahoma, Arial, sans-serif',
        borderRadius: isSummary ? 20 : 0,
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
      }}
    >
      {header}

      <div style={{ padding: isSummary ? '20px 24px 24px' : '28px 32px 36px' }}>
        {/* Customer + balances */}
        <div
          className="avoid-break"
          style={{
            display: 'grid',
            gridTemplateColumns: showOpening ? '1.3fr 1fr 1fr 1fr' : '1.4fr 1fr 1fr',
            gap: 10,
            marginBottom: 18,
          }}
        >
          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              padding: 14,
              background: 'linear-gradient(180deg, #f8fafc 0%, #fff 100%)',
            }}
          >
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>العميل</div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{customer.name}</div>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 4, direction: 'ltr', textAlign: 'right' }}>
              {customer.phone || '—'}
            </div>
          </div>

          {showOpening && (
            <div
              style={{
                borderRadius: 14,
                padding: 14,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ fontSize: 11, color: '#64748b' }}>الرصيد السابق</div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  marginTop: 6,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatMoney(openingBalance, currency)}
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>قبل بداية الفترة</div>
            </div>
          )}

          <div
            style={{
              borderRadius: 14,
              padding: 14,
              background: balance > 0 ? 'rgba(217, 119, 6, 0.08)' : 'rgba(13, 148, 136, 0.08)',
              border: `1px solid ${balance > 0 ? 'rgba(217,119,6,0.25)' : 'rgba(13,148,136,0.25)'}`,
            }}
          >
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {showOpening ? 'رصيد نهاية الفترة' : 'الرصيد الحالي'}
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                marginTop: 6,
                color: balance > 0 ? secondary : primary,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatMoney(balance, currency)}
            </div>
          </div>

          <div
            style={{
              borderRadius: 14,
              padding: 14,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {isSummary ? 'حركة الفترة' : 'إجمالي المشتريات'}
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                marginTop: 6,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {isSummary
                ? `${formatMoney(periodDebit, currency)} / ${formatMoney(periodCredit, currency)}`
                : formatMoney(purchases, currency)}
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
              {isSummary ? 'مدين / دائن' : `${sales.length} فاتورة في الفترة`}
            </div>
          </div>
        </div>

        {/* Summary mode: only KPIs + last few lines */}
        {isSummary && (
          <>
            <div className="avoid-break section-title" style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
              ملخص سريع
            </div>
            <div
              className="avoid-break"
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                padding: 14,
                marginBottom: 12,
                fontSize: 12,
                lineHeight: 1.7,
              }}
            >
              <div>الفترة: <strong>{periodLabel}</strong></div>
              {showOpening && (
                <div>
                  الرصيد السابق:{' '}
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(openingBalance, currency)}
                  </strong>
                </div>
              )}
              <div>
                مدين الفترة:{' '}
                <strong style={{ color: secondary }}>{formatMoney(periodDebit, currency)}</strong>
                {' · '}
                دائن الفترة:{' '}
                <strong style={{ color: '#059669' }}>{formatMoney(periodCredit, currency)}</strong>
              </div>
              <div>
                الرصيد الختامي:{' '}
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(balance, currency)}
                </strong>
              </div>
              <div>
                عدد الفواتير: <strong>{sales.length}</strong>
                {' · '}
                عدد الأصناف: <strong>{productRows.length}</strong>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center' }}>
              هذا ملخص صفحة واحدةحدة للمشاركة عبر واتساب.
              <br />
              التفاصيل الكاملة (المنتجات + الحركات) متوفرة في ملف PDF.
            </div>
          </>
        )}

        {/* FULL mode */}
        {!isSummary && (
          <>
            {/* Opening row notice */}
            {showOpening && (
              <div
                className="avoid-break"
                style={{
                  marginBottom: 16,
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: 'rgba(2, 132, 199, 0.08)',
                  border: '1px solid rgba(2,132,199,0.2)',
                  fontSize: 12,
                  color: '#0c4a6e',
                }}
              >
                يوجد نشاط قبل الفترة المحددة. تم إظهار <strong>الرصيد السابق</strong> (
                {formatMoney(openingBalance, currency)}) كرصيد افتتاحي لهذه الفترة.
              </div>
            )}

            {/* Product details — replaces plain movement-only view */}
            <div style={{ marginBottom: 22 }}>
              <div
                className="section-title avoid-break"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700 }}>تفصيل المنتجات حسب الفواتير</div>
                <div style={{ width: 48, height: 3, borderRadius: 99, background: primary }} />
              </div>

              {!sales.length ? (
                <div
                  style={{
                    padding: 20,
                    textAlign: 'center',
                    color: '#94a3b8',
                    border: '1px solid #e2e8f0',
                    borderRadius: 14,
                  }}
                >
                  لا توجد فواتير في هذه الفترة
                </div>
              ) : (
                sales.map((s) => (
                  <div
                    key={s.id}
                    className="avoid-break"
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 14,
                      overflow: 'hidden',
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        fontSize: 12,
                      }}
                    >
                      <div>
                        <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>
                          {s.invoice_number}
                        </span>
                        <span style={{ color: '#64748b', marginInlineStart: 8 }}>
                          {formatDateTime(s.created_at)}
                        </span>
                      </div>
                      <div style={{ color: '#475569' }}>
                        {paymentMethodLabel(s.payment_method)} · إجمالي{' '}
                        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatMoney(s.total, currency)}
                        </strong>
                        {' · '}
                        مدفوع{' '}
                        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatMoney(s.paid, currency)}
                        </strong>
                      </div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#fff', color: '#64748b' }}>
                          <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>#</th>
                          <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>المنتج</th>
                          <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>الكمية</th>
                          <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>سعر الوحدة</th>
                          <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(s.items && s.items.length
                          ? s.items
                          : [
                              {
                                product_id: 0,
                                product_name: '— بدون أصناف مسجّلة —',
                                quantity: 0,
                                unit_price: 0,
                                total: Number(s.total || 0),
                              } as SaleItem,
                            ]
                        ).map((it, idx) => (
                          <tr
                            key={`${s.id}-${idx}`}
                            style={{
                              borderTop: '1px solid #f1f5f9',
                              background: idx % 2 ? '#fafbfc' : '#fff',
                            }}
                          >
                            <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{idx + 1}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 600 }}>{it.product_name}</td>
                            <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>
                              {qtyLabel(it)}
                            </td>
                            <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>
                              {formatMoney(it.unit_price, currency)}
                            </td>
                            <td
                              style={{
                                padding: '8px 12px',
                                fontWeight: 700,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {formatMoney(it.total, currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>

            {/* Financial movements */}
            <div style={{ marginBottom: 8 }} className="page-break-inside-auto">
              <div
                className="section-title avoid-break"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700 }}>الحركة المالية</div>
                <div style={{ width: 48, height: 3, borderRadius: 99, background: secondary }} />
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', color: '#475569' }}>
                      <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 600 }}>التاريخ</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 600 }}>النوع</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 600 }}>المرجع</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 600 }}>المبلغ</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 600 }}>الرصيد بعد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {showOpening && (
                      <tr style={{ background: '#eff6ff', borderTop: '1px solid #dbeafe' }}>
                        <td style={{ padding: '10px 12px' }}>{periodLabel}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>{ledgerLabel('opening')}</td>
                        <td style={{ padding: '10px 12px', color: '#64748b' }}>افتتاح الفترة</td>
                        <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>—</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          {formatMoney(openingBalance, currency)}
                        </td>
                      </tr>
                    )}
                    {ledger.map((row, idx) => {
                      const isPay = row.type === 'payment' || row.type === 'credit';
                      return (
                        <tr
                          key={row.id}
                          style={{
                            background: idx % 2 ? '#fafbfc' : '#fff',
                            borderTop: '1px solid #f1f5f9',
                          }}
                        >
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                            {formatDateTime(row.created_at)}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 600 }}>{ledgerLabel(row.type)}</td>
                          <td style={{ padding: '10px 12px', color: '#64748b' }}>
                            {row.reference || row.notes || '—'}
                          </td>
                          <td
                            style={{
                              padding: '10px 12px',
                              fontWeight: 700,
                              color: isPay ? '#059669' : secondary,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {isPay ? '−' : '+'}
                            {formatMoney(row.amount, currency)}
                          </td>
                          <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>
                            {formatMoney(row.balance_after, currency)}
                          </td>
                        </tr>
                      );
                    })}
                    {!ledger.length && !showOpening && (
                      <tr>
                        <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                          لا توجد حركات في هذه الفترة
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals strip */}
            <div
              className="avoid-break"
              style={{
                marginTop: 18,
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
              }}
            >
              <div style={{ borderRadius: 12, border: '1px solid #e2e8f0', padding: 12, background: '#fff' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>إجمالي المدين (الفترة)</div>
                <div style={{ fontWeight: 800, marginTop: 4, color: secondary }}>
                  {formatMoney(periodDebit, currency)}
                </div>
              </div>
              <div style={{ borderRadius: 12, border: '1px solid #e2e8f0', padding: 12, background: '#fff' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>إجمالي الدائن (الفترة)</div>
                <div style={{ fontWeight: 800, marginTop: 4, color: '#059669' }}>
                  {formatMoney(periodCredit, currency)}
                </div>
              </div>
              <div style={{ borderRadius: 12, border: '1px solid #e2e8f0', padding: 12, background: '#fff' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>الرصيد الختامي</div>
                <div style={{ fontWeight: 800, marginTop: 4 }}>{formatMoney(balance, currency)}</div>
              </div>
            </div>
          </>
        )}

        {/* Footer */}
        <div
          className="avoid-break"
          style={{
            marginTop: 24,
            paddingTop: 16,
            borderTop: '1px dashed #cbd5e1',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 11, color: '#64748b', maxWidth: 460 }}>
            {tenant?.invoice_footer || 'مستند رسمي صادر من منصة رفد لإدارة المتاجر — RAFD'}
            {tenant?.tax_number ? ` · الرقم الضريبي: ${tenant.tax_number}` : ''}
            <div style={{ marginTop: 4 }}>تاريخ الطباعة: {formatDate(new Date())}</div>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>powered by</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: primary }}>رفد | RAFD</div>
          </div>
        </div>
      </div>
    </div>
  );
}
