const cron = require('node-cron');
const dbService = require('./dbService');
const productSyncService = require('./productSyncService');
const { dbLimiter } = require('../utils/rateLimiters');

/**
 * Service to handle scheduling of sync jobs based on configuration frequencies
 */
class SchedulerService {
  constructor() {
    this.jobs = {};
    this.initialized = false;
    this.runningSyncs = new Set(); // Track currently running syncs
  }

  /**
   * Initialize the scheduler service
   * This should be called when the application starts
   */
  async initialize() {
    if (this.initialized) {
      console.log('Scheduler already initialized');
      return;
    }

    console.log('Initializing scheduler service...');
    
    // Check for configs every hour
    cron.schedule('0 * * * *', async () => {
      console.log('Scheduler: Running hourly check for sync jobs');
      await this.checkAndScheduleSyncs();
    });
    
    // Retry failed syncs on startup
    await this.retryFailedSyncs();
    
    // Initial check when service starts
    await this.checkAndScheduleSyncs();
    
    this.initialized = true;
    console.log('Scheduler service initialized successfully');
  }

  /**
   * Check for configurations that need syncing based on their frequency
   */
  async checkAndScheduleSyncs() {
    try {
      // Get all configurations
      const configs = await dbLimiter(() => dbService.getProductSyncConfigs());
      
      if (!configs || configs.length === 0) {
        console.log('No sync configurations found');
        return;
      }
      
      console.log(`Found ${configs.length} sync configurations`);
      
      // Process each configuration
      for (const config of configs) {
        await this.checkConfigForSync(config);
      }
    } catch (error) {
      console.error('Error in scheduler check:', error);
    }
  }

  /**
   * Check for any syncs that failed and retry them
   */
  async retryFailedSyncs() {
    try {
      console.log('Checking for failed syncs to retry...');
      
      // Get all configurations
      const configs = await dbLimiter(() => dbService.getProductSyncConfigs());
      
      if (!configs || configs.length === 0) {
        console.log('No configurations found for retry check');
        return;
      }
      
      let retryCount = 0;
      
      // Check each config for failed syncs
      for (const config of configs) {
        const { id } = config;
        
        // Get last successful sync
        const lastSuccessful = await dbLimiter(() => dbService.getLastSuccessfulSync(id));
        
        // Get last failed sync
        const lastFailed = await dbLimiter(() => dbService.getLastFailedSync(id));
        
        // If there's no failed sync, continue to next config
        if (!lastFailed) {
          continue;
        }
        
        // If the last sync was successful and happened after the last failure, skip
        if (lastSuccessful && new Date(lastSuccessful.end_time) > new Date(lastFailed.end_time)) {
          continue;
        }
        
        console.log(`Found failed sync for config ${id}, last failure: ${new Date(lastFailed.end_time).toISOString()}`);
        console.log(`Scheduling retry for config ${id}`);
        
        // Schedule a retry (runSync will prevent duplicates)
        this.runSync(id);
        retryCount++;
      }
      
      console.log(`Scheduled ${retryCount} retry sync(s) for previously failed configurations`);
    } catch (error) {
      console.error('Error checking for failed syncs:', error);
    }
  }

  /**
   * Check a specific configuration for sync needs
   * @param {Object} config - The sync configuration to check
   */
  async checkConfigForSync(config) {
    try {
      const { id } = config;
      const syncFrequency = config.syncFrequency || config.sync_frequency;
      
      if (!syncFrequency) {
        console.log(`Config ${id} has no sync frequency set, skipping`);
        return;
      }
      
      // Convert frequency to hours (default to 24 if invalid)
      const frequencyHours = parseInt(syncFrequency, 10) || 24;
      
      // Get last sync time (successful only)
      const lastSync = await dbLimiter(() => dbService.getLastSuccessfulSync(id));
      
      if (!lastSync) {
        console.log(`Config ${id} has never been successfully synced, scheduling now`);
        this.runSync(id);
        return;
      }
      
      const lastSyncTime = new Date(lastSync.end_time);
      const hoursSinceLastSync = (Date.now() - lastSyncTime.getTime()) / (1000 * 60 * 60);
      
      console.log(`Config ${id} last successful sync: ${lastSyncTime.toISOString()}, ${hoursSinceLastSync.toFixed(2)} hours ago`);
      
      // If time since last sync exceeds frequency, sync now
      if (hoursSinceLastSync >= frequencyHours) {
        console.log(`Config ${id} needs sync (${hoursSinceLastSync.toFixed(2)} hours since last sync, frequency: ${frequencyHours} hours)`);
        this.runSync(id);
      } else {
        console.log(`Config ${id} does not need sync yet (${hoursSinceLastSync.toFixed(2)}/${frequencyHours} hours)`);
      }
    } catch (error) {
      console.error(`Error checking config ${config.id || 'unknown'} for sync:`, error);
    }
  }

  /**
   * Run a sync job for a specific configuration, preventing duplicates.
   * @param {string} configId - The ID of the configuration to sync
   */
  async runSync(configId) {
    // Check if a sync for this config is already running
    if (this.runningSyncs.has(configId)) {
      console.log(`Scheduler: Sync for config ${configId} is already in progress. Skipping.`);
      return;
    }
    
    try {
      console.log(`Scheduler: Starting sync for config ${configId}`);
      this.runningSyncs.add(configId); // Mark as running
      
      // Run sync in background
      productSyncService.syncProducts(configId)
        .then(result => {
          console.log(`Scheduler: Sync completed for config ${configId}`, result);
        })
        .catch(error => {
          console.error(`Scheduler: Sync failed for config ${configId}:`, error);
        })
        .finally(() => {
          this.runningSyncs.delete(configId); // Mark as finished
        });
    } catch (error) {
      console.error(`Error starting sync for config ${configId}:`, error);
      this.runningSyncs.delete(configId); // Ensure it's marked as finished even if start fails
    }
  }

  /**
   * Manually trigger a sync for a specific configuration
   * @param {string} configId - The ID of the configuration to sync
   */
  triggerSync(configId) {
    return this.runSync(configId);
  }
}

module.exports = new SchedulerService(); 