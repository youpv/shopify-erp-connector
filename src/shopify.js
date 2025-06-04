import { GraphQLClient } from 'graphql-request';
import { config } from './config.js';

const endpoint = `https://${config.shopify.shop}/admin/api/${config.shopify.version}/graphql.json`;

export const shopifyClient = new GraphQLClient(endpoint, {
  headers: { 'X-Shopify-Access-Token': config.shopify.token }
});

export async function runQuery(query, variables) {
  return shopifyClient.request(query, variables);
}
