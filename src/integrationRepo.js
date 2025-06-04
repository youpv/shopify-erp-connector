import { query } from './db.js';

export async function listConfigs() {
  const { rows } = await query('SELECT * FROM product_sync_configs ORDER BY created_at');
  return rows;
}

export async function getConfig(id) {
  const { rows } = await query('SELECT * FROM product_sync_configs WHERE id=$1', [id]);
  return rows[0] || null;
}

export async function createConfig(data) {
  const { id, name, connection_type, credentials, mapping, metafield_mappings, sync_frequency } = data;
  const { rows } = await query(
    `INSERT INTO product_sync_configs (id, name, connection_type, credentials, mapping, metafield_mappings, sync_frequency)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id, name, connection_type, JSON.stringify(credentials || {}), JSON.stringify(mapping || {}), JSON.stringify(metafield_mappings || []), sync_frequency || '24']
  );
  return rows[0];
}

export async function updateConfig(id, data) {
  const fields = [];
  const params = [];
  let i = 1;
  if (data.name !== undefined) { fields.push(`name=$${i++}`); params.push(data.name); }
  if (data.connection_type !== undefined) { fields.push(`connection_type=$${i++}`); params.push(data.connection_type); }
  if (data.credentials !== undefined) { fields.push(`credentials=$${i++}`); params.push(JSON.stringify(data.credentials)); }
  if (data.mapping !== undefined) { fields.push(`mapping=$${i++}`); params.push(JSON.stringify(data.mapping)); }
  if (data.metafield_mappings !== undefined) { fields.push(`metafield_mappings=$${i++}`); params.push(JSON.stringify(data.metafield_mappings)); }
  if (data.sync_frequency !== undefined) { fields.push(`sync_frequency=$${i++}`); params.push(data.sync_frequency); }
  fields.push(`updated_at=NOW()`);
  const queryStr = `UPDATE product_sync_configs SET ${fields.join(', ')} WHERE id=$${i} RETURNING *`;
  params.push(id);
  const { rows } = await query(queryStr, params);
  return rows[0] || null;
}

export async function deleteConfig(id) {
  const { rowCount } = await query('DELETE FROM product_sync_configs WHERE id=$1', [id]);
  return rowCount > 0;
}
