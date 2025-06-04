const db = require('../config/databaseClient');
const logger = require('../utils/logger');

class DatabaseService {
  async testConnection() {
    try {
      const client = await db.getClient();
      logger.info('Successfully fetched client from pool.');
      const res = await client.query('SELECT NOW()');
      logger.info('Database time:', res.rows[0].now);
      client.release();
      return true;
    } catch (error) {
      logger.error('Database connection test failed:', error);
      return false;
    }
  }

  // Get FTP configuration from database
  async getFtpConfig() {
    try {
      const { rows } = await db.query('SELECT host, username, password, port, timeout FROM ftp_config LIMIT 1');
      if (rows.length === 0) {
        throw new Error('FTP configuration not found in database');
      }
      return {
        host: rows[0].host,
        user: rows[0].username,
        password: rows[0].password,
        port: rows[0].port || 21,
        timeout: rows[0].timeout,
      };
    } catch (error) {
        logger.error('Error fetching FTP config from database:', error);
      throw error;
    }
  }

  /**
   * Get product sync configurations from database
   * @param {string} [id] - Optional ID to get a specific configuration
   * @returns {Promise<Array>} Array of product sync configurations
   */
  async getProductSyncConfigs(id = null) {
    try {
      let query = 'SELECT * FROM product_sync_configs';
      const params = [];

      if (id) {
        query += ' WHERE id = $1';
        params.push(id);
      }

      const { rows } = await db.query(query, params);
      
      // Parse JSON fields
      return rows.map(row => ({
        ...row,
        credentials: typeof row.credentials === 'string' ? JSON.parse(row.credentials) : row.credentials,
        mapping: typeof row.mapping === 'string' ? JSON.parse(row.mapping) : row.mapping,
        metafieldMappings: typeof row.metafieldMappings === 'string' ? JSON.parse(row.metafieldMappings) : row.metafieldMappings,
      }));
    } catch (error) {
        logger.error('Error fetching product sync configs:', error);
      throw error;
    }
  }

  /**
   * Log a sync operation result to the database
   * @param {Object} syncData - Data about the sync operation
   * @returns {Promise<Object>} The inserted log entry
   */
  async logSyncOperation(syncData) {
    try {
      const { configId, startTime, endTime, status, message, itemsProcessed, itemsSucceeded, itemsFailed } = syncData;
      
      const query = `
        INSERT INTO sync_logs 
        (config_id, start_time, end_time, status, message, items_processed, items_succeeded, items_failed)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      
      const params = [
        configId,
        startTime || new Date(),
        endTime || null,
        status || 'started',
        message || '',
        itemsProcessed || 0,
        itemsSucceeded || 0,
        itemsFailed || 0
      ];
      
      const { rows } = await db.query(query, params);
      return rows[0];
    } catch (error) {
        logger.error('Error logging sync operation:', error);
      throw error;
    }
  }

  /**
   * Update an existing sync log entry
   * @param {number} logId - ID of the log entry to update
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} The updated log entry
   */
  async updateSyncLog(logId, updateData) {
    try {
      const { endTime, status, message, itemsProcessed, itemsSucceeded, itemsFailed } = updateData;
      
      let query = 'UPDATE sync_logs SET ';
      const params = [];
      const setClauses = [];
      let paramIndex = 1;
      
      if (endTime) {
        setClauses.push(`end_time = $${paramIndex++}`);
        params.push(endTime);
      }
      
      if (status) {
        setClauses.push(`status = $${paramIndex++}`);
        params.push(status);
      }
      
      if (message) {
        setClauses.push(`message = $${paramIndex++}`);
        params.push(message);
      }
      
      if (itemsProcessed !== undefined) {
        setClauses.push(`items_processed = $${paramIndex++}`);
        params.push(itemsProcessed);
      }
      
      if (itemsSucceeded !== undefined) {
        setClauses.push(`items_succeeded = $${paramIndex++}`);
        params.push(itemsSucceeded);
      }
      
      if (itemsFailed !== undefined) {
        setClauses.push(`items_failed = $${paramIndex++}`);
        params.push(itemsFailed);
      }
      
      if (setClauses.length === 0) {
        return null; // Nothing to update
      }
      
      query += setClauses.join(', ');
      query += ` WHERE id = $${paramIndex} RETURNING *`;
      params.push(logId);
      
      const { rows } = await db.query(query, params);
      return rows[0];
    } catch (error) {
        logger.error('Error updating sync log:', error);
      throw error;
    }
  }

  // Example query function
  async getProducts() {
    // const { rows } = await db.query('SELECT * FROM products_table_placeholder');
    // return rows;
    logger.info('Fetching products from DB placeholder');
    return Promise.resolve([]);
  }

  /**
   * Get the last successful sync for a configuration
   * @param {string} configId - The ID of the configuration
   * @returns {Promise<Object|null>} - The last successful sync log or null
   */
  async getLastSuccessfulSync(configId) {
    try {
      const query = `
        SELECT * FROM sync_logs 
        WHERE config_id = $1 AND status = 'completed' 
        ORDER BY end_time DESC LIMIT 1
      `;
      const { rows } = await db.query(query, [configId]);
      return rows[0] || null;
    } catch (error) {
        logger.error('Error fetching last successful sync:', error);
      return null;
    }
  }

  /**
   * Create a new product sync configuration
   * @param {Object} configData - The configuration data
   * @returns {Promise<Object>} The created configuration
   */
  async createProductSyncConfig(configData) {
    try {
      const { 
        id,
        name, 
        connectionType, 
        credentials, 
        mapping, 
        metafieldMappings, 
        syncFrequency 
      } = configData;
      
      const query = `
        INSERT INTO product_sync_configs 
        (id, name, connection_type, credentials, mapping, metafield_mappings, sync_frequency)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      
      const params = [
        id || Date.now().toString(), // Use provided ID or generate timestamp-based ID
        name,
        connectionType,
        JSON.stringify(credentials),
        JSON.stringify(mapping),
        JSON.stringify(metafieldMappings),
        syncFrequency || '24'
      ];
      
      const { rows } = await db.query(query, params);
      
      // Parse JSON fields for the response
      return {
        ...rows[0],
        credentials: typeof rows[0].credentials === 'string' ? JSON.parse(rows[0].credentials) : rows[0].credentials,
        mapping: typeof rows[0].mapping === 'string' ? JSON.parse(rows[0].mapping) : rows[0].mapping,
        metafieldMappings: typeof rows[0].metafieldMappings === 'string' ? JSON.parse(rows[0].metafieldMappings) : rows[0].metafieldMappings,
      };
    } catch (error) {
        logger.error('Error creating product sync config:', error);
      throw error;
    }
  }

  /**
   * Update an existing product sync configuration
   * @param {string} id - The ID of the configuration to update
   * @param {Object} configData - The updated configuration data
   * @returns {Promise<Object|null>} The updated configuration or null if not found
   */
  async updateProductSyncConfig(id, configData) {
    try {
      // Check if config exists
      const existing = await this.getProductSyncConfigs(id);
      if (!existing || existing.length === 0) {
        return null;
      }
      
      // Build update query
      const fields = [];
      const params = [];
      let paramIndex = 1;
      
      if (configData.name) {
        fields.push(`name = $${paramIndex++}`);
        params.push(configData.name);
      }
      
      if (configData.connectionType) {
        fields.push(`connection_type = $${paramIndex++}`);
        params.push(configData.connectionType);
      }
      
      if (configData.credentials) {
        fields.push(`credentials = $${paramIndex++}`);
        params.push(JSON.stringify(configData.credentials));
      }
      
      if (configData.mapping) {
        fields.push(`mapping = $${paramIndex++}`);
        params.push(JSON.stringify(configData.mapping));
      }
      
      if (configData.metafieldMappings) {
        fields.push(`metafield_mappings = $${paramIndex++}`);
        params.push(JSON.stringify(configData.metafieldMappings));
      }
      
      if (configData.syncFrequency) {
        fields.push(`sync_frequency = $${paramIndex++}`);
        params.push(configData.syncFrequency);
      }
      
      // Always update the updated_at timestamp
      fields.push(`updated_at = $${paramIndex++}`);
      params.push(new Date());
      
      if (fields.length === 0) {
        return existing[0]; // Nothing to update
      }
      
      // Add ID parameter
      params.push(id);
      
      const query = `
        UPDATE product_sync_configs
        SET ${fields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;
      
      const { rows } = await db.query(query, params);
      
      if (rows.length === 0) {
        return null;
      }
      
      // Parse JSON fields for the response
      return {
        ...rows[0],
        credentials: typeof rows[0].credentials === 'string' ? JSON.parse(rows[0].credentials) : rows[0].credentials,
        mapping: typeof rows[0].mapping === 'string' ? JSON.parse(rows[0].mapping) : rows[0].mapping,
        metafieldMappings: typeof rows[0].metafieldMappings === 'string' ? JSON.parse(rows[0].metafieldMappings) : rows[0].metafieldMappings,
      };
    } catch (error) {
        logger.error('Error updating product sync config:', error);
      throw error;
    }
  }

  /**
   * Delete a product sync configuration
   * @param {string} id - The ID of the configuration to delete
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteProductSyncConfig(id) {
    try {
      const query = 'DELETE FROM product_sync_configs WHERE id = $1 RETURNING id';
      const { rows } = await db.query(query, [id]);
      
      return rows.length > 0;
    } catch (error) {
        logger.error('Error deleting product sync config:', error);
      throw error;
    }
  }

  /**
   * Get sync logs for a specific configuration
   * @param {string} configId - The ID of the configuration
   * @param {number} [limit=10] - Maximum number of logs to return
   * @param {number} [offset=0] - Number of logs to skip
   * @returns {Promise<Array>} Array of sync logs
   */
  async getSyncLogs(configId, limit = 10, offset = 0) {
    try {
      const query = `
        SELECT * FROM sync_logs 
        WHERE config_id = $1 
        ORDER BY start_time DESC 
        LIMIT $2 OFFSET $3
      `;
      
      const { rows } = await db.query(query, [configId, limit, offset]);
      return rows;
    } catch (error) {
        logger.error('Error fetching sync logs:', error);
      throw error;
    }
  }

  /**
   * Get the last failed sync for a configuration
   * @param {string} configId - The ID of the configuration
   * @returns {Promise<Object|null>} - The last failed sync log or null
   */
  async getLastFailedSync(configId) {
    try {
      const query = `
        SELECT * FROM sync_logs 
        WHERE config_id = $1 AND status = 'failed' 
        ORDER BY end_time DESC LIMIT 1
      `;
      const { rows } = await db.query(query, [configId]);
      return rows[0] || null;
    } catch (error) {
        logger.error('Error fetching last failed sync:', error);
      return null;
    }
  }

  /**
   * Check if a sync for a configuration has failed within the last 24 hours
   * @param {string} configId - The ID of the configuration
   * @returns {Promise<boolean>} - True if a sync has failed in the last 24 hours
   */
  async hasRecentFailedSync(configId) {
    try {
      const lastFailedSync = await this.getLastFailedSync(configId);
      
      if (!lastFailedSync) {
        return false;
      }
      
      const failedTime = new Date(lastFailedSync.end_time);
      const hoursSinceFailure = (Date.now() - failedTime.getTime()) / (1000 * 60 * 60);
      
      // Return true if the failure was within the last 24 hours
      return hoursSinceFailure <= 24;
    } catch (error) {
        logger.error('Error checking for recent failed sync:', error);
      return false;
    }
  }
}

module.exports = new DatabaseService(); 