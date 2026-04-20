// Pure parsing functions for bank statement import (CSV / Excel / PDF)
// No React imports — safe to use in hooks and unit tests.

// ---- CSV helpers ----

export function parseCSVWithQuotes(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = !inQuotes; }
    } else if (!inQuotes && c === ',') {
      row.push(field.trim().replace(/\s+/g, ' '));
      field = '';
    } else if (!inQuotes && (c === '\n' || c === '\r')) {
      row.push(field.trim().replace(/\s+/g, ' '));
      if (row.length > 0 && row.some(cell => cell)) rows.push(row);
      row = [];
      field = '';
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field.trim().replace(/\s+/g, ' '));
    if (row.some(cell => cell)) rows.push(row);
  }
  return rows;
}

export function parseAmountCiti(str) {
  const s = String(str || '').replace(/,/g, '').replace(/−|－|—/g, '').trim();
  return s && !isNaN(parseFloat(s)) ? s : '0';
}

export function parseDateMDY(str) {
  const s = String(str || '').trim();
  const parts = s.split(/[\/\-\.]/);
  if (parts.length < 3) return s;
  let m = parseInt(parts[0], 10), d = parseInt(parts[1], 10), y = parseInt(parts[2], 10);
  if (isNaN(m) || isNaN(d) || isNaN(y)) return s;
  if (y < 100) y += 2000;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 民國 YYY.MM.DD 或 YYY/M/D → YYYY-MM-DD
export function rocDateToIso(str) {
  const s = String(str || '').trim();
  const m = s.match(/^(\d{3})[.\/\-](\d{1,2})[.\/\-](\d{1,2})$/);
  if (!m) return str;
  const year = parseInt(m[1], 10) + 1911;
  const month = String(parseInt(m[2], 10)).padStart(2, '0');
  const day = String(parseInt(m[3], 10)).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ---- Bank account statement PDF parsers ----

export function parseLandBankStatementPdf(lines) {
  const parsed = [];
  const toNum = s => parseFloat((String(s || '')).replace(/,/g, '')) || 0;
  for (const line of lines) {
    const m = line.match(/^(\d{2,3})[\/\-](\d{2})[\/\-](\d{2})\s+(.+?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/);
    if (m) {
      const year = parseInt(m[1]) + 1911;
      const txDate = `${year}-${m[2]}-${m[3]}`;
      const desc = m[4].trim();
      const col5 = toNum(m[5]);
      const col6 = toNum(m[6]);
      const balance = toNum(m[7]);
      parsed.push({ txDate, description: desc, debitAmount: String(col5 || 0), creditAmount: String(col6 || 0), referenceNo: '', runningBalance: String(balance) });
      continue;
    }
    const m2 = line.match(/^(\d{2,3})[\/\-](\d{2})[\/\-](\d{2})\s+(.+?)\s+(支出|存入|借|貸)\s+([\d,]+)\s+([\d,]+)/);
    if (m2) {
      const year = parseInt(m2[1]) + 1911;
      const txDate = `${year}-${m2[2]}-${m2[3]}`;
      const isDeb = /支出|借/.test(m2[5]);
      const amount = String(toNum(m2[6]));
      const balance = String(toNum(m2[7]));
      parsed.push({ txDate, description: m2[4].trim(), debitAmount: isDeb ? amount : '0', creditAmount: isDeb ? '0' : amount, referenceNo: '', runningBalance: balance });
    }
  }
  return parsed;
}

export function parseGenericBankStatementPdf(lines, bankName) {
  const parsed = [];
  const toNum = s => parseFloat((String(s || '')).replace(/,/g, '')) || 0;
  for (const line of lines) {
    const m = line.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})\s+(.+?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)/);
    if (m) {
      const txDate = `${m[1]}-${m[2]}-${m[3]}`;
      const col5 = toNum(m[5]);
      const col6 = toNum(m[6]);
      const balance = toNum(m[7]);
      const desc = m[4].trim();
      parsed.push({ txDate, description: desc, debitAmount: String(col5), creditAmount: String(col6), referenceNo: '', runningBalance: String(balance) });
      continue;
    }
    const m2 = line.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})\s+(.+?)\s+(?:支出|提出|提款)\s+([\d,]+(?:\.\d+)?)\s+(?:餘額)?\s*([\d,]+(?:\.\d+)?)/);
    if (m2) {
      const txDate = `${m2[1]}-${m2[2]}-${m2[3]}`;
      parsed.push({ txDate, description: m2[4].trim(), debitAmount: String(toNum(m2[5])), creditAmount: '0', referenceNo: '', runningBalance: String(toNum(m2[6])) });
      continue;
    }
    const m3 = line.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})\s+(.+?)\s+(?:存入|轉入|收入)\s+([\d,]+(?:\.\d+)?)\s+(?:餘額)?\s*([\d,]+(?:\.\d+)?)/);
    if (m3) {
      const txDate = `${m3[1]}-${m3[2]}-${m3[3]}`;
      parsed.push({ txDate, description: m3[4].trim(), debitAmount: '0', creditAmount: String(toNum(m3[5])), referenceNo: '', runningBalance: String(toNum(m3[6])) });
    }
  }
  return parsed;
}

export function parseBankStatementPdfText(fullText, bankName) {
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
  const bn = bankName || '';
  if (bn.includes('土地') || bn.includes('土銀')) {
    return parseLandBankStatementPdf(lines);
  }
  return parseGenericBankStatementPdf(lines, bankName);
}

// ---- Credit card statement PDF parsers ----

export function normalizePdfText(t) {
  return t
    .replace(/\uff1a/g, ':')
    .replace(/\uff0f/g, '/')
    .replace(/\u3000/g, ' ')
    .replace(/[ \t]+/g, ' ');
}

export function parsePdfByBank(fullText, bankType) {
  switch (bankType) {
    case '國泰世華': return parseCathayPdf(fullText);
    default:         return parseGenericCcPdf(fullText, bankType);
  }
}

export function parseGenericCcPdf(rawText, bankName) {
  try {
    if (rawText.length > 500000) throw new Error('輸入文字過長');
    const text = normalizePdfText(rawText);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const flatText = lines.join(' ');
    const toNum = s => parseFloat((s || '').replace(/,/g, '')) || 0;

    let merchantId = '', merchantName = '', billingDate = '', paymentDate = '', accountNo = '';
    let totalCount = 0, totalAmount = 0, totalFee = 0, netAmount = 0;

    for (const line of lines) {
      if (!merchantId) {
        const m = line.match(/(?:特店|商店|店家)代號\s*[:\s:]\s*(\d{5,})/);
        if (m) merchantId = m[1];
      }
      if (!merchantName) {
        const m = line.match(/(?:特店|商店|店家)名稱\s*[:\s:]\s*(.+)/);
        if (m) merchantName = m[1].trim().replace(/\s+/g, '');
      }
      if (!billingDate) {
        const m = line.match(/(?:請款|帳單|交易截止)\s*日[期]?\s*[:\s:]\s*(\d{3,4}[\/\-年]\d{1,2}[\/\-月]\d{1,2})/);
        if (m) {
          billingDate = m[1].replace(/[年月]/g, '/').replace(/-/g, '/');
          const parts = billingDate.split('/');
          if (parts[0] && parseInt(parts[0]) < 200) {
            billingDate = `${parseInt(parts[0]) + 1911}/${parts.slice(1).join('/')}`;
          }
        }
      }
      if (!paymentDate) {
        const m = line.match(/(?:撥款|入帳|付款)\s*日[期]?\s*[:\s:]\s*(\d{3,4}[\/\-年]\d{1,2}[\/\-月]\d{1,2})/);
        if (m) {
          paymentDate = m[1].replace(/[年月]/g, '/').replace(/-/g, '/');
          const parts = paymentDate.split('/');
          if (parts[0] && parseInt(parts[0]) < 200) {
            paymentDate = `${parseInt(parts[0]) + 1911}/${parts.slice(1).join('/')}`;
          }
        }
      }
      if (!accountNo) {
        const m = line.match(/(?:入帳|撥款|匯款)\s*帳號\s*[:\s:]\s*(\S+)/);
        if (m) accountNo = m[1];
      }
      if (!totalCount) {
        const m = line.match(/(?:總筆數|交易筆數|刷卡筆數)\s*[:\s:]\s*(\d+)/);
        if (m) totalCount = parseInt(m[1]) || 0;
      }
      if (!totalAmount) {
        const m = line.match(/(?:請款金額|刷卡總金額|交易金額|請款總金額|刷卡金額合計)\s*[:\s:]\s*([\d,]+)/);
        if (m) totalAmount = toNum(m[1]);
      }
      if (!totalFee) {
        const m = line.match(/(?:手續費合計|手續費總計|手續費)\s*[:\s:]\s*([\d,]+)/);
        if (m) totalFee = toNum(m[1]);
      }
      if (!netAmount) {
        const m = line.match(/(?:撥款淨額|撥款金額|實際撥款|實撥金額)\s*[:\s:]\s*([\d,]+)/);
        if (m) netAmount = toNum(m[1]);
      }
    }

    if (!totalAmount) {
      const m = flatText.match(/(?:請款|刷卡).*?([\d,]{4,})/);
      if (m) totalAmount = toNum(m[1]);
    }
    if (!netAmount && totalAmount && totalFee) {
      netAmount = totalAmount - totalFee;
    }

    if (!totalAmount && !merchantId && !merchantName) return null;

    return { bankName, merchantId, merchantName, billingDate, paymentDate, accountNo, totalCount, totalAmount, adjustment: 0, totalFee, serviceFee: 0, otherFee: 0, netAmount, batchLines: [], feeDetails: [] };
  } catch {
    return null;
  }
}

export function parseCathayPdf(rawText) {
  try {
    if (rawText.length > 500000) throw new Error('輸入文字過長，請縮短後再試 (上限 500KB)');
    const text = normalizePdfText(rawText);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const flatText = lines.join(' ');

    let merchantId = '', merchantName = '', billingDate = '', paymentDate = '', accountNo = '';
    for (const line of lines) {
      if (!merchantId) {
        const m = line.match(/(?:特店|商店)代號\s*[:\s]\s*(\d{5,})/);
        if (m) merchantId = m[1];
      }
      if (!merchantName) {
        const m = line.match(/(?:特店|商店)名稱\s*[:\s]\s*(.+)/);
        if (m) merchantName = m[1].trim().replace(/\s+/g, '');
      }
      if (!billingDate) {
        const m = line.match(/請款日[期]?\s*[:\s]\s*(\d{4}[/\-]\d{1,2}[/\-]\d{1,2})/);
        if (m) billingDate = m[1].replace(/-/g, '/').replace(/\/(\d)(?=\/|$)/g, '/0$1');
      }
      if (!paymentDate) {
        const m = line.match(/撥款日[期]?\s*[:\s]\s*(\d{4}[/\-]\d{1,2}[/\-]\d{1,2})/);
        if (m) paymentDate = m[1].replace(/-/g, '/').replace(/\/(\d)(?=\/|$)/g, '/0$1');
      }
      if (!accountNo) {
        const m = line.match(/入帳帳號\s*[:\s]\s*(\S+)/);
        if (m) accountNo = m[1];
      }
    }

    let totalCount = 0, totalAmount = 0, adjustment = 0, totalFee = 0, serviceFee = 0, otherFee = 0, netAmount = 0;
    const toNum = s => parseFloat((s || '').replace(/,/g, '')) || 0;
    const N = '([\\d,]+)';
    const S = '\\s+';
    let sm = flatText.match(new RegExp(`總計${S}${N}${S}${N}${S}${N}${S}${N}${S}${N}${S}${N}${S}${N}`));
    if (sm) {
      totalCount = parseInt(sm[1]) || 0;
      totalAmount = toNum(sm[2]);
      adjustment  = toNum(sm[3]);
      totalFee    = toNum(sm[4]);
      serviceFee  = toNum(sm[5]);
      otherFee    = toNum(sm[6]);
      netAmount   = toNum(sm[7]);
    } else {
      for (const line of lines) {
        if (!totalAmount) { const m = line.match(/請款金額\s*[:\s]\s*([\d,]+)/); if (m) totalAmount = toNum(m[1]); }
        if (!netAmount)   { const m = line.match(/撥款淨額\s*[:\s]\s*([\d,]+)/); if (m) netAmount   = toNum(m[1]); }
        if (!totalFee)    { const m = line.match(/手續費\s*[:\s]\s*([\d,]+)/);   if (m) totalFee    = toNum(m[1]); }
        if (!totalCount)  { const m = line.match(/總筆數\s*[:\s]\s*(\d+)/);      if (m) totalCount  = parseInt(m[1]) || 0; }
      }
    }

    const batchLines = [];
    const dateP = '(\\d{4}/\\d{2}/\\d{2})';
    const batchRegex = new RegExp(`${dateP}\\s+${dateP}\\s+(\\d+)\\s+(\\d+)\\s+(VISA|MASTER|MasterCard|JCB|CUP|UnionPay)\\s+(\\d+)\\s+([\\d,]+)`, 'gi');
    let m;
    while ((m = batchRegex.exec(flatText)) !== null) {
      batchLines.push({
        billingDate: m[1], settlementDate: m[2], terminalId: m[3], batchNo: m[4],
        cardType: m[5].toUpperCase().replace('MASTERCARD', 'MASTER').replace('UNIONPAY', 'CUP'),
        count: parseInt(m[6]), amount: toNum(m[7]),
      });
    }

    const feeDetails = [];
    const feeRegex = /(國內|國外|自行)\s*[(（](VISA|MASTER|JCB|CUP)[)）]\s+筆數\/請款金額\/手續費\s*[:\s]\s*(\d+)\s*\/\s*([\d,]+)\s*\/\s*([\d,.]+)/gi;
    while ((m = feeRegex.exec(flatText)) !== null) {
      const cnt = parseInt(m[3]);
      const amt = toNum(m[4]);
      const fee = toNum(m[5]);
      if (cnt > 0 || amt > 0) {
        feeDetails.push({ origin: m[1], cardType: m[2].toUpperCase(), count: cnt, amount: amt, fee, feeRate: amt > 0 ? Math.round(fee / amt * 10000) / 100 : 0 });
      }
    }

    if (!merchantId && !totalAmount) return null;

    return { bankName: '國泰世華', merchantId, merchantName, billingDate, paymentDate, accountNo, totalCount, totalAmount, adjustment, totalFee, serviceFee, otherFee, netAmount, batchLines, feeDetails };
  } catch {
    return null;
  }
}
