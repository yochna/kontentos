import express from 'express';
import publishRouter from '../server/routes/publish.js';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/publish', publishRouter);
app.use('/', publishRouter);

export default function handler(req: any, res: any) {
  return app(req, res);
}
