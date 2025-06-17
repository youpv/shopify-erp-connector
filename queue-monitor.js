import { syncQueue } from './src/queue.js';
import chalk from 'chalk';

class QueueMonitor {
  constructor() {
    this.isRunning = false;
    this.stats = {
      totalProcessed: 0,
      totalFailed: 0,
      startTime: Date.now()
    };
  }

  async start() {
    this.isRunning = true;
    console.log(chalk.blue('📊 Starting Queue Monitor Dashboard'));
    console.log(chalk.gray('Press Ctrl+C to stop monitoring\n'));

    // Clear screen and show header
    this.clearScreen();
    this.showHeader();

    // Start monitoring loop
    this.monitorLoop();
  }

  clearScreen() {
    process.stdout.write('\x1Bc');
  }

  showHeader() {
    const uptime = this.getUptime();
    console.log(chalk.bold.blue('🚀 SHOPIFY ERP CONNECTOR - QUEUE MONITOR'));
    console.log(chalk.gray('='.repeat(50)));
    console.log(chalk.white(`⏱️  Uptime: ${uptime}`));
    console.log(chalk.white(`📈 Total Processed: ${this.stats.totalProcessed}`));
    console.log(chalk.white(`❌ Total Failed: ${this.stats.totalFailed}`));
    console.log(chalk.gray('-'.repeat(50)));
  }

  getUptime() {
    const uptimeMs = Date.now() - this.stats.startTime;
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  async monitorLoop() {
    while (this.isRunning) {
      try {
        await this.updateStats();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Refresh display every second
        this.clearScreen();
        this.showHeader();
        await this.showQueueStats();
        await this.showRecentJobs();
        
      } catch (error) {
        console.error(chalk.red('Monitor error:'), error);
      }
    }
  }

  async updateStats() {
    const completed = await syncQueue.getCompleted();
    const failed = await syncQueue.getFailed();
    
    this.stats.totalProcessed = completed.length;
    this.stats.totalFailed = failed.length;
  }

  async showQueueStats() {
    try {
      const waiting = await syncQueue.getWaiting();
      const active = await syncQueue.getActive();
      const completed = await syncQueue.getCompleted(0, 5); // Last 5
      const failed = await syncQueue.getFailed(0, 5); // Last 5
      const delayed = await syncQueue.getDelayed();

      console.log(chalk.bold.white('📊 QUEUE STATUS:'));
      console.log(chalk.yellow(`  ⏳ Waiting: ${waiting.length} jobs`));
      console.log(chalk.blue(`  🔄 Active: ${active.length} jobs`));
      console.log(chalk.red(`  ⏰ Delayed: ${delayed.length} jobs`));
      console.log(chalk.green(`  ✅ Recently Completed: ${completed.length}`));
      console.log(chalk.red(`  ❌ Recently Failed: ${failed.length}`));
      
      // Show active jobs details
      if (active.length > 0) {
        console.log(chalk.bold.blue('\n🔄 ACTIVE JOBS:'));
        for (const job of active) {
          const startTime = job.processedOn ? new Date(job.processedOn) : new Date();
          const elapsed = Date.now() - startTime.getTime();
          console.log(chalk.white(`  📦 Job ${job.id}: Config ${job.data.configId} (${Math.floor(elapsed/1000)}s)`));
        }
      }

      // Show waiting jobs
      if (waiting.length > 0) {
        console.log(chalk.bold.yellow('\n⏳ WAITING JOBS:'));
        for (const job of waiting.slice(0, 5)) {
          const testId = job.data.testId || 'manual';
          console.log(chalk.white(`  📦 Job ${job.id}: Config ${job.data.configId} (${testId})`));
        }
        if (waiting.length > 5) {
          console.log(chalk.gray(`  ... and ${waiting.length - 5} more`));
        }
      }

    } catch (error) {
      console.error(chalk.red('Error fetching queue stats:'), error.message);
    }
  }

  async showRecentJobs() {
    try {
      console.log(chalk.bold.green('\n✅ RECENT COMPLETED JOBS:'));
      const completed = await syncQueue.getCompleted(0, 3);
      
      if (completed.length === 0) {
        console.log(chalk.gray('  No completed jobs yet'));
      } else {
        for (const job of completed) {
          const completedTime = job.finishedOn ? new Date(job.finishedOn).toLocaleTimeString() : 'Unknown';
          const duration = job.finishedOn && job.processedOn ? 
            `${Math.floor((job.finishedOn - job.processedOn) / 1000)}s` : 'Unknown';
          
          console.log(chalk.white(`  📦 Job ${job.id}: Config ${job.data.configId} - ${completedTime} (${duration})`));
          
          if (job.returnvalue) {
            const result = job.returnvalue;
            console.log(chalk.gray(`     📊 Results: ✨${result.created || 0} 🔄${result.updated || 0} 🗑️${result.deleted || 0}`));
          }
        }
      }

      console.log(chalk.bold.red('\n❌ RECENT FAILED JOBS:'));
      const failed = await syncQueue.getFailed(0, 3);
      
      if (failed.length === 0) {
        console.log(chalk.gray('  No failed jobs'));
      } else {
        for (const job of failed) {
          const failedTime = job.failedReason ? new Date(job.failedReason).toLocaleTimeString() : 'Unknown';
          console.log(chalk.white(`  📦 Job ${job.id}: Config ${job.data.configId} - ${failedTime}`));
          console.log(chalk.red(`     ❌ Error: ${job.failedReason || 'Unknown error'}`));
        }
      }

    } catch (error) {
      console.error(chalk.red('Error fetching recent jobs:'), error.message);
    }
  }

  stop() {
    this.isRunning = false;
    console.log(chalk.yellow('\n🛑 Queue monitor stopped'));
  }
}

// Create and start monitor
const monitor = new QueueMonitor();

// Graceful shutdown
process.on('SIGINT', () => {
  monitor.stop();
  process.exit(0);
});

monitor.start(); 