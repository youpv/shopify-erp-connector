/**
 * GraphQL queries for Shopify products
 */

// Query to get a single product by ID
const GET_PRODUCT_BY_ID = `
  query getProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      description
      descriptionHtml
      productType
      vendor
      status
      tags
      createdAt
      updatedAt
      publishedAt
      images(first: 10) {
        edges {
          node {
            id
            src
            altText
          }
        }
      }
      variants(first: 50) {
        edges {
          node {
            id
            title
            price
            sku
            inventoryQuantity
            barcode
          }
        }
      }
    }
  }
`;

// Query to get all products
const GET_PRODUCTS = `
  query getProducts($first: Int, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          productType
          vendor
          status
          createdAt
          updatedAt
          variants(first: 1) {
            edges {
              node {
                id
                price
                sku
                inventoryQuantity
              }
            }
          }
        }
      }
    }
  }
`;

// Optimized query for looking up products by SKU
const GET_PRODUCTS_BY_SKUS = `
  query getProductsBySKUs($query: String!) {
    products(first: 50, query: $query) {
      edges {
        node {
          id
          title
          handle
          variants(first: 250) {
            edges {
              node {
                id
                sku
                inventoryQuantity
              }
            }
          }
        }
      }
    }
  }
`;

// Query to specifically find a product by a single variant SKU
const GET_PRODUCT_BY_VARIANT_SKU = `
  query getProductByVariantSku($sku: String!) {
    productVariants(first: 1, query: $sku) {
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
`;

// Query to check the status of a bulk operation
const GET_BULK_OPERATION_STATUS = `
  query currentBulkOperation($type: BulkOperationType) {
    currentBulkOperation(type: $type) {
      id
      status
      errorCode
      createdAt
      completedAt
      objectCount
      fileSize
      url
      partialDataUrl
    }
  }
`;

module.exports = { 
  GET_PRODUCT_BY_ID,
  GET_PRODUCTS,
  GET_PRODUCTS_BY_SKUS,
  GET_PRODUCT_BY_VARIANT_SKU,
  GET_BULK_OPERATION_STATUS
}; 