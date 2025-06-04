import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { config } from './config.js';

const connection = new IORedis(config.redisUrl);

export const syncQueue = new Queue('product-sync', { connection });

export function createWorker(processor) {
  return new Worker('product-sync', processor, { connection });
}
