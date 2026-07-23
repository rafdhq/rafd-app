import { setCors } from '../api-shared/auth-middleware.js';
import { handler as expensesHandler } from '../api-shared/modules/expenses.js';
import { handler as bankAccountsHandler } from '../api-shared/modules/bank-accounts.js';
import { handler as paymentTerminalsHandler } from '../api-shared/modules/payment-terminals.js';
import { handler as customerLedgerHandler } from '../api-shared/modules/customer-ledger.js';
import { handler as supplierLedgerHandler } from '../api-shared/modules/supplier-ledger.js';

const ROUTES = { expenses: expensesHandler, 'bank-accounts': bankAccountsHandler, 'payment-terminals': paymentTerminalsHandler, 'customer-ledger': customerLedgerHandler, 'supplier-ledger': supplierLedgerHandler };

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const resource = req.query?.resource || req.url.split('?')[0].split('/').filter(Boolean)[2];
  const routeHandler = ROUTES[resource];
  if (!routeHandler) return res.status(404).json({ error: `Resource not found: ${resource}` });
  try { return await routeHandler(req, res); }
  catch (err) { console.error(`Financial API error [${resource}]:`, err); return res.status(500).json({ error: err.message || 'Internal server error' }); }
}
