'use client';

import ExportButtons from '@/components/ExportButtons';
import WhQuickBtns from '../_components/WhQuickBtns';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import { OTA_SOURCES } from '../_constants';

export default function OtaReconTab({
  onGoToCommission,
  otaSource, setOtaSource,
  otaDateFrom, setOtaDateFrom,
  otaDateTo, setOtaDateTo,
  otaWarehouse, setOtaWarehouse,
  otaFile, onOtaFileChange,
  otaPreview, otaPreviewLoading, previewOta,
  otaResult,
  otaLoading,
  otaError,
  otaMonth, setOtaMonth,
  otaViewTab, setOtaViewTab,
  commAmt, setCommAmt,
  commMethod, setCommMethod,
  commNote, setCommNote,
  commSubmitting,
  commExisting,
  reconcileConfirmed,
  reconcileConfirming,
  warehouseList,
  runOtaReconcile,
  confirmReconcile,
  submitCommission,
  cancelCommission,
  openOtaEdit,
  openOtaAdd,
  deleteOtaBnb,
}) {
  return (
    <div>
      {otaError && <div className="mb-4"><FetchErrorBanner message={otaError} onRetry={runOtaReconcile} /></div>}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-gray-400">
          💡 目前支援 Booking.com 對帳單。比對完成後請至「OTA傭金」分頁確認佣金。
        </p>
        {onGoToCommission && (
          <button onClick={onGoToCommission}
            className="text-xs text-indigo-600 hover:underline whitespace-nowrap ml-4">
            → OTA傭金
          </button>
        )}
      </div>
      {/* 搜尋列 */}
      <div className="bg-white rounded-xl shadow p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="ota" className="block text-xs text-gray-500 mb-1">OTA 來源</label>
          <select id="ota" className="border rounded-lg px-3 py-1.5 text-sm"
            value={otaSource} onChange={e => setOtaSource(e.target.value)}>
            {OTA_SOURCES.filter(s => s.supported).map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f" className="block text-xs text-gray-500 mb-1">快速月份</label>
          <input id="f" type="month" className="border rounded-lg px-3 py-1.5 text-sm"
            value={otaMonth}
            onChange={e => {
              const m = e.target.value;
              setOtaMonth(m);
              if (m) {
                const [y, mo] = m.split('-').map(Number);
                const last = new Date(y, mo, 0).getDate();
                setOtaDateFrom(`${m}-01`);
                setOtaDateTo(`${m}-${String(last).padStart(2, '0')}`);
              }
            }} />
        </div>
        <div>
          <label htmlFor="f-5" className="block text-xs text-gray-500 mb-1">入住起日</label>
          <input id="f-5" type="date" className="border rounded-lg px-3 py-1.5 text-sm"
            value={otaDateFrom} onChange={e => { setOtaDateFrom(e.target.value); setOtaMonth(''); }} />
        </div>
        <div>
          <label htmlFor="f-6" className="block text-xs text-gray-500 mb-1">入住迄日</label>
          <input id="f-6" type="date" className="border rounded-lg px-3 py-1.5 text-sm"
            value={otaDateTo} onChange={e => { setOtaDateTo(e.target.value); setOtaMonth(''); }} />
        </div>
        <div>
          <label htmlFor="f-2" className="block text-xs text-gray-500 mb-1">館別</label>
          <select id="f-2" className="border rounded-lg px-3 py-1.5 text-sm"
            value={otaWarehouse} onChange={e => setOtaWarehouse(e.target.value)}>
            <option value="">全部</option>
            {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <WhQuickBtns list={warehouseList} value={otaWarehouse} onChange={setOtaWarehouse} />
        </div>
        <div>
          <label htmlFor="f-7" className="block text-xs text-gray-500 mb-1">上傳對帳單</label>
          <input id="f-7" type="file" accept=".xls,.xlsx,.csv"
            className="border rounded-lg px-2 py-1 text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            onChange={e => onOtaFileChange(e.target.files?.[0] || null)} />
        </div>
        {otaPreview && !otaResult ? (
          <button onClick={runOtaReconcile} disabled={otaLoading || !otaFile}
            className="px-5 py-1.5 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
            {otaLoading ? '比對中…' : '確認執行比對'}
          </button>
        ) : (
          <button onClick={previewOta} disabled={otaPreviewLoading || otaLoading || !otaFile}
            className="px-5 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {otaPreviewLoading ? '解析中…' : '解析預覽'}
          </button>
        )}
        {otaResult && (
          <ExportButtons
            data={[
              ...otaResult.matched.map(m => ({
                type: '已配對', arrival: m.ota.arrival, departure: m.ota.departure,
                otaName: m.ota.guestName, sysName: m.bnb.guestName, roomNo: m.bnb.roomNo,
                otaAmt: m.ota.finalAmount, sysAmt: m.bnb.roomCharge, diff: m.amountDiff,
                commission: m.ota.commissionAmt, reservationNo: m.ota.reservationNo,
                status: m.hasAmtIssue || m.hasNameIssue ? '有差異' : '吻合',
              })),
              ...otaResult.unmatchedOta.map(r => ({
                type: 'OTA未配對', arrival: r.arrival, departure: r.departure,
                otaName: r.guestName, sysName: '', roomNo: '',
                otaAmt: r.finalAmount, sysAmt: '', diff: '',
                commission: r.commissionAmt, reservationNo: r.reservationNo, status: r.status,
              })),
              ...otaResult.unmatchedBnb.map(r => ({
                type: '系統未配對', arrival: r.checkInDate, departure: r.checkOutDate,
                otaName: '', sysName: r.guestName, roomNo: r.roomNo,
                otaAmt: '', sysAmt: r.roomCharge, diff: '',
                commission: '', reservationNo: '', status: r.status,
              })),
            ]}
            columns={[
              { header: '類別', key: 'type' },
              { header: '入住', key: 'arrival' },
              { header: '退房', key: 'departure' },
              { header: 'OTA姓名', key: 'otaName' },
              { header: '系統姓名', key: 'sysName' },
              { header: '房號', key: 'roomNo' },
              { header: 'OTA金額', key: 'otaAmt', format: 'number' },
              { header: '系統金額', key: 'sysAmt', format: 'number' },
              { header: '差異', key: 'diff', format: 'number' },
              { header: '佣金', key: 'commission', format: 'number' },
              { header: '訂單號', key: 'reservationNo' },
              { header: '狀態', key: 'status' },
            ]}
            filename={`OTA比對_${otaSource}_${otaDateFrom || 'all'}`}
            title={`OTA 比對結果 ${otaSource}`}
          />
        )}
      </div>

      {/* 解析預覽 panel */}
      {otaPreview && !otaResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-blue-800 text-sm">
              解析預覽 — 共 {otaPreview.parsedCount} 筆，請確認格式正確後再執行比對
            </span>
            <button onClick={() => onOtaFileChange(null)}
              className="text-xs text-blue-600 hover:underline">重新上傳</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-blue-600 border-b border-blue-200">
                  <th className="px-2 py-1 text-left">入住日</th>
                  <th className="px-2 py-1 text-left">退房日</th>
                  <th className="px-2 py-1 text-left">房客姓名</th>
                  <th className="px-2 py-1 text-right">金額</th>
                  <th className="px-2 py-1 text-center">狀態</th>
                </tr>
              </thead>
              <tbody>
                {otaPreview.sample.map((r, i) => (
                  <tr key={i} className="border-t border-blue-100">
                    <td className="px-2 py-1">{r.arrival || <span className="text-red-500">（空）</span>}</td>
                    <td className="px-2 py-1">{r.departure || <span className="text-red-500">（空）</span>}</td>
                    <td className="px-2 py-1">{r.guestName || <span className="text-red-500">（空）</span>}</td>
                    <td className="px-2 py-1 text-right">{r.finalAmount}</td>
                    <td className="px-2 py-1 text-center">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-blue-600">若日期、姓名、金額看起來正確，請按「確認執行比對」。若欄位錯亂，請重新上傳正確格式的檔案。</p>
        </div>
      )}

      {/* 比對結果 */}
      {otaResult && (() => {
        const s = otaResult.summary;
        return (
          <div>
            {/* 摘要卡片 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
              {[
                { lbl: 'OTA 筆數', val: otaResult.otaRowCount },
                { lbl: '系統筆數', val: otaResult.bnbRowCount },
                { lbl: '成功配對', val: s.matchedCount, color: 'text-green-700' },
                { lbl: 'OTA 未配對', val: s.unmatchedOtaCnt, color: s.unmatchedOtaCnt > 0 ? 'text-red-600' : '' },
                { lbl: '系統未配對', val: s.unmatchedBnbCnt, color: s.unmatchedBnbCnt > 0 ? 'text-amber-600' : '' },
                { lbl: '差異筆數', val: s.issueCount, color: s.issueCount > 0 ? 'text-red-600' : '' },
                { lbl: '已取消', val: s.cancelledCount },
              ].map(c => (
                <div key={c.lbl} className="bg-white rounded-xl shadow p-3 text-center">
                  <div className="text-xs text-gray-500">{c.lbl}</div>
                  <div className={`text-xl font-bold ${c.color || 'text-gray-800'}`}>{c.val}</div>
                </div>
              ))}
            </div>
            {/* 金額摘要 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { lbl: 'OTA 總金額', val: s.otaTotal.toLocaleString() },
                { lbl: '系統總金額', val: s.bnbTotal.toLocaleString() },
                { lbl: '總差異', val: s.diff.toLocaleString(), color: Math.abs(s.diff) > 0 ? 'text-red-600' : 'text-green-700' },
                { lbl: 'OTA 佣金合計', val: s.otaCommission.toLocaleString() },
              ].map(c => (
                <div key={c.lbl} className="bg-white rounded-xl shadow p-3 text-center">
                  <div className="text-xs text-gray-500">{c.lbl}</div>
                  <div className={`text-lg font-bold ${c.color || 'text-gray-800'}`}>NT${c.val}</div>
                </div>
              ))}
            </div>

            {/* 確認比對完成 / 存檔 */}
            <div className="bg-white rounded-xl shadow p-4 mb-4 flex items-center gap-4">
              <div className="flex-1">
                <div className="font-semibold text-gray-700 text-sm mb-0.5">確認比對結果</div>
                <div className="text-xs text-gray-400">審查完畢後點擊「確認存檔」，將本次比對摘要儲存至系統記錄</div>
              </div>
              {reconcileConfirmed ? (
                <span className="flex items-center gap-1.5 px-4 py-2 bg-green-100 text-green-700 rounded-xl text-sm font-semibold">
                  ✓ 已確認存檔
                </span>
              ) : (
                <button
                  onClick={confirmReconcile}
                  disabled={reconcileConfirming}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap">
                  {reconcileConfirming ? '存檔中…' : '確認存檔'}
                </button>
              )}
            </div>

            {/* 傭金確認送出 */}
            <div className="bg-white rounded-xl shadow p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="font-semibold text-gray-700 text-sm">傭金登記</span>
                {commExisting?.exists && commExisting.record?.status !== '已取消' && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    (commExisting.record?.status === '已付款' || commExisting.orderStatus?.status === '已執行') ? 'bg-green-100 text-green-700'
                    : commExisting.record?.status === '草稿' ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'
                  }`}>
                    {(commExisting.record?.status === '已付款' || commExisting.orderStatus?.status === '已執行') ? '已付款'
                      : commExisting.record?.status === '草稿' ? '草稿（未送出）'
                      : `待出納 — ${commExisting.orderStatus?.orderNo || ''}`}
                  </span>
                )}
              </div>
              {commExisting?.exists && commExisting.record?.status !== '已取消' ? (
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                  <span>金額：<strong className="text-gray-800">NT$ {Number(commExisting.record.commissionAmount).toLocaleString()}</strong></span>
                  <span>付款方式：{commExisting.record.paymentMethod}</span>
                  <span>廠商：{commExisting.record.supplierName}</span>
                  {commExisting.record.note && <span>備註：{commExisting.record.note}</span>}
                  {commExisting.record.status === '草稿' && (
                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                      請到「OTA傭金」分頁確認金額後點「確認送出」
                    </span>
                  )}
                  {(commExisting.record.status === '草稿' || commExisting.record.status === '待出納') && (
                    <button onClick={() => cancelCommission(commExisting.record.id)}
                      className="px-3 py-1 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100">
                      取消傭金
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label htmlFor="nt" className="block text-xs text-gray-500 mb-1">傭金金額（NT$）</label>
                    <input id="nt" type="number" min="0" step="1"
                      className="border rounded-lg px-3 py-1.5 text-sm w-36"
                      value={commAmt}
                      onChange={e => setCommAmt(e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor="f-3" className="block text-xs text-gray-500 mb-1">付款方式</label>
                    <select id="f-3" className="border rounded-lg px-3 py-1.5 text-sm"
                      value={commMethod} onChange={e => setCommMethod(e.target.value)}>
                      <option value="轉帳">轉帳</option>
                      <option value="匯款">匯款</option>
                      <option value="現金">現金</option>
                      <option value="支票">支票</option>
                      <option value="信用卡">信用卡</option>
                      <option value="月結">月結</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="f-4" className="block text-xs text-gray-500 mb-1">備註</label>
                    <input id="f-4" type="text" className="border rounded-lg px-3 py-1.5 text-sm w-52"
                      placeholder="選填"
                      value={commNote} onChange={e => setCommNote(e.target.value)} />
                  </div>
                  <button onClick={submitCommission}
                    disabled={commSubmitting || !commAmt}
                    className="px-5 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                    {commSubmitting ? '建立中…' : '建立草稿'}
                  </button>
                  <span className="text-xs text-gray-400">建立後可在「OTA傭金」分頁編輯金額再確認送出</span>
                </div>
              )}
            </div>

            {/* 子分頁切換 */}
            <div className="flex gap-1 mb-3">
              {[
                { k: 'matched', l: `已配對 (${s.matchedCount})` },
                { k: 'unmatchedOta', l: `OTA未配對 (${s.unmatchedOtaCnt})` },
                { k: 'unmatchedBnb', l: `系統未配對 (${s.unmatchedBnbCnt})` },
                { k: 'cancelled', l: `已取消 (${s.cancelledCount})` },
              ].map(t => (
                <button key={t.k} onClick={() => setOtaViewTab(t.k)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${otaViewTab === t.k ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>
                  {t.l}
                </button>
              ))}
            </div>

            {/* 已配對 */}
            {otaViewTab === 'matched' && (
              <div className="bg-white rounded-xl shadow tbl-wrap">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-gray-500">
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">入住</th>
                      <th className="px-3 py-2 text-left">退房</th>
                      <th className="px-3 py-2 text-left">OTA 姓名</th>
                      <th className="px-3 py-2 text-left">系統姓名</th>
                      <th className="px-3 py-2 text-left">房號</th>
                      <th className="px-3 py-2 text-right">OTA 金額</th>
                      <th className="px-3 py-2 text-right">系統金額</th>
                      <th className="px-3 py-2 text-right">差異</th>
                      <th className="px-3 py-2 text-right">佣金</th>
                      <th className="px-3 py-2 text-center">訂單號</th>
                      <th className="px-3 py-2 text-center">狀態</th>
                      <th className="px-3 py-2 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {otaResult.matched.length === 0 && (
                      <tr><td colSpan={13} className="text-center py-8 text-gray-400">無配對資料</td></tr>
                    )}
                    {otaResult.matched.map((m, i) => (
                      <tr key={i} className={`hover:bg-gray-50 ${m.hasAmtIssue || m.hasNameIssue ? 'bg-amber-50' : ''}`}>
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{m.ota.arrival}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{m.ota.departure}</td>
                        <td className="px-3 py-2">{m.ota.guestName}
                          {m.hasNameIssue && <span className="ml-1 text-amber-500 text-xs" title="姓名不符">⚠</span>}
                        </td>
                        <td className="px-3 py-2">{m.bnb.guestName}</td>
                        <td className="px-3 py-2 text-gray-500">{m.bnb.roomNo || '—'}</td>
                        <td className="px-3 py-2 text-right">{m.ota.finalAmount.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">{m.bnb.roomCharge.toLocaleString()}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${m.hasAmtIssue ? 'text-red-600' : 'text-green-600'}`}>
                          {m.amountDiff === 0 ? '—' : m.amountDiff > 0 ? `+${m.amountDiff}` : m.amountDiff}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-500">{m.ota.commissionAmt.toLocaleString()}</td>
                        <td className="px-3 py-2 text-center text-xs text-gray-400 font-mono">{m.ota.reservationNo}</td>
                        <td className="px-3 py-2 text-center">
                          {m.hasAmtIssue || m.hasNameIssue
                            ? <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs">有差異</span>
                            : <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs">吻合</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => openOtaEdit(m.bnb.id)}
                            className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100">編輯</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* OTA未配對 */}
            {otaViewTab === 'unmatchedOta' && (
              <div className="bg-white rounded-xl shadow tbl-wrap">
                <p className="px-4 pt-3 text-sm text-red-600">以下筆數存在於 OTA 帳單，但在系統中找不到對應的訂房紀錄</p>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-gray-500">
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">訂單號</th>
                      <th className="px-3 py-2 text-left">入住</th>
                      <th className="px-3 py-2 text-left">退房</th>
                      <th className="px-3 py-2 text-left">房客姓名</th>
                      <th className="px-3 py-2 text-left">訂房人</th>
                      <th className="px-3 py-2 text-right">金額</th>
                      <th className="px-3 py-2 text-right">佣金</th>
                      <th className="px-3 py-2 text-center">OTA狀態</th>
                      <th className="px-3 py-2 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {otaResult.unmatchedOta.length === 0 && (
                      <tr><td colSpan={10} className="text-center py-8 text-green-600">全部 OTA 筆數都有配對</td></tr>
                    )}
                    {otaResult.unmatchedOta.map((r, i) => (
                      <tr key={i} className="hover:bg-red-50">
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs">{r.reservationNo}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.arrival}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.departure}</td>
                        <td className="px-3 py-2">{r.guestName}</td>
                        <td className="px-3 py-2 text-gray-500">{r.bookerName}</td>
                        <td className="px-3 py-2 text-right font-semibold">{r.finalAmount.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{r.commissionAmt.toLocaleString()}</td>
                        <td className="px-3 py-2 text-center text-xs">{r.status}</td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => openOtaAdd(r)}
                            className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 whitespace-nowrap">新增到系統</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 系統未配對 */}
            {otaViewTab === 'unmatchedBnb' && (
              <div className="bg-white rounded-xl shadow tbl-wrap">
                <p className="px-4 pt-3 text-sm text-amber-600">以下筆數存在於系統，但在 OTA 帳單中找不到對應紀錄（可能是直接訂房、電話訂、其他來源）</p>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-gray-500">
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">入住</th>
                      <th className="px-3 py-2 text-left">退房</th>
                      <th className="px-3 py-2 text-left">房客姓名</th>
                      <th className="px-3 py-2 text-left">房號</th>
                      <th className="px-3 py-2 text-right">房費</th>
                      <th className="px-3 py-2 text-center">狀態</th>
                      <th className="px-3 py-2 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {otaResult.unmatchedBnb.length === 0 && (
                      <tr><td colSpan={8} className="text-center py-8 text-green-600">全部系統紀錄都有配對</td></tr>
                    )}
                    {otaResult.unmatchedBnb.map((r, i) => (
                      <tr key={i} className="hover:bg-amber-50">
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.checkInDate}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.checkOutDate}</td>
                        <td className="px-3 py-2">{r.guestName}</td>
                        <td className="px-3 py-2 text-gray-500">{r.roomNo || '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold">{r.roomCharge.toLocaleString()}</td>
                        <td className="px-3 py-2 text-center text-xs">{r.status}</td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => openOtaEdit(r.id)}
                              className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100">編輯</button>
                            <button onClick={() => deleteOtaBnb(r.id)}
                              className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100">刪除</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 已取消 */}
            {otaViewTab === 'cancelled' && (
              <div className="bg-white rounded-xl shadow tbl-wrap">
                <p className="px-4 pt-3 text-sm text-gray-500">以下為 OTA 帳單中標記為已取消的訂單</p>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-gray-500">
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">訂單號</th>
                      <th className="px-3 py-2 text-left">入住</th>
                      <th className="px-3 py-2 text-left">退房</th>
                      <th className="px-3 py-2 text-left">房客姓名</th>
                      <th className="px-3 py-2 text-right">原始金額</th>
                      <th className="px-3 py-2 text-right">最終金額</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {otaResult.cancelledOta.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-8 text-gray-400">無已取消訂單</td></tr>
                    )}
                    {otaResult.cancelledOta.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs">{r.reservationNo}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.arrival}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.departure}</td>
                        <td className="px-3 py-2">{r.guestName}</td>
                        <td className="px-3 py-2 text-right line-through text-gray-400">{r.originalAmount.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-semibold">{r.finalAmount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
