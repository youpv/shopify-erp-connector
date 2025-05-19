const { Pool } = require('pg');
const appConfig = require('./index');

const pool = new Pool({
  user: appConfig.database.user,
  host: appConfig.database.host,
  database: appConfig.database.name,
  password: appConfig.database.password,
  port: appConfig.database.port,
  ssl: {
    require: true,
    rejectUnauthorized: false // You might want to set this to true in production
  }
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL database!');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(), // For transactions
}; 