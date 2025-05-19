require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Create a new pool with the connection string
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false
  }
});

async function setupDatabase() {
  let client;
  try {
    // Read the schema file
    const schemaPath = path.join(__dirname, '..', 'sql', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('Connecting to database...');
    client = await pool.connect();
    
    console.log('Executing schema...');
    await client.query(schema);
    
    console.log('Database setup completed successfully!');
  } catch (err) {
    console.error('Error setting up database:', err);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

setupDatabase(); 