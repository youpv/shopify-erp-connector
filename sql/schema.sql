-- Create product_sync_configs table
CREATE TABLE IF NOT EXISTS product_sync_configs (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  connection_type VARCHAR(50) NOT NULL,
  credentials JSONB NOT NULL,
  mapping JSONB NOT NULL,
  metafield_mappings JSONB NOT NULL,
  sync_frequency VARCHAR(10) NOT NULL DEFAULT '24',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create sync_logs table to track sync operations
CREATE TABLE IF NOT EXISTS sync_logs (
  id SERIAL PRIMARY KEY,
  config_id VARCHAR(50) REFERENCES product_sync_configs(id) ON DELETE CASCADE,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  status VARCHAR(50) NOT NULL,
  message TEXT,
  items_processed INTEGER DEFAULT 0,
  items_succeeded INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index on config_id for faster queries
CREATE INDEX IF NOT EXISTS idx_sync_logs_config_id ON sync_logs(config_id);

-- Create index on status for faster queries
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);

-- For development/testing only
-- Create FTP configuration table
CREATE TABLE IF NOT EXISTS ftp_config (
  id SERIAL PRIMARY KEY,
  host VARCHAR(255) NOT NULL,
  username VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  port INTEGER DEFAULT 21,
  timeout INTEGER, -- Timeout in milliseconds
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
); 