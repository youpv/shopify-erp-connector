export function mapProduct(product, config) {
  const mapping = config.mapping || {};
  const metafieldMappings = config.metafield_mappings || config.metafieldMappings || [];

  const result = { productData: {}, variantData: {}, metafields: [] };

  for (const [shopField, erpField] of Object.entries(mapping)) {
    const value = product[erpField];
    if (value === undefined) continue;
    if (shopField.startsWith('variant.')) {
      result.variantData[shopField.replace('variant.', '')] = value;
    } else {
      result.productData[shopField] = value;
    }
  }

  for (const m of metafieldMappings) {
    const value = product[m.sourceKey];
    
    // Skip if value is null, undefined, or empty
    if (value === undefined || value === null || value === '') continue;
    
    // Skip if key is invalid (null, undefined, empty, or too short)
    if (!m.metafieldKey || m.metafieldKey.length < 2) continue;
    
    // Format the value based on the metafield type
    let formattedValue;
    if (m.metafieldType && m.metafieldType.includes('list.')) {
      // For list types, we need to format as JSON array
      if (typeof value === 'string' && value.includes(',')) {
        // Split comma-separated values into array
        formattedValue = JSON.stringify(value.split(',').map(v => v.trim()));
      } else if (Array.isArray(value)) {
        // Already an array
        formattedValue = JSON.stringify(value);
      } else {
        // Single value, wrap in array
        formattedValue = JSON.stringify([String(value)]);
      }
    } else if (typeof value === 'object' && value !== null) {
      // For objects, stringify them
      formattedValue = JSON.stringify(value);
    } else {
      // For simple types, convert to string
      formattedValue = String(value);
    }
    
    // Final validation - skip if formatted value is empty
    if (!formattedValue || formattedValue === 'null' || formattedValue === 'undefined') continue;
    
    result.metafields.push({
      namespace: m.metafieldNamespace || 'custom',
      key: m.metafieldKey,
      value: formattedValue,
      type: m.metafieldType || 'single_line_text_field'
    });
  }

  if (result.metafields.length) {
    result.productData.metafields = result.metafields;
  }
  return result;
}
