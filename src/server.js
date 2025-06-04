import express from 'express';
import { enqueueSync } from './productSync.js';
import integrationRouter from './integrationRoutes.js';

export function createServer() {
  const app = express();
  app.use(express.json());

  app.use('/configs', integrationRouter);

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.post('/sync/:id', async (req, res) => {
    await enqueueSync(req.params.id);
    res.json({ queued: true });
  });

  return app;
}
