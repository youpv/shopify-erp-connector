import { runQuery } from '../shopify.js';
import { CREATE_PRODUCT, UPDATE_PRODUCT, DELETE_PRODUCT } from '../shopify/mutations.js';
import { updateProductTracking, removeProductTracking } from './productOperations.js';
import { createBulkOperation, monitorBulkOperation } from './bulkOperations.js';
import pLimit from 'p-limit';
import chalk from 'chalk';

// Rate limiting for API calls
const limit = pLimit(2); // Max 2 concurrent API calls

export async function executeProductOperations(operations, mappedProducts, configId, useBulk = true) {
  const results = {
    created: 0,
    updated: 0,
    deleted: 0,
    errors: []
  };

  try {
    // Use bulk operations for batches of 10 or more products
    if (useBulk && (operations.create.length >= 10 || operations.update.length >= 10)) {
      await executeBulkOperations(operations, mappedProducts, configId, results);
    } else {
      // Handle individual operations for small batches
      await executeIndividualOperations(operations, mappedProducts, configId, results);
    }

    // Always handle deletes individually
    if (operations.delete.length > 0) {
      await executeDeleteOperations(operations.delete, configId, results);
    }

  } catch (error) {
    console.error(chalk.red('Sync operations error:'), error);
    results.errors.push({ error: error.message });
  }

  return results;
}

async function executeBulkOperations(operations, mappedProducts, configId, results) {
  // Prepare products for bulk create
  if (operations.create.length > 0) {
    console.log(chalk.blue('🚀 Executing bulk create operation'));
    
    const createProducts = operations.create.map(op => {
      const mapped = mappedProducts.find(m => m.sku === op.erpProduct.sku);
      return transformToShopifyProduct(mapped, op.erpProduct);
    });

    try {
      const bulkOp = await createBulkOperation(createProducts, 'create');
      const completed = await monitorBulkOperation(bulkOp.id);
      
      results.created = parseInt(completed.processedCount) || operations.create.length;
      
      // Track created products
      for (const op of operations.create) {
        await updateProductTracking(
          configId,
          op.erpProduct.sku,
          'pending-bulk', // Will be updated after bulk operation completes
          'pending-bulk',
          op.erpProduct
        );
      }
    } catch (error) {
      console.error(chalk.red('Bulk create failed:'), error);
      results.errors.push({ operation: 'bulk-create', error: error.message });
    }
  }

  // Prepare products for bulk update
  if (operations.update.length > 0) {
    console.log(chalk.blue('🚀 Executing bulk update operation'));
    
    const updateProducts = operations.update.map(op => {
      const mapped = mappedProducts.find(m => m.sku === op.erpProduct.sku);
      return {
        id: op.shopifyProductId,
        ...transformToShopifyProduct(mapped, op.erpProduct)
      };
    });

    try {
      const bulkOp = await createBulkOperation(updateProducts, 'update');
      const completed = await monitorBulkOperation(bulkOp.id);
      
      results.updated = parseInt(completed.processedCount) || operations.update.length;
      
      // Track updated products
      for (const op of operations.update) {
        await updateProductTracking(
          configId,
          op.erpProduct.sku,
          op.shopifyProductId,
          op.shopifyVariantId,
          op.erpProduct
        );
      }
    } catch (error) {
      console.error(chalk.red('Bulk update failed:'), error);
      results.errors.push({ operation: 'bulk-update', error: error.message });
    }
  }
}

async function executeIndividualOperations(operations, mappedProducts, configId, results) {
  // Create products
  const createPromises = operations.create.map(op => 
    limit(async () => {
      try {
        const mapped = mappedProducts.find(m => m.sku === op.erpProduct.sku);
        const shopifyProduct = transformToShopifyProduct(mapped, op.erpProduct);
        
        const response = await runQuery(CREATE_PRODUCT, { input: shopifyProduct });
        
        if (response.productCreate?.userErrors?.length > 0) {
          throw new Error(JSON.stringify(response.productCreate.userErrors));
        }
        
        const product = response.productCreate?.product;
        if (product) {
          const variant = product.variants.edges[0]?.node;
          await updateProductTracking(
            configId,
            op.erpProduct.sku,
            product.id,
            variant?.id,
            op.erpProduct
          );
          results.created++;
          console.log(chalk.green(`✅ Created product: ${product.title}`));
        }
      } catch (error) {
        console.error(chalk.red(`Failed to create product ${op.erpProduct.sku}:`), error);
        results.errors.push({ sku: op.erpProduct.sku, operation: 'create', error: error.message });
      }
    })
  );

  // Update products
  const updatePromises = operations.update.map(op =>
    limit(async () => {
      try {
        const mapped = mappedProducts.find(m => m.sku === op.erpProduct.sku);
        const shopifyProduct = {
          id: op.shopifyProductId,
          ...transformToShopifyProduct(mapped, op.erpProduct)
        };
        
        const response = await runQuery(UPDATE_PRODUCT, { input: shopifyProduct });
        
        if (response.productUpdate?.userErrors?.length > 0) {
          throw new Error(JSON.stringify(response.productUpdate.userErrors));
        }
        
        await updateProductTracking(
          configId,
          op.erpProduct.sku,
          op.shopifyProductId,
          op.shopifyVariantId,
          op.erpProduct
        );
        results.updated++;
        console.log(chalk.yellow(`🔄 Updated product: ${op.erpProduct.sku}`));
      } catch (error) {
        console.error(chalk.red(`Failed to update product ${op.erpProduct.sku}:`), error);
        results.errors.push({ sku: op.erpProduct.sku, operation: 'update', error: error.message });
      }
    })
  );

  await Promise.all([...createPromises, ...updatePromises]);
}

async function executeDeleteOperations(deleteOps, configId, results) {
  const deletePromises = deleteOps.map(op =>
    limit(async () => {
      try {
        const response = await runQuery(DELETE_PRODUCT, { 
          input: { id: op.shopifyProductId } 
        });
        
        if (response.productDelete?.userErrors?.length > 0) {
          throw new Error(JSON.stringify(response.productDelete.userErrors));
        }
        
        await removeProductTracking(configId, op.sku);
        results.deleted++;
        console.log(chalk.red(`🗑️  Deleted product: ${op.sku}`));
      } catch (error) {
        console.error(chalk.red(`Failed to delete product ${op.sku}:`), error);
        results.errors.push({ sku: op.sku, operation: 'delete', error: error.message });
      }
    })
  );

  await Promise.all(deletePromises);
}

function transformToShopifyProduct(mappedData, erpProduct) {
  if (!mappedData) return {};
  
  // For bulk operations, we need a simpler structure
  const product = {
    title: mappedData.productData?.title || erpProduct.name || erpProduct.title || 'Untitled Product',
    descriptionHtml: mappedData.productData?.descriptionHtml || mappedData.productData?.description || '',
    vendor: mappedData.productData?.vendor || erpProduct.vendor || '',
    productType: mappedData.productData?.productType || erpProduct.productType || '',
    tags: mappedData.productData?.tags || [],
    status: mappedData.productData?.status || 'ACTIVE'
  };

  // Include metafields if present
  if (mappedData.metafields && mappedData.metafields.length > 0) {
    product.metafields = mappedData.metafields;
  }

  return product;
} 