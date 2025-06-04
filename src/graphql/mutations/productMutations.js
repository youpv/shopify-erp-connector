/**
 * GraphQL mutations for Shopify products and bulk operations
 */

// Mutation to create a staged upload (required for bulk operations)
const STAGED_UPLOADS_CREATE = `
  mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Mutation to run a bulk operation for the query
const BULK_OPERATION_RUN_QUERY = `
  mutation bulkOperationRunQuery($query: String!) {
    bulkOperationRunQuery(query: $query) {
      bulkOperation {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Mutation to run a bulk operation for mutations (bulk product creation/update)
const BULK_OPERATION_RUN_MUTATION = `
  mutation bulkOperationRunMutation($mutation: String!, $stagedUploadPath: String!) {
    bulkOperationRunMutation(
      mutation: $mutation,
      stagedUploadPath: $stagedUploadPath
    ) {
      bulkOperation {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Mutation to cancel a bulk operation
const BULK_OPERATION_CANCEL = `
  mutation bulkOperationCancel($id: ID!) {
    bulkOperationCancel(id: $id) {
      bulkOperation {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Mutation to create a product
const CREATE_PRODUCT = `
  mutation productCreate($input: ProductInput!) {
    productCreate(input: $input) {
      product {
        id
        title
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Mutation to update a product
const UPDATE_PRODUCT = `
  mutation productUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        title
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Simplified mutation for bulk product creation
const BULK_CREATE_PRODUCT = `
  mutation productCreate($input: ProductInput!) {
    productCreate(input: $input) {
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

// Simplified mutation for bulk product update
const BULK_UPDATE_PRODUCT = `
  mutation productUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
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

// Simplified mutation for bulk product creation using productSet
const BULK_PRODUCT_SET = `
  mutation call($input: ProductInput!) {
    productCreate(input: $input) {
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

// Mutation template for bulk operations with productSet
const BULK_PRODUCT_SET_MUTATION = `
  mutation call($input: ProductInput!) {
    productCreate(input: $input) {
      product {
        id
        variants(first: 1) {
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

// Mutation template for bulk operations with productVariantsBulkCreate
const BULK_VARIANTS_CREATE = `
  mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants {
        id
        sku
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Mutation to delete a product
const DELETE_PRODUCT = `
  mutation productDelete($input: ProductDeleteInput!) {
    productDelete(input: $input) {
      deletedProductId
      userErrors {
        field
        message
      }
    }
  }
`;

module.exports = {
  STAGED_UPLOADS_CREATE,
  BULK_OPERATION_RUN_QUERY,
  BULK_OPERATION_RUN_MUTATION,
  BULK_OPERATION_CANCEL,
  CREATE_PRODUCT,
  UPDATE_PRODUCT,
  BULK_CREATE_PRODUCT,
  BULK_UPDATE_PRODUCT,
  BULK_PRODUCT_SET,
  BULK_PRODUCT_SET_MUTATION,
  BULK_VARIANTS_CREATE,
  DELETE_PRODUCT
}; 