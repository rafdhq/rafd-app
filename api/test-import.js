import { setCors } from './_lib/auth-middleware';

export default function handler(req, res) {
  setCors(res);
  res.status(200).json({ 
    message: 'Import from api-shared works!',
    timestamp: new Date().toISOString()
  });
}
