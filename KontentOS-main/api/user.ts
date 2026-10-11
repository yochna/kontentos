import express from 'express';
import * as db from '../server/db.js';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get(['/api/user', '/'], async (req, res) => {
  try {
    const user = await db.getUser();
    res.json({ success: true, data: user });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch user' });
  }
});

app.post(['/api/user', '/'], async (req, res) => {
  try {
    const updated = await db.saveUser(req.body);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save user' });
  }
});

export default function handler(req: any, res: any) {
  return app(req, res);
}
