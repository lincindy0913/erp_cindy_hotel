import fs from 'fs';
import path from 'path';
import Link from 'next/link';

export const metadata = { title: '使用說明手冊 — ERP 系統' };

// ── Markdown → HTML (no external deps) ────────────────────────────────────

function headingToId(text) {
  return text
    .toLowerCase()
    .replace(/[^一-鿿㐀-䶿\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function fmtInline(text) {
  return text
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-red-700 px-1 rounded text-sm font-mono">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 underline hover:text-blue-800">$1</a>');
}

function parseTable(tableLines) {
  if (tableLines.length < 2) return '';
  const splitRow = (row) => row.split('|').slice(1, -1).map(c => c.trim());
  const headers = splitRow(tableLines[0]);
  const body = tableLines.slice(2);
  const thead = `<tr>${headers.map(h => `<th class="px-3 py-2 text-left text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-200">${fmtInline(h)}</th>`).join('')}</tr>`;
  const tbody = body.map(row => {
    const cells = splitRow(row);
    return `<tr class="even:bg-gray-50">${cells.map(c => `<td class="px-3 py-2 text-sm border border-gray-200">${fmtInline(c)}</td>`).join('')}</tr>`;
  }).join('');
  return `<div class="overflow-x-auto my-3"><table class="border-collapse border border-gray-200 text-sm w-full"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
}

function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headings
    const hm = line.match(/^(#{1,4})\s(.+)$/);
    if (hm) {
      const level = hm[1].length;
      const text = hm[2];
      const id = headingToId(text);
      const cls = [
        'mt-8 mb-3 font-bold scroll-mt-20',
        level === 1 ? 'text-2xl text-gray-900 border-b-2 border-blue-200 pb-2' :
        level === 2 ? 'text-xl text-blue-800 border-b border-blue-100 pb-1' :
        level === 3 ? 'text-base text-gray-800' :
        'text-sm text-gray-700 font-semibold',
      ].join(' ');
      out.push(`<h${level} id="${id}" class="${cls}">${fmtInline(text)}</h${level}>`);
      i++; continue;
    }

    // HR
    if (/^---+$/.test(line.trim())) {
      out.push('<hr class="my-6 border-gray-200">');
      i++; continue;
    }

    // Table (collect consecutive | lines)
    if (line.startsWith('|')) {
      const tbl = [];
      while (i < lines.length && lines[i].startsWith('|')) { tbl.push(lines[i]); i++; }
      out.push(parseTable(tbl));
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      out.push(`<blockquote class="border-l-4 border-blue-300 bg-blue-50 px-4 py-2 my-2 text-sm text-blue-800 italic">${fmtInline(line.slice(2))}</blockquote>`);
      i++; continue;
    }

    // Unordered list (collect consecutive)
    if (/^[-*] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(`<li class="ml-4 list-disc text-sm text-gray-700">${fmtInline(lines[i].replace(/^[-*] /, ''))}</li>`);
        i++;
      }
      out.push(`<ul class="my-2 space-y-1">${items.join('')}</ul>`);
      continue;
    }

    // Numbered list
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(`<li class="ml-4 list-decimal text-sm text-gray-700">${fmtInline(lines[i].replace(/^\d+\. /, ''))}</li>`);
        i++;
      }
      out.push(`<ol class="my-2 space-y-1">${items.join('')}</ol>`);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      out.push('<div class="my-1"></div>');
      i++; continue;
    }

    // Paragraph
    out.push(`<p class="text-sm text-gray-700 leading-relaxed">${fmtInline(line)}</p>`);
    i++;
  }

  return out.join('\n');
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function ManualPage() {
  const filePath = path.join(process.cwd(), 'docs', 'USER_MANUAL.md');
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    content = '# 找不到手冊檔案\n\n請確認 `docs/USER_MANUAL.md` 存在。';
  }

  const html = mdToHtml(content);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm">← 返回首頁</Link>
            <span className="text-gray-300">|</span>
            <span className="text-sm font-semibold text-gray-700">使用說明手冊</span>
          </div>
          <a href="#二十三常見問題-faq" className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            常見問題 FAQ
          </a>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div
          className="bg-white rounded-xl shadow-sm border border-gray-100 px-8 py-6"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600">← 返回系統</Link>
        </div>
      </div>
    </div>
  );
}
