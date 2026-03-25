/**
 * Password strength policy — shared across user creation & password change endpoints.
 * Minimum: 8 chars, at least 1 uppercase, 1 lowercase, 1 digit.
 */

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

module.exports = { validatePasswordStrength };
