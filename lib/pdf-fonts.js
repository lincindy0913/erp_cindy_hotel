/**
 * CJK font support for jsPDF (傳票/報表列印中文不亂碼)
 * Spec: spec23_print_voucher_v5 — 字型：中文字體（Noto Sans CJK / WenQuanYi）
 *
 * 使用方式：在建立 jsPDF 後呼叫 addCJKFontToDoc(doc)，之後所有 doc.text / autoTable 會使用中文體。
 * 若未放置字型檔，則不註冊，PDF 仍會產生但中文可能為亂碼。
 * 字型檔：執行 node scripts/download-pdf-font.js 或將 NotoSansTC-Regular.ttf 放入 lib/fonts/
 */

const path = require('path');
const fs = require('fs');

const FONT_FILENAME = 'NotoSansTC-Regular.ttf';
const FONT_VFS_NAME = 'NotoSansTC-Regular.ttf';
const FONT_FAMILY = 'NotoSansTC';

let cachedBase64 = null;

function getFontDir() {
  return path.join(process.cwd(), 'lib', 'fonts');
}

/**
 * 取得中文字型 TTF 的 base64，優先讀取 lib/fonts/NotoSansTC-Regular.ttf
 * 若目錄內有任一 .ttf 也會使用（方便自行更名）
 */
function getCJKFontBase64() {
  if (cachedBase64) return cachedBase64;
  try {
    const fontDir = getFontDir();
    const primary = path.join(fontDir, FONT_FILENAME);
    if (fs.existsSync(primary)) {
      const buf = fs.readFileSync(primary);
      cachedBase64 = Buffer.from(buf).toString('base64');
      return cachedBase64;
    }
    if (fs.existsSync(fontDir)) {
      const files = fs.readdirSync(fontDir).filter((f) => f.toLowerCase().endsWith('.ttf'));
      if (files.length > 0) {
        const buf = fs.readFileSync(path.join(fontDir, files[0]));
        cachedBase64 = Buffer.from(buf).toString('base64');
        return cachedBase64;
      }
    }
  } catch (_) {
    // ignore
  }
  return null;
}

/**
 * 為 jsPDF 實例註冊並設定中文字型；若無字型檔則不變更，回傳 false
 * @param {import('jspdf').jsPDF} doc
 * @returns {boolean} 是否已成功設定中文體
 */
function addCJKFontToDoc(doc) {
  const base64 = getCJKFontBase64();
  if (!base64) return false;
  try {
    doc.addFileToVFS(FONT_VFS_NAME, base64);
    doc.addFont(FONT_VFS_NAME, FONT_FAMILY, 'normal');
    doc.addFont(FONT_VFS_NAME, FONT_FAMILY, 'bold');
    doc.setFont(FONT_FAMILY, 'normal');
    return true;
  } catch (e) {
    console.warn('[pdf-fonts] addCJKFontToDoc failed:', e?.message);
    return false;
  }
}

/**
 * 回傳目前使用的中文 font family 名稱；若未載入字型則回傳 null
 */
function getCJKFontFamily() {
  return getCJKFontBase64() ? FONT_FAMILY : null;
}

module.exports = {
  addCJKFontToDoc,
  getCJKFontBase64,
  getCJKFontFamily,
  FONT_FAMILY,
  FONT_FILENAME,
  getFontDir,
};
