/**
 * 敏感欄位加密/解密工具
 * 使用 AES-256-GCM 對資料庫中的敏感欄位進行加解密
 *
 * 環境變數: FIELD_ENCRYPTION_KEY (64 hex chars = 32 bytes)
 *
 * 加密格式: enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM recommended IV size
const PREFIX = 'enc:v1:';

let _key = null;
let _warned = false;

function getKey() {
  if (_key !== null) return _key;

  const keyHex = process.env.FIELD_ENCRYPTION_KEY;
  if (!keyHex) {
    if (!_warned) {
      console.warn('[field-encryption] FIELD_ENCRYPTION_KEY 未設定，敏感欄位將以明文儲存');
      _warned = true;
    }
    _key = false;
    return false;
  }

  if (keyHex.length !== 64) {
    if (!_warned) {
      console.warn(`[field-encryption] FIELD_ENCRYPTION_KEY 長度不正確（需要 64 hex chars，實際 ${keyHex.length}），加密功能已停用`);
      _warned = true;
    }
    _key = false;
    return false;
  }

  _key = Buffer.from(keyHex, 'hex');
  return _key;
}

/**
 * 加密明文字串
 * @param {string|null} plaintext - 要加密的明文
 * @returns {string|null} - 加密後的字串，或原文（若加密未啟用）
 */
export function encryptField(plaintext) {
  if (!plaintext) return plaintext;

  const key = getKey();
  if (!key) return plaintext; // No key → store as plaintext (graceful degradation)

  // Don't double-encrypt
  if (plaintext.startsWith(PREFIX)) return plaintext;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * 解密密文字串
 * @param {string|null} ciphertext - 加密後的字串
 * @returns {string|null} - 解密後的明文
 */
export function decryptField(ciphertext) {
  if (!ciphertext) return ciphertext;

  // Not encrypted → return as-is
  if (!ciphertext.startsWith(PREFIX)) return ciphertext;

  const key = getKey();
  if (!key) {
    console.error('[field-encryption] 嘗試解密但 FIELD_ENCRYPTION_KEY 未設定或無效');
    return null;
  }

  try {
    const payload = ciphertext.slice(PREFIX.length);
    const parts = payload.split(':');
    if (parts.length !== 3) {
      console.error('[field-encryption] 加密格式無效');
      return null;
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[field-encryption] 解密失敗:', err.message);
    return null;
  }
}

/**
 * 批量加密多個欄位
 * @param {object} data - 包含待加密欄位的物件
 * @param {string[]} fields - 需要加密的欄位名稱清單
 * @returns {object} - 加密後的物件（淺拷貝）
 */
export function encryptFields(data, fields) {
  const result = { ...data };
  for (const field of fields) {
    if (result[field] !== undefined && result[field] !== null) {
      result[field] = encryptField(result[field]);
    }
  }
  return result;
}

/**
 * 批量解密多個欄位
 * @param {object} data - 包含密文欄位的物件
 * @param {string[]} fields - 需要解密的欄位名稱清單
 * @returns {object} - 解密後的物件（淺拷貝）
 */
export function decryptFields(data, fields) {
  if (!data) return data;
  const result = { ...data };
  for (const field of fields) {
    if (result[field] !== undefined && result[field] !== null) {
      result[field] = decryptField(result[field]);
    }
  }
  return result;
}
