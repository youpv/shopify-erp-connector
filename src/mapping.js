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
    if (value === undefined) continue;
    result.metafields.push({
      namespace: m.metafieldNamespace,
      key: m.metafieldKey,
      value: String(value),
      type: m.metafieldType
    });
  }

  if (result.metafields.length) {
    result.productData.metafields = result.metafields;
  }
  return result;
}
