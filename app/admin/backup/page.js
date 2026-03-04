'use client';

import { useState, useEffect } from 'react';
import Navigation from '@/components/Navigation';

const TIER_LABELS = {
  tier1_full: 'Tier 1 全量備份',
  tier2_snapshot: 'Tier 2 快照備份',
  tier3_monthend: 'Tier 3 月結備份',
  tier3_yearend: 'Tier 3 年結備份',
};

const STATUS_COLORS = {
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  verified: 'bg-emerald-100 text-emerald-800',
  corrupted: 'bg-orange-100 text-orange-800',
};

const STATUS_LABELS = {
  in_progress: '執行中',
  completed: '已完成',
  failed: '失敗',
  verified: '已驗證',
  corrupted: '已損壞',
};

const TRIGGER_LABELS = {
  manual: '手動',
  scheduled: '排程',
  month_end: '月結觸發',
  year_end: '年結觸發',
};

const DAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

export default function BackupPage() {
  const [records, setRecords] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [triggeringTier, setTriggeringTier] = useState(null);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [filterTier, setFilterTier] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [editingConfig, setEditingConfig] = useState(false);
  const [configForm, setConfigForm] = useState(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [expandedRecord, setExpandedRecord] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [recordsRes, configRes] = await Promise.all([
        fetch('/api/backup'),
        fetch('/api/backup/config'),
      ]);
      if (recordsRes.ok) {
        const data = await recordsRes.json();
        setRecords(data.data || []);
      }
      if (configRes.ok) {
        const data = await configRes.json();
        setConfig(data);
        setConfigForm(data);
      }
    } catch (err) {
      console.error('取得備份資料失敗:', err);
    }
    setLoading(false);
  }

  async function triggerBackup(tier) {
    if (!confirm(`確定要手動觸發 ${TIER_LABELS[tier]}？`)) return;
    setTriggeringTier(tier);
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, triggerType: 'manual' }),
      });
      if (res.ok) {
        showToast('備份已觸發，請稍後重新整理查看狀態', 'success');
        fetchData();
      } else {
        const err = await res.json();
        showToast(err.error?.message || '觸發失敗', 'error');
      }
    } catch {
      showToast('系統錯誤', 'error');
    }
    setTriggeringTier(null);
  }

  async function verifyBackup(recordId) {
    setVerifyingId(recordId);
    try {
      const res = await fetch(`/api/backup/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify' }),
      });
      if (res.ok) {
        showToast('驗證完成', 'success');
        fetchData();
      } else {
        const err = await res.json();
        showToast(err.error?.message || '驗證失敗', 'error');
      }
    } catch {
      showToast('系統錯誤', 'error');
    }
    setVerifyingId(null);
  }

  async function saveConfig() {
    setSavingConfig(true);
    try {
      const res = await fetch('/api/backup/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configForm),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setConfigForm(data);
        setEditingConfig(false);
        showToast('備份設定已儲存', 'success');
      } else {
        const err = await res.json();
        showToast(err.error?.message || '儲存失敗', 'error');
      }
    } catch {
      showToast('系統錯誤', 'error');
    }
    setSavingConfig(false);
  }

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  function formatFileSize(bytes) {
    if (!bytes) return '-';
    const num = Number(bytes);
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    if (num < 1024 * 1024 * 1024) return `${(num / 1024 / 1024).toFixed(1)} MB`;
    return `${(num / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function formatDate(dt) {
    if (!dt) return '-';
    return new Date(dt).toLocaleString('zh-TW');
  }

  const tiers = ['tier1_full', 'tier2_snapshot', 'tier3_monthend', 'tier3_yearend'];

  const filteredRecords = records.filter(r => {
    if (filterTier && r.tier !== filterTier) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    return true;
  });

  const latestByTier = {};
  tiers.forEach(tier => {
    latestByTier[tier] = records.find(r => r.tier === tier && (r.status === 'completed' || r.status === 'verified'));
  });

  const failedCount = records.filter(r => r.status === 'failed').length;
  const inProgressCount = records.filter(r => r.status === 'in_progress').length;

  return (
    <div className="min-h-screen page-bg-settings">
      <Navigation borderColor="border-gray-500" />

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
          {toast.message}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800 accent-settings pl-3">資料備份管理</h2>
          {(failedCount > 0 || inProgressCount > 0) && (
            <div className="flex items-center gap-3">
              {failedCount > 0 && (
                <span className="px-3 py-1 bg-red-100 text-red-700 text-sm rounded-full font-medium">
                  🔴 {failedCount} 筆備份失敗
                </span>
              )}
              {inProgressCount > 0 && (
                <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full font-medium">
                  🔄 {inProgressCount} 筆執行中
                </span>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {[
            { key: 'overview', label: '備份總覽' },
            { key: 'history', label: '備份歷史' },
            { key: 'config', label: '備份設定' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-gray-600 text-gray-800'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">載入中...</div>
        ) : (
          <>
            {/* ===== 備份總覽 ===== */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Status Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {tiers.map(tier => {
                    const latest = latestByTier[tier];
                    const inProg = records.find(r => r.tier === tier && r.status === 'in_progress');
                    const failed = records.find(r => r.tier === tier && r.status === 'failed');

                    let statusIcon = '⏳';
                    let statusText = '尚無備份';
                    let statusColor = 'text-gray-400';

                    if (inProg) { statusIcon = '🔄'; statusText = '執行中'; statusColor = 'text-blue-600'; }
                    else if (latest) {
                      if (latest.status === 'verified') { statusIcon = '✅'; statusText = '已驗證'; statusColor = 'text-emerald-600'; }
                      else { statusIcon = '✅'; statusText = '已完成'; statusColor = 'text-green-600'; }
                    } else if (failed) { statusIcon = '❌'; statusText = '上次失敗'; statusColor = 'text-red-600'; }

                    return (
                      <div key={tier} className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
                        <h3 className="text-xs font-medium text-gray-500 mb-2">{TIER_LABELS[tier]}</h3>
                        <div className={`text-sm font-semibold mb-1 ${statusColor}`}>
                          {statusIcon} {statusText}
                        </div>
                        {latest && (
                          <>
                            <div className="text-xs text-gray-400 mb-1">
                              {formatDate(latest.completedAt || latest.startedAt)}
                            </div>
                            <div className="text-xs text-gray-400 mb-3">
                              {formatFileSize(latest.fileSize)}
                            </div>
                          </>
                        )}
                        <button
                          onClick={() => triggerBackup(tier)}
                          disabled={!!triggeringTier || !!inProg}
                          className="w-full px-3 py-1.5 bg-gray-700 text-white text-xs rounded hover:bg-gray-800 disabled:opacity-40 transition-colors"
                        >
                          {triggeringTier === tier ? '觸發中...' : '▶ 手動觸發'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Disk/Schedule Info */}
                {config && (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">排程資訊</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-xs text-gray-400 mb-0.5">Tier 1 全量排程</div>
                        <div className="font-medium text-gray-700">每日 {config.tier1BackupTime || '04:00'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 mb-0.5">Tier 2 快照排程</div>
                        <div className="font-medium text-gray-700">每日 {config.tier2SnapshotTime || '04:30'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 mb-0.5">自動驗證</div>
                        <div className="font-medium text-gray-700">
                          {DAY_LABELS[config.verifyDayOfWeek ?? 0]} {config.verifyTime || '06:00'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 mb-0.5">雲端儲存</div>
                        <div className={`font-medium ${config.cloudProvider !== 'disabled' ? 'text-green-600' : 'text-gray-400'}`}>
                          {config.cloudProvider === 'disabled' ? '未啟用' : config.cloudProvider?.toUpperCase()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Retention Policy */}
                {config && (
                  <div className="bg-blue-50 rounded-lg border border-blue-100 p-4">
                    <h3 className="text-sm font-semibold text-blue-800 mb-2">備份保存策略</h3>
                    <ul className="text-xs text-blue-700 space-y-1">
                      <li>Tier 1（全量）— 本地保存 <strong>{config.tier1RetainDays || 90}</strong> 天，雲端保存 90 天</li>
                      <li>Tier 2（快照）— 本地保存 <strong>{config.tier2RetainDays || 30}</strong> 天，雲端保存 30 天</li>
                      <li>Tier 3（月結/年結）— 依台灣商業會計法規保存 <strong>7 年</strong>，不自動刪除</li>
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* ===== 備份歷史 ===== */}
            {activeTab === 'history' && (
              <div className="space-y-4">
                {/* Filters */}
                <div className="flex gap-3 items-center">
                  <select
                    value={filterTier}
                    onChange={e => setFilterTier(e.target.value)}
                    className="border rounded px-3 py-1.5 text-sm text-gray-700"
                  >
                    <option value="">全部層級</option>
                    {tiers.map(t => (
                      <option key={t} value={t}>{TIER_LABELS[t]}</option>
                    ))}
                  </select>
                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="border rounded px-3 py-1.5 text-sm text-gray-700"
                  >
                    <option value="">全部狀態</option>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <span className="text-sm text-gray-400">共 {filteredRecords.length} 筆</span>
                </div>

                {/* Table */}
                <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">開始時間</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">層級</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">觸發方式</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">業務期間</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">大小</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">狀態</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">雲端</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredRecords.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-10 text-center text-gray-400">尚無備份紀錄</td>
                        </tr>
                      ) : filteredRecords.map(r => (
                        <>
                          <tr
                            key={r.id}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => setExpandedRecord(expandedRecord === r.id ? null : r.id)}
                          >
                            <td className="px-4 py-3 text-xs text-gray-600">{formatDate(r.startedAt)}</td>
                            <td className="px-4 py-3 text-xs">{TIER_LABELS[r.tier] || r.tier}</td>
                            <td className="px-4 py-3 text-xs text-gray-500">{TRIGGER_LABELS[r.triggerType] || r.triggerType}</td>
                            <td className="px-4 py-3 text-xs text-gray-500">{r.businessPeriod || '-'}</td>
                            <td className="px-4 py-3 text-xs text-right">{formatFileSize(r.fileSize)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-700'}`}>
                                {STATUS_LABELS[r.status] || r.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center text-xs">
                              {r.cloudUploaded ? (
                                <span className="text-green-600">☁️ 已上傳</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {(r.status === 'completed' || r.status === 'verified') && (
                                <button
                                  onClick={e => { e.stopPropagation(); verifyBackup(r.id); }}
                                  disabled={verifyingId === r.id}
                                  className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-50"
                                >
                                  {verifyingId === r.id ? '驗證中...' : '🔍 驗證'}
                                </button>
                              )}
                            </td>
                          </tr>
                          {expandedRecord === r.id && (
                            <tr key={`${r.id}-detail`} className="bg-gray-50">
                              <td colSpan={8} className="px-6 py-4">
                                <div className="text-xs text-gray-600 space-y-1">
                                  {r.filePath && <div><span className="text-gray-400">本地路徑：</span>{r.filePath}</div>}
                                  {r.cloudPath && <div><span className="text-gray-400">雲端路徑：</span>{r.cloudPath}</div>}
                                  {r.sha256 && <div><span className="text-gray-400">SHA256：</span><code className="font-mono">{r.sha256}</code></div>}
                                  {r.completedAt && <div><span className="text-gray-400">完成時間：</span>{formatDate(r.completedAt)}</div>}
                                  {r.totalRecords && <div><span className="text-gray-400">總記錄數：</span>{r.totalRecords.toLocaleString()}</div>}
                                  {r.errorMessage && (
                                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700">
                                      <span className="font-medium">錯誤訊息：</span>{r.errorMessage}
                                    </div>
                                  )}
                                  {r.verified && (
                                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-green-700">
                                      ✅ 備份已驗證（{formatDate(r.verifiedAt)}）
                                    </div>
                                  )}
                                  {r.createdBy && <div><span className="text-gray-400">觸發人員：</span>{r.createdBy}</div>}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ===== 備份設定 ===== */}
            {activeTab === 'config' && configForm && (
              <div className="space-y-6 max-w-2xl">
                <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-700">排程設定</h3>
                    {!editingConfig ? (
                      <button
                        onClick={() => setEditingConfig(true)}
                        className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                      >
                        ✏️ 編輯
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setEditingConfig(false); setConfigForm(config); }}
                          className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded"
                        >
                          取消
                        </button>
                        <button
                          onClick={saveConfig}
                          disabled={savingConfig}
                          className="px-3 py-1.5 text-sm bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-50"
                        >
                          {savingConfig ? '儲存中...' : '儲存'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Tier 1 全量備份時間</label>
                        {editingConfig ? (
                          <input
                            type="time"
                            value={configForm.tier1BackupTime || '04:00'}
                            onChange={e => setConfigForm(p => ({ ...p, tier1BackupTime: e.target.value }))}
                            className="border rounded px-2 py-1 text-sm w-full"
                          />
                        ) : (
                          <div className="font-medium text-gray-700">{configForm.tier1BackupTime || '04:00'}</div>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Tier 2 快照備份時間</label>
                        {editingConfig ? (
                          <input
                            type="time"
                            value={configForm.tier2SnapshotTime || '04:30'}
                            onChange={e => setConfigForm(p => ({ ...p, tier2SnapshotTime: e.target.value }))}
                            className="border rounded px-2 py-1 text-sm w-full"
                          />
                        ) : (
                          <div className="font-medium text-gray-700">{configForm.tier2SnapshotTime || '04:30'}</div>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">自動驗證星期</label>
                        {editingConfig ? (
                          <select
                            value={configForm.verifyDayOfWeek ?? 0}
                            onChange={e => setConfigForm(p => ({ ...p, verifyDayOfWeek: parseInt(e.target.value) }))}
                            className="border rounded px-2 py-1 text-sm w-full"
                          >
                            {DAY_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                          </select>
                        ) : (
                          <div className="font-medium text-gray-700">{DAY_LABELS[configForm.verifyDayOfWeek ?? 0]}</div>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">自動驗證時間</label>
                        {editingConfig ? (
                          <input
                            type="time"
                            value={configForm.verifyTime || '06:00'}
                            onChange={e => setConfigForm(p => ({ ...p, verifyTime: e.target.value }))}
                            className="border rounded px-2 py-1 text-sm w-full"
                          />
                        ) : (
                          <div className="font-medium text-gray-700">{configForm.verifyTime || '06:00'}</div>
                        )}
                      </div>
                    </div>

                    <hr className="border-gray-100" />

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Tier 1 本地保留天數</label>
                        {editingConfig ? (
                          <input
                            type="number"
                            min={1}
                            value={configForm.tier1RetainDays || 90}
                            onChange={e => setConfigForm(p => ({ ...p, tier1RetainDays: parseInt(e.target.value) }))}
                            className="border rounded px-2 py-1 text-sm w-full"
                          />
                        ) : (
                          <div className="font-medium text-gray-700">{configForm.tier1RetainDays || 90} 天</div>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Tier 2 本地保留天數</label>
                        {editingConfig ? (
                          <input
                            type="number"
                            min={1}
                            value={configForm.tier2RetainDays || 30}
                            onChange={e => setConfigForm(p => ({ ...p, tier2RetainDays: parseInt(e.target.value) }))}
                            className="border rounded px-2 py-1 text-sm w-full"
                          />
                        ) : (
                          <div className="font-medium text-gray-700">{configForm.tier2RetainDays || 30} 天</div>
                        )}
                      </div>
                    </div>

                    <hr className="border-gray-100" />

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">雲端儲存方案</label>
                      {editingConfig ? (
                        <select
                          value={configForm.cloudProvider || 'disabled'}
                          onChange={e => setConfigForm(p => ({ ...p, cloudProvider: e.target.value }))}
                          className="border rounded px-2 py-1 text-sm"
                        >
                          <option value="disabled">未啟用</option>
                          <option value="aws_s3">AWS S3</option>
                          <option value="gcs">Google Cloud Storage</option>
                          <option value="b2">Backblaze B2</option>
                        </select>
                      ) : (
                        <div className={`font-medium ${configForm.cloudProvider !== 'disabled' ? 'text-green-600' : 'text-gray-400'}`}>
                          {configForm.cloudProvider === 'disabled' ? '未啟用' : configForm.cloudProvider?.toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">備份失敗時通知</label>
                      {editingConfig ? (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!configForm.notifyOnFailure}
                            onChange={e => setConfigForm(p => ({ ...p, notifyOnFailure: e.target.checked }))}
                            className="rounded"
                          />
                          <span className="text-sm text-gray-700">發送 N14 通知給所有管理員</span>
                        </label>
                      ) : (
                        <div className={`font-medium ${configForm.notifyOnFailure ? 'text-green-600' : 'text-gray-400'}`}>
                          {configForm.notifyOnFailure ? '已啟用' : '已停用'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-amber-800 mb-2">⚠️ 注意事項</h3>
                  <ul className="text-xs text-amber-700 space-y-1">
                    <li>• Tier 1 全量備份需要系統具備 pg_dump 工具與足夠磁碟空間</li>
                    <li>• 自動驗證會在 Staging 環境執行還原測試，請確保環境就緒</li>
                    <li>• 雲端上傳需設定對應的 Access Key 與 Secret（請聯繫系統管理員）</li>
                    <li>• Tier 3 年度備份保存 7 年，不提供自動刪除</li>
                  </ul>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
