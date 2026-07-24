export interface Tenant {
  id: number;
  name: string;
  name_ar: string;
  logo_url?: string | null;
  primary_color: string;
  secondary_color: string;
  currency: string;
  plan: string;
  status: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_number?: string | null;
  invoice_footer?: string | null;
  created_at?: string;
  /** Activity profile: grocery, restaurant, housewares, ... */
  business_type?: string | null;
  /** Enabled product categories for this tenant */
  enabled_categories?: string[] | null;
  /** Extra custom category labels */
  custom_categories?: string[] | null;
  // Subscription fields (merged from tenant_subscriptions for admin/subscriber views)
  plan_code?: string | null;
  billing_cycle?: string | null;
  trial_starts_at?: string | null;
  trial_ends_at?: string | null;
  subscription_starts_at?: string | null;
  subscription_ends_at?: string | null;
  subscription_plan?: { name?: string; name_ar?: string; code?: string } | null;
  owner?: { full_name?: string; email?: string; role?: string } | null;
}

export interface Branch {
  id: number;
  tenant_id: number;
  name: string;
  name_ar: string;
  address?: string | null;
  phone?: string | null;
  is_main: boolean;
  status: string;
}

export interface Product {
  id: number;
  tenant_id: number;
  name: string;
  name_ar: string;
  sku: string;
  barcode: string;
  category: string;
  price: number; // unit sell price (حبة)
  cost: number; // unit cost (حبة)
  stock: number; // pieces
  min_stock: number;
  unit: string;
  image_url?: string | null;
  is_active: boolean;
  units_per_carton?: number | null;
  carton_cost?: number | null;
  supplier_id?: number | null;
  supplier_name?: string | null;
  created_at?: string;
}

export interface Customer {
  id: number;
  tenant_id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  balance: number;
  total_purchases: number;
  notes?: string | null;
  created_at?: string;
}

export interface Supplier {
  id: number;
  tenant_id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  balance: number;
  notes?: string | null;
  created_at?: string;
}

export interface Sale {
  id: number;
  tenant_id: number;
  branch_id?: number | null;
  invoice_number: string;
  customer_id?: number | null;
  customer_name?: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  payment_method: string;
  status: string;
  notes?: string | null;
  created_by?: string | null;
  bank_account_id?: number | null;
  created_at?: string;
  items?: SaleItem[];
}

export interface SaleItem {
  id?: number;
  sale_id?: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Expense {
  id: number;
  tenant_id: number;
  category: string;
  amount: number;
  description?: string | null;
  payment_method?: string | null;
  expense_date: string;
  created_at?: string;
}

export interface PurchaseItem {
  id?: number;
  purchase_id?: number;
  product_id?: number | null;
  product_name: string;
  quantity: number;
  unit?: string;
  unit_cost: number;
  total: number;
  units_per_carton?: number;
  cartons?: number;
}

export interface Purchase {
  id: number;
  tenant_id: number;
  supplier_id?: number | null;
  supplier_name?: string | null;
  reference: string;
  total: number;
  paid: number;
  status: string;
  purchase_date: string;
  notes?: string | null;
  created_at?: string;
  items?: PurchaseItem[];
}

export interface SupplierLedger {
  id: number;
  tenant_id: number;
  supplier_id: number;
  type: string;
  amount: number;
  balance_after: number;
  reference?: string | null;
  notes?: string | null;
  purchase_id?: number | null;
  created_at?: string;
}

export interface AppUser {
  id: number;
  tenant_id?: number | null;
  auth_id?: string | null;
  email: string;
  full_name: string;
  role: string;
  phone?: string | null;
  branch_id?: number | null;
  status: string;
  avatar_url?: string | null;
}

export interface NotificationItem {
  id: number;
  tenant_id?: number | null;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export interface SyncStatus {
  id: number;
  tenant_id: number;
  status: string;
  last_sync_at?: string | null;
  message?: string | null;
  pending_changes: number;
}

export interface BankAccount {
  id: number;
  tenant_id: number;
  bank_name: string;
  account_name: string;
  account_number?: string | null;
  iban?: string | null;
  currency: string;
  is_active: boolean;
  notes?: string | null;
  created_at?: string;
}

export interface PaymentTerminal {
  id: number;
  tenant_id: number;
  name: string;
  provider: string;
  terminal_id?: string | null;
  connection_type: string;
  is_active: boolean;
  supports_contactless?: boolean;
  notes?: string | null;
  created_at?: string;
}

export interface CustomerLedger {
  id: number;
  tenant_id: number;
  customer_id: number;
  type: string;
  amount: number;
  balance_after: number;
  reference?: string | null;
  notes?: string | null;
  sale_id?: number | null;
  created_at?: string;
}

export interface DashboardStats {
  sales_today: number;
  revenue_today: number;
  revenue_month: number;
  profit_month: number;
  expenses_month: number;
  low_stock_count: number;
  customers_count: number;
  products_count: number;
  invoices_today: number;
  top_products: Array<{ name: string; qty: number; revenue: number }>;
  sales_series: Array<{ day: string; total: number }>;
  recent_sales: Sale[];
  insights: string[];
}

export interface CartLine {
  product: Product;
  /** For piece items: count. For weight items: kilograms (weight_g / 1000). */
  quantity: number;
  discount: number;
  /** Weight in grams when sold by weight (خضار etc.) */
  weight_g?: number;
  /** Display helper — price is always per kg for weight items */
  sold_by_weight?: boolean;
}
