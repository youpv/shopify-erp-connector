import { runQuery } from '../shopify.js';
import { STAGED_UPLOADS_CREATE } from '../shopify/mutations.js';
import { BULK_OPERATION_STATUS, CURRENT_BULK_OPERATION, GET_SHOP_LOCATIONS } from '../shopify/queries.js';
import fetch from 'node-fetch';
import FormData from 'form-data';
import chalk from 'chalk';

let cachedLocationId = null;

async function getDefaultLocationId() {
  if (cachedLocationId) return cachedLocationId;
  
  try {
    const response = await runQuery(GET_SHOP_LOCATIONS);
    const locations = response.locations?.edges || [];
    
    // Find the first active location that fulfills online orders
    const defaultLocation = locations.find(edge => 
      edge.node.isActive && edge.node.fulfillsOnlineOrders
    ) || locations[0];
    
    if (defaultLocation) {
      cachedLocationId = defaultLocation.node.id;
      console.log(chalk.gray(`Using location: ${defaultLocation.node.name} (${cachedLocationId})`));
      return cachedLocationId;
    }
  } catch (error) {
    console.warn(chalk.yellow('Could not fetch locations, using default'));
  }
  
  // Fallback to a default if we can't get locations
  return "gid://shopify/Location/1";
}

export async function createBulkOperation(products, operationType = 'create') {
  console.log(chalk.blue(`📦 Starting bulk ${operationType} operation for ${products.length} products`));
  
  try {
    // Get the default location ID for inventory
    const locationId = await getDefaultLocationId();
    
    // Create JSONL content based on operation type
    let jsonlContent;
    if (operationType === 'create') {
      // For productCreate mutation, we need ProductInput format
      jsonlContent = products
        .map(product => {
          const input = {
            input: {
              title: product.title,
              descriptionHtml: product.descriptionHtml || product.description || '',
              vendor: product.vendor || '',
              productType: product.productType || '',
              status: product.status || 'ACTIVE',
              tags: product.tags || [],
              // For productCreate, variants are created separately or we create a default variant
              // The product will be created with a single default variant
              variants: [{
                sku: product.sku || '',
                price: product.price || '0.00',
                inventoryPolicy: 'DENY',
                inventoryManagement: 'SHOPIFY',
                inventoryQuantities: [{
                  availableQuantity: parseInt(product.inventoryQuantity) || 0,
                  locationId: locationId
                }]
              }]
            }
          };
          return JSON.stringify(input);
        })
        .join('\n');
    } else {
      // For updates, ensure correct format for bulk operation
      jsonlContent = products
        .map(product => {
          const updateInput = {
            input: {
              id: product.id,
              title: product.title,
              descriptionHtml: product.descriptionHtml || product.description,
              vendor: product.vendor,
              productType: product.productType,
              status: product.status || 'ACTIVE',
              tags: product.tags || []
            }
          };
          // Remove undefined fields
          Object.keys(updateInput.input).forEach(key => {
            if (updateInput.input[key] === undefined) {
              delete updateInput.input[key];
            }
          });
          return JSON.stringify(updateInput);
        })
        .join('\n');
    }

    // Stage the upload
    const stagedUpload = await stageUpload(jsonlContent);
    
    if (!stagedUpload) {
      throw new Error('Failed to stage upload');
    }

    // Extract the key parameter which is the stagedUploadPath
    const keyParam = stagedUpload.parameters?.find(p => p.name === 'key');
    if (!keyParam) {
      throw new Error('No key parameter found in staged upload');
    }

    // Use the productSet mutation for bulk operations
    const bulkMutation = operationType === 'create' 
      ? `mutation productCreate($input: ProductInput!) { 
          productCreate(input: $input) { 
            product {
              id
              title
              handle
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
        }`
      : `mutation productUpdate($input: ProductInput!) { 
          productUpdate(input: $input) { 
            product { 
              id 
              title
            } 
            userErrors { 
              field 
              message 
            } 
          } 
        }`;

    const response = await runQuery(`
      mutation bulkOperationRunMutation($mutation: String!, $stagedUploadPath: String!) {
        bulkOperationRunMutation(
          mutation: $mutation,
          stagedUploadPath: $stagedUploadPath
        ) {
          bulkOperation {
            id
            status
            url
          }
          userErrors {
            field
            message
          }
        }
      }
    `, { 
      mutation: bulkMutation,
      stagedUploadPath: keyParam.value 
    });

    if (response.bulkOperationRunMutation?.userErrors?.length > 0) {
      throw new Error(`Bulk operation failed: ${JSON.stringify(response.bulkOperationRunMutation.userErrors)}`);
    }

    const bulkOperation = response.bulkOperationRunMutation?.bulkOperation;
    console.log(chalk.green(`✅ Bulk operation started: ${bulkOperation.id}`));
    
    return bulkOperation;
  } catch (error) {
    console.error(chalk.red(`Bulk ${operationType} failed:`), error);
    throw error;
  }
}

async function stageUpload(content) {
  try {
    // Create staged upload
    const stagedUploadResponse = await runQuery(STAGED_UPLOADS_CREATE, {
      input: [{
        resource: 'BULK_MUTATION_VARIABLES',
        filename: 'bulk-operation.jsonl',
        mimeType: 'text/jsonl',
        httpMethod: 'POST'
      }]
    });

    if (stagedUploadResponse.stagedUploadsCreate?.userErrors?.length > 0) {
      throw new Error(`Staged upload failed: ${JSON.stringify(stagedUploadResponse.stagedUploadsCreate.userErrors)}`);
    }

    const target = stagedUploadResponse.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target) {
      throw new Error('No staged target returned');
    }

    // Upload the file
    const formData = new FormData();
    
    // Add all parameters
    target.parameters.forEach(param => {
      formData.append(param.name, param.value);
    });
    
    // Add the file content
    formData.append('file', Buffer.from(content), {
      filename: 'bulk-operation.jsonl',
      contentType: 'text/jsonl'
    });

    const uploadResponse = await fetch(target.url, {
      method: 'POST',
      body: formData
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }

    console.log(chalk.green('✅ File uploaded successfully'));
    
    return target;

  } catch (error) {
    console.error(chalk.red('Staged upload error:'), error);
    throw error;
  }
}

export async function monitorBulkOperation(operationId, checkInterval = 5000) {
  console.log(chalk.blue(`📊 Monitoring bulk operation: ${operationId}`));
  
  return new Promise((resolve, reject) => {
    const checkStatus = async () => {
      try {
        const response = await runQuery(BULK_OPERATION_STATUS, { id: operationId });
        const operation = response.node;

        if (!operation) {
          reject(new Error('Operation not found'));
          return;
        }

        const statusEmoji = {
          'RUNNING': '⏳',
          'CREATED': '🆕',
          'COMPLETED': '✅',
          'FAILED': '❌',
          'CANCELED': '🚫'
        };

        const emoji = statusEmoji[operation.status] || '❓';
        const objectCount = operation.objectCount || operation.processedRowsCount || 0;
        
        console.log(chalk.gray(`${emoji} Status: ${operation.status}, Objects processed: ${objectCount}`));

        switch (operation.status) {
          case 'COMPLETED':
            console.log(chalk.green(`✅ Bulk operation completed successfully`));
            
            // Process results to get actual count
            let processedCount = objectCount;
            
            // If objectCount is 0 but we have results, count them from the URL
            if ((!objectCount || objectCount === '0') && operation.url) {
              try {
                const results = await processBulkOperationResults(operation);
                processedCount = results.length;
                console.log(chalk.green(`📦 Actual processed count from results: ${processedCount}`));
              } catch (error) {
                console.warn(chalk.yellow('⚠️  Could not fetch result count from URL'));
              }
            } else {
              console.log(chalk.green(`📦 Processed: ${objectCount} objects`));
            }
            
            resolve({
              ...operation,
              processedCount: processedCount.toString()
            });
            break;
            
          case 'FAILED':
          case 'CANCELED':
            console.error(chalk.red(`❌ Bulk operation ${operation.status}: ${operation.errorCode || 'Unknown error'}`));
            reject(new Error(`Bulk operation ${operation.status}: ${operation.errorCode}`));
            break;
            
          case 'RUNNING':
          case 'CREATED':
            // Continue monitoring
            setTimeout(checkStatus, checkInterval);
            break;
            
          default:
            console.warn(chalk.yellow(`❓ Unknown status: ${operation.status}`));
            setTimeout(checkStatus, checkInterval);
        }
      } catch (error) {
        console.error(chalk.red('❌ Error checking operation status:'), error);
        reject(error);
      }
    };

    checkStatus();
  });
}

export async function processBulkOperationResults(operation) {
  if (!operation.url) {
    console.log(chalk.yellow('⚠️  No results URL provided'));
    return [];
  }

  try {
    const response = await fetch(operation.url);
    const text = await response.text();
    
    const results = text
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          console.warn(chalk.yellow('⚠️  Failed to parse line:'), line);
          return null;
        }
      })
      .filter(result => result !== null);
    
    console.log(chalk.gray(`📋 Processed ${results.length} results from bulk operation`));
    return results;
  } catch (error) {
    console.error(chalk.red('❌ Error processing results:'), error);
    return [];
  }
} 