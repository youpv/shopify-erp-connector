import cron from 'node-cron';
import { listConfigs } from './integrationRepo.js';
import { enqueueSync } from './productSync.js';
import chalk from 'chalk';

const activeJobs = new Map();

export async function startScheduler() {
  console.log(chalk.blue('🕐 Starting scheduler service...'));
  
  // Check for scheduled syncs every minute
  cron.schedule('* * * * *', async () => {
    try {
      await checkAndScheduleSyncs();
    } catch (error) {
      console.error(chalk.red('Scheduler error:'), error);
    }
  });

  // Initial check
  await checkAndScheduleSyncs();
}

async function checkAndScheduleSyncs() {
  const configs = await listConfigs();
  
  for (const config of configs) {
    const jobKey = `sync-${config.id}`;
    
    // Parse sync frequency (in hours)
    const frequencyHours = parseInt(config.sync_frequency) || 24;
    const cronExpression = getCronExpression(frequencyHours);
    
    // Check if job already exists
    if (activeJobs.has(jobKey)) {
      const existingJob = activeJobs.get(jobKey);
      // Update schedule if frequency changed
      if (existingJob.frequency !== frequencyHours) {
        existingJob.task.stop();
        activeJobs.delete(jobKey);
      } else {
        continue; // Job already scheduled with same frequency
      }
    }
    
    // Schedule new job
    const task = cron.schedule(cronExpression, async () => {
      console.log(chalk.green(`⚡ Triggering scheduled sync for config: ${config.name} (${config.id})`));
      try {
        await enqueueSync(config.id);
      } catch (error) {
        console.error(chalk.red(`Failed to enqueue sync for ${config.id}:`), error);
      }
    });
    
    activeJobs.set(jobKey, { task, frequency: frequencyHours });
    console.log(chalk.blue(`📅 Scheduled sync for ${config.name} every ${frequencyHours} hours`));
  }
  
  // Clean up removed configs
  for (const [jobKey, job] of activeJobs) {
    const configId = jobKey.replace('sync-', '');
    if (!configs.find(c => c.id === configId)) {
      job.task.stop();
      activeJobs.delete(jobKey);
      console.log(chalk.yellow(`🗑️  Removed schedule for deleted config: ${configId}`));
    }
  }
}

function getCronExpression(hours) {
  if (hours === 1) return '0 * * * *'; // Every hour
  if (hours === 24) return '0 0 * * *'; // Daily at midnight
  if (hours === 12) return '0 0,12 * * *'; // Twice daily
  if (hours === 6) return '0 0,6,12,18 * * *'; // Four times daily
  if (hours === 3) return '0 */3 * * *'; // Every 3 hours
  
  // For other values, run at specific hour intervals
  return `0 */${hours} * * *`;
}

export function stopScheduler() {
  for (const [jobKey, job] of activeJobs) {
    job.task.stop();
  }
  activeJobs.clear();
  console.log(chalk.yellow('🛑 Scheduler stopped'));
} 