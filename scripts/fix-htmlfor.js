#!/usr/bin/env node
/**
 * fix-htmlfor.js
 * Adds htmlFor/id pairs to <label>...<input/select/textarea> patterns
 * that are missing them. Skips labels inside .map() / loop contexts.
 *
 * Usage: node scripts/fix-htmlfor.js
 */

const fs   = require('fs');
const path = require('path');

// ── files to process ──────────────────────────────────────────────────────────
const APP_DIR = path.join(__dirname, '..', 'app');

function collectFiles(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      collectFiles(full, results);
    } else if (/\.(js|jsx)$/.test(entry.name) && entry.name !== 'fix-htmlfor.js') {
      results.push(full);
    }
  }
  return results;
}

// ── helpers ───────────────────────────────────────────────────────────────────
// Returns true if lineIdx is "inside" a row-generating .map() / .forEach()
// by scanning back up to WINDOW lines.
// Excludes .map() calls that render <option> lists (not repeating row loops).
const WINDOW = 6;
function inLoopContext(lines, lineIdx) {
  for (let i = lineIdx - 1; i >= Math.max(0, lineIdx - WINDOW); i--) {
    const l = lines[i];
    if (!/\.(map|flatMap|forEach)\s*\(/.test(l)) continue;
    // Skip if the map result appears to be a one-liner (ends on same line with ))
    if (/\.(map|flatMap|forEach)\s*\([^)]*\)\s*$/.test(l)) continue;
    // Peek at the next 3 lines to detect option-list maps
    const peek = lines.slice(i + 1, i + 4).join(' ');
    if (/<option/.test(l) || /<option/.test(peek)) continue;
    // This looks like a multi-element row loop → we're inside it
    return true;
  }
  return false;
}

// Extract plain-text content of a single-line label (strip JSX expressions)
function labelId(rawText, usedInFile) {
  const text = rawText
    .replace(/\{[^}]*\}/g, '')   // strip JSX expressions
    .replace(/\*|\?/g, '')        // strip * ?
    .trim();

  // Build slug from ASCII characters only (Chinese → skip → use counter fallback)
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 25);

  const base = slug || 'f';
  let candidate = base;
  let n = 2;
  while (usedInFile.has(candidate)) {
    candidate = `${base}-${n++}`;
  }
  usedInFile.add(candidate);
  return candidate;
}

// Adds id="ID" to an input/select/textarea on a given line.
// Handles both "<input type=..." and bare "<input" (end-of-line) cases.
function patchElement(lines, lineIdx, id) {
  const line = lines[lineIdx];
  // Case 1: tag followed by space/> on same line
  if (/<(input|select|textarea)([\s>])/.test(line)) {
    lines[lineIdx] = line.replace(/<(input|select|textarea)([\s>])/, `<$1 id="${id}"$2`);
  } else {
    // Case 2: bare tag at end of line (e.g., just "<input")
    lines[lineIdx] = line.replace(/<(input|select|textarea)\s*$/, `<$1 id="${id}"`);
  }
}

// ── process one file ──────────────────────────────────────────────────────────
function processFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const lines = src.split('\n');
  const usedInFile = new Set();

  // Pre-seed with IDs already present in the file
  for (const l of lines) {
    const m = l.match(/\bid="([^"]+)"/);
    if (m) usedInFile.add(m[1]);
  }

  let fixes = 0;
  let seqCounter = 0;
  function nextSeq() { return `lf-${++seqCounter}`; }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Must contain <label and NOT already have htmlFor
    if (!line.includes('<label') || line.includes('htmlFor')) continue;

    // Skip if inside a loop
    if (inLoopContext(lines, i)) continue;

    // ── PATTERN A: label and input on the SAME line ────────────────────────
    // e.g. <div><label ...>text</label><input ... /></div>
    const sameLine = line.match(/<label([^>]*)>([^<]*)<\/label>([\s\S]*?)<(input|select|textarea)([\s>])/);
    if (sameLine) {
      const [, labelAttrs, rawText,, tagName, afterTag] = sameLine;
      // Skip checkbox/radio wrappers
      if (/flex.*items-center|cursor-pointer/.test(labelAttrs)) continue;
      // Skip if there's already an id on the element that follows
      const afterLabel = line.slice(line.indexOf('</label>') + 8);
      if (/\bid\s*=/.test(afterLabel)) continue;

      const id = labelId(rawText || nextSeq(), usedInFile);
      // Patch: add htmlFor to label (first label on this line)
      lines[i] = lines[i].replace(
        /<label(\s|>)/,
        `<label htmlFor="${id}"$1`
      );
      // Patch: add id to the input/select/textarea that follows on the same line
      // Replace only after </label> to avoid touching the label itself
      const labelEnd = lines[i].indexOf('</label>');
      const before = lines[i].slice(0, labelEnd + 8);
      const after  = lines[i].slice(labelEnd + 8).replace(
        /<(input|select|textarea)([\s>])/,
        `<$1 id="${id}"$2`
      );
      lines[i] = before + after;
      fixes++;
      continue;
    }

    // ── PATTERN B: single-line label: <label ...>text</label> ─────────────
    const singleLine = line.match(/^(\s*)<label([^>]*)>([^<]+)<\/label>\s*$/);
    if (singleLine) {
      const [, , labelAttrs, rawText] = singleLine;
      // Checkbox/radio pattern: label wraps its input → skip
      if (/flex.*items-center|cursor-pointer/.test(labelAttrs)) continue;

      // Look ahead up to 4 lines for <input|<select|<textarea without id
      // Note: [\s>]? handles both "<input type=..." and bare "<input" at end of line
      let targetLine = -1;
      for (let j = i + 1; j <= Math.min(lines.length - 1, i + 4); j++) {
        const next = lines[j];
        if (!next.trim()) continue;
        if (!/<(input|select|textarea)[\s>/]?/.test(next)) break;
        if (/\bid\s*=/.test(next)) break;
        targetLine = j;
        break;
      }
      if (targetLine < 0) continue;

      const id = labelId(rawText, usedInFile);
      lines[i] = lines[i].replace(/<label(\s|>)/, `<label htmlFor="${id}"$1`);
      patchElement(lines, targetLine, id);
      fixes++;
      continue;
    }

    // ── PATTERN C: multiline label (opens on this line, closes later) ─────
    // e.g. <label className="...">\n  text\n</label>\n<input ...>
    const multiOpen = line.match(/^(\s*)<label([^>]*)>\s*$/);
    if (!multiOpen) continue;
    const [, indent, labelAttrs] = multiOpen;
    // Skip checkbox/radio wrappers
    if (/flex.*items-center|cursor-pointer/.test(labelAttrs)) continue;

    // Find closing </label> within next 5 lines
    let closeIdx = -1;
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 5); j++) {
      if (lines[j].includes('</label>')) { closeIdx = j; break; }
    }
    if (closeIdx < 0) continue;

    // Collect label text from lines between open and close
    const rawText = lines.slice(i + 1, closeIdx).map(l => l.trim()).join(' ').replace(/\{[^}]*\}/g, '').trim();

    // Look ahead from closeIdx for input/select/textarea (within 4 lines)
    let targetLine = -1;
    for (let j = closeIdx + 1; j <= Math.min(lines.length - 1, closeIdx + 4); j++) {
      const next = lines[j];
      if (!next.trim()) continue;
      if (!/<(input|select|textarea)[\s>/]?/.test(next)) break;
      if (/\bid\s*=/.test(next)) break;
      targetLine = j;
      break;
    }
    if (targetLine < 0) continue;

    const id = labelId(rawText || nextSeq(), usedInFile);
    lines[i] = lines[i].replace(/<label(\s|>)/, `<label htmlFor="${id}"$1`);
    patchElement(lines, targetLine, id);
    fixes++;
  }

  if (fixes > 0) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  }
  return fixes;
}

// ── main ──────────────────────────────────────────────────────────────────────
const files = collectFiles(APP_DIR);
let totalFixes = 0;
const changed = [];

for (const f of files) {
  const n = processFile(f);
  if (n > 0) {
    changed.push({ file: path.relative(process.cwd(), f), fixes: n });
    totalFixes += n;
  }
}

console.log('\n── fix-htmlfor results ───────────────────────────────');
for (const { file, fixes } of changed) {
  console.log(`  ${fixes.toString().padStart(3)}  ${file}`);
}
console.log(`\n  Total fixes: ${totalFixes}`);
console.log('─────────────────────────────────────────────────────\n');
