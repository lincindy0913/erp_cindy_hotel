/**
 * Safe numeric parsing utilities — returns validated numbers or throws/returns errors.
 * Use these instead of raw parseInt/parseFloat to prevent NaN from reaching the database.
 */

// Max value for Decimal(12,2) columns in the database
const DECIMAL_12_2_MAX = 9999999999.99;

/**
 * Parse an integer, returning null if the input is nullish, or throwing if invalid.
 * @param {*} value - The value to parse
 * @param {string} fieldName - Field name for error messages
 * @returns {number|null}
 */
function safeInt(value, fieldName = 'value') {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  if (Number.isNaN(n) || !Number.isFinite(n)) {
    throw new Error(`VALIDATION:${fieldName} 必須為有效整數`);
  }
  return n;
}

/**
 * Parse a required integer (null not allowed).
 */
function requireInt(value, fieldName = 'value') {
  const n = safeInt(value, fieldName);
  if (n === null) throw new Error(`VALIDATION:${fieldName} 為必填`);
  return n;
}

/**
 * Parse a float, returning null if the input is nullish, or throwing if invalid.
 * @param {*} value
 * @param {string} fieldName
 * @param {Object} [opts]
 * @param {number} [opts.min] - Minimum allowed value
 * @param {number} [opts.max] - Maximum allowed value
 * @returns {number|null}
 */
function safeFloat(value, fieldName = 'value', opts = {}) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isNaN(n) || !Number.isFinite(n)) {
    throw new Error(`VALIDATION:${fieldName} 必須為有效數字`);
  }
  if (opts.min !== undefined && n < opts.min) {
    throw new Error(`VALIDATION:${fieldName} 不可小於 ${opts.min}`);
  }
  if (opts.max !== undefined && n > opts.max) {
    throw new Error(`VALIDATION:${fieldName} 不可大於 ${opts.max}`);
  }
  return n;
}

/**
 * Parse a required float (null not allowed).
 */
function requireFloat(value, fieldName = 'value', opts = {}) {
  const n = safeFloat(value, fieldName, opts);
  if (n === null) throw new Error(`VALIDATION:${fieldName} 為必填`);
  return n;
}

/**
 * Parse a monetary/decimal value with Decimal(12,2) max enforcement.
 * Returns null if nullish, throws if NaN/overflow.
 * @param {*} value
 * @param {string} fieldName
 * @param {Object} [opts]
 * @param {number} [opts.min] - Minimum (default: no min)
 * @param {number} [opts.max] - Maximum (default: DECIMAL_12_2_MAX)
 * @returns {number|null}
 */
function safeMoney(value, fieldName = 'amount', opts = {}) {
  const effectiveMax = opts.max !== undefined ? opts.max : DECIMAL_12_2_MAX;
  return safeFloat(value, fieldName, { ...opts, max: effectiveMax });
}

/**
 * Parse a required monetary value (null not allowed).
 */
function requireMoney(value, fieldName = 'amount', opts = {}) {
  const n = safeMoney(value, fieldName, opts);
  if (n === null) throw new Error(`VALIDATION:${fieldName} 為必填`);
  return n;
}

module.exports = { safeInt, requireInt, safeFloat, requireFloat, safeMoney, requireMoney, DECIMAL_12_2_MAX };
