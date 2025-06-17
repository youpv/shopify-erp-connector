import { syncQueue } from './src/queue.js';
import chalk from 'chalk';

async function testQueueLoad() {
  console.log(chalk.blue('🚀 Starting queue load test...'));
  
  const configId = '1747061035558'; // Your existing config ID
  const numJobs = 10;
  
  console.log(chalk.yellow(`📦 Enqueueing ${numJobs} sync jobs for config: ${configId}`));
  
  const startTime = Date.now();
  const jobs = [];
  
  // Enqueue multiple jobs
  for (let i = 0; i < numJobs; i++) {
    const job = await syncQueue.add('sync', { 
      configId,
      testId: `load-test-${i + 1}`,
      enqueuedAt: new Date().toISOString()
    }, {
      // Add job options for testing
      delay: i * 1000, // Stagger jobs by 1 second
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });
    
    jobs.push(job);
    console.log(chalk.green(`✅ Enqueued job ${i + 1}/${numJobs} - ID: ${job.id}`));
  }
  
  const enqueueTime = Date.now() - startTime;
  console.log(chalk.cyan(`⚡ All jobs enqueued in ${enqueueTime}ms`));
  
  // Monitor queue stats
  console.log(chalk.blue('📊 Monitoring queue stats...'));
  
  const monitorInterval = setInterval(async () => {
    try {
      const waiting = await syncQueue.getWaiting();
      const active = await syncQueue.getActive();
      const completed = await syncQueue.getCompleted();
      const failed = await syncQueue.getFailed();
      
      console.log(chalk.gray(`📈 Queue Status - Waiting: ${waiting.length}, Active: ${active.length}, Completed: ${completed.length}, Failed: ${failed.length}`));
      
      // Stop monitoring when all jobs are done
      if (waiting.length === 0 && active.length === 0) {
        clearInterval(monitorInterval);
        console.log(chalk.green('🏁 All jobs processed!'));
        
        // Get final stats
        const finalCompleted = await syncQueue.getCompleted();
        const finalFailed = await syncQueue.getFailed();
        
        console.log(chalk.cyan('📊 Final Results:'));
        console.log(chalk.green(`  ✅ Completed: ${finalCompleted.length}`));
        console.log(chalk.red(`  ❌ Failed: ${finalFailed.length}`));
        
        const totalTime = Date.now() - startTime;
        console.log(chalk.blue(`⏱️  Total processing time: ${totalTime}ms`));
        
        process.exit(0);
      }
    } catch (error) {
      console.error(chalk.red('Error monitoring queue:'), error);
    }
  }, 2000);
  
  // Timeout after 5 minutes
  setTimeout(() => {
    clearInterval(monitorInterval);
    console.log(chalk.yellow('⏰ Test timeout reached'));
    process.exit(1);
  }, 300000);
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('🛑 Test interrupted'));
  process.exit(0);
});

testQueueLoad().catch(error => {
  console.error(chalk.red('Test failed:'), error);
  process.exit(1);
}); 