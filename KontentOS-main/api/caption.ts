import express from 'express';
import captionRouter from '../server/routes/caption.js';

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/caption', captionRouter);
app.use('/', captionRouter);

export default function handler(req: any, res: any) {
  return app(req, res);
}
