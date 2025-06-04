const shopifyService = require('./shopifyService');
const ftpService = require('./ftpService');
const dbService = require('./dbService');
const { shopifyApiLimiter, ftpLimiter } = require('../utils/rateLimiters');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { 
  GET_PRODUCTS_BY_SKUS,
  GET_PRODUCT_BY_VARIANT_SKU
} = require('../graphql/queries/productQueries');
const { 
  BULK_CREATE_PRODUCT, 
  BULK_UPDATE_PRODUCT,
  CREATE_PRODUCT,
  UPDATE_PRODUCT,
  DELETE_PRODUCT
} = require('../graphql/mutations/productMutations');

// Add a constant for the maximum recommended batch size
const MAX_BULK_BATCH_SIZE = 1000; // Cap each bulk operation at 1000 products to avoid timeouts or size limits

class ProductSyncService {
  /**
   * Download and parse product data from FTP
   * @param {Object} config - Product sync configuration
   * @returns {Promise<Array>} Array of parsed products
   */
  async fetchProductsFromSource(config) {
    try {
      // Support both camelCase and snake_case naming conventions
      const connectionType = config.connectionType || config.connection_type;
      const credentials = config.credentials;
      
      if (connectionType === 'ftp') {
        const { ftpHost, ftpPort, ftpUser, ftpPassword, filePath, dataPath } = credentials;
        
        // Create temporary directory if it doesn't exist
        const tempDir = path.join(os.tmpdir(), 'shopify-erp-connector');
        try {
          await fs.mkdir(tempDir, { recursive: true });
        } catch (err) {
          if (err.code !== 'EEXIST') throw err;
        }
        
        // Create FTP config for this specific request
        const ftpConfig = {
          host: ftpHost,
          port: parseInt(ftpPort, 10) || 21,
          user: ftpUser,
          password: ftpPassword
        };
        
        // Download file from FTP
        const tempFilePath = path.join(tempDir, `products-${Date.now()}.json`);
        await ftpLimiter(() => ftpService.downloadFile(filePath, tempFilePath, ftpConfig));
        
        // Read and parse the file
        const fileContent = await fs.readFile(tempFilePath, 'utf8');
        const parsedData = JSON.parse(fileContent);
        
        // Extract the data using the provided dataPath
        let products = parsedData;
        if (dataPath) {
          // Handle nested paths like 'data.products'
          const pathParts = dataPath.split('.');
          for (const part of pathParts) {
            if (products && products[part]) {
              products = products[part];
            } else {
              logger.warn(`Data path '${dataPath}' not found in the response`);
              products = [];
              break;
            }
          }
        }
        
        // Clean up temp file
        await fs.unlink(tempFilePath);
        
        return Array.isArray(products) ? products : [products];
      } else {
        throw new Error(`Unsupported connection type: ${connectionType}`);
      }
    } catch (error) {
      logger.error('Error fetching products from source:', error);
      throw error;
    }
  }

  /**
   * Transform ERP product data to Shopify format
   * @param {Object} product - Product data from ERP
   * @param {Object} config - Sync configuration with mappings
   * @returns {Object} An object containing Shopify-formatted product input and variant data
   */
  transformProductToShopify(product, config) {
    // Support both camelCase and snake_case naming conventions
    const mapping = config.mapping || {};
    const metafieldMappings = config.metafieldMappings || config.metafield_mappings || [];
    
    // Initialize product data
    const shopifyProductInput = { 
      metafields: [],
      status: "ACTIVE"
    };
    
    // Initialize variant data with default values
    const variantData = {
      barcode: null,
      sku: null,
      price: 0,
      inventoryItem: {
        tracked: true,
        measurement: {
          weight: {
            unit: "KILOGRAMS",
            value: 0.01 // Default weight
          }
        }
      },
      inventoryPolicy: "DENY",
      optionValues: [
        {
          name: "Default Title",
          optionName: "Title"
        }
      ]
    };
    
    // Map standard fields
    for (const [shopifyField, erpField] of Object.entries(mapping)) {
      if (!erpField || product[erpField] === undefined || product[erpField] === null) continue;
      
      if (shopifyField.startsWith('FIELD_')) {
        // Handle special field mappings
        const fieldName = shopifyField.replace('FIELD_', '').toLowerCase();
        
        switch (fieldName) {
          // Map variant-specific fields
          case 'sku':
            variantData.sku = product[erpField];
            break;
          case 'barcode':
            variantData.barcode = product[erpField];
            break;
          case 'price':
            variantData.price = parseFloat(product[erpField]);
            break;
          case 'compare_at_price':
            variantData.compareAtPrice = parseFloat(product[erpField]);
            break;
          case 'inventory_quantity':
            variantData.inventoryQuantity = parseInt(product[erpField], 10);
            break;
          case 'taxable':
            variantData.taxable = Boolean(product[erpField]);
            break;
          case 'tax_code':
            variantData.taxCode = product[erpField];
            break;
          case 'requires_shipping':
            variantData.requiresShipping = Boolean(product[erpField]);
            break;
          case 'harmonized_system_code':
            variantData.harmonizedSystemCode = product[erpField];
            break;
          case 'cost':
            variantData.inventoryItem.cost = parseFloat(product[erpField]);
            break;
          
          // Weight handling
          case 'weight':
            const weightValue = parseFloat(product[erpField]);
            if (!isNaN(weightValue)) {
              variantData.inventoryItem.measurement.weight.value = weightValue;
            }
            break;
          
          // Weight unit handling
          case 'weight_unit':
            variantData.inventoryItem.measurement.weight.unit = product[erpField] || "KILOGRAMS";
            break;
          
          // SEO fields
          case 'seo_title':
            if (!shopifyProductInput.seo) shopifyProductInput.seo = {};
            shopifyProductInput.seo.title = product[erpField];
            break;
          case 'seo_description':
            if (!shopifyProductInput.seo) shopifyProductInput.seo = {};
            shopifyProductInput.seo.description = product[erpField];
            break;
          
          // Standard product fields
          case 'description_html':
            shopifyProductInput.descriptionHtml = product[erpField];
            break;
          case 'tags':
            shopifyProductInput.tags = Array.isArray(product[erpField]) 
              ? product[erpField].join(', ') 
              : product[erpField];
            break;
          case 'vendor':
            shopifyProductInput.vendor = product[erpField];
            break;
          case 'product_type':
            shopifyProductInput.productType = product[erpField];
            break;
          case 'handle':
            shopifyProductInput.handle = product[erpField];
            break;
          case 'status':
            shopifyProductInput.status = product[erpField];
            break;
          case 'template_suffix':
            shopifyProductInput.templateSuffix = product[erpField];
            break;
          case 'published_at':
            shopifyProductInput.publishedAt = product[erpField];
            break;
          case 'requires_selling_plan':
            shopifyProductInput.requiresSellingPlan = Boolean(product[erpField]);
            break;
          default:
            // Map other main product fields
            shopifyProductInput[fieldName] = product[erpField];
        }
      } else {
        // Direct mapping to the main product input
        shopifyProductInput[shopifyField] = product[erpField];
      }
    }
    
    // Add product options definition
    shopifyProductInput.productOptions = [
      {
        name: "Title",
        values: [{ name: "Default Title" }]
      }
    ];
    
    // Process metafield mappings
    if (metafieldMappings && Array.isArray(metafieldMappings)) {
      for (const mapping of metafieldMappings) {
        const { mappingType, sourceKey, metafieldNamespace, metafieldKey, metafieldType, arrayKeySource, arrayValueSource } = mapping;
        
        if (mappingType === 'single') {
          // Direct mapping of a single value
          if (product[sourceKey] !== undefined && product[sourceKey] !== null) {
            shopifyProductInput.metafields.push({
              namespace: metafieldNamespace,
              key: metafieldKey,
              value: this.formatMetafieldValue(product[sourceKey], metafieldType),
              type: metafieldType,
            });
          }
        } else if (mappingType === 'dynamic_from_array' && Array.isArray(product[sourceKey])) {
          // Create dynamic metafields from an array of objects
          for (const item of product[sourceKey]) {
            if (item[arrayKeySource] && item[arrayValueSource] !== undefined) {
              shopifyProductInput.metafields.push({
                namespace: metafieldNamespace,
                key: item[arrayKeySource].toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                value: this.formatMetafieldValue(item[arrayValueSource], metafieldType),
                type: metafieldType,
              });
            }
          }
        }
      }
    }
    
    // Only add metafields that have valid values
    shopifyProductInput.metafields = shopifyProductInput.metafields.filter(
      metafield => metafield.value !== null && metafield.value !== undefined && metafield.value !== ''
    );
    
    // Extract the SKU from variant data for tracking
    const sku = variantData.sku;
    
    return {
      productData: shopifyProductInput,
      variantData: variantData,
      sku: sku
    };
  }
  
  /**
   * Format a value according to the Shopify metafield type
   * @param {any} value - The value to format
   * @param {string} type - Shopify metafield type
   * @returns {string} Formatted value
   */
  formatMetafieldValue(value, type) {
    if (value === null || value === undefined) {
      return '';
    }
    
    // Handle array values for list types
    if (type.startsWith('list.')) {
      const baseType = type.replace('list.', '');
      try {
        // If value is already a string but looks like an array, parse it
        if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
          try {
            value = JSON.parse(value);
          } catch (e) {
            // If parsing fails, treat as is
          }
        }
        
        // Ensure value is an array
        const listValues = Array.isArray(value) ? value : [value];
        
        // Format each value in the list according to its base type
        const formattedList = listValues.map(item => {
          // For single_line_text_field, ensure item is a simple string
          if (baseType === 'single_line_text_field') {
            return String(item).substring(0, 255); // Apply character limit for single line text
          }
          return String(item);
        });
        
        return JSON.stringify(formattedList);
      } catch (error) {
        logger.warn(`Error formatting list metafield value: ${error.message}`);
        return JSON.stringify(Array.isArray(value) ? value : [String(value)]);
      }
    }
    
    // Handle non-list types
    switch (type) {
      case 'single_line_text_field':
        // Ensure string and apply character limits
        return String(value).substring(0, 255);
      
      case 'multi_line_text_field':
        return String(value);
      
      case 'number_integer':
        const intValue = parseInt(value, 10);
        return isNaN(intValue) ? '0' : intValue.toString();
      
      case 'number_decimal':
        const floatValue = parseFloat(value);
        return isNaN(floatValue) ? '0.0' : floatValue.toString();
      
      case 'boolean':
        return Boolean(value).toString();
      
      case 'json':
        if (typeof value === 'object') {
          try {
            return JSON.stringify(value);
          } catch (e) {
            return '{}';
          }
        }
        // If value is already a string but looks like JSON, validate it
        if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
          try {
            JSON.parse(value); // Just validate
            return value;
          } catch (e) {
            return '{}';
          }
        }
        return String(value);
      
      case 'url':
        return String(value);
      
      case 'date':
      case 'date_time':
        // Try to format as ISO date if it's not already
        if (value instanceof Date) {
          return type === 'date' ? value.toISOString().split('T')[0] : value.toISOString();
        }
        return String(value);
      
      default:
        return String(value);
    }
  }

  /**
   * Prepare bulk operation payload for products with batch size control
   * @param {Array} shopifyProducts - Array of Shopify-formatted products
   * @param {Array} variantsData - Array of variant data for each product
   * @param {string} operation - The operation to perform ('create' or 'update')
   * @returns {string} JSONL content for bulk operation
   */
  prepareBulkOperationPayload(shopifyProducts, variantsData, operation) {
    logger.info(`[Product Sync] Preparing bulk ${operation} payload for ${shopifyProducts.length} products`);
    
    // Create a properly formatted JSONL string
    const jsonlLines = shopifyProducts.map(product => {
      // For productSet mutation which requires ProductSetInput format
      const input = {
        title: product.productData.title || "Untitled Product",
        descriptionHtml: product.productData.descriptionHtml,
        vendor: product.productData.vendor,
        productType: product.productData.productType,
        tags: product.productData.tags,
        status: product.productData.status || "ACTIVE",
        metafields: product.productData.metafields,
        productOptions: [
          { name: "Title", values: [{ name: "Default Title" }] }
        ],
        variants: [
          {
            sku: product.variantData.sku,
            barcode: product.variantData.barcode,
            price: parseFloat(product.variantData.price || 0),
            compareAtPrice: product.variantData.compareAtPrice ? parseFloat(product.variantData.compareAtPrice) : null,
            inventoryItem: {
              tracked: true,
              cost: product.variantData.inventoryItem?.cost ? parseFloat(product.variantData.inventoryItem.cost) : null
            },
            inventoryPolicy: product.variantData.inventoryPolicy || "DENY",
            optionValues: [
              { name: "Default Title", optionName: "Title" }
            ]
          }
        ]
      };
      
      // For update operations, add IDs
      if (operation === 'update' && product.productId) {
        input.id = product.productId;
        
        if (product.variantId && input.variants && input.variants.length > 0) {
          input.variants[0].id = product.variantId;
        }
      }
      
      // Remove empty arrays to avoid API errors
      if (input.metafields && input.metafields.length === 0) {
        delete input.metafields;
      }
      
      // Return a single line of JSONL
      return JSON.stringify({ input });
    });
    
    const jsonlContent = jsonlLines.join('\n');
    logger.info(`[Product Sync] JSONL payload size: ${jsonlContent.length} bytes`);
    
    return jsonlContent;
  }

  /**
   * Prepare bulk variants operation payload
   * @param {Array} variants - Array of variants to create
   * @param {string} productId - ID of the product for these variants
   * @returns {string} JSONL content for bulk operation
   */
  prepareVariantsBulkPayload(variants, productId) {
    const payload = {
      productId,
      variants
    };
    
    return JSON.stringify(payload);
  }

  /**
   * Process a batch of products with bulk operations
   * @param {Array} products - Array of products to process
   * @param {string} operation - The operation to perform ('create' or 'update')
   * @param {string} syncLogId - The ID of the sync log
   * @returns {Promise<Object>} The result of the bulk operation
   */
  async processBulkBatch(products, operation, syncLogId) {
    if (products.length === 0) return null;
    
    // Use productSet mutation which is more reliable and consistent
    // Note: productSet expects ProductSetInput! not ProductInput!
    const PRODUCT_SET_MUTATION = `
      mutation call($input: ProductSetInput!) {
        productSet(input: $input) {
          product {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const jsonlContent = this.prepareBulkOperationPayload(products, operation);
    
    // Initiate the bulk operation with productSet mutation
    const bulkOperation = await shopifyApiLimiter(() => 
      shopifyService.initiateBulkOperation(PRODUCT_SET_MUTATION, jsonlContent)
    );
    
    // Update sync log
    await dbService.updateSyncLog(syncLogId, {
      status: 'bulk_operation_started',
      message: `Bulk ${operation} operation started with ID: ${bulkOperation.id} for ${products.length} products`,
    });
    
    // Poll for completion
    const completedOperation = await shopifyService.pollBulkOperation('MUTATION');
    
    return completedOperation;
  }

  /**
   * Synchronize products from ERP to Shopify
   * @param {string} configId - ID of the sync configuration to use
   * @param {boolean} limitedMode - When true, limits the number of products processed (for development)
   * @param {number} limit - Maximum number of products to sync when in limitedMode (default: 100)
   * @param {boolean} useBulk - When true, uses bulk operations for product creation/updates (default: false)
   * @returns {Promise<Object>} Result of the sync operation
   */
  async syncProducts(configId, limitedMode = true, limit = 100, useBulk = true) {
    let syncLogId = null;
    
    try {
      // Get the sync configuration
      const configs = await dbService.getProductSyncConfigs(configId);
      if (!configs || configs.length === 0) {
        throw new Error(`Sync configuration not found with ID: ${configId}`);
      }
      
      const config = configs[0];
      
      // Create a sync log entry
      const syncLog = await dbService.logSyncOperation({
        configId: config.id,
        status: 'started',
        message: limitedMode 
          ? `Product sync started (DEVELOPMENT MODE - Limited to ${limit} products)${useBulk ? ' using bulk operations' : ''}` 
          : `Product sync started${useBulk ? ' using bulk operations' : ''}`,
      });
      
      syncLogId = syncLog.id;
      
      // Fetch products from ERP
      let erpProducts = await this.fetchProductsFromSource(config);
      
      // Apply the limit if in limited mode
      const originalCount = erpProducts.length;
      if (limitedMode && erpProducts.length > limit) {
        erpProducts = erpProducts.slice(0, limit);
      }
      
      // Update sync log with count
      await dbService.updateSyncLog(syncLogId, { 
        status: 'processing',
        message: limitedMode 
          ? `Development mode: Limited to ${erpProducts.length} of ${originalCount} products from source` 
          : `Fetched ${erpProducts.length} products from source`,
        itemsProcessed: erpProducts.length
      });
      
      // Transform products to Shopify format
      const processedProducts = erpProducts.map(product => {
        // Transform the product and get back product and variant data
        return this.transformProductToShopify(product, config);
      });
      
      // Use the true two-step approach - use bulk operations if explicitly enabled or if not limited and many products
      const stats = await this.processTwoStepProductSync(
        processedProducts, 
        syncLogId, 
        useBulk || (!limitedMode && processedProducts.length > 10)
      );
      
      // Run duplicate cleanup after sync is complete
      let cleanupStats = null;
      try {
        await dbService.updateSyncLog(syncLogId, {
          status: 'cleaning_duplicates',
          message: 'Running duplicate cleanup...'
        });
        
        cleanupStats = await this.cleanupDuplicateProducts(syncLogId);
        logger.info(`[Product Sync] Duplicate cleanup completed: ${cleanupStats.productsDeleted} duplicates removed`);
      } catch (cleanupError) {
        logger.error('[Product Sync] Error during duplicate cleanup:', cleanupError);
        // Don't fail the whole sync if cleanup fails
      }
      
      // Final update to sync log
      await dbService.updateSyncLog(syncLogId, {
        endTime: new Date(),
        status: stats.failedCount === 0 ? 'completed' : 'completed_with_errors',
        message: limitedMode 
          ? `Development sync completed (limited to ${limit}). Created ${stats.createSuccessCount} products, updated ${stats.updateSuccessCount}, ${stats.failedCount} failed.${cleanupStats ? ` Removed ${cleanupStats.productsDeleted} duplicates.` : ''}`
          : `Sync completed. Created ${stats.createSuccessCount} products, updated ${stats.updateSuccessCount}, ${stats.failedCount} failed.${cleanupStats ? ` Removed ${cleanupStats.productsDeleted} duplicates.` : ''}`,
        itemsSucceeded: stats.createSuccessCount + stats.updateSuccessCount,
        itemsFailed: stats.failedCount,
      });
      
      return {
        success: true,
        message: limitedMode 
          ? `Development sync completed (limited to ${limit}). Created ${stats.createSuccessCount} products, updated ${stats.updateSuccessCount}, ${stats.failedCount} failed.${cleanupStats ? ` Removed ${cleanupStats.productsDeleted} duplicates.` : ''}`
          : `Sync completed. Created ${stats.createSuccessCount} products, updated ${stats.updateSuccessCount}, ${stats.failedCount} failed.${cleanupStats ? ` Removed ${cleanupStats.productsDeleted} duplicates.` : ''}`,
        syncLogId,
        ...(limitedMode ? { originalProductCount: originalCount } : {}),
        productCount: erpProducts.length,
        createSuccessCount: stats.createSuccessCount,
        updateSuccessCount: stats.updateSuccessCount,
        failedCount: stats.failedCount,
        ...(cleanupStats ? { duplicatesRemoved: cleanupStats.productsDeleted } : {})
      };
      
    } catch (error) {
      logger.error('Product sync error:', error);
      
      // Update sync log with error
      if (syncLogId) {
        await dbService.updateSyncLog(syncLogId, {
          endTime: new Date(),
          status: 'failed',
          message: `Sync failed: ${error.message}`,
        });
      }
      
      throw error;
    }
  }

  /**
   * Process a true two-step sync approach: first create products, then add variants
   * @param {Array} processedProducts - Array of processed product data with separate product and variant data
   * @param {string} syncLogId - The ID of the sync log
   * @param {boolean} useBulk - Whether to use bulk operations
   * @returns {Promise<Object>} - Result statistics
   */
  async processTwoStepProductSync(processedProducts, syncLogId, useBulk = false) {
    // Look up existing products by SKU to determine create vs update
    const existingProducts = {};
    
    // Collect all SKUs from products to look up
    const skus = processedProducts
      .filter(p => p.sku)
      .map(p => p.sku);
    
    if (skus.length > 0) {
      logger.info(`[Product Sync] Looking up ${skus.length} SKUs in Shopify`);
      
      // Process SKUs one by one for more accurate matching
      for (const sku of skus) {
        if (!sku) continue;
        
        try {
          // Use a more precise query for each SKU
          const result = await shopifyApiLimiter(() => 
            shopifyService.executeGraphQL(`
              query getProductVariantBySku($sku: String!) {
                productVariants(first: 10, query: $sku) {
                  edges {
                    node {
                      id
                      sku
                      product {
                        id
                        title
                        handle
                      }
                    }
                  }
                }
              }
            `, { sku: `sku:"${sku}"` }) // Use exact match with quotes
          );
          
          if (result?.data?.productVariants?.edges) {
            // Find exact SKU match (case-sensitive)
            const exactMatch = result.data.productVariants.edges.find(edge => 
              edge.node.sku === sku
            );
            
            if (exactMatch) {
              const variant = exactMatch.node;
              const product = variant.product;
              
              logger.info(`[Product Sync] Found exact match for SKU: ${sku} (product: ${product.title})`);
              
              existingProducts[sku] = {
                productId: product.id,
                variantId: variant.id,
                title: product.title
              };
            } else {
              // If no exact match, check for case-insensitive match
              const caseInsensitiveMatch = result.data.productVariants.edges.find(edge => 
                edge.node.sku && edge.node.sku.toLowerCase() === sku.toLowerCase()
              );
              
              if (caseInsensitiveMatch) {
                const variant = caseInsensitiveMatch.node;
                const product = variant.product;
                
                logger.warn(`[Product Sync] Found case-insensitive match for SKU: ${sku} -> ${variant.sku} (product: ${product.title})`);
                
                existingProducts[sku] = {
                  productId: product.id,
                  variantId: variant.id,
                  title: product.title
                };
              }
            }
          }
        } catch (error) {
          logger.error(`[Product Sync] Error looking up SKU ${sku}:`, error.message);
        }
      }
    }
    
    logger.info(`[Product Sync] Found ${Object.keys(existingProducts).length} existing products by SKU`);
    
    // Split products into create and update batches
    const productsToCreate = [];
    const productsToUpdate = [];
    
    processedProducts.forEach(product => {
      const sku = product.sku;
      
      if (sku && existingProducts[sku]) {
        // Product exists - prepare for update
        productsToUpdate.push({
          ...product,
          productId: existingProducts[sku].productId,
          variantId: existingProducts[sku].variantId
        });
      } else {
        // New product - prepare for creation
        productsToCreate.push(product);
      }
    });

    logger.info(`[Product Sync] Will create ${productsToCreate.length} new products and update ${productsToUpdate.length} existing products`);

    // Update sync log with split results
    await dbService.updateSyncLog(syncLogId, {
      status: 'processing',
      message: `Processing ${productsToCreate.length} new products and ${productsToUpdate.length} updates`,
    });
    
    const stats = {
      createSuccessCount: 0,
      updateSuccessCount: 0,
      failedCount: 0,
      newProductIds: {}
    };
    
    // Process products one by one using productSet for both creates and updates
    if (!useBulk) {
      // Process creates
      for (const product of productsToCreate) {
        try {
          // Use the productSet mutation which supports variants
          const PRODUCT_SET = `
            mutation productSet($input: ProductSetInput!, $synchronous: Boolean!) {
              productSet(input: $input, synchronous: $synchronous) {
                product {
                  id
                  variants(first: 10) {
                    edges {
                      node {
                        id
                        sku
                      }
                    }
                  }
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;
          
          // Create a complete product input with variant
          const productSetInput = {
            title: product.productData.title || "Untitled Product",
            descriptionHtml: product.productData.descriptionHtml,
            vendor: product.productData.vendor,
            productType: product.productData.productType,
            tags: product.productData.tags,
            status: product.productData.status || "ACTIVE",
            metafields: product.productData.metafields,
            productOptions: [
              {
                name: "Title", 
                values: [{ name: "Default Title" }]
              }
            ],
            variants: [
              {
                sku: product.variantData.sku,
                barcode: product.variantData.barcode,
                price: product.variantData.price,
                compareAtPrice: product.variantData.compareAtPrice,
                inventoryItem: {
                  tracked: true,
                  cost: product.variantData.inventoryItem?.cost
                },
                inventoryPolicy: product.variantData.inventoryPolicy || "DENY",
                optionValues: [
                  {
                    optionName: "Title",
                    name: "Default Title"
                  }
                ]
              }
            ]
          };
          
          // Execute the mutation
          const result = await shopifyApiLimiter(() => 
            shopifyService.executeGraphQL(PRODUCT_SET, { 
              input: productSetInput,
              synchronous: true
            })
          );
          
          if (result.data?.productSet?.userErrors?.length > 0) {
            logger.error("Error creating product:", result.data.productSet.userErrors);
            stats.failedCount++;
          } else {
            stats.createSuccessCount++;
          }
        } catch (error) {
          logger.error(`Error creating product: ${error.message}`);
          stats.failedCount++;
        }
      }
      
      // Process updates
      for (const product of productsToUpdate) {
        try {
          // Use productSet for updates too
          const PRODUCT_SET = `
            mutation productSet($input: ProductSetInput!, $synchronous: Boolean!) {
              productSet(input: $input, synchronous: $synchronous) {
                product {
                  id
                  variants(first: 10) {
                    edges {
                      node {
                        id
                        sku
                      }
                    }
                  }
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;
          
          // Create update input with ID and variant
          const productSetInput = {
            id: product.productId,
            title: product.productData.title || "Untitled Product",
            descriptionHtml: product.productData.descriptionHtml,
            vendor: product.productData.vendor,
            productType: product.productData.productType,
            tags: product.productData.tags,
            status: product.productData.status || "ACTIVE",
            metafields: product.productData.metafields,
            productOptions: [
              {
                name: "Title", 
                values: [{ name: "Default Title" }]
              }
            ],
            variants: [
              {
                id: product.variantId,
                sku: product.variantData.sku,
                barcode: product.variantData.barcode,
                price: product.variantData.price,
                compareAtPrice: product.variantData.compareAtPrice,
                inventoryItem: {
                  tracked: true,
                  cost: product.variantData.inventoryItem?.cost
                },
                inventoryPolicy: product.variantData.inventoryPolicy || "DENY",
                optionValues: [
                  {
                    optionName: "Title",
                    name: "Default Title"
                  }
                ]
              }
            ]
          };
          
          // Execute the update
          const result = await shopifyApiLimiter(() => 
            shopifyService.executeGraphQL(PRODUCT_SET, { 
              input: productSetInput,
              synchronous: true 
            })
          );
          
          if (result.data?.productSet?.userErrors?.length > 0) {
            logger.error("Error updating product:", result.data.productSet.userErrors);
            stats.failedCount++;
          } else {
            stats.updateSuccessCount++;
          }
        } catch (error) {
          logger.error(`Error updating product: ${error.message}`);
          stats.failedCount++;
        }
      }
    } else {
      // BULK OPERATIONS
      // For bulk operations, we'll use our improved processBulkBatch method
      if (productsToCreate.length > 0) {
        try {
          logger.info(`[Product Sync] Processing ${productsToCreate.length} products for bulk creation`);
          
          // Update sync log
          await dbService.updateSyncLog(syncLogId, {
            status: 'preparing_bulk_operation',
            message: `Preparing bulk product creation for ${productsToCreate.length} products`,
          });
          
          // Process bulk operation
          const bulkResult = await this.processBulkBatch(productsToCreate, 'create', syncLogId);
          
          // Consider the operation successful if it completes
          if (bulkResult.status === 'COMPLETED') {
            logger.info(`[Product Sync] Bulk creation completed successfully`);
            stats.createSuccessCount = productsToCreate.length;
          } else {
            logger.error(`[Product Sync] Bulk creation failed with status: ${bulkResult.status}`);
            logger.error(`Error: ${bulkResult.errorCode || 'Unknown error'}`);
            stats.failedCount += productsToCreate.length;
          }
        } catch (error) {
          logger.error("Bulk creation error:", error.message);
          stats.failedCount += productsToCreate.length;
        }
      }
      
      // Process bulk updates similarly
      if (productsToUpdate.length > 0) {
        try {
          logger.info(`[Product Sync] Processing ${productsToUpdate.length} products for bulk update`);
          
          // Update sync log
          await dbService.updateSyncLog(syncLogId, {
            status: 'preparing_bulk_operation',
            message: `Preparing bulk product update for ${productsToUpdate.length} products`,
          });
          
          // Process bulk operation
          const bulkResult = await this.processBulkBatch(productsToUpdate, 'update', syncLogId);
          
          // Consider the operation successful if it completes
          if (bulkResult.status === 'COMPLETED') {
            logger.info(`[Product Sync] Bulk update completed successfully`);
            stats.updateSuccessCount = productsToUpdate.length;
          } else {
            logger.error(`[Product Sync] Bulk update failed with status: ${bulkResult.status}`);
            logger.error(`Error: ${bulkResult.errorCode || 'Unknown error'}`);
            stats.failedCount += productsToUpdate.length;
          }
        } catch (error) {
          logger.error("Bulk update error:", error.message);
          stats.failedCount += productsToUpdate.length;
        }
      }
    }
    
    return stats;
  }

  /**
   * Clean up duplicate products in Shopify based on SKU
   * @param {string} syncLogId - The ID of the sync log (optional)
   * @returns {Promise<Object>} - Cleanup statistics
   */
  async cleanupDuplicateProducts(syncLogId = null) {
    logger.info('[Product Cleanup] Starting duplicate product cleanup');
    
    const stats = {
      totalProducts: 0,
      duplicatesFound: 0,
      productsDeleted: 0,
      errors: 0
    };
    
    try {
      // Query to get all products with their variants
      const PRODUCTS_WITH_SKUS_QUERY = `
        query getAllProductsWithSkus($cursor: String) {
          products(first: 250, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                title
                createdAt
                updatedAt
                variants(first: 250) {
                  edges {
                    node {
                      id
                      sku
                    }
                  }
                }
              }
            }
          }
        }
      `;
      
      // Collect all products
      const allProducts = [];
      let hasNextPage = true;
      let cursor = null;
      
      while (hasNextPage) {
        const result = await shopifyApiLimiter(() => 
          shopifyService.executeGraphQL(PRODUCTS_WITH_SKUS_QUERY, { cursor })
        );
        
        if (result?.data?.products?.edges) {
          allProducts.push(...result.data.products.edges.map(edge => edge.node));
          hasNextPage = result.data.products.pageInfo.hasNextPage;
          cursor = result.data.products.pageInfo.endCursor;
        } else {
          hasNextPage = false;
        }
      }
      
      stats.totalProducts = allProducts.length;
      logger.info(`[Product Cleanup] Found ${stats.totalProducts} total products`);
      
      // Group products by SKU
      const productsBySku = {};
      
      allProducts.forEach(product => {
        // Check all variants for SKUs
        if (product.variants && product.variants.edges) {
          product.variants.edges.forEach(variantEdge => {
            const variant = variantEdge.node;
            if (variant.sku) {
              if (!productsBySku[variant.sku]) {
                productsBySku[variant.sku] = [];
              }
              productsBySku[variant.sku].push({
                productId: product.id,
                title: product.title,
                createdAt: product.createdAt,
                updatedAt: product.updatedAt
              });
            }
          });
        }
      });
      
      // Find duplicates and collect unique products to delete
      const productsToDelete = new Map(); // Use Map to ensure uniqueness by productId
      const duplicateSkus = Object.keys(productsBySku).filter(sku => productsBySku[sku].length > 1);
      stats.duplicatesFound = duplicateSkus.length;
      
      logger.info(`[Product Cleanup] Found ${stats.duplicatesFound} SKUs with duplicate products`);
      
      if (syncLogId) {
        await dbService.updateSyncLog(syncLogId, {
          status: 'cleaning_duplicates',
          message: `Found ${stats.duplicatesFound} duplicate SKUs to clean up`
        });
      }
      
      // Collect products to delete, ensuring each product is only deleted once
      for (const sku of duplicateSkus) {
        const duplicates = productsBySku[sku];
        
        // Sort by updatedAt date (newest first)
        duplicates.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        
        // Keep the first one (most recently updated), mark the rest for deletion
        const toKeep = duplicates[0];
        const toDelete = duplicates.slice(1);
        
        logger.info(`[Product Cleanup] SKU "${sku}" has ${duplicates.length} products. Keeping: ${toKeep.title} (${toKeep.productId})`);
        
        for (const product of toDelete) {
          // Only add to deletion list if not already there
          if (!productsToDelete.has(product.productId)) {
            productsToDelete.set(product.productId, product);
            logger.info(`[Product Cleanup] Marking for deletion: ${product.title} (${product.productId})`);
          }
        }
      }
      
      const uniqueProductsToDelete = Array.from(productsToDelete.values());
      logger.info(`[Product Cleanup] Total unique products to delete: ${uniqueProductsToDelete.length}`);
      
      if (uniqueProductsToDelete.length === 0) {
        logger.info('[Product Cleanup] No duplicates to clean up');
        return stats;
      }
      
      // Process deletions in parallel batches to speed up the process
      const BATCH_SIZE = 5; // Process 5 deletions at a time to respect rate limits
      
      for (let i = 0; i < uniqueProductsToDelete.length; i += BATCH_SIZE) {
        const batch = uniqueProductsToDelete.slice(i, i + BATCH_SIZE);
        
        logger.info(`[Product Cleanup] Processing deletion batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(uniqueProductsToDelete.length/BATCH_SIZE)} (${batch.length} products)`);
        
        // Process batch in parallel
        const batchPromises = batch.map(async (product) => {
          try {
            const deleteResult = await shopifyApiLimiter(() => 
              shopifyService.executeGraphQL(DELETE_PRODUCT, {
                input: { id: product.productId }
              })
            );
            
            if (deleteResult.data?.productDelete?.userErrors?.length > 0) {
              const errors = deleteResult.data.productDelete.userErrors;
              const isAlreadyDeleted = errors.some(err => 
                err.message.includes('Product does not exist') || 
                err.message.includes('not found')
              );
              
              if (isAlreadyDeleted) {
                logger.info(`[Product Cleanup] Product already deleted: ${product.productId}`);
                return { success: true, productId: product.productId };
              } else {
                logger.error(`[Product Cleanup] Error deleting product ${product.productId}:`, errors);
                return { success: false, productId: product.productId, error: errors };
              }
            } else {
              logger.info(`[Product Cleanup] Successfully deleted: ${product.title} (${product.productId})`);
              return { success: true, productId: product.productId };
            }
          } catch (error) {
            logger.error(`[Product Cleanup] Error deleting product ${product.productId}:`, error.message);
            return { success: false, productId: product.productId, error: error.message };
          }
        });
        
        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);
        
        // Update stats based on results
        batchResults.forEach(result => {
          if (result.success) {
            stats.productsDeleted++;
          } else {
            stats.errors++;
          }
        });
        
        // Small delay between batches to be extra careful with rate limits
        if (i + BATCH_SIZE < uniqueProductsToDelete.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      logger.info(`[Product Cleanup] Cleanup completed. Deleted ${stats.productsDeleted} duplicate products, ${stats.errors} errors`);
      
      if (syncLogId) {
        await dbService.updateSyncLog(syncLogId, {
          message: `Cleanup completed. Deleted ${stats.productsDeleted} duplicate products`
        });
      }
      
      return stats;
      
    } catch (error) {
      logger.error('[Product Cleanup] Error during cleanup:', error);
      throw error;
    }
  }
}

module.exports = new ProductSyncService(); 
