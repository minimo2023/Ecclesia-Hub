import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import xitWorkerRoutes from './xitWorker.routes.mjs';

const app = express();
const port = Number(process.env.XIT_WORKER_PORT || process.env.PORT || 3105);

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3005',
    'http://127.0.0.1:3005',
  ],
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));

app.get('/', (req, res) => {
  res.redirect('/xit-worker/');
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.use('/xit-worker', xitWorkerRoutes);

app.use((error, req, res, next) => {
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({
      ok: false,
      error: 'Invalid JSON body',
      message: error.message,
      path: req.originalUrl,
    });
    return;
  }

  next(error);
});

app.listen(port, () => {
  console.log(`[XIT-Worker] standalone server listening on http://127.0.0.1:${port}/xit-worker/`);
});
