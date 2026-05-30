/**
 * 通用列印輔助：開新視窗並渲染 HTML 表格後自動列印
 * @param {string}   title   - 報表標題
 * @param {string[]} headers - 欄位標頭
 * @param {any[][]}  rows    - 資料列（每列為陣列）
 * @param {string}   [footer] - 自訂頁尾文字（預設 ERP 系統名稱）
 */
export function openPrintWindow(title, headers, rows, footer) {
  const thHtml = headers.map(h => `<th>${h}</th>`).join('');
  const trHtml = rows.map(r =>
    `<tr>${r.map(c => `<td>${c ?? ''}</td>`).join('')}</tr>`
  ).join('');
  const html = `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8">
<title>${title}</title>
<style>
  body { font-family: '微軟正黑體','Arial',sans-serif; font-size:11px; margin:12px; }
  h2 { font-size:14px; margin-bottom:6px; }
  p.sub { font-size:10px; color:#666; margin-bottom:8px; }
  table { border-collapse:collapse; width:100%; }
  th,td { border:1px solid #ccc; padding:4px 6px; white-space:nowrap; }
  th { background:#e8edf8; font-weight:bold; text-align:center; }
  td { text-align:right; }
  td:first-child,td:nth-child(2) { text-align:left; }
  tr:nth-child(even) { background:#f8f9fc; }
  .footer { margin-top:8px; font-size:9px; color:#aaa; }
</style></head><body>
<h2>${title}</h2>
<p class="sub">列印時間：${new Date().toLocaleString('zh-TW')}</p>
<table><thead><tr>${thHtml}</tr></thead><tbody>${trHtml}</tbody></table>
<p class="footer">${footer || '自在海 ERP 系統'}</p>
</body></html>`;
  const w = window.open('', '_blank', 'width=1100,height=700');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.addEventListener('load', () => w.print());
  return true;
}
