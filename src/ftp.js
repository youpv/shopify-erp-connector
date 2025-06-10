import ftp from 'basic-ftp';
import { query } from './db.js';
import { Writable } from 'stream';

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
  
  // Handle both old and new credential field names
  const ftpConfig = {
    host: config.host || config.ftpHost || config.ftp_host,
    user: config.user || config.ftpUser || config.ftp_user || config.username,
    password: config.password || config.ftpPassword || config.ftp_password,
    port: parseInt(config.port || config.ftpPort || config.ftp_port || 21),
    timeout: config.timeout || 30000
  };
  
  console.log(`🔌 Connecting to FTP: ${ftpConfig.host}:${ftpConfig.port} as ${ftpConfig.user}`);
  
  const client = new ftp.Client(ftpConfig.timeout);
  try {
    await client.access(ftpConfig);
    
    // Download to a buffer
    const chunks = [];
    const writable = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(chunk);
        callback();
      }
    });
    
    await client.downloadTo(writable, filePath);
    const buffer = Buffer.concat(chunks);
    return JSON.parse(buffer.toString());
  } finally {
    client.close();
  }
}

export { getDefaultConfig };
