import { createWorker } from './src/queue.js';
import { runSync } from './src/productSync.js';
import chalk from 'chalk';

const workerInstance = process.env.WORKER_ID || Math.random().toString(36).substr(2, 9);

console.log(chalk.magenta(`🔧 Starting worker instance: ${workerInstance}`));

const worker = createWorker(async job => {
  const { configId } = job.data;
  const startTime = Date.now();
  
  console.log(chalk.blue(`[${workerInstance}] 🚀 Processing sync for config: ${configId}`));
  
  try {
    // Add some artificial delay to see concurrency in action
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const result = await runSync(configId);
    const processingTime = Date.now() - startTime;
    
    console.log(chalk.green(`[${workerInstance}] ✅ Completed sync for ${configId} in ${processingTime}ms`));
    console.log(chalk.cyan(`[${workerInstance}] 📊 Results: Created: ${result.created || 0}, Updated: ${result.updated || 0}, Deleted: ${result.deleted || 0}`));
    
    return result;
  } catch (error) {
    console.error(chalk.red(`[${workerInstance}] ❌ Failed sync for ${configId}:`), error.message);
    throw error;
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log(chalk.yellow(`[${workerInstance}] 🛑 Shutting down worker...`));
  await worker.close();
  process.exit(0);
});

console.log(chalk.green(`[${workerInstance}] ✅ Worker ready and listening for jobs`)); 