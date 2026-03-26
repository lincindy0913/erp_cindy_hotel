/**
 * Lightweight request body validation utility.
 * Validates shape, types, and constraints without heavy dependencies like zod.
 *
 * Usage:
 *   const { ok, data, error } = validateBody(body, {
 *     email:    { type: 'string', required: true, maxLength: 255 },
 *     password: { type: 'string', required: true, minLength: 8, maxLength: 128 },
 *     name:     { type: 'string', required: true, maxLength: 100 },
 *     roleIds:  { type: 'array', itemType: 'number' },
 *     isActive: { type: 'boolean' },
 *     amount:   { type: 'number', min: 0, max: 999999999 },
 *   });
 */

const MAX_STRING_DEFAULT = 10000;
const MAX_ARRAY_DEFAULT = 1000;

/**
 * @param {object} body - parsed JSON body
 * @param {object} schema - field definitions
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
function validateBody(body, schema) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: '請求內容格式錯誤' };
  }

  const cleaned = {};
  const allowedKeys = new Set(Object.keys(schema));

  for (const [field, rules] of Object.entries(schema)) {
    const value = body[field];

    // Required check
    if (rules.required && (value === undefined || value === null || value === '')) {
      return { ok: false, error: `缺少必要欄位: ${field}` };
    }

    // Skip optional missing fields
    if (value === undefined || value === null) {
      if (rules.required) {
        return { ok: false, error: `缺少必要欄位: ${field}` };
      }
      cleaned[field] = value;
      continue;
    }

    // Type check
    if (rules.type === 'string') {
      if (typeof value !== 'string') {
        return { ok: false, error: `${field} 必須為字串` };
      }
      const maxLen = rules.maxLength || MAX_STRING_DEFAULT;
      if (value.length > maxLen) {
        return { ok: false, error: `${field} 長度超過上限 (${maxLen})` };
      }
      if (rules.minLength && value.length < rules.minLength) {
        return { ok: false, error: `${field} 長度至少 ${rules.minLength} 字元` };
      }
      if (rules.pattern && !rules.pattern.test(value)) {
        return { ok: false, error: `${field} 格式不正確` };
      }
      cleaned[field] = value;
    } else if (rules.type === 'number') {
      const num = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(num)) {
        return { ok: false, error: `${field} 必須為數字` };
      }
      if (rules.min !== undefined && num < rules.min) {
        return { ok: false, error: `${field} 不得小於 ${rules.min}` };
      }
      if (rules.max !== undefined && num > rules.max) {
        return { ok: false, error: `${field} 不得大於 ${rules.max}` };
      }
      if (rules.integer && !Number.isInteger(num)) {
        return { ok: false, error: `${field} 必須為整數` };
      }
      cleaned[field] = num;
    } else if (rules.type === 'boolean') {
      if (typeof value !== 'boolean') {
        return { ok: false, error: `${field} 必須為布林值` };
      }
      cleaned[field] = value;
    } else if (rules.type === 'array') {
      if (!Array.isArray(value)) {
        return { ok: false, error: `${field} 必須為陣列` };
      }
      const maxItems = rules.maxItems || MAX_ARRAY_DEFAULT;
      if (value.length > maxItems) {
        return { ok: false, error: `${field} 超過最大項目數 (${maxItems})` };
      }
      if (rules.itemType) {
        const invalidItem = value.find(item => typeof item !== rules.itemType);
        if (invalidItem !== undefined) {
          return { ok: false, error: `${field} 陣列中包含非 ${rules.itemType} 型別的項目` };
        }
      }
      cleaned[field] = value;
    } else if (rules.type === 'object') {
      if (typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, error: `${field} 必須為物件` };
      }
      cleaned[field] = value;
    } else if (rules.type === 'enum') {
      if (!rules.values || !rules.values.includes(value)) {
        return { ok: false, error: `${field} 值不在允許範圍內` };
      }
      cleaned[field] = value;
    }
  }

  // Strip unknown fields — only keep fields defined in schema
  // Pass through any field from body that is in the schema
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      // Silently drop unknown fields for security
      continue;
    }
  }

  return { ok: true, data: cleaned };
}

module.exports = { validateBody };
