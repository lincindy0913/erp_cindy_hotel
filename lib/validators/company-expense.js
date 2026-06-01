// YYYY-MM-DD
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// ROC year.period — e.g. 113.3-4, 114.11-12
const PERIOD_RE = /^\d{3}\.\d{1,2}-\d{1,2}$/;

export function validateInvoiceBody(body) {
  if (!body.invoiceDate || !DATE_RE.test(body.invoiceDate)) {
    return '發票日期必填（格式 YYYY-MM-DD）';
  }
  if (body.period && !PERIOD_RE.test(body.period)) {
    return 'period 格式錯誤，應為民國年.期別，例：113.3-4';
  }
  const amt   = Number(body.amount    ?? 0);
  const tax   = Number(body.taxAmount ?? 0);
  const total = Number(body.totalAmount ?? 0);
  if (amt < 0 || tax < 0 || total < 0) return '金額不可為負數';
  if (Math.abs(amt + tax - total) > 0.5) {
    return `totalAmount(${total}) 應等於 amount(${amt}) + taxAmount(${tax})`;
  }
  return null;
}

export function validateExpenseBody(body) {
  if (!body.expenseDate || !DATE_RE.test(body.expenseDate)) {
    return '費用日期必填（格式 YYYY-MM-DD）';
  }
  if (body.period && !PERIOD_RE.test(body.period)) {
    return 'period 格式錯誤，應為民國年.期別，例：113.3-4';
  }
  const amt   = Number(body.amount      ?? 0);
  const tax   = Number(body.taxAmount   ?? 0);
  const other = Number(body.otherAmount ?? 0);
  const total = Number(body.totalAmount ?? 0);
  if (amt < 0 || tax < 0 || other < 0 || total < 0) return '金額不可為負數';
  if (Math.abs(amt + tax + other - total) > 0.5) {
    return `totalAmount(${total}) 應等於 amount(${amt}) + taxAmount(${tax}) + otherAmount(${other})`;
  }
  return null;
}
