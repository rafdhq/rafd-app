export interface LedgerRow {
  id: number;
  type: string;
  amount: number;
  balance_after: number;
  reference?: string | null;
  notes?: string | null;
  created_at?: string;
}
