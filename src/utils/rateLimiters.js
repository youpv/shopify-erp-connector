const pLimit = require('p-limit').default;

/**
 * Rate limiter for Shopify API calls
 * Shopify has a general rate limit of 2 requests per second but allows for bursts
 * Using a concurrency limit of 5 gives decent performance while staying within limits
 */
const shopifyApiLimiter = pLimit(5);

/**
 * Rate limiter for FTP operations
 * FTP connections should be limited to avoid overwhelming the server
 */
const ftpLimiter = pLimit(2);

/**
 * Rate limiter for database operations
 * Helps to prevent excessive concurrent database operations
 */
const dbLimiter = pLimit(10);

module.exports = {
  shopifyApiLimiter,
  ftpLimiter,
  dbLimiter,
}; 