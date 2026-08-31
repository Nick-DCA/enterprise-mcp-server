/**
 * Helper to recursively remove undefined key-value pairs from objects
 * to prevent Xero API validation errors caused by explicit undefined/null values.
 */
export function cleanObject<T extends Record<string, any>>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => (typeof item === 'object' && item !== null ? cleanObject(item) : item)) as unknown as T;
  }

  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const nested = cleanObject(value);
        if (Object.keys(nested).length > 0) {
          cleaned[key] = nested;
        }
      } else if (Array.isArray(value)) {
        cleaned[key] = cleanObject(value as any);
      } else {
        cleaned[key] = value;
      }
    }
  }
  return cleaned as T;
}
