const productSyncService = require('../services/productSyncService');
const dbService = require('../services/dbService');

class ProductController {
  /**
   * Initiate a product sync process
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async syncProducts(req, res, next) {
    try {
      const { configId } = req.body;
      
      if (!configId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required parameter: configId' 
        });
      }
      
      // Start the sync process (it will run asynchronously)
      const syncPromise = productSyncService.syncProducts(configId);
      
      // Immediately return a response that the process has started
      res.status(202).json({ 
        success: true, 
        message: 'Product sync process initiated',
        configId
      });
      
      // Handle the sync process in the background
        syncPromise.catch(error => {
          const logger = require('../utils/logger');
          logger.error('Background sync process error:', error);
        });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get all product sync configurations
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getConfigurations(req, res, next) {
    try {
      const configs = await dbService.getProductSyncConfigs();
      
      // Sanitize sensitive data for response
      const sanitizedConfigs = configs.map(config => {
        const { credentials, ...safeConfig } = config;
        
        // Include only non-sensitive parts of credentials
        const safeCredentials = { ...credentials };
        if (safeCredentials.ftpPassword) {
          safeCredentials.ftpPassword = '********';
        }
        
        return {
          ...safeConfig,
          credentials: safeCredentials
        };
      });
      
      res.status(200).json({
        success: true,
        count: sanitizedConfigs.length,
        data: sanitizedConfigs
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get a specific product sync configuration
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getConfiguration(req, res, next) {
    try {
      const { id } = req.params;
      
      const configs = await dbService.getProductSyncConfigs(id);
      
      if (!configs || configs.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No configuration found with ID: ${id}`
        });
      }
      
      // Sanitize sensitive data
      const config = configs[0];
      const { credentials, ...safeConfig } = config;
      
      // Include only non-sensitive parts of credentials
      const safeCredentials = { ...credentials };
      if (safeCredentials.ftpPassword) {
        safeCredentials.ftpPassword = '********';
      }
      
      res.status(200).json({
        success: true,
        data: {
          ...safeConfig,
          credentials: safeCredentials
        }
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get sync logs for a specific configuration
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getSyncLogs(req, res, next) {
    try {
      const { id } = req.params;
      const { limit = 10, offset = 0 } = req.query;
      
      const logs = await dbService.getSyncLogs(id, parseInt(limit, 10), parseInt(offset, 10));
      
      res.status(200).json({
        success: true,
        count: logs.length,
        data: logs
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a new product sync configuration
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async createConfiguration(req, res, next) {
    try {
      const configData = req.body;
      
      // Validate the required fields
      if (!configData.name || !configData.connectionType || !configData.credentials) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: name, connectionType, credentials'
        });
      }
      
      // Create the configuration
      const newConfig = await dbService.createProductSyncConfig(configData);
      
      // Automatically trigger a sync process with the new configuration
      const syncPromise = productSyncService.syncProducts(newConfig.id, true, 100, true);
      
      // Handle the sync process in the background
      syncPromise.catch(error => {
        const logger = require('../utils/logger');
        logger.error(`Background sync process error for new config ${newConfig.id}:`, error);
      });
      
      res.status(201).json({
        success: true,
        message: 'Configuration created successfully and sync process started',
        data: {
          ...newConfig,
          syncStarted: true
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update an existing product sync configuration
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateConfiguration(req, res, next) {
    try {
      const { id } = req.params;
      const configData = req.body;
      
      // Update the configuration
      const updated = await dbService.updateProductSyncConfig(id, configData);
      
      if (!updated) {
        return res.status(404).json({
          success: false,
          message: `Configuration not found with ID: ${id}`
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Configuration updated successfully',
        data: updated
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a product sync configuration
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deleteConfiguration(req, res, next) {
    try {
      const { id } = req.params;
      
      const deleted = await dbService.deleteProductSyncConfig(id);
      
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: `Configuration not found with ID: ${id}`
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Configuration deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProductController(); 