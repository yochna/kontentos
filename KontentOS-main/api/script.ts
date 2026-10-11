import express from 'express';
import scriptRouter from '../server/routes/script.js';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/script', scriptRouter);
app.use('/', scriptRouter);

export default function handler(req: any, res: any) {
  return app(req, res);
}
