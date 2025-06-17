# Queue & Async Testing Guide

This guide will help you test the async and queuing functionality of the Shopify ERP Connector.

## 🚀 Testing Scenarios

### 1. **Multiple Worker Processes Testing**

Test how multiple workers handle the same queue:

```bash
# Terminal 1: Start main application
npm start

# Terminal 2: Start queue monitor (real-time dashboard)
npm run monitor

# Terminal 3: Start additional worker
WORKER_ID=worker-2 npm run test:multiple-workers

# Terminal 4: Start another worker
WORKER_ID=worker-3 npm run test:multiple-workers

# Terminal 5: Trigger queue load test
npm run test:queue-load
```

**What to observe:**
- Jobs distributed across different workers
- Worker instance identification in logs
- Queue stats updating in real-time
- No duplicate processing

### 2. **Queue Load Testing**

Test queue performance with multiple jobs:

```bash
# Start the queue monitor first
npm run monitor

# In another terminal, run load test
npm run test:queue-load
```

**What to observe:**
- 10 jobs enqueued rapidly
- Jobs processed by available workers
- Queue statistics (waiting, active, completed)
- Processing times and throughput

### 3. **Concurrency Testing**

Test concurrent API calls to trigger multiple syncs:

```bash
# Start main app and monitor
npm start
npm run monitor

# In another terminal, trigger multiple syncs simultaneously
curl -X POST http://localhost:3000/sync/1747061035558 &
curl -X POST http://localhost:3000/sync/1747061035558 &
curl -X POST http://localhost:3000/sync/1747061035558 &
```

**What to observe:**
- Multiple jobs queued instantly
- One job processed while others wait
- No race conditions or conflicts

### 4. **Failure and Retry Testing**

Test how the system handles failures:

```bash
# Stop your Shopify connection temporarily or modify credentials
# Then trigger syncs to see retry behavior

# Trigger sync with invalid config
curl -X POST http://localhost:3000/sync/invalid-id
```

**What to observe:**
- Failed jobs in the queue
- Retry attempts with exponential backoff
- Error logging and handling

### 5. **Scheduler Testing**

Test the automatic scheduling functionality:

```bash
# Update your config's sync_frequency to 1 minute for testing
# Watch the logs for automatic sync triggers

# Check sync logs via API
curl http://localhost:3000/logs
curl http://localhost:3000/configs/1747061035558/logs
```

## 📊 Queue Monitor Dashboard

The real-time monitor shows:

- **Queue Status**: Active, waiting, delayed, completed, failed jobs
- **Active Jobs**: Currently processing jobs with elapsed time
- **Recent Jobs**: Last completed and failed jobs with results
- **System Stats**: Uptime, total processed, total failed

```bash
npm run monitor
```

## 🔧 Testing Configuration

### Environment Variables for Testing

```bash
# Use a test Redis instance
REDIS_URL=redis://localhost:6379/1

# Enable debug logging
NODE_ENV=development

# Worker identification
WORKER_ID=test-worker-1
```

### BullMQ Job Options

The load test uses these job options:

```javascript
{
  delay: i * 1000,        // Stagger jobs
  attempts: 3,            // Retry failed jobs
  backoff: {
    type: 'exponential',
    delay: 2000
  }
}
```

## 🧪 Advanced Testing Scenarios

### High Load Testing

Modify `test-queue-load.js` to test with more jobs:

```javascript
const numJobs = 50; // Increase from 10
```

### Multiple Configuration Testing

Create additional sync configurations and test with different config IDs:

```bash
# Add more configs via API
curl -X POST http://localhost:3000/configs \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Config 2", ...}'
```

### Memory and Performance Testing

Monitor system resources while running tests:

```bash
# Monitor memory usage
watch -n 1 'ps aux | grep node'

# Monitor Redis
redis-cli monitor
```

## 📈 What Success Looks Like

### Multiple Workers
- ✅ Jobs distributed evenly
- ✅ No duplicate processing
- ✅ Worker identification in logs
- ✅ Graceful shutdown

### Queue Load
- ✅ All jobs processed successfully
- ✅ Reasonable processing times
- ✅ Queue stats accurate
- ✅ No memory leaks

### Concurrency
- ✅ Jobs queued instantly
- ✅ One active job at a time per config
- ✅ Proper error handling
- ✅ Results properly tracked

### System Health
- ✅ Redis connection stable
- ✅ Database connections managed
- ✅ Shopify API rate limits respected
- ✅ Logs comprehensive and readable

## 🚨 Common Issues

### Redis Connection
```
BullMQ: DEPRECATION WARNING! Your redis options maxRetriesPerRequest must be null
```
**Solution**: Update Redis configuration in `src/queue.js`

### Worker Conflicts
**Symptom**: Same job processed multiple times
**Solution**: Ensure proper job completion and error handling

### Memory Issues
**Symptom**: Node.js process memory growth
**Solution**: Monitor job cleanup and Redis memory usage

## 💡 Tips

1. **Start with monitoring**: Always run the monitor first to see what's happening
2. **Use different terminals**: Run each test in separate terminals for clarity
3. **Check Redis**: Use `redis-cli` to inspect queue state directly
4. **Monitor logs**: Watch both application logs and queue monitor
5. **Test incrementally**: Start with small loads and increase gradually

Happy testing! 🎉 