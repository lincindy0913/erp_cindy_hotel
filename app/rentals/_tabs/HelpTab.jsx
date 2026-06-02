'use client';

export default function HelpTab() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-3">租屋管理 — 使用說明</h3>
        <p className="text-sm text-gray-600">本頁彙整最近功能調整與常見操作流程，協助您快速上手。最新異動置於最上方。</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 bg-teal-100 text-teal-700 rounded">最新</span>
          編輯租客 — 無生效合約時可直接綁定物業
        </h4>
        <p className="text-sm text-gray-600 mb-3">過往於「編輯租客」彈窗中，只有「新增租客」流程才能選擇物業並建立初始合約；當該租客的合約全部退租（或從未綁定物業）時，畫面只剩基本資料、聯絡資料、銀行資料、信用備註等欄位，無法新增物業合約。現已改善：</p>
        <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1.5">
          <li>「新增物業合約」區塊會在以下情況自動顯示：
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li>新增租客時（標題顯示「初始物業合約」）</li>
              <li>編輯租客時，且該租客<strong>沒有任何生效中／待審核合約</strong>（標題顯示「新增物業合約」）</li>
            </ul>
          </li>
          <li>填寫「物業 / 月租金 / 開始日期 / 收租帳戶」後按「儲存」，系統會自動建立一張<strong>待審核（pending）</strong>合約。</li>
          <li>合約結束日期預設為「開始日期 +1 年」，可至「合約管理」分頁進一步調整。</li>
        </ul>
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded p-3 text-sm text-gray-600">
          <strong className="text-gray-800">操作位置：</strong>
          <span className="ml-1">「租客管理」分頁 → 點選租客列的「編輯」 → 滑到彈窗下方「新增物業合約」區塊。</span>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h4 className="font-semibold text-gray-800 mb-3">租客狀態 vs. 合約狀態</h4>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="border rounded p-3">
            <p className="font-medium text-gray-800 mb-1">租客狀態（leaseStatus）</p>
            <ul className="list-disc pl-5 text-gray-600 space-y-1">
              <li><span className="text-green-700 font-medium">出租中</span>（active）</li>
              <li><span className="text-orange-700 font-medium">退租</span>（terminating）</li>
              <li><span className="text-gray-500 font-medium">已退租</span>（terminated）</li>
            </ul>
          </div>
          <div className="border rounded p-3">
            <p className="font-medium text-gray-800 mb-1">合約狀態（contract.status）</p>
            <ul className="list-disc pl-5 text-gray-600 space-y-1">
              <li><span className="text-gray-700 font-medium">待審核</span>（pending）</li>
              <li><span className="text-green-700 font-medium">生效中</span>（active）</li>
              <li><span className="text-yellow-700 font-medium">已到期</span>（expired，由結束日期自動判定）</li>
              <li><span className="text-red-700 font-medium">已終止</span>（terminated，含退租）</li>
            </ul>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">小提醒：實際房屋是否「出租中」以<strong>合約狀態</strong>為準；租客狀態僅作為租客主檔的標記。</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h4 className="font-semibold text-gray-800 mb-3">常見操作</h4>
        <ul className="text-sm text-gray-700 list-disc pl-5 space-y-2">
          <li><strong>新增租客 + 物業綁定</strong>：「租客管理」→「新增租客」→ 填基本資料 → 下方填「初始物業合約」→ 儲存。</li>
          <li><strong>替既有租客新增物業</strong>：若該租客<strong>沒有</strong>生效合約 → 直接在「編輯租客」中填「新增物業合約」；若<strong>已有</strong>生效合約 → 請至「合約管理」→「新增合約」。</li>
          <li><strong>更換物業</strong>：「編輯租客」→「合約 / 物業」區塊 → 對生效合約使用下拉選單切換物業 → 儲存。</li>
          <li><strong>辦理退租</strong>：「編輯租客」→「合約 / 物業」區塊 → 對應合約右側「退租」按鈕 → 選退租日期 → 確認。</li>
          <li><strong>合約待審核 → 生效</strong>：「合約管理」→ 編輯該合約 → 將狀態改為「生效中」→ 儲存。</li>
        </ul>
      </div>
    </div>
  );
}
