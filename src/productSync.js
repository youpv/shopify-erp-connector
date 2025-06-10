import { syncQueue, createWorker } from './queue.js';
import { query } from './db.js';
import { fetchJson } from './ftp.js';
import { mapProduct } from './mapping.js';
import { categorizeProducts } from './services/productOperations.js';
import { executeProductOperations } from './services/syncOperations.js';
import chalk from 'chalk';

export async function enqueueSync(configId) {
  await syncQueue.add('sync', { configId });
}

export function startWorker() {
  createWorker(async job => {
    const { configId } = job.data;
    console.log(chalk.blue(`🚀 Starting sync for config: ${configId}`));
    
    try {
      const result = await runSync(configId);
      
      // Format sync completed message with emojis
      console.log(chalk.green(`✅ Sync completed for ${configId}`));
      console.log(chalk.cyan('📊 Sync results summary:'));
      console.log(chalk.white(`  📦 Total products: ${result.totalProducts}`));
      console.log(chalk.green(`  ✨ Created: ${result.created || 0} products`));
      console.log(chalk.blue(`  🔄 Updated: ${result.updated || 0} products`));
      console.log(chalk.yellow(`  🗑️  Deleted: ${result.deleted || 0} products`));
      if (result.errors && result.errors.length > 0) {
        console.log(chalk.red(`  ❌ Errors: ${result.errors.length}`));
      }
      
      // Log sync results
      await logSyncResult(configId, 'completed', result);
      
      return result;
    } catch (error) {
      console.error(chalk.red(`❌ Sync failed for ${configId}:`), error);
      
      // Log sync failure
      await logSyncResult(configId, 'failed', null, error.message);
      
      throw error;
    }
  });
}

async function runSync(configId) {
  // Get configuration
  const { rows } = await query('SELECT * FROM product_sync_configs WHERE id=$1', [configId]);
  const config = rows[0];
  if (!config) throw new Error('Config not found');

  console.log(chalk.blue(`📋 Syncing products for: ${config.name}`));

  // Start sync log
  const syncLogId = await createSyncLog(configId);

  try {
    // Download product data from FTP
    console.log(chalk.gray('📥 Fetching data from FTP...'));
    const jsonData = await fetchJson(config.credentials.filePath, config.credentials);
    
    // Extract products using dataPath if specified
    let products = jsonData;
    if (config.credentials.dataPath) {
      const pathParts = config.credentials.dataPath.split('.');
      for (const part of pathParts) {
        products = products[part];
        if (!products) {
          throw new Error(`Data path '${config.credentials.dataPath}' not found in JSON response`);
        }
      }
    }
    
    // Ensure products is an array
    if (!Array.isArray(products)) {
      throw new Error(`Expected array at data path '${config.credentials.dataPath || 'root'}', got ${typeof products}`);
    }
    
    console.log(chalk.green(`✅ Fetched ${products.length} products from FTP`));

    // Limit to first 100 products for demo POC
    const DEMO_LIMIT = 100;
    if (products.length > DEMO_LIMIT) {
      console.log(chalk.yellow(`⚠️  Limiting to first ${DEMO_LIMIT} products for demo POC (total: ${products.length})`));
      products = products.slice(0, DEMO_LIMIT);
    }

    // Add SKU to each product for easier tracking
    const productsWithSku = products.map(p => ({
      ...p,
      sku: p.sku || p.SKU || p.variant?.sku || p.productCode
    }));

    // Categorize products into create/update/delete operations
    const operations = await categorizeProducts(productsWithSku, configId);

    // Map products according to configuration
    console.log(chalk.gray('🔄 Mapping products...'));
    const mappedProducts = productsWithSku.map(p => ({
      ...mapProduct(p, config),
      sku: p.sku
    }));

    // Execute operations
    console.log(chalk.gray('⚡ Executing Shopify operations...'));
    const results = await executeProductOperations(operations, mappedProducts, configId);

    // Update sync log with results
    await updateSyncLog(syncLogId, 'completed', results);

    return {
      totalProducts: products.length,
      ...results
    };

  } catch (error) {
    // Update sync log with error
    await updateSyncLog(syncLogId, 'failed', null, error.message);
    throw error;
  }
}

async function createSyncLog(configId) {
  const { rows } = await query(
    `INSERT INTO sync_logs (config_id, start_time, status)
     VALUES ($1, NOW(), 'running')
     RETURNING id`,
    [configId]
  );
  return rows[0].id;
}

async function updateSyncLog(syncLogId, status, results = null, errorMessage = null) {
  const updates = {
    end_time: 'NOW()',
    status,
    message: errorMessage || null,
    items_processed: results?.created + results?.updated + results?.deleted || 0,
    items_succeeded: results?.created + results?.updated + results?.deleted || 0,
    items_failed: results?.errors?.length || 0
  };

  await query(
    `UPDATE sync_logs 
     SET end_time = NOW(), status = $2, message = $3, 
         items_processed = $4, items_succeeded = $5, items_failed = $6
     WHERE id = $1`,
    [syncLogId, status, updates.message, updates.items_processed, updates.items_succeeded, updates.items_failed]
  );
}

async function logSyncResult(configId, status, result = null, errorMessage = null) {
  const message = errorMessage || 
    (result ? `Created: ${result.created}, Updated: ${result.updated}, Deleted: ${result.deleted}` : null);
  
  await query(
    `INSERT INTO sync_logs (config_id, start_time, end_time, status, message, items_processed, items_succeeded, items_failed)
     VALUES ($1, NOW(), NOW(), $2, $3, $4, $5, $6)`,
    [
      configId,
      status,
      message,
      result?.totalProducts || 0,
      result ? (result.created + result.updated + result.deleted) : 0,
      result?.errors?.length || 0
    ]
  );
}
