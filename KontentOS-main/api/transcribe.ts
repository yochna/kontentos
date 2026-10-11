import express from 'express';
import transcribeRouter from '../server/routes/transcribe.js';

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/transcribe', transcribeRouter);
app.use('/', transcribeRouter);

export default function handler(req: any, res: any) {
  return app(req, res);
}
