/**
 * PMS 訂房來源分類邏輯 (shared, used by batches & reclassify routes)
 * @param {object} row  - 訂房 row（含 companyName, discountName, roomType）
 * @param {Set<string>} agencyNames - 已知代訂中心公司名稱集合
 * @returns {string} source label
 */
export function classifySource(row, agencyNames = new Set()) {
  const company  = (row.companyName  || '').trim();
  const discount = (row.discountName || '').trim();
  const roomType = (row.roomType     || '').trim();

  if (roomType === '團體') return '團體';

  // Company name takes priority — check specific OTAs before generic NET- pattern
  if (/agoda/i.test(company))   return 'OTA-Agoda';
  if (/expedia/i.test(company)) return 'OTA-Expedia';
  if (/攜程/.test(company))     return '攜程網';
  if (/易遊/.test(company))     return '易遊網';
  if (/一般散客/.test(company)) return '一般散客';
  if (/月租/.test(company))     return '月租';

  // Generic OTA indicators (NET- prefix / "booking" keyword)
  if (/NET-/i.test(discount) || /booking/i.test(company) || /booking/i.test(discount)) return 'OTA-Booking';
  if (/agoda/i.test(discount))   return 'OTA-Agoda';
  if (/expedia/i.test(discount)) return 'OTA-Expedia';

  if (agencyNames.has(company)) return '代訂中心';
  if (/月租/.test(discount))    return '月租';
  return '電話';
}
