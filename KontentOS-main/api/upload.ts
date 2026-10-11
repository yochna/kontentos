import express from 'express';
import uploadRouter from '../server/routes/upload.js';

const app = express();
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

app.use('/api/upload', uploadRouter);
app.use('/', uploadRouter);

export default function handler(req: any, res: any) {
  return app(req, res);
}
