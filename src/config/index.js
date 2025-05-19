require('dotenv').config();

module.exports = {
  port: process.env.PORT,
  shopify: {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecret: process.env.SHOPIFY_API_SECRET,
    hostName: process.env.SHOPIFY_SHOP_HOST_NAME,
    scopes: process.env.SHOPIFY_API_SCOPES ? process.env.SHOPIFY_API_SCOPES.split(',') : [], // Parse scopes into an array
    apiVersion: process.env.SHOPIFY_API_VERSION,
    isCustomStoreApp: true, // Assuming this is a custom app
    hostScheme: 'https',
    adminApiAccessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
  },
  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
  },
  ftp: {
    host: process.env.FTP_HOST,
    user: process.env.FTP_USER,
    password: process.env.FTP_PASSWORD,
    port: parseInt(process.env.FTP_PORT, 10),
  }
}; 