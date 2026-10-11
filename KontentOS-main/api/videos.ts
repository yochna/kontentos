import express from 'express';
import videosRouter from '../server/routes/videos.js';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/videos', videosRouter);
app.use('/', videosRouter);

export default function handler(req: any, res: any) {
  return app(req, res);
}
