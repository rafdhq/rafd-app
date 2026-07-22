/**
 * Financial Domain Router
 * Handles: expenses, bank-accounts, payment-terminals, customer-ledger, supplier-ledger
 */
import { setCors } from './_shared/auth-middleware.js';

const ROUTES = {
  expenses: () => import('./_shared/modules/expenses.js'),
  'bank-accounts': () => import('./_shared/modules/bank-accounts.js'),
  'payment-terminals': () => import('./_shared/modules/payment-terminals.js'),
  'customer-ledger': () => import('./_shared/modules/customer-ledger.js'),
  'supplier-ledger': () => import('./_shared/modules/supplier-ledger.js'),
};

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const pathParts = req.url.split('?')[0].split('/').filter(Boolean);
  const resource = pathParts[2];

  const loader = ROUTES[resource];
  if (!loader) {
    return res.status(404).json({ error: `Resource not found: ${resource}` });
  }

  try {
    const { default: routeHandler } = await loader();
    return routeHandler(req, res);
  } catch (err) {
    console.error(`Financial API error [${resource}]:`, err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
