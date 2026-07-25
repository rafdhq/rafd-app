import { setCors } from './_lib/auth-middleware.js';

export default function handler(req, res) {
  setCors(req, res);
  res.status(200).json({ 
    message: 'Import from api-shared works!',
    timestamp: new Date().toISOString()
  });
}
