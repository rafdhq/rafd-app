import { setCors } from './lib/auth-middleware.js';
import { handler as expensesHandler } from './lib/modules/expenses.js';
import { handler as bankAccountsHandler } from './lib/modules/bank-accounts.js';
import { handler as paymentTerminalsHandler } from './lib/modules/payment-terminals.js';
import { handler as customerLedgerHandler } from './lib/modules/customer-ledger.js';
import { handler as supplierLedgerHandler } from './lib/modules/supplier-ledger.js';

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
