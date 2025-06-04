const { GraphQLClient } = require('graphql-request');
const appConfig = require('../config');
const FormData = require('form-data');
const fetch = require('node-fetch');
const logger = require('../utils/logger');
const { STAGED_UPLOADS_CREATE, BULK_OPERATION_RUN_QUERY, BULK_OPERATION_RUN_MUTATION } = require('../graphql/mutations/productMutations');
const { GET_BULK_OPERATION_STATUS } = require('../graphql/queries/productQueries');

class ShopifyService {
  constructor() {
    // Ensure the hostname doesn't include 'https://'
    const hostname = appConfig.shopify.hostName.replace(/^https?:\/\//, '');
    
    this.endpoint = `https://${hostname}/admin/api/${appConfig.shopify.apiVersion}/graphql.json`;
    // Use the admin access token for authentication
    this.accessToken = appConfig.shopify.adminApiAccessToken || appConfig.shopify.apiSecret;
    
    logger.info(`Initializing Shopify GraphQL client for ${this.endpoint}`);
    
    this.client = new GraphQLClient(this.endpoint, {
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Execute a GraphQL query or mutation against the Shopify Admin API.
   * @param {string} query - GraphQL query string.
   * @param {object} [variables] - Variables for the query.
   * @returns {Promise<object>} - Parsed response.
   */
  async executeGraphQL(query, variables = {}) {
    try {
      // Log more details for product queries
      const isProductQuery = query.includes('products(') || 
                            (variables.query && typeof variables.query === 'string' && 
                             variables.query.includes('variants.sku'));
      
      if (isProductQuery) {
        logger.info(`[Shopify API] Executing product query with variables:`,
          JSON.stringify(variables, null, 2).substring(0, 500) + 
          (JSON.stringify(variables).length > 500 ? '...' : '')
        );
      }
      
      const startTime = Date.now();
      const response = await this.client.request(query, variables);
      const duration = Date.now() - startTime;
      
      if (isProductQuery) {
        // For product queries, log more details about the response
        const productCount = response.products?.edges?.length || 0;
        logger.info(`[Shopify API] Product query completed in ${duration}ms, found ${productCount} products`);
        
        // Log first few products and their variants if this was an SKU lookup
        if (variables.query && typeof variables.query === 'string' && variables.query.includes('variants.sku')) {
          if (response.products?.edges) {
            response.products.edges.slice(0, 3).forEach(edge => {
              const product = edge.node;
              logger.info(`[Shopify API] Product: ${product.title} (${product.id})`);
              
              if (product.variants?.edges) {
                product.variants.edges.slice(0, 5).forEach(variantEdge => {
                  const variant = variantEdge.node;
                logger.info(`[Shopify API]   - Variant SKU: ${variant.sku}`);
                });
                
                if (product.variants.edges.length > 5) {
                  logger.info(`[Shopify API]   - ... and ${product.variants.edges.length - 5} more variants`);
                }
              }
            });
            
            if (response.products.edges.length > 3) {
            logger.info(`[Shopify API] ... and ${response.products.edges.length - 3} more products`);
            }
          }
        }
      }
      
      return { data: response };
    } catch (error) {
      // Provide more detailed error information
      if (error.response) {
        const statusCode = error.response.status;
        logger.error(`Shopify API Error (${statusCode}):`, {
          statusCode,
          statusText: error.response.statusText,
          method: 'POST',
          url: this.endpoint,
          // Only log first part of token for security
          token: this.accessToken ? `${this.accessToken.substring(0, 5)}...` : 'undefined',
        });
        
        if (statusCode === 401) {
          logger.error('Authentication error: Please check your Shopify API credentials in .env file');
        }
      } else {
        logger.error('GraphQL Execution Error:', error.message);
      }
      
      if (error.response && error.response.errors) {
        throw new Error(JSON.stringify(error.response.errors));
      }
      
      throw error;
    }
  }

  /**
   * Create a staged upload for bulk operation files
   * @param {string} filename - The name of the file to stage
   * @param {number} fileSize - The size of the file in bytes
   * @returns {Promise<object>} - The staged upload details
   */
  async stageUpload(filename, fileSize) {
    logger.info(`[Shopify API] Staging upload for file: ${filename}, size: ${fileSize} bytes`);
    
    const input = [{
      resource: 'BULK_MUTATION_VARIABLES',
      filename,
      mimeType: 'application/jsonl',
      fileSize: fileSize.toString(), // Convert fileSize to string as required by Shopify
      httpMethod: 'POST'
    }];

    const result = await this.executeGraphQL(STAGED_UPLOADS_CREATE, { input });
    
    
    if (result.data?.stagedUploadsCreate?.userErrors?.length > 0) {
      throw new Error(`Staged upload error: ${JSON.stringify(result.data.stagedUploadsCreate.userErrors)}`);
    }

    if (!result.data?.stagedUploadsCreate?.stagedTargets || result.data.stagedUploadsCreate.stagedTargets.length === 0) {
      throw new Error('No staged targets returned from Shopify');
    }

    return result.data.stagedUploadsCreate.stagedTargets[0];
  }

  /**
   * Upload file to the staged target
   * @param {object} stagedTarget - The staged target details from stageUpload
   * @param {string|Buffer} fileContent - The content to upload
   * @returns {Promise<string>} - The resourceUrl for bulk operations
   */
  async uploadToStagedTarget(stagedTarget, fileContent) {
    const { url, parameters } = stagedTarget;
    
    // Create form data for the upload
    const formData = new FormData();
    
    // Find the key parameter which contains the file path
    const keyParam = parameters.find(param => param.name === 'key');
    const filePath = keyParam ? keyParam.value : null;
    
    if (!filePath) {
      throw new Error('Missing file path in staged upload parameters');
    }
    
    logger.info(`[Shopify API] File path for upload: ${filePath}`);
    
    // Add all parameters from the staged target
    parameters.forEach(param => {
      formData.append(param.name, param.value);
    });
    
    // Add the file content as buffer
    formData.append('file', Buffer.from(fileContent), {
      filename: 'variables.jsonl',
      contentType: 'application/jsonl'
    });
    
    logger.info(`[Shopify API] Uploading file to staged target`);
    
    // Using node-fetch for HTTP requests
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Failed to upload to staged target: ${response.status} ${response.statusText}`);
      }
      
      logger.info(`[Shopify API] File uploaded successfully, status: ${response.status}`);
      
      // Construct the full resource URL with the file path
      // Format: https://shopify-staged-uploads.storage.googleapis.com/tmp/SHOP_ID/bulk/UUID/FILENAME.jsonl
      const fullResourceUrl = `${url}${filePath}`;
      logger.info(`[Shopify API] Constructed resource URL: ${fullResourceUrl}`);
      
      return fullResourceUrl;
    } catch (error) {
      logger.error('[Shopify API] Error uploading file:', error.message);
      throw error;
    }
  }

  /**
   * Initiate a bulk operation for product mutation
   * @param {string} mutation - The GraphQL mutation template
   * @param {string} jsonlContent - JSONL formatted content with variables for each mutation
   * @returns {Promise<object>} - Bulk operation details
   */
  async initiateBulkOperation(mutation, jsonlContent) {
    // Stage the upload
    const stagedTarget = await this.stageUpload(`bulk-${Date.now()}.jsonl`, jsonlContent.length);
    
    logger.info("[Shopify API] Staged target created");
    
    // Upload the JSONL file
    const resourceUrl = await this.uploadToStagedTarget(stagedTarget, jsonlContent);
    
    logger.info(`[Shopify API] Resource URL for bulk operation: ${resourceUrl}`);
    
    // Verify the resourceUrl is not empty and properly formatted
    if (!resourceUrl || !resourceUrl.includes('https://')) {
      throw new Error(`Invalid resource URL: ${resourceUrl}`);
    }
    
    // Run the bulk operation
    const result = await this.executeGraphQL(BULK_OPERATION_RUN_MUTATION, {
      mutation,
      stagedUploadPath: resourceUrl
    });
    
    if (result.data?.bulkOperationRunMutation?.userErrors?.length > 0) {
      throw new Error(`Bulk operation error: ${JSON.stringify(result.data.bulkOperationRunMutation.userErrors)}`);
    }
    
    return result.data.bulkOperationRunMutation.bulkOperation;
  }

  /**
   * Initiate a bulk query operation
   * @param {string} query - The GraphQL query
   * @returns {Promise<object>} - Bulk operation details
   */
  async initiateBulkQuery(query) {
    const result = await this.executeGraphQL(BULK_OPERATION_RUN_QUERY, { query });
    
    if (result.data?.bulkOperationRunQuery?.userErrors?.length > 0) {
      throw new Error(`Bulk query error: ${JSON.stringify(result.data.bulkOperationRunQuery.userErrors)}`);
    }
    
    return result.data.bulkOperationRunQuery.bulkOperation;
  }

  /**
   * Get the current bulk operation status
   * @param {string} [type='QUERY'] - The type of bulk operation (QUERY or MUTATION)
   * @returns {Promise<object>} - Current bulk operation status
   */
  async getBulkOperationStatus(type = 'QUERY') {
    const result = await this.executeGraphQL(GET_BULK_OPERATION_STATUS, { type });
    return result.data.currentBulkOperation;
  }

  /**
   * Poll for bulk operation completion
   * @param {string} [type='QUERY'] - The type of bulk operation (QUERY or MUTATION)
   * @param {number} [maxAttempts=30] - Maximum number of polling attempts
   * @param {number} [interval=2000] - Polling interval in milliseconds
   * @returns {Promise<object>} - Completed bulk operation
   */
  async pollBulkOperation(type = 'QUERY', maxAttempts = 30, interval = 2000) {
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      const operation = await this.getBulkOperationStatus(type);
      
      if (!operation) {
        throw new Error('No bulk operation found');
      }
      
      if (['COMPLETED', 'FAILED', 'CANCELED'].includes(operation.status)) {
        return operation;
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
      attempts++;
    }
    
    throw new Error(`Bulk operation polling timed out after ${maxAttempts} attempts`);
  }
}

module.exports = new ShopifyService(); 