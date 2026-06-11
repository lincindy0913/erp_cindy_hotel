'use client';

import Link from 'next/link';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';
import ExcelBatchImport from '@/components/ExcelBatchImport';
import HelpButton from '@/components/HelpButton';
import { todayStr } from '@/lib/localDate';

export default function CashflowHeader({ activeTab, transactions, fetchTransactions }) {
  return (
    <div className="flex justify-between items-center mb-4">
      <div>
        <h2 className="text-2xl font-bold">現金流管理</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          日常收支記錄。帳戶主檔設定請至{' '}
          <Link href="/fund-management" className="text-emerald-600 hover:underline">資金管理 →</Link>
        </p>
      </div>
      <div className="flex items-center gap-3">
        <HelpButton anchor="八現金流管理" />
        {activeTab === 'transactions' && (
          <>
            <ExportButtons
              data={transactions.map(tx => ({
                ...tx,
                accountName: tx.account?.name || '-',
                categoryName: tx.category?.name || '-',
                supplierName: tx.supplier?.name || '-',
              }))}
              columns={EXPORT_CONFIGS.cashflow.columns}
              exportName={EXPORT_CONFIGS.cashflow.filename}
              title="現金交易紀錄"
              sheetName="交易紀錄"
            />
            <ExcelBatchImport
              title="現金流交易批次匯入"
              hint="批次匯入收入/支出交易記錄。帳戶名稱需與系統中一致，科目（選填）可為空。"
              columns={[
                { key: 'date',        header: '日期',     example: todayStr(),  required: true,  width: 14, note: 'YYYY-MM-DD' },
                { key: 'type',        header: '類型',     example: '支出',      required: true,  width: 8,  note: '收入/支出/移轉' },
                { key: 'amount',      header: '金額',     example: '1500',      required: true,  width: 12 },
                { key: 'accountName', header: '帳戶名稱', example: '玉山銀行',  required: true,  width: 16 },
                { key: 'description', header: '摘要說明', example: '水電費',    required: false, width: 20 },
                { key: 'category',    header: '科目',     example: '水電瓦斯',  required: false, width: 14, note: '留空可稍後歸類' },
                { key: 'warehouse',   header: '館別',     example: '館別A',     required: false, width: 12 },
              ]}
              onImport={async rows => {
                const res = await fetch('/api/cashflow/transactions/import-excel', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ rows }),
                });
                const json = await res.json();
                if (res.ok) { fetchTransactions(1); return json; }
                throw new Error(json.error || '匯入失敗');
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
