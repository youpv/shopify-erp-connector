import express from 'express';
import { enqueueSync } from './productSync.js';
import integrationRouter from './integrationRoutes.js';
import { query } from './db.js';

export function createServer() {
  const app = express();
  app.use(express.json());

  app.use('/configs', integrationRouter);

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.post('/sync/:id', async (req, res) => {
    try {
      await enqueueSync(req.params.id);
      res.json({ queued: true, configId: req.params.id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get sync logs for a specific config
  app.get('/configs/:id/logs', async (req, res) => {
    try {
      const { rows } = await query(
        `SELECT * FROM sync_logs 
         WHERE config_id = $1 
         ORDER BY created_at DESC 
         LIMIT 50`,
        [req.params.id]
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all recent sync logs
  app.get('/logs', async (req, res) => {
    try {
      const { rows } = await query(
        `SELECT sl.*, psc.name as config_name 
         FROM sync_logs sl
         JOIN product_sync_configs psc ON sl.config_id = psc.id
         ORDER BY sl.created_at DESC 
         LIMIT 100`
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get sync status
  app.get('/sync/status', async (req, res) => {
    try {
      const { rows: activeConfigs } = await query(
        `SELECT COUNT(DISTINCT config_id) as active_configs 
         FROM sync_logs 
         WHERE created_at > NOW() - INTERVAL '24 hours'`
      );
      
      const { rows: recentSyncs } = await query(
        `SELECT status, COUNT(*) as count 
         FROM sync_logs 
         WHERE created_at > NOW() - INTERVAL '24 hours'
         GROUP BY status`
      );
      
      res.json({
        activeConfigs: activeConfigs[0].active_configs,
        recentSyncs: recentSyncs.reduce((acc, row) => {
          acc[row.status] = parseInt(row.count);
          return acc;
        }, {})
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return app;
}
