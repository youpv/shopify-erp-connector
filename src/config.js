import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  shopify: {
    shop: process.env.SHOPIFY_SHOP,
    version: process.env.SHOPIFY_API_VERSION || '2023-10',
    token: process.env.SHOPIFY_ACCESS_TOKEN
  }
};
