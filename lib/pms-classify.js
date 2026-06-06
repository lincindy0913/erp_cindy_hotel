/**
 * PMS 訂房來源分類邏輯 (shared, used by batches & reclassify routes)
 * @param {object} row          - 訂房 row（含 companyName, discountName, roomType, source, bookingRef）
 * @param {Set<string>} agencyNames - 已知代訂中心公司名稱集合
 * @returns {string} source label
 */
export function classifySource(row, agencyNames = new Set()) {
  const company    = (row.companyName  || '').trim();
  const discount   = (row.discountName || '').trim();
  const roomType   = (row.roomType     || '').trim();
  const bookingRef = (row.bookingRef   || '').trim();

  // parse-excel 已做過詳細偵測時直接採用（非預設值才信任）
  if (row.source && row.source !== '電話') return row.source;

  if (roomType === '團體') return '團體';

  // ── 以公司名稱判斷 OTA ──
  const c = company.toLowerCase();

  if (/agoda/.test(c))                              return 'OTA-Agoda';
  if (/booking\.com|booking com/.test(c))           return 'OTA-Booking';
  if (/expedia/.test(c))                            return 'OTA-Expedia';
  if (/airbnb/.test(c))                             return 'OTA-Airbnb';
  if (/易遊網|eztravel|ez\s*travel/.test(c))        return 'OTA-易遊網';
  if (/momo|富邦媒/.test(c))                        return 'OTA-MOMO';
  if (/klook/.test(c))                              return 'OTA-Klook';
  if (/kkday/.test(c))                              return 'OTA-KKday';
  if (/雄獅|lion\s*travel/.test(c))                 return 'OTA-雄獅';
  if (/可樂旅遊|colla/.test(c))                     return 'OTA-可樂旅遊';
  if (/lifetour|鳳凰/.test(c))                      return 'OTA-鳳凰';
  if (/hotels\.com|hotelscom/.test(c))              return 'OTA-Hotels.com';
  if (/trip\.com|ctrip|攜程/.test(c))               return 'OTA-Trip.com';
  if (/trivago/.test(c))                            return 'OTA-Trivago';
  if (/google\s*hotel/.test(c))                     return 'OTA-Google';
  if (/易/.test(c) && /網/.test(c))                 return 'OTA-易遊網'; // 易遊網模糊比對

  // ── 月租 / 長期住宿 ──
  if (/月租|月結|包棟|長住|長期/.test(c))             return '月租';
  if (/月租/.test(discount))                        return '月租';

  // ── 現場 / 直接訂房 ──
  if (/現場|walk.?in|散客|直客|一般散客/.test(c))   return '現場';
  if (/官網|直訂|直接訂/.test(c))                    return '官網直訂';

  // ── 折扣名稱 / 來源編號輔助判斷 ──
  const d = discount.toLowerCase();
  if (/booking/i.test(d) || /NET-/i.test(discount)) return 'OTA-Booking';
  if (/agoda/i.test(d))                             return 'OTA-Agoda';
  if (/expedia/i.test(d))                           return 'OTA-Expedia';

  // ── bookingRef 前綴輔助判斷 ──
  if (/^bj\d/i.test(bookingRef))                    return 'OTA-Booking'; // BJ88201280
  if (/agoda/i.test(bookingRef))                    return 'OTA-Agoda';

  // ── 代訂中心（已知旅行社名稱）──
  if (agencyNames.has(company))                     return '代訂中心';

  return '電話';
}
