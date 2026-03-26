/**
 * Password strength policy — shared across user creation & password change endpoints.
 * Minimum: 8 chars, at least 1 uppercase, 1 lowercase, 1 digit.
 */

const PASSWORD_HISTORY_LIMIT = 5; // Remember last 5 passwords

function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { ok: false, message: '密碼不可為空' };
  }
  if (password.length < 8) {
    return { ok: false, message: '密碼長度至少 8 個字元' };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, message: '密碼須包含至少一個小寫英文字母' };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, message: '密碼須包含至少一個大寫英文字母' };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: '密碼須包含至少一個數字' };
  }
  return { ok: true };
}

/**
 * Check if the new password matches any of the recent password hashes.
 * @param {string} newPassword - plaintext new password
 * @param {string} currentHash - current bcrypt hash
 * @param {string[]} historyHashes - array of recent bcrypt hashes from passwordHistory field
 * @returns {Promise<{ok: boolean, message?: string}>}
 */
async function checkPasswordHistory(newPassword, currentHash, historyHashes) {
  const bcrypt = require('bcryptjs');
  const allHashes = [currentHash, ...(Array.isArray(historyHashes) ? historyHashes : [])].filter(Boolean);

  for (const hash of allHashes) {
    if (await bcrypt.compare(newPassword, hash)) {
      return { ok: false, message: `不可使用最近 ${PASSWORD_HISTORY_LIMIT} 次用過的密碼` };
    }
  }
  return { ok: true };
}

/**
 * Build the updated passwordHistory array after a successful password change.
 * Prepends the old hash and trims to PASSWORD_HISTORY_LIMIT.
 * @param {string} oldHash - the current (soon-to-be-old) password hash
 * @param {string[]} existingHistory - current passwordHistory array
 * @returns {string[]}
 */
function buildUpdatedHistory(oldHash, existingHistory) {
  const history = Array.isArray(existingHistory) ? existingHistory : [];
  return [oldHash, ...history].slice(0, PASSWORD_HISTORY_LIMIT);
}

module.exports = { validatePasswordStrength, checkPasswordHistory, buildUpdatedHistory, PASSWORD_HISTORY_LIMIT };
