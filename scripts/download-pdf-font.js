/**
 * 下載 Noto Sans TC 字型供傳票 PDF 使用（避免中文亂碼）
 * 執行一次即可：node scripts/download-pdf-font.js
 * 或 npm run download-pdf-font
 *
 * 字型來源：Google Fonts (github.com/google/fonts)
 */

const fs = require('fs');
const path = require('path');

const FONT_DIR = path.join(process.cwd(), 'lib', 'fonts');
const FONT_PATH = path.join(FONT_DIR, 'NotoSansTC-Regular.ttf');
const FONT_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf';

async function download() {
  if (fs.existsSync(FONT_PATH)) {
    console.log('Already exists:', FONT_PATH);
    return;
  }
  if (!fs.existsSync(FONT_DIR)) {
    fs.mkdirSync(FONT_DIR, { recursive: true });
  }
  console.log('Downloading Noto Sans TC from Google Fonts...');
  const res = await fetch(FONT_URL);
  if (!res.ok) {
    console.warn('Download failed:', res.status, res.statusText);
    console.warn('Please download Noto Sans TC from https://fonts.google.com/noto/specimen/Noto+Sans+TC');
    console.warn('and save as lib/fonts/NotoSansTC-Regular.ttf');
    return;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(FONT_PATH, buf);
  console.log('Saved:', FONT_PATH, '(' + (buf.length / 1024 / 1024).toFixed(2) + ' MB)');
}

download().catch((e) => {
  console.error(e);
  process.exit(1);
});
