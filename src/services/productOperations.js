import { query } from '../db.js';
import { runQuery } from '../shopify.js';
import { GET_PRODUCTS_BY_SKUS } from '../shopify/queries.js';
import chalk from 'chalk';

export async function categorizeProducts(erpProducts, configId) {
  const operations = {
    create: [],
    update: [],
    delete: []
  };

  // Extract all SKUs from ERP products
  const erpSkus = erpProducts
    .map(p => p.sku || p.SKU || p.variant?.sku)
    .filter(Boolean);

  if (erpSkus.length === 0) {
    console.warn(chalk.yellow('⚠️  No SKUs found in ERP products'));
    return operations;
  }

  // Get existing products from our database
  const { rows: dbProducts } = await query(
    'SELECT * FROM products WHERE config_id = $1',
    [configId]
  );

  // Create a map of existing products by SKU
  const existingProductsMap = new Map();
  dbProducts.forEach(p => existingProductsMap.set(p.sku, p));

  // Fetch products from Shopify by SKUs
  const shopifyProducts = await fetchShopifyProductsBySKUs(erpSkus);
  const shopifyProductsMap = new Map();
  
  shopifyProducts.forEach(product => {
    product.variants.edges.forEach(({ node: variant }) => {
      if (variant.sku) {
        shopifyProductsMap.set(variant.sku, {
          productId: product.id,
          variantId: variant.id,
          product
        });
      }
    });
  });

  // Categorize ERP products
  for (const erpProduct of erpProducts) {
    const sku = erpProduct.sku || erpProduct.SKU || erpProduct.variant?.sku;
    if (!sku) continue;

    const existingDbProduct = existingProductsMap.get(sku);
    const shopifyProduct = shopifyProductsMap.get(sku);

    if (shopifyProduct) {
      // Product exists in Shopify - UPDATE
      operations.update.push({
        erpProduct,
        shopifyProductId: shopifyProduct.productId,
        shopifyVariantId: shopifyProduct.variantId,
        existingProduct: shopifyProduct.product
      });
    } else {
      // Product doesn't exist in Shopify - CREATE
      operations.create.push({
        erpProduct
      });
    }
  }

  // Find products to delete (exist in DB but not in ERP data)
  const erpSkuSet = new Set(erpSkus);
  for (const [sku, dbProduct] of existingProductsMap) {
    if (!erpSkuSet.has(sku) && dbProduct.shopify_product_id) {
      operations.delete.push({
        sku,
        shopifyProductId: dbProduct.shopify_product_id,
        dbProduct
      });
    }
  }

  console.log(chalk.blue('📊 Product operations summary:'));
  console.log(chalk.green(`  ✨ Create: ${operations.create.length} products`));
  console.log(chalk.yellow(`  🔄 Update: ${operations.update.length} products`));
  console.log(chalk.red(`  🗑️  Delete: ${operations.delete.length} products`));

  return operations;
}

async function fetchShopifyProductsBySKUs(skus) {
  const allProducts = [];
  const batchSize = 250; // Shopify's limit

  // Process SKUs in batches
  for (let i = 0; i < skus.length; i += batchSize) {
    const batchSkus = skus.slice(i, i + batchSize);
    const skuQuery = batchSkus.map(sku => `sku:${sku}`).join(' OR ');
    
    try {
      const response = await runQuery(GET_PRODUCTS_BY_SKUS, { 
        skus: skuQuery,
        first: batchSize 
      });
      
      if (response.products?.edges) {
        allProducts.push(...response.products.edges.map(e => e.node));
      }
    } catch (error) {
      console.error(chalk.red('Error fetching products from Shopify:'), error);
    }
  }

  return allProducts;
}

export async function updateProductTracking(configId, sku, shopifyProductId, shopifyVariantId, erpData) {
  const { rows } = await query(
    `INSERT INTO products (config_id, sku, shopify_product_id, shopify_variant_id, erp_data, last_synced_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (config_id, sku)
     DO UPDATE SET 
       shopify_product_id = $3,
       shopify_variant_id = $4,
       erp_data = $5,
       last_synced_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [configId, sku, shopifyProductId, shopifyVariantId, JSON.stringify(erpData)]
  );
  return rows[0];
}

export async function removeProductTracking(configId, sku) {
  await query(
    'DELETE FROM products WHERE config_id = $1 AND sku = $2',
    [configId, sku]
  );
} 