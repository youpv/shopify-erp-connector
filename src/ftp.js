import ftp from 'basic-ftp';
import { query } from './db.js';

async function getDefaultConfig() {
  const { rows } = await query('SELECT host, username, password, port, timeout FROM ftp_config LIMIT 1');
  if (!rows[0]) throw new Error('FTP configuration not found');
  const row = rows[0];
  return {
    host: row.host,
    user: row.username,
    password: row.password,
    port: row.port || 21,
    timeout: row.timeout || 30000
  };
}

export async function fetchJson(filePath, customConfig = null) {
  const config = customConfig || await getDefaultConfig();
  const client = new ftp.Client(config.timeout);
  try {
    await client.access(config);
    const buffer = await client.downloadToBuffer(filePath);
    return JSON.parse(buffer.toString());
  } finally {
    client.close();
  }
}

export { getDefaultConfig };
