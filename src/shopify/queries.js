export const GET_PRODUCTS_BY_SKUS = `
  query getProductsBySKUs($skus: String!, $first: Int = 250) {
    products(first: $first, query: $skus) {
      edges {
        node {
          id
          title
          handle
          variants(first: 100) {
            edges {
              node {
                id
                sku
                title
                price
                inventoryQuantity
                inventoryItem {
                  id
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const GET_ALL_PRODUCTS = `
  query getAllProducts($first: Int = 250, $after: String) {
    products(first: $first, after: $after) {
      edges {
        node {
          id
          title
          handle
          status
          variants(first: 100) {
            edges {
              node {
                id
                sku
                title
                price
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const BULK_OPERATION_STATUS = `
  query bulkOperationStatus($id: ID!) {
    node(id: $id) {
      ... on BulkOperation {
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
  }
`;

export const CURRENT_BULK_OPERATION = `
  query currentBulkOperation($type: BulkOperationType!) {
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

export const GET_SHOP_LOCATIONS = `
  query getShopLocations($first: Int = 10) {
    locations(first: $first) {
      edges {
        node {
          id
          name
          isActive
          fulfillsOnlineOrders
        }
      }
    }
  }
`; 