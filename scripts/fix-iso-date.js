#!/usr/bin/env node
/**
 * fix-iso-date.js
 * Replaces timezone-unsafe new Date().toISOString().split/slice patterns
 * with timezone-safe todayStr() / localDateStr() helpers.
 *
 * Three passes per file:
 *   A  new Date().toISOString().[split/slice/substring → YYYY-MM-DD]  →  todayStr()
 *   B  new Date().toISOString().slice(0,7)                            →  todayStr().slice(0, 7)
 *   C  <ident>.toISOString().[split/slice → YYYY-MM-DD]              →  localDateStr(<ident>)
 *
 * After replacements, ensures the file imports todayStr / localDateStr from @/lib/localDate.
 */

const fs   = require('fs');
const path = require('path');

const APP_DIR = path.join(__dirname, '..', 'app');

function collectFiles(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      collectFiles(full, results);
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

// ── regex helpers ──────────────────────────────────────────────────────────────
// Matches the "date extraction" suffix: .split('T')[0] or .slice(0,10) or .substring(0,10)
const DATE_SUFFIX = String.raw`(?:\.split\('T'\)\[0\]|\.slice\(0,\s*10\)|\.substring\(0,\s*10\))`;
// Same but also matches .slice(0,7) for year-month
const MONTH_SUFFIX = String.raw`\.slice\(0,\s*7\)`;

// Pass A: new Date() → todayStr()
const RE_TODAY = new RegExp(
  String.raw`new\s+Date\(\)\.toISOString\(\)` + DATE_SUFFIX,
  'g'
);

// Pass B: new Date() month → todayStr().slice(0, 7)
const RE_MONTH = new RegExp(
  String.raw`new\s+Date\(\)\.toISOString\(\)` + MONTH_SUFFIX,
  'g'
);

// Pass C: <ident>.toISOString() → localDateStr(<ident>)
// Matches simple identifiers and dotted expressions (e.g. cutoffs.operation)
const RE_VAR = new RegExp(
  String.raw`([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*)` +
  String.raw`\.toISOString\(\)` +
  DATE_SUFFIX,
  'g'
);

// ── import management ─────────────────────────────────────────────────────────
function updateImports(src, needsToday, needsLocal) {
  // Check what's already imported from @/lib/localDate
  const importRe = /import\s*\{([^}]*)\}\s*from\s*['"]@\/lib\/localDate['"]/;
  const match = src.match(importRe);

  if (!match) {
    // No import at all — add one if needed
    const toAdd = [];
    if (needsToday) toAdd.push('todayStr');
    if (needsLocal) toAdd.push('localDateStr');
    if (!toAdd.length) return src;

    // Insert after the last "import ... from '...'" line
    const lastImportMatch = [...src.matchAll(/^import .+ from .+$/gm)].pop();
    if (!lastImportMatch) return src; // can't find import block — skip
    const insertAt = lastImportMatch.index + lastImportMatch[0].length;
    return (
      src.slice(0, insertAt) +
      `\nimport { ${toAdd.join(', ')} } from '@/lib/localDate';` +
      src.slice(insertAt)
    );
  }

  // There is already an import — extend it if missing
  const currentNames = match[1].split(',').map(s => s.trim()).filter(Boolean);
  const toAdd = [];
  if (needsToday && !currentNames.includes('todayStr'))    toAdd.push('todayStr');
  if (needsLocal && !currentNames.includes('localDateStr')) toAdd.push('localDateStr');
  if (!toAdd.length) return src;

  const newNames = [...currentNames, ...toAdd].join(', ');
  return src.replace(importRe, `import { ${newNames} } from '@/lib/localDate'`);
}

// ── process one file ──────────────────────────────────────────────────────────
function processFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  let src = original;
  let usesToday = false;
  let usesLocal = false;

  // Pass A — new Date() → todayStr()
  src = src.replace(RE_TODAY, () => { usesToday = true; return 'todayStr()'; });

  // Pass B — new Date() month → todayStr().slice(0, 7)
  src = src.replace(RE_MONTH, () => { usesToday = true; return 'todayStr().slice(0, 7)'; });

  // Pass C — <ident>.toISOString() → localDateStr(<ident>)
  src = src.replace(RE_VAR, (_, ident) => {
    usesLocal = true;
    return `localDateStr(${ident})`;
  });

  if (src === original) return 0;

  // Fix imports
  src = updateImports(src, usesToday, usesLocal);

  fs.writeFileSync(filePath, src, 'utf8');
  const fixes = (original.match(RE_TODAY) || []).length
              + (original.match(RE_MONTH) || []).length
              + (original.match(RE_VAR)   || []).length;
  return fixes;
}

// ── main ──────────────────────────────────────────────────────────────────────
const files = collectFiles(APP_DIR);
let total = 0;
const changed = [];

for (const f of files) {
  const n = processFile(f);
  if (n > 0) {
    changed.push({ file: path.relative(process.cwd(), f), fixes: n });
    total += n;
  }
}

console.log('\n── fix-iso-date results ──────────────────────────────');
for (const { file, fixes } of changed.sort((a,b) => b.fixes - a.fixes)) {
  console.log(`  ${String(fixes).padStart(3)}  ${file}`);
}
console.log(`\n  Total: ${total} replacements in ${changed.length} files`);
console.log('──────────────────────────────────────────────────────\n');
