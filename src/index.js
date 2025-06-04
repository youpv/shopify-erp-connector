require('dotenv').config();
const app = require('./app');
const config = require('./config');
const dbService = require('./services/dbService');
const schedulerService = require('./services/schedulerService');
const logger = require('./utils/logger');

// Set the port
const PORT = config.port || 3000;

// Initialize server
const server = app.listen(PORT, async () => {
  logger.info(`Shopify ERP Connector API running on port ${PORT}`);
  
  // Test database connection on startup
  try {
    const connected = await dbService.testConnection();
    if (connected) {
      logger.info('Database connection successful!');
      
      // Initialize the scheduler service after successful DB connection
      await schedulerService.initialize();
    } else {
      logger.error('Database connection failed!');
    }
  } catch (error) {
    logger.error('Database connection error:', error);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('UNHANDLED REJECTION:', err);
  // Close server & exit process
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION:', err);
  // Close server & exit process
  server.close(() => process.exit(1));
});

module.exports = server; 