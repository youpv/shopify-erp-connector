import { syncQueue, createWorker } from './queue.js';
import { query } from './db.js';
import { runQuery } from './shopify.js';
import { fetchJson } from './ftp.js';
import { mapProduct } from './mapping.js';

// Example mutation for bulk operations
const BULK_MUTATION = `mutation bulk($mutation: String!, $path: String!) {\n  bulkOperationRunMutation(mutation: $mutation, stagedUploadPath: $path) {\n    bulkOperation { id status }\n    userErrors { field message }\n  }\n}`;

export async function enqueueSync(configId) {
  await syncQueue.add('sync', { configId });
}

export function startWorker() {
  createWorker(async job => {
    const { configId } = job.data;
    await runSync(configId);
  });
}

async function runSync(configId) {
  const { rows } = await query('SELECT * FROM product_sync_configs WHERE id=$1', [configId]);
  const config = rows[0];
  if (!config) throw new Error('Config not found');

  console.log(`Syncing products for ${configId}`);

  // Download product data from FTP
  const products = await fetchJson(config.credentials.filePath, config.credentials);

  const mapped = products.map(p => mapProduct(p, config));

  // Placeholder mutation call per product
  for (const p of mapped) {
    await runQuery(BULK_MUTATION, { mutation: JSON.stringify(p), path: '' });
  }
}
