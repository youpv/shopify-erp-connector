import { Router } from 'express';
import { listConfigs, getConfig, createConfig, updateConfig, deleteConfig } from './integrationRepo.js';

const router = Router();

router.get('/', async (req, res) => {
  const configs = await listConfigs();
  res.json(configs);
});

router.get('/:id', async (req, res) => {
  const config = await getConfig(req.params.id);
  if (!config) return res.status(404).json({ error: 'not found' });
  res.json(config);
});

router.post('/', async (req, res) => {
  const created = await createConfig(req.body);
  res.status(201).json(created);
});

router.put('/:id', async (req, res) => {
  const updated = await updateConfig(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const ok = await deleteConfig(req.params.id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ deleted: true });
});

export default router;
