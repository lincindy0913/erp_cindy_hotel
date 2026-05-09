import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import prisma from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { handleApiError, createErrorResponse } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse');
    const yearMonth = searchParams.get('yearMonth');

    if (!warehouse || !yearMonth) {
      return createErrorResponse('VALIDATION_FAILED', '請提供館別與月份', 400);
    }

    const [y, m] = yearMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const startDate = `${yearMonth}-01`;
    const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

    const batches = await prisma.pmsImportBatch.findMany({
      where: { warehouse, businessDate: { gte: startDate, lte: endDate } },
      include: { records: { orderBy: [{ entryType: 'asc' }, { accountingCode: 'asc' }] } },
      orderBy: { businessDate: 'asc' },
    });

    const allRecords = batches.flatMap(b =>
      b.records.map(r => ({ ...r, batchDate: b.businessDate, batchStatus: b.status, batchNo: b.batchNo }))
    );

    const totalCredit = batches.reduce((s, b) => s + Number(b.creditTotal), 0);
    const totalDebit  = batches.reduce((s, b) => s + Number(b.debitTotal), 0);
    const statusMap   = batches.reduce((m, b) => { m[b.status] = (m[b.status] || 0) + 1; return m; }, {});

    // Sheet 1: 摘要
    const summaryRows = [
      ['PMS 月度收入報表'],
      ['館別', warehouse, '月份', yearMonth],
      ['匯出日期', new Date().toLocaleDateString('zh-TW')],
      [],
      ['批次總數', batches.length, '總記錄數', allRecords.length],
      ['貸方合計（收入）', totalCredit],
      ['借方合計（付款方式）', totalDebit],
      ['差額', totalCredit - totalDebit],
      [],
      ['狀態分佈'],
      ...Object.entries(statusMap).map(([st, cnt]) => [st, cnt, '批次']),
    ];

    // Sheet 2: 批次明細
    const batchRows = [
      ['營業日期', '批次號', '狀態', '記錄數', '貸方合計', '借方合計', '差額'],
      ...batches.map(b => [
        b.businessDate, b.batchNo, b.status, b.records.length,
        Number(b.creditTotal), Number(b.debitTotal), Number(b.difference),
      ]),
      ['合計', '', '',
        batches.reduce((s, b) => s + b.records.length, 0),
        totalCredit, totalDebit, totalCredit - totalDebit,
      ],
    ];

    // Sheet 3: 科目彙總
    const byCode = {};
    for (const r of allRecords) {
      const key = `${r.accountingCode}|||${r.entryType}`;
      if (!byCode[key]) byCode[key] = { code: r.accountingCode, name: r.accountingName, type: r.entryType, total: 0, count: 0 };
      byCode[key].total += Number(r.amount);
      byCode[key].count++;
    }
    const codeRows = [
      ['科目代碼', '科目名稱', '借貸', '筆數', '金額合計'],
      ...Object.values(byCode)
        .sort((a, b) => a.code.localeCompare(b.code))
        .map(c => [c.code, c.name, c.type, c.count, c.total]),
    ];

    // Sheet 4: 全部記錄
    const detailRows = [
      ['日期', '批次號', '館別', '科目代碼', '科目名稱', 'PMS欄位', '借貸', '金額'],
      ...allRecords.map(r => [
        r.batchDate, r.batchNo, warehouse,
        r.accountingCode, r.accountingName, r.pmsColumnName,
        r.entryType, Number(r.amount),
      ]),
    ];

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
    const ws2 = XLSX.utils.aoa_to_sheet(batchRows);
    const ws3 = XLSX.utils.aoa_to_sheet(codeRows);
    const ws4 = XLSX.utils.aoa_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(wb, ws1, '摘要');
    XLSX.utils.book_append_sheet(wb, ws2, '批次明細');
    XLSX.utils.book_append_sheet(wb, ws3, '科目彙總');
    XLSX.utils.book_append_sheet(wb, ws4, '全部記錄');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `PMS月結報表_${warehouse}_${yearMonth}.xlsx`;

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
