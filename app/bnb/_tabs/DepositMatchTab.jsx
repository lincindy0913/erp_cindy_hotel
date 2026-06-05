'use client';

import FetchErrorBanner from '@/components/FetchErrorBanner';
import ExportButtons from '@/components/ExportButtons';
import WhQuickBtns from '../_components/WhQuickBtns';
import { inputCls, btnCls } from '../_constants';

const NT = (v) => `NT$ ${Number(v || 0).toLocaleString()}`;

const PAY_TYPE_TABS = [
  { key: 'payment', label: '收款明細' },
  { key: 'ledger',  label: '流水帳' },
  { key: 'all',     label: '整體進度' },
];
const PAY_SUB_TYPES = [
  { key: 'combined', label: '全部' },
  { key: 'deposit',  label: '訂金匯款' },
  { key: 'transfer', label: '當天匯款' },
  { key: 'card',     label: '刷卡' },
  { key: 'cash',     label: '現金存款' },
];

export default function DepositMatchTab({
  // useDepositMatch props
  dmMonth, setDmMonth,
  dmWarehouse, setDmWarehouse,
  dmAccountId, setDmAccountId,
  dmData, setDmData,
  dmLoading, dmError,
  dmAccounts,
  dmSelBnb, setDmSelBnb,
  dmSelLine, setDmSelLine,
  dmMatching,
  dmPayType, setDmPayType,
  dmMarkModal, setDmMarkModal,
  dmMarkNote, setDmMarkNote,
  fetchDepositMatch,
  handleMatch,
  onGoToBooking,
  handleUnmatch,
  handleMark,
  handleClearMark,
  handleAutoMatch,
  // shared page state
  warehouseList,
  isLocked,
  // ledger state
  ledgerMonthFrom, setLedgerMonthFrom,
  ledgerMonthTo,   setLedgerMonthTo,
  ledgerWarehouse, setLedgerWarehouse,
  ledgerRows,
  ledgerLoading,
  fetchLedger,
  // bank import state/handlers
  showBankImport, setShowBankImport,
  bankImportLines, setBankImportLines,
  bankImportParsing,
  bankImportSubmitting,
  bankImportError, setBankImportError,
  handleBankFileUpload,
  submitBankImport,
}) {
  const suggestMap = new Map((dmData?.suggestions || []).map(s => [s.bnbId, s.bankLineId]));
  const lineMatchedByBnb = new Map(
    (dmData?.bnbRecords || [])
      .filter(r => r.bankLineId)
      .map(r => [r.bankLineId, r.guestName])
  );
  const summary    = dmData?.summary;
  const bnbRecords = dmData?.bnbRecords || [];
  const bankLines  = dmData?.bankLines  || [];

  const activeOuterTab = dmPayType === 'all' ? 'all' : dmPayType === 'ledger' ? 'ledger' : 'payment';

  return (
    <div>
      {dmError && <div className="mb-4"><FetchErrorBanner message={dmError} onRetry={fetchDepositMatch} /></div>}
      {/* 付款類型切換 */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {PAY_TYPE_TABS.map(t => (
          <button key={t.key}
            onClick={() => {
              if (t.key === 'all') { setDmPayType('all'); setDmData(null); setDmSelBnb(null); setDmSelLine(null); }
              else if (t.key === 'ledger') { setDmPayType('ledger'); }
              else if (dmPayType === 'all' || dmPayType === 'ledger') { setDmPayType('deposit'); setDmData(null); setDmSelBnb(null); setDmSelLine(null); }
            }}
            className={`px-4 py-1.5 text-sm rounded-lg whitespace-nowrap transition-colors ${
              activeOuterTab === t.key
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-indigo-50'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 篩選列 */}
      {activeOuterTab !== 'ledger' && <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="f-15" className="block text-xs text-gray-500 mb-1">月份</label>
          <input id="f-15" type="month" value={dmMonth} onChange={e => setDmMonth(e.target.value)} className={inputCls} />
        </div>
        {dmPayType !== 'all' && (
          <div>
            <label htmlFor="f-16" className="block text-xs text-gray-500 mb-1">分類</label>
            <select id="f-16" value={dmPayType} onChange={e => { setDmPayType(e.target.value); setDmData(null); setDmSelBnb(null); setDmSelLine(null); }} className={inputCls}>
              {PAY_SUB_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="f-33" className="block text-xs text-gray-500 mb-1">館別</label>
          <select id="f-33" value={dmWarehouse} onChange={e => setDmWarehouse(e.target.value)} className={inputCls}>
            <option value="">全部</option>
            {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <WhQuickBtns list={warehouseList} value={dmWarehouse} onChange={setDmWarehouse} />
        </div>
        {dmPayType !== 'all' && dmPayType !== 'combined' && (
          <div>
            <label htmlFor="f-34" className="block text-xs text-gray-500 mb-1">存簿帳戶</label>
            <select id="f-34" value={dmAccountId} onChange={e => setDmAccountId(e.target.value)} className={inputCls}>
              <option value="">請選擇帳戶</option>
              {dmAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
        <button onClick={fetchDepositMatch} disabled={dmLoading || (dmPayType !== 'all' && dmPayType !== 'combined' && !dmAccountId)}
          className={`${btnCls} bg-indigo-50 text-indigo-700 disabled:opacity-40`}>
          {dmLoading ? '載入中…' : '查詢'}
        </button>
        <button
          type="button"
          onClick={() => { setBankImportLines([]); setBankImportError(''); setShowBankImport(true); }}
          className="px-4 py-1.5 text-sm rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap">
          ↑ 匯入銀行對帳單
        </button>
        {dmData && dmPayType !== 'all' && (
          <>
            <button onClick={handleAutoMatch} disabled={dmMatching || !(dmData?.suggestions?.length) || isLocked}
              className={`${btnCls} bg-amber-50 text-amber-700 disabled:opacity-40`}>
              ⚡ 自動配對{dmData?.suggestions?.length ? `（${dmData.suggestions.length}筆）` : ''}
            </button>
            <ExportButtons
              data={(dmData?.bnbRecords || []).map(r => ({
                guestName:   r.guestName,
                checkInDate: r.checkInDate,
                checkOutDate:r.checkOutDate,
                payAmount:   r.payAmount,
                payDate:     r.payDate,
                last5:       r.last5,
                matchStatus: r.bankLineId ? '已配對' : '未配對',
                matchedBy:   r.matchedBy || '',
              }))}
              columns={[
                { header: '姓名',    key: 'guestName' },
                { header: '入住',    key: 'checkInDate' },
                { header: '退房',    key: 'checkOutDate' },
                { header: '金額',    key: 'payAmount',  format: 'number' },
                { header: '付款日期', key: 'payDate' },
                { header: '後五碼',  key: 'last5' },
                { header: '配對狀態', key: 'matchStatus' },
                { header: '配對者',  key: 'matchedBy' },
              ]}
              filename={`核對_${dmPayType}_${dmMonth}`}
              title={`${PAY_SUB_TYPES.find(t => t.key === dmPayType)?.label || ''} 核對 ${dmMonth}`}
            />
          </>
        )}
      </div>}

      {/* 流水帳 */}
      {activeOuterTab === 'ledger' && (
        <div>
          {/* 流水帳篩選列 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div>
              <label htmlFor="f-17" className="block text-xs text-gray-500 mb-1">月份起</label>
              <input id="f-17" type="month" value={ledgerMonthFrom} onChange={e => setLedgerMonthFrom(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="f-18" className="block text-xs text-gray-500 mb-1">月份迄</label>
              <input id="f-18" type="month" value={ledgerMonthTo} onChange={e => setLedgerMonthTo(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="f-19" className="block text-xs text-gray-500 mb-1">館別</label>
              <select id="f-19" value={ledgerWarehouse} onChange={e => setLedgerWarehouse(e.target.value)} className={inputCls}>
                <option value="">全部</option>
                {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <WhQuickBtns list={warehouseList} value={ledgerWarehouse} onChange={setLedgerWarehouse} />
            </div>
            <button onClick={fetchLedger} disabled={ledgerLoading}
              className={`${btnCls} bg-indigo-50 text-indigo-700 disabled:opacity-40`}>
              {ledgerLoading ? '載入中…' : '查詢'}
            </button>
            {ledgerRows.length > 0 && (() => {
              const sumRoom    = ledgerRows.reduce((s, r) => s + Number(r.roomCharge  || 0), 0);
              const sumOther   = ledgerRows.reduce((s, r) => s + Number(r.otherCharge || 0), 0);
              const sumDeposit = ledgerRows.reduce((s, r) => s + Number(r.payDeposit  || 0), 0);
              const sumXfer    = ledgerRows.reduce((s, r) => s + Number(r.payTransfer || 0), 0);
              const sumCard    = ledgerRows.reduce((s, r) => s + Number(r.payCard     || 0), 0);
              const sumCash    = ledgerRows.reduce((s, r) => s + Number(r.payCash     || 0), 0);
              const sumVoucher = ledgerRows.reduce((s, r) => s + Number(r.payVoucher  || 0), 0);
              const sumFee     = ledgerRows.reduce((s, r) => s + Number(r.cardFee     || 0), 0);
              const net = sumDeposit + sumXfer + sumCard + sumCash + sumVoucher - sumFee;
              return (
                <div className="flex flex-wrap gap-2 items-center ml-2 text-xs">
                  <span className="text-gray-400">{ledgerRows.length} 筆</span>
                  <span className="text-gray-500">房費 <b className="text-indigo-700">{NT(sumRoom)}</b></span>
                  <span className="text-gray-500">訂金 <b>{NT(sumDeposit)}</b></span>
                  <span className="text-gray-500">匯款 <b>{NT(sumXfer)}</b></span>
                  <span className="text-gray-500">刷卡 <b>{NT(sumCard)}</b></span>
                  <span className="text-gray-500">現金 <b>{NT(sumCash)}</b></span>
                  <span className="text-gray-500">住宿券 <b>{NT(sumVoucher)}</b></span>
                  <span className="text-gray-500">手續費 <b className="text-red-500">-{NT(sumFee)}</b></span>
                  <span className="text-gray-700 font-semibold">淨收入 <b className="text-green-700">{NT(net)}</b></span>
                </div>
              );
            })()}
            {ledgerRows.length > 0 && (
              <ExportButtons
                data={ledgerRows.map(r => ({
                  importMonth:  r.importMonth,
                  warehouse:    r.warehouse,
                  source:       r.source,
                  guestName:    r.guestName,
                  roomNo:       r.roomNo || '',
                  checkInDate:  r.checkInDate,
                  checkOutDate: r.checkOutDate,
                  roomCharge:   Number(r.roomCharge  || 0),
                  otherCharge:  Number(r.otherCharge || 0),
                  payDeposit:   Number(r.payDeposit  || 0),
                  depositDate:  r.depositDate  || '',
                  depositLast5: r.depositLast5 || '',
                  payTransfer:  Number(r.payTransfer || 0),
                  transferDate: r.transferDate  || '',
                  transferLast5:r.transferLast5 || '',
                  payCard:      Number(r.payCard     || 0),
                  cardFeeRate:  Number(r.cardFeeRate || 0),
                  cardFee:      Number(r.cardFee     || 0),
                  payCash:      Number(r.payCash     || 0),
                  payVoucher:   Number(r.payVoucher  || 0),
                  net: Number(r.payDeposit||0)+Number(r.payTransfer||0)+Number(r.payCard||0)+Number(r.payCash||0)+Number(r.payVoucher||0)-Number(r.cardFee||0),
                  status:       r.status,
                  note:         r.note || '',
                }))}
                columns={[
                  { header: '月份',     key: 'importMonth' },
                  { header: '館別',     key: 'warehouse' },
                  { header: '來源',     key: 'source' },
                  { header: '姓名',     key: 'guestName' },
                  { header: '房號',     key: 'roomNo' },
                  { header: '入住',     key: 'checkInDate' },
                  { header: '退房',     key: 'checkOutDate' },
                  { header: '房費',     key: 'roomCharge',   format: 'number' },
                  { header: '其他費用', key: 'otherCharge',  format: 'number' },
                  { header: '訂金',     key: 'payDeposit',   format: 'number' },
                  { header: '訂金日期', key: 'depositDate' },
                  { header: '訂金後五碼',key:'depositLast5' },
                  { header: '當天匯款', key: 'payTransfer',  format: 'number' },
                  { header: '匯款日期', key: 'transferDate' },
                  { header: '匯款後五碼',key:'transferLast5'},
                  { header: '刷卡',     key: 'payCard',      format: 'number' },
                  { header: '手續費率', key: 'cardFeeRate',  format: 'number' },
                  { header: '手續費',   key: 'cardFee',      format: 'number' },
                  { header: '現金',     key: 'payCash',      format: 'number' },
                  { header: '住宿券',   key: 'payVoucher',   format: 'number' },
                  { header: '淨收入',   key: 'net',          format: 'number' },
                  { header: '狀態',     key: 'status' },
                  { header: '備註',     key: 'note' },
                ]}
                filename={`流水帳_${ledgerMonthFrom}_${ledgerMonthTo}${ledgerWarehouse ? '_' + ledgerWarehouse : ''}`}
                title={`收款流水帳 ${ledgerMonthFrom} ~ ${ledgerMonthTo}${ledgerWarehouse ? '　' + ledgerWarehouse : ''}`}
              />
            )}
          </div>

          {/* 流水帳表格 */}
          {ledgerLoading && <div className="text-center py-20 text-gray-400">載入中…</div>}
          {!ledgerLoading && ledgerRows.length === 0 && (
            <div className="text-center py-20 text-gray-400">請設定月份區間後按「查詢」</div>
          )}
          {!ledgerLoading && ledgerRows.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 tbl-wrap">
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="sticky top-0 bg-indigo-50 text-indigo-800">
                  <tr>
                    <th className="px-3 py-2 text-left">月份</th>
                    <th className="px-3 py-2 text-left">館別</th>
                    <th className="px-3 py-2 text-left">姓名</th>
                    <th className="px-3 py-2 text-left">入住</th>
                    <th className="px-3 py-2 text-left">退房</th>
                    <th className="px-3 py-2 text-right">房費</th>
                    <th className="px-3 py-2 text-right">其他</th>
                    <th className="px-3 py-2 text-right">訂金</th>
                    <th className="px-3 py-2 text-left">訂金日</th>
                    <th className="px-3 py-2 text-left">後五碼</th>
                    <th className="px-3 py-2 text-right">匯款</th>
                    <th className="px-3 py-2 text-left">匯款日</th>
                    <th className="px-3 py-2 text-left">後五碼</th>
                    <th className="px-3 py-2 text-right">刷卡</th>
                    <th className="px-3 py-2 text-right">手續費</th>
                    <th className="px-3 py-2 text-right">現金</th>
                    <th className="px-3 py-2 text-right">住宿券</th>
                    <th className="px-3 py-2 text-right font-semibold">淨收入</th>
                    <th className="px-3 py-2 text-left">狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {ledgerRows.map(r => {
                    const net = Number(r.payDeposit||0)+Number(r.payTransfer||0)+Number(r.payCard||0)+Number(r.payCash||0)+Number(r.payVoucher||0)-Number(r.cardFee||0);
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">{r.importMonth}</td>
                        <td className="px-3 py-2">{r.warehouse}</td>
                        <td className="px-3 py-2">{r.guestName}</td>
                        <td className="px-3 py-2">{r.checkInDate}</td>
                        <td className="px-3 py-2">{r.checkOutDate}</td>
                        <td className="px-3 py-2 text-right">{Number(r.roomCharge||0) > 0 ? NT(r.roomCharge) : ''}</td>
                        <td className="px-3 py-2 text-right">{Number(r.otherCharge||0) > 0 ? NT(r.otherCharge) : ''}</td>
                        <td className="px-3 py-2 text-right">{Number(r.payDeposit||0) > 0 ? NT(r.payDeposit) : ''}</td>
                        <td className="px-3 py-2 text-gray-500">{r.depositDate || ''}</td>
                        <td className="px-3 py-2 font-mono text-gray-500">{r.depositLast5 || ''}</td>
                        <td className="px-3 py-2 text-right">{Number(r.payTransfer||0) > 0 ? NT(r.payTransfer) : ''}</td>
                        <td className="px-3 py-2 text-gray-500">{r.transferDate || ''}</td>
                        <td className="px-3 py-2 font-mono text-gray-500">{r.transferLast5 || ''}</td>
                        <td className="px-3 py-2 text-right">{Number(r.payCard||0) > 0 ? NT(r.payCard) : ''}</td>
                        <td className="px-3 py-2 text-right text-red-500">{Number(r.cardFee||0) > 0 ? `-${NT(r.cardFee)}` : ''}</td>
                        <td className="px-3 py-2 text-right">{Number(r.payCash||0) > 0 ? NT(r.payCash) : ''}</td>
                        <td className="px-3 py-2 text-right">{Number(r.payVoucher||0) > 0 ? NT(r.payVoucher) : ''}</td>
                        <td className="px-3 py-2 text-right font-semibold text-green-700">{net > 0 ? NT(net) : ''}</td>
                        <td className="px-3 py-2 text-gray-500">{r.status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 整體進度視圖 */}
      {dmPayType === 'all' && dmData && !dmLoading && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(dmData.summary || []).map(s => {
              const pct = s.total > 0 ? Math.round(s.matched / s.total * 100) : 0;
              return (
                <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <div className="text-xs text-gray-500 mb-1">{s.label}</div>
                  <div className="text-lg font-bold text-indigo-700">
                    NT$ {s.amount.toLocaleString()}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-500">{pct}%</span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs">
                    <span className="text-green-600">✓ {s.matched}</span>
                    {s.skipped > 0 && <span className="text-orange-500">↗ {s.skipped}</span>}
                    <span className={s.unmatched > 0 ? 'text-amber-600' : 'text-gray-400'}>
                      ○ {s.unmatched}
                    </span>
                    <span className="text-gray-400">共 {s.total}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 摘要卡 */}
      {summary && dmPayType !== 'all' && dmPayType !== 'ledger' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          {[
            { label: `BNB ${PAY_SUB_TYPES.find(t => t.key === dmPayType)?.label || ''}合計`,
              val: `NT$ ${summary.totalBnbAmount.toLocaleString()}`, color: 'text-indigo-700' },
            { label: '存簿入帳合計',   val: `NT$ ${summary.totalBankCredit.toLocaleString()}`,  color: 'text-blue-700' },
            { label: '差異',          val: `NT$ ${Math.abs(summary.diff).toLocaleString()}`,    color: summary.diff !== 0 ? 'text-red-600 font-bold' : 'text-green-600' },
            { label: '已配對',         val: `${summary.matchedCount} 筆`,                        color: 'text-green-600' },
            { label: '標記處理',       val: `${summary.skippedCount || 0} 筆`,                   color: summary.skippedCount > 0 ? 'text-orange-500' : 'text-gray-400' },
            { label: '未配對（BNB）',  val: `${summary.unmatchedBnbCount} 筆`,                   color: summary.unmatchedBnbCount > 0 ? 'text-amber-600' : 'text-gray-500' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
              <p className="text-xs text-gray-500">{c.label}</p>
              <p className={`font-bold text-sm mt-0.5 ${c.color}`}>{c.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* 配對按鈕 */}
      {(dmSelBnb && dmSelLine) && (
        <div className="mb-3 flex items-center gap-3 p-3 bg-indigo-50 rounded-xl border border-indigo-200">
          <span className="text-sm text-indigo-700">已選取雙側各一筆，確認配對？</span>
          <button onClick={() => handleMatch(onGoToBooking)} disabled={dmMatching || isLocked}
            className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {dmMatching ? '配對中…' : isLocked ? '已鎖帳' : '確認配對'}
          </button>
          <button onClick={() => { setDmSelBnb(null); setDmSelLine(null); }}
            className="text-xs text-gray-500 hover:underline">取消</button>
        </div>
      )}

      {!dmData && !dmLoading && activeOuterTab !== 'ledger' && (
        <div className="text-center py-20 text-gray-400">
          {dmPayType === 'all' ? '請選擇月份後按「查詢」' : '請選擇存簿帳戶後按「查詢」'}
        </div>
      )}
      {dmLoading && activeOuterTab !== 'ledger' && (
        <div className="text-center py-20 text-gray-400">載入中…</div>
      )}

      {/* 全部分類合併列表 */}
      {dmData && !dmLoading && dmPayType === 'combined' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-indigo-800">全部收款類型（BNB）</span>
            <span className="text-xs text-indigo-500">
              {bnbRecords.length} 筆 　合計 NT${bnbRecords.reduce((s, r) => s + (r.payAmount || 0), 0).toLocaleString('zh-TW')}
            </span>
          </div>
          <div className="overflow-y-auto max-h-[600px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="text-gray-500">
                  <th className="px-3 py-2 text-left">姓名</th>
                  <th className="px-3 py-2 text-left">入住</th>
                  <th className="px-3 py-2 text-left">付款日</th>
                  <th className="px-3 py-2 text-left">分類</th>
                  <th className="px-3 py-2 text-left">後五碼</th>
                  <th className="px-3 py-2 text-right">金額</th>
                  <th className="px-3 py-2 text-center">配對</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {bnbRecords.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">本月無收款記錄</td></tr>
                )}
                {bnbRecords.map(r => {
                  const typeColors = { deposit: 'bg-blue-50 text-blue-700', transfer: 'bg-indigo-50 text-indigo-700', card: 'bg-purple-50 text-purple-700', cash: 'bg-green-50 text-green-700' };
                  return (
                    <tr key={r.id} className={r.bankLineId ? 'bg-green-50' : 'hover:bg-gray-50'}>
                      <td className="px-3 py-2 font-medium max-w-[90px] truncate">{r.guestName}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.checkInDate}</td>
                      <td className="px-3 py-2 text-blue-500 whitespace-nowrap">{r.payDate || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${typeColors[r.paymentTypeKey] || 'bg-gray-100 text-gray-600'}`}>
                          {r.paymentTypeLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-blue-600 font-mono">{r.last5 || '—'}</td>
                      <td className="px-3 py-2 text-right font-semibold text-indigo-700">{r.payAmount.toLocaleString()}</td>
                      <td className="px-3 py-2 text-center">
                        {r.bankLineId
                          ? <span className="text-green-600 font-bold">✓</span>
                          : r.matchSkip
                            ? <div className="flex items-center justify-center gap-1">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.matchSkip === 'next_month' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}
                                  title={r.matchSkipNote || ''}>
                                  {r.matchSkip === 'next_month' ? '跨月' : '免配'}
                                </span>
                                <button onClick={() => handleClearMark(r.bnbId, r.paymentTypeKey)}
                                  className="text-gray-300 hover:text-red-400 text-sm leading-none">×</button>
                              </div>
                            : <div className="flex items-center justify-center gap-1">
                                <button onClick={() => { setDmMarkNote(''); setDmMarkModal({ bnbId: r.bnbId, skipType: 'next_month', paymentType: r.paymentTypeKey }); }}
                                  className="text-[10px] text-orange-600 border border-orange-200 hover:bg-orange-50 px-1 py-0.5 rounded">跨月</button>
                                <button onClick={() => { setDmMarkNote(''); setDmMarkModal({ bnbId: r.bnbId, skipType: 'no_match', paymentType: r.paymentTypeKey }); }}
                                  className="text-[10px] text-gray-500 border border-gray-200 hover:bg-gray-50 px-1 py-0.5 rounded">免配</button>
                              </div>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold text-xs">
                <tr>
                  {['deposit','transfer','card','cash'].map(key => {
                    const typeRows = bnbRecords.filter(r => r.paymentTypeKey === key);
                    if (typeRows.length === 0) return null;
                    const label = PAY_SUB_TYPES.find(t => t.key === key)?.label || key;
                    const total = typeRows.reduce((s, r) => s + (r.payAmount || 0), 0);
                    return <td key={key} className="px-3 py-2 text-gray-600">{label}: {total.toLocaleString()}</td>;
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {dmData && !dmLoading && dmPayType !== 'all' && dmPayType !== 'combined' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* 左欄：BNB 收款 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-indigo-800">
                {PAY_SUB_TYPES.find(t => t.key === dmPayType)?.label || ''}（BNB）
              </span>
              <span className="text-xs text-indigo-500">{bnbRecords.length} 筆　點選後再點右側存簿行配對</span>
            </div>
            <div className="overflow-y-auto max-h-[480px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="text-gray-500">
                    <th className="px-3 py-2 text-left">狀態</th>
                    <th className="px-3 py-2 text-left">姓名</th>
                    <th className="px-3 py-2 text-left">入住</th>
                    <th className="px-3 py-2 text-left">付款日</th>
                    <th className="px-3 py-2 text-left">分類</th>
                    {(dmPayType === 'deposit' || dmPayType === 'transfer') && (
                      <th className="px-3 py-2 text-left">後五碼</th>
                    )}
                    <th className="px-3 py-2 text-right">金額</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {bnbRecords.length === 0 && (
                    <tr><td colSpan={(dmPayType === 'deposit' || dmPayType === 'transfer') ? 8 : 7} className="text-center py-8 text-gray-400">本月無此類型收款記錄</td></tr>
                  )}
                  {bnbRecords.map((r, _ri, arr) => {
                    const isMatched   = !!r.bankLineId;
                    const isSkipped   = !r.bankLineId && !!r.matchSkip;
                    const isSuggested = !isMatched && !isSkipped && suggestMap.has(r.id);
                    const isSelected  = dmSelBnb === r.id;
                    const isFirstUnmatched = !isMatched && !isSkipped && arr.findIndex(x => !x.bankLineId && !x.matchSkip) === _ri;
                    let rowCls = 'transition-colors ';
                    if (!isMatched && !isSkipped) rowCls += 'cursor-pointer ';
                    if (isSelected)       rowCls += 'bg-indigo-100 ring-1 ring-inset ring-indigo-300';
                    else if (isMatched)   rowCls += 'bg-green-50 hover:bg-green-100';
                    else if (isSkipped)   rowCls += r.matchSkip === 'next_month' ? 'bg-orange-50' : 'bg-gray-50';
                    else if (isSuggested) rowCls += 'bg-amber-50 hover:bg-amber-100';
                    else rowCls += 'hover:bg-gray-50';
                    return (
                      <tr key={r.id} className={rowCls}
                        {...(isFirstUnmatched ? { 'data-first-unmatched': '1' } : {})}
                        onClick={() => !isMatched && !isSkipped && setDmSelBnb(isSelected ? null : r.id)}>
                        <td className="px-3 py-2.5">
                          {isMatched
                            ? <span className="text-green-600 font-bold">✓</span>
                            : isSkipped
                              ? <span className={`text-[10px] font-semibold ${r.matchSkip === 'next_month' ? 'text-orange-500' : 'text-gray-400'}`}>
                                  {r.matchSkip === 'next_month' ? '↗' : '–'}
                                </span>
                              : isSuggested
                                ? <span className="text-amber-500">⚡</span>
                                : <span className="text-gray-300">○</span>
                          }
                        </td>
                        <td className="px-3 py-2.5 max-w-[100px] truncate font-medium">{r.guestName}</td>
                        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{r.checkInDate}</td>
                        <td className="px-3 py-2.5 text-blue-500 whitespace-nowrap text-xs">{r.payDate || '—'}</td>
                        <td className="px-3 py-2.5">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 whitespace-nowrap">
                            {PAY_SUB_TYPES.find(t => t.key === dmPayType)?.label || dmPayType}
                          </span>
                        </td>
                        {(dmPayType === 'deposit' || dmPayType === 'transfer') && (
                          <td className="px-3 py-2.5 text-blue-600 font-mono text-xs tracking-wider">{r.last5 || '—'}</td>
                        )}
                        <td className="px-3 py-2.5 text-right font-semibold text-indigo-700">
                          {r.payAmount.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {isSkipped ? (
                            <div className="flex items-center justify-end gap-1">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.matchSkip === 'next_month' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}
                                title={r.matchSkipNote || ''}>
                                {r.matchSkip === 'next_month' ? '跨月' : '免配'}
                              </span>
                              {!isLocked && (
                                <button onClick={e => { e.stopPropagation(); handleClearMark(r.id); }}
                                  className="text-gray-300 hover:text-red-400 text-sm leading-none ml-0.5">×</button>
                              )}
                            </div>
                          ) : isMatched ? (
                            !isLocked && (
                              <button onClick={e => { e.stopPropagation(); handleUnmatch(r.id); }}
                                className="text-[10px] text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded border border-red-200 hover:bg-red-50">
                                解除
                              </button>
                            )
                          ) : !isLocked ? (
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={e => { e.stopPropagation(); setDmMarkNote(''); setDmMarkModal({ bnbId: r.id, skipType: 'next_month' }); }}
                                className="text-[10px] text-orange-600 border border-orange-200 hover:bg-orange-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                                跨月
                              </button>
                              <button onClick={e => { e.stopPropagation(); setDmMarkNote(''); setDmMarkModal({ bnbId: r.id, skipType: 'no_match' }); }}
                                className="text-[10px] text-gray-500 border border-gray-200 hover:bg-gray-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                                免配
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 右欄：存簿入帳 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-blue-800">存簿入帳（銀行明細）</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-blue-500">{bankLines.length} 筆入帳</span>
                {dmAccountId && (
                  <button onClick={() => { setBankImportLines([]); setBankImportError(''); setShowBankImport(true); }}
                    className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 whitespace-nowrap">
                    ↑ 匯入對帳單
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-y-auto max-h-[480px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="text-gray-500">
                    <th className="px-3 py-2 text-left">狀態</th>
                    <th className="px-3 py-2 text-left">日期</th>
                    <th className="px-3 py-2 text-left">說明</th>
                    <th className="px-3 py-2 text-right">金額</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {bankLines.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-8 text-gray-400">本月無存簿入帳資料</td></tr>
                  )}
                  {bankLines.map(l => {
                    const isUsed      = l.isUsed;
                    const isSuggested = !isUsed && [...suggestMap.values()].includes(l.id);
                    const isSelected  = dmSelLine === l.id;
                    const matchedTo   = lineMatchedByBnb.get(l.id);
                    let rowCls = 'transition-colors ';
                    if (isUsed) rowCls += 'bg-green-50 opacity-70';
                    else if (isSelected) rowCls += 'bg-indigo-100 cursor-pointer ring-1 ring-inset ring-indigo-300';
                    else if (isSuggested) rowCls += 'bg-amber-50 hover:bg-amber-100 cursor-pointer';
                    else rowCls += 'hover:bg-gray-50 cursor-pointer';
                    return (
                      <tr key={l.id} className={rowCls}
                        onClick={() => !isUsed && setDmSelLine(isSelected ? null : l.id)}>
                        <td className="px-3 py-2.5">
                          {isUsed
                            ? <span className="text-green-600 font-bold" title={`已配對：${matchedTo}`}>✓</span>
                            : isSuggested
                              ? <span className="text-amber-500">⚡</span>
                              : <span className="text-gray-300">○</span>
                          }
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{l.txDate}</td>
                        <td className="px-3 py-2.5 max-w-[160px] truncate text-gray-500"
                          title={l.description || ''}>
                          {l.description || '—'}
                          {isUsed && matchedTo && (
                            <span className="ml-1 text-green-600">（{matchedTo}）</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-blue-700">
                          {l.creditAmount.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ 存簿比對：標記跳過 Modal ══ */}
      {dmMarkModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setDmMarkModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-[340px]" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800 mb-2">
              {dmMarkModal.skipType === 'next_month' ? '標記為跨月入帳' : '標記為無需配對'}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              {dmMarkModal.skipType === 'next_month'
                ? '此筆款項下月才入帳存簿，本月暫不配對。'
                : '此筆款項為現金收帳或已另行處理，不需存簿配對。'}
            </p>
            <div className="mb-5">
              <label htmlFor="f-25" className="block text-xs text-gray-500 mb-1">備註（選填）</label>
              <input id="f-25"
                type="text"
                value={dmMarkNote}
                onChange={e => setDmMarkNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleMark()}
                placeholder="說明原因…"
                maxLength={255}
                autoFocus
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setDmMarkModal(null); setDmMarkNote(''); }}
                className="px-4 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                取消
              </button>
              <button onClick={handleMark}
                className={`px-4 py-1.5 text-sm rounded-lg text-white ${dmMarkModal.skipType === 'next_month' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-gray-600 hover:bg-gray-700'}`}>
                確認標記
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ 存簿對帳單匯入 Modal ══ */}
      {showBankImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowBankImport(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">↑ 匯入存簿對帳單</h3>
              <button onClick={() => setShowBankImport(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              {/* 說明 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <p className="font-medium mb-1">📥 土地銀行網路銀行下載步驟</p>
                <ol className="list-decimal ml-4 space-y-0.5 text-xs">
                  <li>登入土地銀行網銀 → 帳戶管理 → 存款交易明細</li>
                  <li>選擇帳戶（土海）、月份區間</li>
                  <li>點「匯出 Excel」下載 .xls 檔</li>
                  <li>上傳至此處即可</li>
                </ol>
              </div>

              {/* 匯入月份/帳戶 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="f-26" className="block text-xs text-gray-500 mb-1">月份</label>
                  <input id="f-26" type="month" value={dmMonth} onChange={e => setDmMonth(e.target.value)}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-27" className="block text-xs text-gray-500 mb-1">存簿帳戶 *</label>
                  <select id="f-27" value={dmAccountId} onChange={e => setDmAccountId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm">
                    <option value="">請選擇帳戶</option>
                    {dmAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>

              {/* 檔案選擇 */}
              <div>
                <label htmlFor="xls-xlsx-csv" className="block text-sm font-medium text-gray-700 mb-1">選擇檔案（.xls / .xlsx / .csv）</label>
                <input id="xls-xlsx-csv" type="file" accept=".xls,.xlsx,.csv"
                  onChange={handleBankFileUpload}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
                {bankImportParsing && <p className="text-xs text-blue-500 mt-1">解析中…</p>}
                {bankImportError && <p className="text-xs text-red-500 mt-1">{bankImportError}</p>}
              </div>

              {/* 解析預覽 */}
              {bankImportLines.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    預覽：共 {bankImportLines.length} 筆
                    （存入 {bankImportLines.filter(l => l.creditAmount > 0).length} 筆 /
                    支出 {bankImportLines.filter(l => l.debitAmount > 0).length} 筆）
                  </p>
                  <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">日期</th>
                          <th className="px-3 py-2 text-left">說明</th>
                          <th className="px-3 py-2 text-right text-green-700">存入</th>
                          <th className="px-3 py-2 text-right text-red-600">支出</th>
                          <th className="px-3 py-2 text-right">餘額</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {bankImportLines.map((l, i) => (
                          <tr key={i} className={l.creditAmount > 0 ? 'bg-green-50/30' : ''}>
                            <td className="px-3 py-1.5 whitespace-nowrap">{l.txDate}</td>
                            <td className="px-3 py-1.5 max-w-[200px] truncate" title={l.description}>{l.description}</td>
                            <td className="px-3 py-1.5 text-right text-green-700">{l.creditAmount > 0 ? l.creditAmount.toLocaleString() : ''}</td>
                            <td className="px-3 py-1.5 text-right text-red-600">{l.debitAmount > 0 ? l.debitAmount.toLocaleString() : ''}</td>
                            <td className="px-3 py-1.5 text-right text-gray-500">{l.runningBalance ? l.runningBalance.toLocaleString() : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={() => setShowBankImport(false)}
                className="px-4 py-2 text-sm bg-gray-200 rounded-lg hover:bg-gray-300">取消</button>
              <button onClick={submitBankImport}
                disabled={bankImportLines.length === 0 || !dmAccountId || bankImportSubmitting}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                {bankImportSubmitting ? '匯入中…' : bankImportLines.length === 0 ? '請先上傳檔案' : !dmAccountId ? '請選擇帳戶' : `確認匯入 ${bankImportLines.length} 筆`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
