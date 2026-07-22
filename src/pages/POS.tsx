import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pause,
  Play,
  Printer,
  Search,
  Trash2,
  UserRound,
  X,
  Minus,
  Plus,
  Percent,
  Banknote,
  CreditCard,
  Split,
  MessageCircle,
  Keyboard,
  ShoppingBag,
  Landmark,
  CalendarClock,
  Wallet,
  Nfc,
  Settings2,
  Volume2,
} from 'lucide-react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Dialog from '../components/ui/Dialog';
import Select from '../components/ui/Select';
import BarcodeScanner from '../components/ui/BarcodeScanner';
import ProductThumb from '../components/products/ProductThumb';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import type { BankAccount, CartLine, Customer, PaymentTerminal, Product, Sale } from '../lib/types';
import DetailedInvoice, { type InvoiceViewModel } from '../components/ui/DetailedInvoice';
import ThermalReceipt from '../components/ui/ThermalReceipt';
import PhoneWhatsAppField from '../components/ui/PhoneWhatsAppField';
import {
  loadPosSettings,
  playScanBeep,
  playSuccessChime,
  savePosSettings,
  type PosHardwareSettings,
} from '../lib/posSettings';
import { printThermalReceipt } from '../lib/thermalPrint';
import { openCashDrawer, printEscPosOrBrowser } from '../lib/escpos/printer';
import {
  buildDetailedInvoiceText,
  buildWhatsAppNumber,
  CARD_NETWORKS,
  cn,
  formatMoney,
  formatWeightLabel,
  generateInvoiceNumber,
  isWeightProduct,
  lineAmount,
  shareWhatsApp,
  WALLET_PROVIDERS,
} from '../lib/utils';
import { calcTax, parseTenantTax } from '../lib/tax';
import { createSaleWithOffline } from '../lib/offline/salesQueue';

type PayMethod = 'cash' | 'card' | 'split' | 'transfer' | 'credit' | 'wallet' | 'pos';

const SUSPEND_KEY = 'rafd-suspended-carts';

interface SuspendedCart {
  id: string;
  label: string;
  lines: CartLine[];
  customer: Customer | null;
  discount: number;
  createdAt: string;
}

export default function POS() {
  const { tenant, currentBranch } = useTenant();
  const { profile } = useAuth();
  const currency = tenant?.currency || 'YER';
  const tenantId = tenant?.id || 1;

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [cartDiscount, setCartDiscount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [receiptView, setReceiptView] = useState<InvoiceViewModel | null>(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [weightProduct, setWeightProduct] = useState<Product | null>(null);
  const [weightGrams, setWeightGrams] = useState(500);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerBusy, setNewCustomerBusy] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    countryCode: '+967',
    localPhone: '',
  });
  const [paymentMethod, setPaymentMethod] = useState<PayMethod>('cash');
  const [cashAmount, setCashAmount] = useState(0);
  const [cardAmount, setCardAmount] = useState(0);
  const [bankAccountId, setBankAccountId] = useState<number | null>(null);
  const [creditPaidNow, setCreditPaidNow] = useState(0);
  const [terminals, setTerminals] = useState<PaymentTerminal[]>([]);
  const [terminalId, setTerminalId] = useState<number | null>(null);
  const [cardNetwork, setCardNetwork] = useState('mada');
  const [walletProvider, setWalletProvider] = useState('jawali');
  const [walletRef, setWalletRef] = useState('');
  const [cardRef, setCardRef] = useState('');
  const [posSettings, setPosSettings] = useState<PosHardwareSettings>(() => loadPosSettings());
  const [hwOpen, setHwOpen] = useState(false);
  const [receiptTab, setReceiptTab] = useState<'thermal' | 'detailed'>('thermal');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [shiftSales, setShiftSales] = useState(0);
  const [shiftCount, setShiftCount] = useState(0);
  const [suspended, setSuspended] = useState<SuspendedCart[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(SUSPEND_KEY) || '[]');
    } catch {
      return [];
    }
  });

  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes, bRes, tRes] = await Promise.all([
        fetch(`/api/products?tenant_id=${tenantId}`),
        fetch(`/api/customers?tenant_id=${tenantId}`),
        fetch(`/api/bank-accounts?tenant_id=${tenantId}`),
        fetch(`/api/payment-terminals?tenant_id=${tenantId}`),
      ]);
      if (pRes.ok) setProducts(await pRes.json());
      if (cRes.ok) setCustomers(await cRes.json());
      if (bRes.ok) {
        const list: BankAccount[] = await bRes.json();
        setBanks(list.filter((b) => b.is_active));
      }
      if (tRes.ok) {
        const list: PaymentTerminal[] = await tRes.json();
        setTerminals(list.filter((t) => t.is_active));
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onSettings = (e: Event) => {
      const detail = (e as CustomEvent<PosHardwareSettings>).detail;
      if (detail) setPosSettings(detail);
      else setPosSettings(loadPosSettings());
    };
    window.addEventListener('rafd-pos-settings', onSettings as EventListener);
    return () => window.removeEventListener('rafd-pos-settings', onSettings as EventListener);
  }, []);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean));
    return ['all', ...Array.from(set)];
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (!p.is_active) return false;
      if (category !== 'all' && p.category !== category) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        p.name_ar?.includes(query) ||
        p.name?.toLowerCase().includes(q) ||
        p.barcode?.includes(query) ||
        p.sku?.toLowerCase().includes(q)
      );
    });
  }, [products, query, category]);

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.phone?.includes(customerQuery) ||
        c.email?.toLowerCase().includes(q)
    );
  }, [customers, customerQuery]);

  const subtotal = lines.reduce((a, l) => a + lineAmount(l), 0);
  const discountTotal = cartDiscount + lines.reduce((a, l) => a + Number(l.discount || 0), 0);
  const netAfterDiscount = Math.max(0, subtotal - cartDiscount);
  const taxCfg = parseTenantTax({
    currency: tenant?.currency,
    tax_number: tenant?.tax_number,
    tax_rate: (tenant as { tax_rate?: number })?.tax_rate,
    tax_mode: (tenant as { tax_mode?: string })?.tax_mode,
    tax_enabled: (tenant as { tax_enabled?: boolean })?.tax_enabled,
  });
  const taxCalc = calcTax(netAfterDiscount, taxCfg);
  const tax = taxCalc.tax;
  const total = taxCalc.total;

  const addProduct = (product: Product) => {
    if (isWeightProduct(product)) {
      setWeightProduct(product);
      setWeightGrams(500);
      return;
    }
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.product.id === product.id && !l.sold_by_weight);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { product, quantity: 1, discount: 0, sold_by_weight: false }];
    });
    if (posSettings.scanBeep) playScanBeep();
    setToast(`أُضيف: ${product.name_ar || product.name}`);
    setTimeout(() => setToast(''), 1200);
  };

  const confirmWeightAdd = () => {
    if (!weightProduct || weightGrams <= 0) return;
    const kg = weightGrams / 1000;
    setLines((prev) => [
      ...prev,
      {
        product: weightProduct,
        quantity: kg,
        discount: 0,
        weight_g: weightGrams,
        sold_by_weight: true,
      },
    ]);
    if (posSettings.scanBeep) playScanBeep();
    setToast(`أُضيف: ${weightProduct.name_ar || weightProduct.name} (${formatWeightLabel(weightGrams)})`);
    setTimeout(() => setToast(''), 1400);
    setWeightProduct(null);
  };

  const resolveBarcode = useCallback(
    (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      const exact =
        products.find((p) => p.barcode === trimmed) ||
        products.find((p) => p.sku?.toLowerCase() === trimmed.toLowerCase()) ||
        products.find((p) => p.name_ar?.includes(trimmed) || p.name?.toLowerCase().includes(trimmed.toLowerCase()));
      if (exact) {
        addProduct(exact);
        setQuery('');
        setToast(`باركود: ${exact.name_ar || exact.name}`);
        setTimeout(() => setToast(''), 1200);
      } else {
        setQuery(trimmed);
        setToast('المنتج غير موجود');
        setTimeout(() => setToast(''), 1500);
      }
    },
    [products]
  );

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim()) {
      resolveBarcode(query);
    }
  };

  const updateQty = (index: number, delta: number) => {
    setLines((prev) =>
      prev
        .map((l, idx) => {
          if (idx !== index) return l;
          if (l.sold_by_weight) {
            const nextG = Math.max(0, Number(l.weight_g || 0) + delta * 50);
            return { ...l, weight_g: nextG, quantity: nextG / 1000 };
          }
          return { ...l, quantity: Math.max(0, l.quantity + delta) };
        })
        .filter((l) => (l.sold_by_weight ? Number(l.weight_g || 0) > 0 : l.quantity > 0))
    );
  };

  const setQty = (index: number, qty: number) => {
    setLines((prev) =>
      prev
        .map((l, idx) => {
          if (idx !== index) return l;
          if (l.sold_by_weight) {
            const g = Math.max(0, qty);
            return { ...l, weight_g: g, quantity: g / 1000 };
          }
          return { ...l, quantity: Math.max(0, qty) };
        })
        .filter((l) => (l.sold_by_weight ? Number(l.weight_g || 0) > 0 : l.quantity > 0))
    );
  };

  const removeLine = (index: number) => setLines((prev) => prev.filter((_, idx) => idx !== index));

  const clearCart = () => {
    setLines([]);
    setCustomer(null);
    setCartDiscount(0);
  };

  const saveSuspended = () => {
    if (!lines.length) return;
    const cart: SuspendedCart = {
      id: String(Date.now()),
      label: customer?.name || `معلقة #${suspended.length + 1}`,
      lines,
      customer,
      discount: cartDiscount,
      createdAt: new Date().toISOString(),
    };
    const next = [cart, ...suspended].slice(0, 20);
    setSuspended(next);
    localStorage.setItem(SUSPEND_KEY, JSON.stringify(next));
    clearCart();
    setToast('تم تعليق الفاتورة');
    setTimeout(() => setToast(''), 1500);
  };

  const resumeCart = (cart: SuspendedCart) => {
    setLines(cart.lines);
    setCustomer(cart.customer);
    setCartDiscount(cart.discount);
    const next = suspended.filter((c) => c.id !== cart.id);
    setSuspended(next);
    localStorage.setItem(SUSPEND_KEY, JSON.stringify(next));
    setSuspendOpen(false);
  };

  const openPay = () => {
    if (!lines.length) return;
    const def = (posSettings.defaultPaymentMethod || 'cash') as PayMethod;
    setPaymentMethod(def === 'pos' || def === 'wallet' || def === 'card' || def === 'transfer' || def === 'credit' ? def : 'cash');
    setCashAmount(total);
    setCardAmount(0);
    setCreditPaidNow(0);
    setBankAccountId(banks[0]?.id || null);
    setTerminalId(terminals[0]?.id || null);
    setCardNetwork('mada');
    setWalletProvider('jawali');
    setWalletRef('');
    setCardRef('');
    setPayOpen(true);
  };

  const runThermalPrint = async (view: InvoiceViewModel) => {
    try {
      const result = await printEscPosOrBrowser({
        tenant,
        invoice: view,
        currency,
        paperWidth: posSettings.paperWidth,
        branchName: currentBranch?.name_ar || currentBranch?.name,
        openDrawer: posSettings.openCashDrawer,
        copies: posSettings.printCopies,
      });
      if (result.mode === 'browser' && posSettings.openCashDrawer) {
        // browser print path cannot kick drawer pins — try raw pulse separately
        await openCashDrawer('auto');
      }
      if (result.mode === 'escpos') {
        setToast('طباعة ESC/POS على الطابعة');
        setTimeout(() => setToast(''), 1500);
      }
    } catch (err) {
      console.error(err);
      try {
        await printThermalReceipt({
          tenant,
          invoice: view,
          currency,
          paperWidth: posSettings.paperWidth,
          branchName: currentBranch?.name_ar || currentBranch?.name,
          headerNote: posSettings.receiptHeaderNote,
          footerNote: posSettings.receiptFooterNote,
          copies: posSettings.printCopies,
        });
      } catch (err2) {
        console.error(err2);
        setToast('تعذرت الطباعة الحرارية — تحقق من الطابعة');
        setTimeout(() => setToast(''), 2500);
      }
    }
  };

  const completeSale = async () => {
    if (!lines.length) return;
    if (paymentMethod === 'credit' && !customer) {
      setToast('البيع الآجل يتطلب اختيار عميل');
      setTimeout(() => setToast(''), 2000);
      return;
    }
    if (paymentMethod === 'transfer' && !bankAccountId) {
      setToast('اختر حساباً بنكياً للتحويل');
      setTimeout(() => setToast(''), 2000);
      return;
    }
    if ((paymentMethod === 'pos' || paymentMethod === 'card') && terminals.length && !terminalId) {
      setToast('اختر نقطة الدفع');
      setTimeout(() => setToast(''), 2000);
      return;
    }
    setBusy(true);
    try {
      let paid = total;
      let method: string = paymentMethod;
      const notes: string[] = [];

      if (paymentMethod === 'split') {
        paid = Number(cashAmount) + Number(cardAmount);
        method = `split:${cashAmount}/${cardAmount}`;
      } else if (paymentMethod === 'credit') {
        paid = Math.min(Number(creditPaidNow) || 0, total);
        method = 'credit';
      } else if (paymentMethod === 'transfer') {
        paid = total;
        method = bankAccountId ? `transfer:${bankAccountId}` : 'transfer';
      } else if (paymentMethod === 'card') {
        paid = total;
        method = `card:${cardNetwork}`;
        if (terminalId) notes.push(`terminal=${terminalId}`);
        if (cardRef) notes.push(`auth=${cardRef}`);
      } else if (paymentMethod === 'pos') {
        paid = total;
        method = terminalId ? `pos:${terminalId}` : 'pos';
        notes.push(`network=${cardNetwork}`);
        if (cardRef) notes.push(`auth=${cardRef}`);
      } else if (paymentMethod === 'wallet') {
        paid = total;
        method = `wallet:${walletProvider}`;
        if (walletRef) notes.push(`ref=${walletRef}`);
      } else if (paymentMethod === 'cash') {
        paid = total;
        method = 'cash';
        if (cashAmount > total) notes.push(`tendered=${cashAmount}`);
      }

      const payload = {
        tenant_id: tenantId,
        branch_id: currentBranch?.id || null,
        invoice_number: generateInvoiceNumber(),
        customer_id: customer?.id || null,
        customer_name: customer?.name || 'عميل نقدي',
        subtotal,
        discount: discountTotal,
        tax,
        tax_rate: taxCfg.enabled ? taxCfg.rate : 0,
        tax_mode: taxCfg.mode,
        total,
        paid,
        payment_method: method,
        bank_account_id: paymentMethod === 'transfer' ? bankAccountId : null,
        status: 'completed',
        notes: notes.length ? notes.join(' | ') : null,
        created_by: profile?.full_name || profile?.email || 'cashier',
        items: lines.map((l) => {
          const name = l.product.name_ar || l.product.name;
          const label = l.sold_by_weight
            ? `${name} (${formatWeightLabel(l.weight_g)})`
            : name;
          return {
            product_id: l.product.id,
            product_name: label,
            quantity: l.sold_by_weight ? Number(l.weight_g || 0) / 1000 : l.quantity,
            unit_price: l.product.price,
            total: lineAmount(l),
            weight_g: l.sold_by_weight ? Number(l.weight_g || 0) : null,
            sold_by_weight: !!l.sold_by_weight,
          };
        }),
      };

      const { sale: saleRaw, offline } = await createSaleWithOffline(payload, tenantId);
      const sale = saleRaw as unknown as Sale & {
        invoice_number: string;
        created_at?: string;
        created_by?: string;
        payment_method?: string;
        customer_name?: string;
      };
      if (offline) {
        setToast('حُفظت الفاتورة دون اتصال — ستُزامن تلقائياً');
        setTimeout(() => setToast(''), 2500);
      }
      const view: InvoiceViewModel = {
        invoice_number: sale.invoice_number,
        customer_name: sale.customer_name,
        customer_phone: customer?.phone || null,
        payment_method: sale.payment_method,
        created_at: sale.created_at || new Date().toISOString(),
        subtotal,
        discount: discountTotal,
        tax,
        total,
        paid,
        created_by: sale.created_by,
        items: lines.map((l) => ({
          product_name: l.product.name_ar || l.product.name,
          quantity: l.sold_by_weight ? Number(l.weight_g || 0) / 1000 : l.quantity,
          unit_price: Number(l.product.price),
          total: lineAmount(l),
          qty_label: l.sold_by_weight
            ? formatWeightLabel(l.weight_g)
            : `${l.quantity} ${l.product.unit || 'حبة'}`,
        })),
      };

      setShiftCount((c) => c + 1);
      setShiftSales((s) => s + total);
      playSuccessChime();

      // Auto thermal print immediately after payment
      if (posSettings.autoPrintThermal) {
        // slight delay so UI can paint
        setTimeout(() => {
          void runThermalPrint(view);
        }, 180);
      }

      if (posSettings.showDetailedAfterSale) {
        setReceipt(sale);
        setReceiptView(view);
        setReceiptTab('thermal');
      } else {
        setToast(`تم البيع · ${sale.invoice_number}`);
        setTimeout(() => setToast(''), 2000);
      }

      setPayOpen(false);
      clearCart();
      load();
    } catch (err) {
      console.error(err);
      setToast('تعذر إتمام العملية');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'F2') {
          e.preventDefault();
          searchRef.current?.focus();
        }
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'F4') {
        e.preventDefault();
        openPay();
      }
      if (e.key === 'F6') {
        e.preventDefault();
        saveSuspended();
      }
      if (e.key === 'F8') {
        e.preventDefault();
        setCustomerOpen(true);
      }
      if (e.key === 'Escape') {
        setPayOpen(false);
        setCustomerOpen(false);
        setSuspendOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="pos-shell flex flex-col bg-muted/40" dir="rtl">
      {/* top bar */}
      <div className="shrink-0 space-y-2 border-b border-app bg-surface px-2 py-2 sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <ShoppingBag className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-app">نقطة البيع</div>
              <div className="truncate text-[11px] text-muted">
                {currentBranch?.name_ar || 'الفرع'} · {profile?.full_name || 'كاشير'}
                {shiftCount > 0 && (
                  <span className="ms-2 hidden text-primary sm:inline">
                    · الوردية: {shiftCount} · {formatMoney(shiftSales, currency)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="ms-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            <Badge tone={posSettings.autoPrintThermal ? 'success' : 'default'} className="hidden md:inline-flex">
              <Printer className="h-3 w-3" />
              {posSettings.autoPrintThermal ? `طباعة ${posSettings.paperWidth}مم` : 'طباعة يدوية'}
            </Badge>
            <Button variant="outline" size="sm" className="sm:h-11 sm:px-4" onClick={() => setScannerOpen((v) => !v)}>
              كاميرا
            </Button>
            <Button variant="outline" size="sm" className="max-w-[9rem] sm:max-w-none sm:h-11 sm:px-4" onClick={() => setCustomerOpen(true)}>
              <UserRound className="h-4 w-4 shrink-0" />
              <span className="truncate">{customer ? customer.name : 'عميل'}</span>
            </Button>
            <Button variant="soft" size="sm" className="sm:h-11 sm:px-4" onClick={() => setSuspendOpen(true)}>
              <Play className="h-4 w-4" />
              <span className="hidden xs:inline sm:inline">معلقة</span>
              ({suspended.length})
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setHwOpen(true)} aria-label="إعدادات الطابعة">
              <Settings2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => setShortcutsOpen(true)} aria-label="اختصارات">
              <Keyboard className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="relative w-full">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            ref={searchRef}
            id="pos-barcode-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKey}
            data-barcode-input="true"
            placeholder="باركود / اسم / SKU — Enter"
            className="h-11 w-full rounded-2xl border border-app bg-muted pe-10 ps-3 text-sm text-app shadow-soft focus:outline-none focus:ring-2 focus:ring-[var(--ring)] sm:h-12 sm:ps-4 sm:text-base"
          />
        </div>
      </div>

      {scannerOpen && (
        <div className="shrink-0 border-b border-app bg-surface px-2 py-2 sm:px-4 sm:py-3">
          <BarcodeScanner onScan={resolveBarcode} autoFocusTargetId="pos-barcode-input" keepFocus />
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(280px,42%)] lg:grid-rows-1 lg:grid-cols-[minmax(0,1fr)_min(380px,36vw)] xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* products */}
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-app bg-surface px-2 py-2 sm:px-4">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition sm:px-3.5 sm:text-sm',
                  category === c
                    ? 'bg-primary text-inverse'
                    : 'bg-muted text-secondary hover:bg-primary-soft hover:text-primary'
                )}
              >
                {c === 'all' ? 'الكل' : c}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3 lg:p-4">
            {loading ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4 2xl:grid-cols-5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="skeleton h-32 rounded-2xl sm:h-36" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4 2xl:grid-cols-5">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="pos-tile flex flex-col rounded-2xl p-3 text-start"
                  >
                    <ProductThumb product={p} size="pos" className="mb-2" rounded="xl" />
                    <div className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-app">
                      {p.name_ar || p.name}
                    </div>
                    {isWeightProduct(p) && (
                      <div className="mb-1 text-[10px] font-medium text-accent">أدخل الوزن بالغرام</div>
                    )}
                    <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                      <div className="text-base font-bold tabular text-primary">
                        {formatMoney(p.price, currency)}
                        {isWeightProduct(p) && (
                          <span className="ms-1 text-[10px] font-medium text-muted">/كجم</span>
                        )}
                      </div>
                      <Badge tone={Number(p.stock) <= Number(p.min_stock) ? 'warning' : 'default'}>
                        {isWeightProduct(p) ? `${p.stock} كجم` : p.stock}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {!loading && !filtered.length && (
              <div className="flex h-48 items-center justify-center text-muted">لا توجد منتجات مطابقة</div>
            )}
          </div>
        </div>

        {/* cart */}
        <aside className="flex min-h-0 min-w-0 flex-col border-t border-app bg-surface shadow-[0_-8px_24px_rgba(15,23,42,0.06)] lg:border-t-0 lg:border-s lg:shadow-none">
          <div className="flex items-center justify-between border-b border-app px-4 py-3">
            <div>
              <div className="font-semibold text-app">السلة</div>
              <div className="text-xs text-muted">{lines.length} صنف</div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={saveSuspended} disabled={!lines.length} title="تعليق F6">
                <Pause className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={clearCart} disabled={!lines.length}>
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {!lines.length && (
              <div className="flex h-full min-h-40 flex-col items-center justify-center text-center text-sm text-muted">
                <ShoppingBag className="mb-2 h-10 w-10 opacity-30" />
                امسح باركود أو اضغط منتجاً للإضافة
              </div>
            )}
            {lines.map((l, idx) => (
              <div key={`${l.product.id}-${idx}-${l.sold_by_weight ? 'w' : 'u'}`} className="rounded-2xl border border-app bg-subtle p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-app">{l.product.name_ar || l.product.name}</div>
                    <div className="text-xs text-muted tabular">
                      {l.sold_by_weight ? (
                        <>
                          {formatMoney(l.product.price, currency)}/كجم · {formatWeightLabel(l.weight_g)}
                        </>
                      ) : (
                        <>
                          {formatMoney(l.product.price, currency)} × {l.quantity}
                        </>
                      )}
                    </div>
                  </div>
                  <button onClick={() => removeLine(idx)} className="text-muted hover:text-danger">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  {l.sold_by_weight ? (
                    <div className="flex flex-1 items-center gap-2">
                      <div className="inline-flex items-center rounded-xl border border-app bg-surface">
                        <button className="h-10 w-10 touch-target" onClick={() => updateQty(idx, -1)}>
                          <Minus className="mx-auto h-4 w-4" />
                        </button>
                        <input
                          className="h-10 w-16 border-x border-app bg-transparent text-center tabular text-sm font-semibold"
                          value={l.weight_g ?? ''}
                          onChange={(e) => setQty(idx, Number(e.target.value) || 0)}
                          inputMode="numeric"
                        />
                        <button className="h-10 w-10 touch-target" onClick={() => updateQty(idx, 1)}>
                          <Plus className="mx-auto h-4 w-4" />
                        </button>
                      </div>
                      <span className="text-xs text-muted">غرام</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center rounded-xl border border-app bg-surface">
                      <button className="h-10 w-10 touch-target" onClick={() => updateQty(idx, -1)}>
                        <Minus className="mx-auto h-4 w-4" />
                      </button>
                      <input
                        className="h-10 w-12 border-x border-app bg-transparent text-center tabular text-sm font-semibold"
                        value={l.quantity}
                        onChange={(e) => setQty(idx, Number(e.target.value) || 0)}
                      />
                      <button className="h-10 w-10 touch-target" onClick={() => updateQty(idx, 1)}>
                        <Plus className="mx-auto h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <div className="font-bold tabular text-app">{formatMoney(lineAmount(l), currency)}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="shrink-0 space-y-2 border-t border-app p-3 sm:space-y-3 sm:p-4 safe-pb">
            <div className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-muted" />
              <Input
                type="number"
                min={0}
                value={cartDiscount || ''}
                onChange={(e) => setCartDiscount(Number(e.target.value) || 0)}
                placeholder="خصم على الفاتورة"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted">
                <span>المجموع الفرعي</span>
                <span className="tabular">{formatMoney(subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>الخصم</span>
                <span className="tabular text-danger">-{formatMoney(discountTotal, currency)}</span>
              </div>
              {taxCfg.enabled && (
                <div className="flex justify-between text-muted">
                  <span>{taxCfg.label}</span>
                  <span className="tabular">{formatMoney(tax, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold text-app">
                <span>الإجمالي</span>
                <span className="tabular text-primary">{formatMoney(total, currency)}</span>
              </div>
            </div>
            <Button size="xl" className="w-full" disabled={!lines.length} onClick={openPay}>
              <Banknote className="h-5 w-5" />
              دفع · F4
            </Button>
          </div>
        </aside>
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink-900 px-4 py-2 text-sm text-white shadow-lift">
          {toast}
        </div>
      )}

      {/* Weight dialog for veggies */}
      <Dialog
        open={!!weightProduct}
        onClose={() => setWeightProduct(null)}
        title={`وزن — ${weightProduct?.name_ar || ''}`}
        description={`السعر ${formatMoney(weightProduct?.price || 0, currency)} لكل كجم`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setWeightProduct(null)}>
              إلغاء
            </Button>
            <Button onClick={confirmWeightAdd}>إضافة للسلة</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="الوزن بالجرام"
            type="number"
            min={1}
            value={weightGrams}
            onChange={(e) => setWeightGrams(Number(e.target.value) || 0)}
            hint="مثال: 250 = ربع كيلو، 500 = نصف كيلو، 1000 = كيلو"
          />
          <div className="flex flex-wrap gap-2">
            {[100, 250, 500, 750, 1000, 1500, 2000].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setWeightGrams(g)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm',
                  weightGrams === g ? 'border-primary bg-primary-soft text-primary' : 'border-app'
                )}
              >
                {g >= 1000 ? `${g / 1000} كجم` : `${g} غ`}
              </button>
            ))}
          </div>
          <div className="rounded-2xl bg-primary-soft/40 px-4 py-3 text-sm">
            <div className="text-muted">القيمة المحسوبة تلقائياً</div>
            <div className="text-2xl font-bold tabular text-primary">
              {formatMoney(((weightGrams || 0) / 1000) * Number(weightProduct?.price || 0), currency)}
            </div>
            <div className="text-xs text-muted">
              {formatWeightLabel(weightGrams)} × {formatMoney(weightProduct?.price || 0, currency)}/كجم
            </div>
          </div>
        </div>
      </Dialog>

      {/* Customer dialog */}
      <Dialog
        open={customerOpen}
        onClose={() => setCustomerOpen(false)}
        title="اختيار عميل"
        description="ابحث بالاسم أو رقم الواتساب — أو أضف عميلاً جديداً"
        footer={
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setCustomer(null);
                  setCustomerOpen(false);
                }}
              >
                عميل نقدي
              </Button>
              <Button
                variant="soft"
                onClick={() => {
                  setNewCustomer({ name: '', countryCode: '+967', localPhone: '' });
                  setNewCustomerOpen(true);
                }}
              >
                + عميل جديد
              </Button>
            </div>
            <Button onClick={() => setCustomerOpen(false)}>تم</Button>
          </div>
        }
      >
        <div className="mb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              placeholder="بحث بالاسم أو الواتساب..."
              className="h-11 w-full rounded-xl border border-app bg-surface pe-10 ps-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              autoFocus
            />
          </div>
          <div className="mt-2 text-xs text-muted">{filteredCustomers.length} نتيجة</div>
        </div>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {filteredCustomers.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setCustomer(c);
                setCustomerOpen(false);
                setCustomerQuery('');
              }}
              className={cn(
                'flex w-full items-center justify-between rounded-xl border px-3 py-3 text-start transition',
                customer?.id === c.id ? 'border-primary bg-primary-soft' : 'border-app hover:bg-muted'
              )}
            >
              <div>
                <div className="font-medium text-app">{c.name}</div>
                <div className="text-xs text-muted" dir="ltr">
                  {c.phone || 'بدون واتساب'}
                </div>
              </div>
              <div className="text-end">
                <div className="text-xs text-muted">رصيد آجل</div>
                <div className="text-xs font-semibold tabular text-warning">
                  {formatMoney(c.balance, currency)}
                </div>
              </div>
            </button>
          ))}
          {!filteredCustomers.length && (
            <div className="py-8 text-center text-sm text-muted">لا نتائج — أضف عميلاً جديداً</div>
          )}
        </div>
      </Dialog>

      <Dialog
        open={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
        title="عميل جديد سريع"
        description="الاسم + واتساب مع رمز الدولة"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewCustomerOpen(false)}>
              إلغاء
            </Button>
            <Button
              loading={newCustomerBusy}
              onClick={async () => {
                if (!newCustomer.name.trim()) return;
                setNewCustomerBusy(true);
                try {
                  const phone = buildWhatsAppNumber(newCustomer.countryCode, newCustomer.localPhone);
                  const res = await fetch('/api/customers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      tenant_id: tenantId,
                      name: newCustomer.name.trim(),
                      phone: phone || null,
                      balance: 0,
                      total_purchases: 0,
                    }),
                  });
                  if (!res.ok) throw new Error('fail');
                  const created: Customer = await res.json();
                  setCustomers((prev) => [created, ...prev]);
                  setCustomer(created);
                  setNewCustomerOpen(false);
                  setCustomerOpen(false);
                  setToast(`تم اختيار ${created.name}`);
                  setTimeout(() => setToast(''), 1500);
                } catch {
                  setToast('تعذر إضافة العميل');
                  setTimeout(() => setToast(''), 1500);
                } finally {
                  setNewCustomerBusy(false);
                }
              }}
            >
              حفظ واختيار
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label="اسم العميل"
            value={newCustomer.name}
            onChange={(e) => setNewCustomer((f) => ({ ...f, name: e.target.value }))}
            placeholder="مثال: أحمد علي"
          />
          <PhoneWhatsAppField
            countryCode={newCustomer.countryCode}
            localPhone={newCustomer.localPhone}
            onCountryChange={(code) => setNewCustomer((f) => ({ ...f, countryCode: code }))}
            onLocalChange={(local) => setNewCustomer((f) => ({ ...f, localPhone: local }))}
          />
        </div>
      </Dialog>

      {/* Suspended */}
      <Dialog open={suspendOpen} onClose={() => setSuspendOpen(false)} title="الفواتير المعلقة">
        <div className="space-y-2">
          {!suspended.length && <div className="py-8 text-center text-sm text-muted">لا توجد فواتير معلقة</div>}
          {suspended.map((c) => (
            <button
              key={c.id}
              onClick={() => resumeCart(c)}
              className="flex w-full items-center justify-between rounded-xl border border-app px-3 py-3 text-start hover:bg-muted"
            >
              <div>
                <div className="font-medium">{c.label}</div>
                <div className="text-xs text-muted">{c.lines.length} أصناف</div>
              </div>
              <Badge tone="accent">استئناف</Badge>
            </button>
          ))}
        </div>
      </Dialog>

      {/* Shortcuts */}
      <Dialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="اختصارات لوحة المفاتيح" size="sm">
        <div className="space-y-2 text-sm">
          {[
            ['F2', 'تركيز البحث / الباركود'],
            ['Enter', 'إضافة أول نتيجة'],
            ['F4', 'فتح الدفع'],
            ['F6', 'تعليق الفاتورة'],
            ['F8', 'اختيار عميل'],
            ['Esc', 'إغلاق النوافذ'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">
              <span className="text-secondary">{v}</span>
              <kbd className="rounded-lg border border-app bg-surface px-2 py-1 font-mono text-xs">{k}</kbd>
            </div>
          ))}
        </div>
      </Dialog>

      {/* Payment */}
      <Dialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="إتمام الدفع"
        description={`الإجمالي ${formatMoney(total, currency)}`}
        size="lg"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              إلغاء
            </Button>
            <Button size="lg" loading={busy} onClick={completeSale}>
              تأكيد الدفع
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {(
            [
              { id: 'cash' as PayMethod, label: 'نقدي', icon: Banknote },
              { id: 'card' as PayMethod, label: 'بطاقة', icon: CreditCard },
              { id: 'pos' as PayMethod, label: 'نقطة دفع', icon: Nfc },
              { id: 'wallet' as PayMethod, label: 'محفظة', icon: Wallet },
              { id: 'transfer' as PayMethod, label: 'تحويل', icon: Landmark },
              { id: 'credit' as PayMethod, label: 'آجل', icon: CalendarClock },
              { id: 'split' as PayMethod, label: 'مقسّم', icon: Split },
            ] as const
          ).map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setPaymentMethod(m.id);
                  if (m.id === 'cash') {
                    setCashAmount(total);
                    setCardAmount(0);
                  } else if (m.id === 'card' || m.id === 'pos') {
                    setCashAmount(0);
                    setCardAmount(total);
                    setTerminalId(terminals[0]?.id || null);
                  } else if (m.id === 'transfer') {
                    setBankAccountId(banks[0]?.id || null);
                  } else if (m.id === 'credit') {
                    setCreditPaidNow(0);
                  } else if (m.id === 'split') {
                    setCashAmount(Math.round(total / 2));
                    setCardAmount(total - Math.round(total / 2));
                  }
                }}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition touch-target',
                  paymentMethod === m.id
                    ? 'border-primary bg-primary-soft text-primary shadow-soft'
                    : 'border-app hover:bg-muted'
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs font-semibold">{m.label}</span>
              </button>
            );
          })}
        </div>

        {paymentMethod === 'split' && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Input
              label="مبلغ نقدي"
              type="number"
              value={cashAmount}
              onChange={(e) => setCashAmount(Number(e.target.value) || 0)}
            />
            <Input
              label="مبلغ بطاقة / نقطة دفع"
              type="number"
              value={cardAmount}
              onChange={(e) => setCardAmount(Number(e.target.value) || 0)}
            />
          </div>
        )}

        {paymentMethod === 'cash' && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {[total, Math.ceil(total / 1000) * 1000, Math.ceil(total / 5000) * 5000, 1000, 5000, 10000]
                .filter((v, i, a) => v > 0 && a.indexOf(v) === i)
                .slice(0, 6)
                .map((v) => (
                  <button key={v} type="button" className="pos-cash-chip px-2 text-sm" onClick={() => setCashAmount(v)}>
                    {formatMoney(v, currency)}
                  </button>
                ))}
            </div>
            <Input
              label="المبلغ المستلم"
              type="number"
              value={cashAmount}
              onChange={(e) => setCashAmount(Number(e.target.value) || 0)}
            />
            <div className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success">
              الباقي للعميل:{' '}
              <span className="font-bold tabular">
                {formatMoney(Math.max(0, cashAmount - total), currency)}
              </span>
            </div>
          </div>
        )}

        {(paymentMethod === 'card' || paymentMethod === 'pos') && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-info/20 bg-info-soft/40 px-3 py-2 text-sm text-info">
              {paymentMethod === 'pos'
                ? 'اطلب من العميل تمرير/لمس البطاقة على جهاز الشبكة ثم أكّد الدفع'
                : 'سجّل عملية البطاقة على نقطة الدفع ثم أكّد'}
            </div>
            {!!terminals.length && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-secondary">نقطة الدفع</div>
                {terminals.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTerminalId(t.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl border px-3 py-3 text-start',
                      terminalId === t.id ? 'border-primary bg-primary-soft' : 'border-app'
                    )}
                  >
                    <div>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted">
                        {t.provider} · {t.connection_type}
                        {t.supports_contactless ? ' · NFC' : ''}
                      </div>
                    </div>
                    <Badge tone="info">{t.terminal_id || 'POS'}</Badge>
                  </button>
                ))}
              </div>
            )}
            {!terminals.length && (
              <div className="text-xs text-muted">يمكنك إضافة أجهزة نقاط الدفع من صفحة المدفوعات</div>
            )}
            <Select
              label="شبكة / نوع البطاقة"
              value={cardNetwork}
              onChange={(e) => setCardNetwork(e.target.value)}
              options={CARD_NETWORKS.map((n) => ({ value: n.id, label: n.label }))}
            />
            <Input
              label="رقم التفويض / المرجع (اختياري)"
              value={cardRef}
              onChange={(e) => setCardRef(e.target.value)}
              placeholder="AUTH-123456"
            />
          </div>
        )}

        {paymentMethod === 'wallet' && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Select
              label="المحفظة"
              value={walletProvider}
              onChange={(e) => setWalletProvider(e.target.value)}
              options={WALLET_PROVIDERS.map((w) => ({ value: w.id, label: w.label }))}
            />
            <Input
              label="مرجع العملية"
              value={walletRef}
              onChange={(e) => setWalletRef(e.target.value)}
              placeholder="رقم العملية"
            />
          </div>
        )}

        {paymentMethod === 'transfer' && (
          <div className="mt-4 space-y-2">
            <div className="text-sm font-medium text-secondary">اختر الحساب البنكي</div>
            {!banks.length && (
              <div className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
                لا توجد حسابات بنكية — أضفها من صفحة المدفوعات
              </div>
            )}
            {banks.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBankAccountId(b.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border px-3 py-3 text-start',
                  bankAccountId === b.id ? 'border-primary bg-primary-soft' : 'border-app'
                )}
              >
                <div>
                  <div className="font-medium">{b.bank_name}</div>
                  <div className="text-xs text-muted">{b.account_name}</div>
                </div>
                <div className="font-mono text-xs text-muted" dir="ltr">
                  {b.account_number || b.iban}
                </div>
              </button>
            ))}
          </div>
        )}

        {paymentMethod === 'credit' && (
          <div className="mt-4 space-y-3">
            {!customer && (
              <div className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
                يجب اختيار عميل للبيع الآجل
              </div>
            )}
            {customer && (
              <div className="rounded-xl bg-muted px-3 py-2 text-sm">
                العميل: <strong>{customer.name}</strong> · رصيد حالي:{' '}
                {formatMoney(customer.balance, currency)}
              </div>
            )}
            <Input
              label="مبلغ مدفوع الآن (اختياري)"
              type="number"
              value={creditPaidNow}
              onChange={(e) => setCreditPaidNow(Number(e.target.value) || 0)}
            />
            <div className="text-sm text-muted">
              سيُضاف للآجل:{' '}
              <span className="font-bold text-warning tabular">
                {formatMoney(Math.max(0, total - Number(creditPaidNow || 0)), currency)}
              </span>
            </div>
          </div>
        )}
      </Dialog>

      {/* Hardware / thermal settings */}
      <Dialog
        open={hwOpen}
        onClose={() => setHwOpen(false)}
        title="الطابعة الحرارية ونقطة البيع"
        description="إعدادات الجهاز المحلي لهذا المتصفح/الجهاز"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setHwOpen(false)}>
              إغلاق
            </Button>
            <Button
              onClick={() => {
                const next = savePosSettings(posSettings);
                setPosSettings(next);
                setHwOpen(false);
                setToast('تم حفظ إعدادات الطابعة');
                setTimeout(() => setToast(''), 1500);
              }}
            >
              حفظ
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-3 rounded-2xl border border-app bg-subtle px-4 py-3">
            <div>
              <div className="font-semibold text-app">طباعة حرارية تلقائية بعد الدفع</div>
              <div className="text-xs text-muted">تُرسل الفاتورة مباشرة لطابعة الإيصال الموصولة</div>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--primary)]"
              checked={posSettings.autoPrintThermal}
              onChange={(e) => setPosSettings((s) => ({ ...s, autoPrintThermal: e.target.checked }))}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="عرض ورق الطابعة"
              value={posSettings.paperWidth}
              onChange={(e) =>
                setPosSettings((s) => ({
                  ...s,
                  paperWidth: e.target.value as '58' | '80',
                }))
              }
              options={[
                { value: '80', label: '80 مم (شائع)' },
                { value: '58', label: '58 مم' },
              ]}
            />
            <Select
              label="عدد النسخ"
              value={String(posSettings.printCopies)}
              onChange={(e) =>
                setPosSettings((s) => ({ ...s, printCopies: Number(e.target.value) || 1 }))
              }
              options={[
                { value: '1', label: '1' },
                { value: '2', label: '2' },
                { value: '3', label: '3' },
              ]}
            />
            <Select
              label="وسيلة الدفع الافتراضية"
              value={posSettings.defaultPaymentMethod}
              onChange={(e) =>
                setPosSettings((s) => ({
                  ...s,
                  defaultPaymentMethod: e.target
                    .value as PosHardwareSettings['defaultPaymentMethod'],
                }))
              }
              options={[
                { value: 'cash', label: 'نقدي' },
                { value: 'card', label: 'بطاقة' },
                { value: 'pos', label: 'نقطة دفع' },
                { value: 'wallet', label: 'محفظة' },
                { value: 'transfer', label: 'تحويل' },
                { value: 'credit', label: 'آجل' },
              ]}
            />
            <label className="flex items-center gap-2 rounded-xl border border-app px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="accent-[var(--primary)]"
                checked={posSettings.scanBeep}
                onChange={(e) => setPosSettings((s) => ({ ...s, scanBeep: e.target.checked }))}
              />
              <Volume2 className="h-4 w-4 text-muted" />
              صوت عند إضافة منتج
            </label>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-app px-4 py-3">
            <div>
              <div className="font-medium text-app">عرض الفاتورة بعد البيع</div>
              <div className="text-xs text-muted">حتى مع الطباعة التلقائية</div>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--primary)]"
              checked={posSettings.showDetailedAfterSale}
              onChange={(e) =>
                setPosSettings((s) => ({ ...s, showDetailedAfterSale: e.target.checked }))
              }
            />
          </label>

          <Input
            label="ملاحظة أعلى الإيصال"
            value={posSettings.receiptHeaderNote}
            onChange={(e) => setPosSettings((s) => ({ ...s, receiptHeaderNote: e.target.value }))}
          />
          <Input
            label="ملاحظة أسفل الإيصال"
            value={posSettings.receiptFooterNote}
            onChange={(e) => setPosSettings((s) => ({ ...s, receiptFooterNote: e.target.value }))}
            placeholder="أو يُستخدم تذييل المتجر"
          />

          <div className="rounded-2xl bg-muted p-3 text-xs text-secondary leading-relaxed">
            <strong className="text-app">نصيحة احترافية:</strong> عيّن الطابعة الحرارية كطابعة
            افتراضية في النظام، أو اخترها من مربع الطباعة. الورق 58/80مم يُضبط تلقائياً.
          </div>

          {receiptView && (
            <Button variant="outline" className="w-full" onClick={() => void runThermalPrint(receiptView)}>
              <Printer className="h-4 w-4" />
              اختبار طباعة آخر فاتورة
            </Button>
          )}
        </div>
      </Dialog>

      {/* Receipt after sale */}
      <Dialog
        open={!!receipt && !!receiptView}
        onClose={() => {
          setReceipt(null);
          setReceiptView(null);
        }}
        title="تم إتمام البيع"
        description={receipt?.invoice_number}
        size="lg"
        footer={
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                if (!receiptView) return;
                await runThermalPrint(receiptView);
              }}
            >
              <Printer className="h-4 w-4" />
              طباعة حرارية {posSettings.paperWidth}مم
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const el = document.getElementById(
                  receiptTab === 'thermal' ? 'thermal-receipt-print' : 'detailed-invoice-print'
                );
                if (!el) {
                  window.print();
                  return;
                }
                const { printElement } = await import('../lib/documentExport');
                await printElement(el);
              }}
            >
              طباعة A4 / عادية
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const el = document.getElementById(
                  receiptTab === 'thermal' ? 'thermal-receipt-print' : 'detailed-invoice-print'
                );
                if (!el) return;
                const { downloadElementAsPng } = await import('../lib/documentExport');
                await downloadElementAsPng(
                  el,
                  `rafd-invoice-${receipt?.invoice_number || Date.now()}.png`
                );
              }}
            >
              صورة
            </Button>
            <Button
              variant="soft"
              onClick={async () => {
                if (!receipt || !receiptView) return;
                const text = buildDetailedInvoiceText({
                  tenantName: tenant?.name_ar || tenant?.name || 'رفد',
                  tenantAddress: tenant?.address,
                  invoiceNumber: receiptView.invoice_number,
                  customerName: receiptView.customer_name,
                  customerPhone: receiptView.customer_phone,
                  paymentMethod: receiptView.payment_method,
                  createdAt: receiptView.created_at,
                  items: receiptView.items.map((it) => ({
                    name: it.product_name,
                    qtyLabel: it.qty_label || String(it.quantity),
                    unitPrice: it.unit_price,
                    total: it.total,
                  })),
                  subtotal: receiptView.subtotal,
                  discount: receiptView.discount,
                  tax: receiptView.tax,
                  total: receiptView.total,
                  paid: receiptView.paid,
                  currency,
                  footer: tenant?.invoice_footer,
                });
                const el = document.getElementById(
                  receiptTab === 'thermal' ? 'thermal-receipt-print' : 'detailed-invoice-print'
                );
                if (el) {
                  const { shareDocumentBundle } = await import('../lib/documentExport');
                  await shareDocumentBundle({
                    element: el,
                    phone: receiptView.customer_phone,
                    text,
                    baseName: `rafd-invoice-${receipt.invoice_number}`,
                    mode: 'whatsapp-both',
                  });
                } else {
                  shareWhatsApp(receiptView.customer_phone || '', text);
                }
              }}
            >
              <MessageCircle className="h-4 w-4" />
              واتساب
            </Button>
            <Button
              onClick={() => {
                setReceipt(null);
                setReceiptView(null);
              }}
            >
              فاتورة جديدة
            </Button>
          </div>
        }
      >
        {receiptView && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={receiptTab === 'thermal' ? 'primary' : 'outline'}
                onClick={() => setReceiptTab('thermal')}
              >
                إيصال حراري
              </Button>
              <Button
                size="sm"
                variant={receiptTab === 'detailed' ? 'primary' : 'outline'}
                onClick={() => setReceiptTab('detailed')}
              >
                فاتورة تفصيلية
              </Button>
              {posSettings.autoPrintThermal && (
                <Badge tone="success" className="ms-auto">
                  طباعة تلقائية مفعّلة
                </Badge>
              )}
            </div>
            {receiptTab === 'thermal' ? (
              <ThermalReceipt
                tenant={tenant}
                invoice={receiptView}
                currency={currency}
                paperWidth={posSettings.paperWidth}
                branchName={currentBranch?.name_ar || currentBranch?.name}
              />
            ) : (
              <DetailedInvoice
                tenant={tenant}
                invoice={receiptView}
                currency={currency}
                docId="detailed-invoice-print"
              />
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
