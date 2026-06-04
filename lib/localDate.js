/**
 * Returns today's date as YYYY-MM-DD using LOCAL timezone.
 * Avoids the UTC midnight shift that toISOString() produces,
 * which causes off-by-one errors between midnight and UTC+offset AM.
 */
export function todayStr() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Formats any Date object as YYYY-MM-DD in local timezone.
 */
export function localDateStr(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Parses a YYYY-MM-DD string as a local-timezone Date (midnight).
 * Avoids UTC interpretation that bare `new Date('YYYY-MM-DD')` produces.
 */
export function parseLocalDate(dateStr) {
  return new Date(dateStr + 'T00:00:00');
}
