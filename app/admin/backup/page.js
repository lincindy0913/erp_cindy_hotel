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
  passed: 'bg-green-100 text-green-800',
};

const STATUS_LABELS = {
  in_progress: '執行中',
  completed: '已完成',
  failed: '失敗',
  verified: '已驗證',
  corrupted: '已損壞',
  passed: '通過',
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
  // Drill / RTO-RPO state
  const [drillData, setDrillData] = useState(null);
  const [rtoRpoData, setRtoRpoData] = useState(null);
  const [runningDrill, setRunningDrill] = useState(false);

  // Railway cloud state
  const [railwayData, setRailwayData] = useState(null);
  const [railwayLoading, setRailwayLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchDrillData();
  }, []);

  useEffect(() => {
    if (activeTab === 'drill') fetchDrillData();
    if (activeTab === 'railway') fetchRailwayData();
  }, [activeTab]);

  async function fetchRailwayData() {
    setRailwayLoading(true);
    try {
      const res = await fetch('/api/backup/railway');
      if (res.ok) setRailwayData(await res.json());
    } catch (err) {
      console.error('Railway API 失敗:', err);
    }
    setRailwayLoading(false);
  }

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

  async function fetchDrillData() {
    try {
      const [drillRes, statusRes] = await Promise.all([
        fetch('/api/backup/restore-drill'),
        fetch('/api/backup/rto-rpo-status'),
      ]);
      if (drillRes.ok) setDrillData(await drillRes.json());
      if (statusRes.ok) setRtoRpoData(await statusRes.json());
    } catch (err) {
      console.error('取得演練資料失敗:', err);
    }
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

  async function triggerDrill() {
    if (!confirm('確定要手動執行還原演練？將對最近備份執行實際還原測試。')) return;
    setRunningDrill(true);
    try {
      const res = await fetch('/api/backup/restore-drill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoRestore: true }),
      });
      const data = await res.json();
      if (res.ok) {
        const statusText = data.status === 'passed' ? '通過' : '失敗';
        showToast(`還原演練${statusText} — RTO: ${data.rto?.actualFormatted || '-'}, RPO: ${data.rpo?.actualFormatted || '-'}`, data.status === 'passed' ? 'success' : 'error');
        fetchDrillData();
      } else {
        showToast(data.error || '演練觸發失敗', 'error');
      }
    } catch {
      showToast('系統錯誤', 'error');
    }
    setRunningDrill(false);
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
        showToast((typeof err.error === 'string' ? err.error : err.error?.message) || '儲存失敗', 'error');
      }
    } catch {
      showToast('系統錯誤', 'error');
    }
    setSavingConfig(false);
  }

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
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
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm max-w-md ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
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
                  {failedCount} 筆備份失敗
                </span>
              )}
              {inProgressCount > 0 && (
                <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full font-medium">
                  {inProgressCount} 筆執行中
                </span>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {[
            { key: 'overview', label: '備份總覽' },
            { key: 'railway', label: '☁️ Railway 雲端備份' },
            { key: 'drill', label: '還原演練' },
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
                {/* RTO/RPO Health Score Banner */}
                {rtoRpoData && (
                  <div className={`rounded-lg border p-4 ${
                    rtoRpoData.healthScore >= 80 ? 'bg-green-50 border-green-200' :
                    rtoRpoData.healthScore >= 60 ? 'bg-yellow-50 border-yellow-200' :
                    rtoRpoData.healthScore >= 40 ? 'bg-orange-50 border-orange-200' :
                    'bg-red-50 border-red-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-1">備份可還原性健康分數</h3>
                        <div className="flex items-center gap-3">
                          <span className={`text-3xl font-bold ${
                            rtoRpoData.healthScore >= 80 ? 'text-green-700' :
                            rtoRpoData.healthScore >= 60 ? 'text-yellow-700' :
                            rtoRpoData.healthScore >= 40 ? 'text-orange-700' :
                            'text-red-700'
                          }`}>
                            {rtoRpoData.healthScore}/100 ({rtoRpoData.healthGrade})
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setActiveTab('drill')}
                        className="px-3 py-1.5 text-xs bg-gray-700 text-white rounded hover:bg-gray-800"
                      >
                        查看詳情
                      </button>
                    </div>
                    {rtoRpoData.recommendations?.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {rtoRpoData.recommendations.slice(0, 2).map((r, i) => (
                          <div key={i} className={`text-xs px-2 py-1 rounded ${
                            r.level === 'critical' ? 'bg-red-100 text-red-700' :
                            r.level === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {r.message}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Status Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {tiers.map(tier => {
                    const latest = latestByTier[tier];
                    const inProg = records.find(r => r.tier === tier && r.status === 'in_progress');
                    const failed = records.find(r => r.tier === tier && r.status === 'failed');

                    let statusText = '尚無備份';
                    let statusColor = 'text-gray-400';

                    if (inProg) { statusText = '執行中'; statusColor = 'text-blue-600'; }
                    else if (latest) {
                      if (latest.status === 'verified') { statusText = '已驗證'; statusColor = 'text-emerald-600'; }
                      else { statusText = '已完成'; statusColor = 'text-green-600'; }
                    } else if (failed) { statusText = '上次失敗'; statusColor = 'text-red-600'; }

                    return (
                      <div key={tier} className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
                        <h3 className="text-xs font-medium text-gray-500 mb-2">{TIER_LABELS[tier]}</h3>
                        <div className={`text-sm font-semibold mb-1 ${statusColor}`}>
                          {statusText}
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
                          {triggeringTier === tier ? '觸發中...' : '手動觸發'}
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
                        <div className="text-xs text-gray-400 mb-0.5">還原演練頻率</div>
                        <div className="font-medium text-gray-700">
                          每 {config.drillFrequencyDays || 7} 天
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

            {/* ===== Railway 雲端備份 ===== */}
            {activeTab === 'railway' && (
              <div className="space-y-5">
                {/* Header info */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                        <span className="text-xl">🐘</span> Railway PostgreSQL 雲端備份
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        透過 Railway API 查看雲端資料庫的備份狀態與備份紀錄
                      </p>
                    </div>
                    <button
                      onClick={fetchRailwayData}
                      disabled={railwayLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-200 disabled:opacity-50"
                    >
                      <svg className={`h-4 w-4 ${railwayLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      重新整理
                    </button>
                  </div>
                </div>

                {railwayLoading && !railwayData ? (
                  <div className="text-center py-16 text-gray-400">連線 Railway 中...</div>
                ) : !railwayData ? (
                  <div className="text-center py-16 text-gray-400">點擊「重新整理」載入 Railway 資料</div>
                ) : !railwayData.connected ? (
                  /* ── NOT CONNECTED ── */
                  <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-6">
                    <div className="flex items-start gap-4">
                      <span className="text-3xl">⚙️</span>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-800 mb-1">
                          {railwayData.reason === 'NOT_CONFIGURED' ? 'Railway API Token 未設定' : 'Railway API 連線失敗'}
                        </h4>
                        <p className="text-sm text-gray-600 mb-4">{railwayData.message}</p>

                        <div className="bg-gray-900 rounded-lg p-4 text-sm font-mono mb-4">
                          <p className="text-gray-400 text-xs mb-2"># Railway 專案 Variables 新增以下設定：</p>
                          <p className="text-green-400">RAILWAY_API_TOKEN<span className="text-white"> = </span><span className="text-amber-300">your_token_here</span></p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <a href="https://railway.app/account/tokens" target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
                            🔑 取得 Railway API Token
                          </a>
                          <a href={railwayData.dashboardUrl} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900">
                            🚂 開啟 Railway Dashboard
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── CONNECTED ── */
                  <>
                    {/* Warning: RAILWAY_PROJECT_ID not wired */}
                    {!railwayData.projectIdAvailable && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                        <span className="text-amber-500 text-lg">⚠️</span>
                        <div>
                          <p className="text-sm font-semibold text-amber-800">Token 連線成功，但缺少 RAILWAY_PROJECT_ID</p>
                          <p className="text-xs text-amber-700 mt-1">
                            在 Railway app service → Variables 新增：
                            <code className="ml-1 bg-amber-100 px-1.5 py-0.5 rounded font-mono">RAILWAY_PROJECT_ID</code>
                            → 值選擇 <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">{'${{RAILWAY_PROJECT_ID}}'}</code>（Railway Reference 變數）
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Connection status + Project info */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-4">
                        <p className="text-xs text-gray-500 mb-1">連線狀態</p>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                          <span className="font-semibold text-emerald-700">已連線</span>
                        </div>
                        {railwayData.me && (
                          <p className="text-xs text-gray-400 mt-1">{railwayData.me.name || railwayData.me.email}</p>
                        )}
                        {railwayData.project && (
                          <p className="text-xs text-gray-400 mt-1">專案：{railwayData.project.name}</p>
                        )}
                      </div>

                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <p className="text-xs text-gray-500 mb-1">PostgreSQL 狀態</p>
                        {railwayData.postgresPlugin ? (
                          <>
                            <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full inline-block ${railwayData.postgresPlugin.status === 'RUNNING' ? 'bg-emerald-500' : 'bg-amber-400'}`}></span>
                              <span className="font-semibold text-gray-800">{railwayData.postgresPlugin.status}</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">{railwayData.postgresPlugin.name}</p>
                          </>
                        ) : (
                          <p className="text-sm text-gray-400">未偵測到 Plugin</p>
                        )}
                      </div>

                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <p className="text-xs text-gray-500 mb-1">最新部署</p>
                        {railwayData.latestDeployment ? (
                          <>
                            <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full inline-block ${railwayData.latestDeployment.status === 'SUCCESS' ? 'bg-emerald-500' : 'bg-amber-400'}`}></span>
                              <span className="font-semibold text-gray-800 text-sm">{railwayData.latestDeployment.status}</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">{formatDate(railwayData.latestDeployment.createdAt)}</p>
                          </>
                        ) : (
                          <p className="text-sm text-gray-400">-</p>
                        )}
                      </div>
                    </div>

                    {/* Open Railway backup page button */}
                    <div className="flex flex-wrap gap-3">
                      <a href={railwayData.backupTabUrl} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 shadow-sm">
                        🐘 開啟 Railway 備份管理頁面
                      </a>
                      <a href={railwayData.dashboardUrl} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 shadow-sm">
                        🚂 Railway Dashboard
                      </a>
                    </div>

                    {/* Backup list */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                        <h4 className="font-semibold text-gray-800">Railway 備份紀錄</h4>
                        {railwayData.backupError && (
                          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                            備份列表需升級 Railway 方案
                          </span>
                        )}
                      </div>

                      {railwayData.backupError && railwayData.backups.length === 0 ? (
                        /* Railway didn't expose backups via API — show guide */
                        <div className="p-6 text-center space-y-4">
                          <div className="text-4xl">🔒</div>
                          <div>
                            <p className="text-sm font-medium text-gray-700">備份檔案需在 Railway 平台查看</p>
                            <p className="text-xs text-gray-400 mt-1">
                              Railway 的 Postgres 備份儲存在加密的雲端儲存，目前需透過 Railway Dashboard 查看與還原
                            </p>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left mx-auto max-w-lg">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2 text-xs text-gray-500">在 Railway Dashboard 中可見的操作</th>
                                  <th className="px-4 py-2 text-xs text-gray-500">說明</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {[
                                  { action: 'New backup', desc: '手動觸發備份' },
                                  { action: 'Edit schedule', desc: '設定自動備份排程' },
                                  { action: 'Restore', desc: '還原至指定備份時間點' },
                                ].map(row => (
                                  <tr key={row.action}>
                                    <td className="px-4 py-2 font-mono text-xs bg-gray-100 text-gray-700 rounded">{row.action}</td>
                                    <td className="px-4 py-2 text-gray-600">{row.desc}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <a href={railwayData.backupTabUrl} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-2 px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700">
                            前往 Railway 查看備份 →
                          </a>
                        </div>
                      ) : railwayData.backups.length > 0 ? (
                        /* Show backup list from Railway API */
                        <table className="w-full">
                          <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">時間 (UTC)</th>
                              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">狀態</th>
                              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">大小</th>
                              <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {railwayData.backups.map((bk, i) => (
                              <tr key={bk.id || i} className="hover:bg-gray-50">
                                <td className="px-5 py-3 text-sm text-gray-800 font-mono">
                                  {bk.createdAt ? new Date(bk.createdAt).toLocaleString('zh-TW') : '-'}
                                </td>
                                <td className="px-5 py-3">
                                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                    bk.status === 'COMPLETED' || bk.status === 'SUCCESS'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : bk.status === 'IN_PROGRESS'
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-gray-100 text-gray-600'
                                  }`}>
                                    {bk.status || '已完成'}
                                  </span>
                                </td>
                                <td className="px-5 py-3 text-sm text-right text-gray-600">
                                  {bk.size ? formatFileSize(bk.size) : '-'}
                                </td>
                                <td className="px-5 py-3 text-center">
                                  {bk.restoreUrl ? (
                                    <a href={bk.restoreUrl} target="_blank" rel="noreferrer"
                                      className="px-3 py-1 bg-gray-800 text-white text-xs rounded-lg hover:bg-gray-900">
                                      Restore
                                    </a>
                                  ) : (
                                    <a href={railwayData.backupTabUrl} target="_blank" rel="noreferrer"
                                      className="px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200">
                                      Railway →
                                    </a>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="text-center py-10 text-gray-400 text-sm">尚無備份紀錄</div>
                      )}
                    </div>

                    {/* How Railway backup works — info box */}
                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-sm text-purple-800">
                      <p className="font-semibold mb-1">Railway 備份說明</p>
                      <ul className="text-xs text-purple-700 space-y-1 list-disc list-inside">
                        <li>Railway Postgres 備份儲存在加密的雲端儲存（🔒 符號代表已加密）</li>
                        <li>預設自動備份頻率視方案而定（Hobby Plan：每日；Pro Plan：更頻繁）</li>
                        <li>手動備份可透過 Railway Dashboard 的「New backup」按鈕觸發</li>
                        <li>還原操作會覆蓋現有資料庫，請謹慎操作</li>
                      </ul>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ===== 還原演練 (Drill + RTO/RPO) ===== */}
            {activeTab === 'drill' && (
              <div className="space-y-6">
                {/* RTO/RPO Dashboard */}
                {rtoRpoData && (
                  <>
                    {/* Health Score */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      <div className={`rounded-lg border p-4 ${
                        rtoRpoData.healthScore >= 80 ? 'bg-green-50 border-green-200' :
                        rtoRpoData.healthScore >= 60 ? 'bg-yellow-50 border-yellow-200' :
                        rtoRpoData.healthScore >= 40 ? 'bg-orange-50 border-orange-200' :
                        'bg-red-50 border-red-200'
                      }`}>
                        <div className="text-xs text-gray-500 mb-1">健康分數</div>
                        <div className={`text-2xl font-bold ${
                          rtoRpoData.healthScore >= 80 ? 'text-green-700' :
                          rtoRpoData.healthScore >= 60 ? 'text-yellow-700' :
                          rtoRpoData.healthScore >= 40 ? 'text-orange-700' :
                          'text-red-700'
                        }`}>
                          {rtoRpoData.healthScore} <span className="text-lg">/ 100</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">等級: {rtoRpoData.healthGrade}</div>
                      </div>
                      <div className={`bg-white rounded-lg border p-4 ${rtoRpoData.currentStatus.rpoCompliant ? 'border-green-200' : 'border-red-200'}`}>
                        <div className="text-xs text-gray-500 mb-1">RPO 現況</div>
                        <div className={`text-lg font-bold ${rtoRpoData.currentStatus.rpoCompliant ? 'text-green-700' : 'text-red-700'}`}>
                          {rtoRpoData.currentStatus.rpoFormatted || '無備份'}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">目標: {rtoRpoData.targets.rpoTargetHours} 小時內</div>
                      </div>
                      <div className={`bg-white rounded-lg border p-4 ${rtoRpoData.drillStatus.lastRtoCompliant ? 'border-green-200' : 'border-red-200'}`}>
                        <div className="text-xs text-gray-500 mb-1">RTO 上次實測</div>
                        <div className={`text-lg font-bold ${rtoRpoData.drillStatus.lastRtoCompliant === null ? 'text-gray-400' : rtoRpoData.drillStatus.lastRtoCompliant ? 'text-green-700' : 'text-red-700'}`}>
                          {rtoRpoData.drillStatus.lastRestoreFormatted || '尚未測試'}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">目標: {rtoRpoData.targets.rtoTargetMinutes} 分鐘內</div>
                      </div>
                      <div className={`bg-white rounded-lg border p-4 ${rtoRpoData.drillStatus.drillOverdue ? 'border-red-200' : 'border-green-200'}`}>
                        <div className="text-xs text-gray-500 mb-1">上次演練</div>
                        <div className={`text-lg font-bold ${rtoRpoData.drillStatus.drillOverdue ? 'text-red-700' : 'text-green-700'}`}>
                          {rtoRpoData.drillStatus.daysSinceLastDrill != null ? `${rtoRpoData.drillStatus.daysSinceLastDrill} 天前` : '從未執行'}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">頻率: 每 {rtoRpoData.targets.drillFrequencyDays} 天</div>
                      </div>
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <div className="text-xs text-gray-500 mb-1">演練通過率</div>
                        <div className="text-lg font-bold text-gray-700">
                          {rtoRpoData.trend.passRate || '-'}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">RTO: {rtoRpoData.trend.rtoPassRate || '-'} | RPO: {rtoRpoData.trend.rpoPassRate || '-'}</div>
                      </div>
                    </div>

                    {/* Health Factors */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">健康評分明細</h3>
                      <div className="space-y-2">
                        {rtoRpoData.healthFactors?.map((f, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <div className="w-24 text-xs text-gray-500">{f.factor}</div>
                            <div className="flex-1">
                              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${f.score >= f.max * 0.8 ? 'bg-green-500' : f.score >= f.max * 0.5 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                  style={{ width: `${(f.score / f.max) * 100}%` }}
                                />
                              </div>
                            </div>
                            <div className="w-16 text-xs text-right text-gray-600">{f.score}/{f.max}</div>
                            <div className="w-40 text-xs text-gray-400 truncate">{f.detail}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Recommendations */}
                    {rtoRpoData.recommendations?.length > 0 && (
                      <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
                        <h3 className="text-sm font-semibold text-amber-800 mb-2">改善建議</h3>
                        <div className="space-y-2">
                          {rtoRpoData.recommendations.map((r, i) => (
                            <div key={i} className={`text-xs px-3 py-2 rounded ${
                              r.level === 'critical' ? 'bg-red-100 text-red-700 font-medium' :
                              r.level === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {r.level === 'critical' ? '[嚴重] ' : r.level === 'warning' ? '[警告] ' : '[建議] '}{r.message}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Drill Action + History */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-700">還原演練紀錄</h3>
                    <button
                      onClick={triggerDrill}
                      disabled={runningDrill}
                      className="px-4 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-800 disabled:opacity-50"
                    >
                      {runningDrill ? '演練中...' : '立即執行還原演練'}
                    </button>
                  </div>

                  {drillData?.drills?.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">時間</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">備份層級</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">狀態</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">還原方式</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">RTO 實測</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">RTO</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">RPO</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">RPO</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">觸發</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {drillData.drills.map(d => (
                          <tr key={d.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-xs text-gray-600">{formatDate(d.startedAt)}</td>
                            <td className="px-3 py-2 text-xs">{TIER_LABELS[d.backup?.tier] || d.backup?.tier || '-'}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[d.status] || 'bg-gray-100 text-gray-700'}`}>
                                {STATUS_LABELS[d.status] || d.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-gray-500">
                              {d.restoreMethod === 'pg_restore_temp_schema' ? 'pg_restore' :
                               d.restoreMethod === 'json_validate_insert' ? 'JSON 驗證' :
                               d.restoreMethod || '-'}
                            </td>
                            <td className="px-3 py-2 text-right text-xs font-mono">
                              {d.restoreDurationMs != null ? formatDuration(d.restoreDurationMs) : '-'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {d.rtoCompliant === true && <span className="text-green-600 text-xs font-medium">OK</span>}
                              {d.rtoCompliant === false && <span className="text-red-600 text-xs font-medium">超標</span>}
                              {d.rtoCompliant == null && <span className="text-gray-400 text-xs">-</span>}
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-gray-600">
                              {d.dataAgeMinutes != null ? (d.dataAgeMinutes < 60 ? `${d.dataAgeMinutes}m` : `${(d.dataAgeMinutes / 60).toFixed(1)}h`) : '-'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {d.rpoCompliant === true && <span className="text-green-600 text-xs font-medium">OK</span>}
                              {d.rpoCompliant === false && <span className="text-red-600 text-xs font-medium">超標</span>}
                              {d.rpoCompliant == null && <span className="text-gray-400 text-xs">-</span>}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-400">{d.triggeredBy || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      尚無還原演練紀錄，請點擊「立即執行還原演練」開始第一次演練
                    </div>
                  )}
                </div>

                {/* Trend / Stats */}
                {rtoRpoData?.trend && (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">趨勢統計（近 30 次）</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-xs text-gray-400 mb-0.5">平均還原時間</div>
                        <div className="font-medium text-gray-700">{rtoRpoData.trend.avgRestoreFormatted || '-'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 mb-0.5">最長還原時間</div>
                        <div className="font-medium text-gray-700">{rtoRpoData.trend.maxRestoreFormatted || '-'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 mb-0.5">RTO 達標率</div>
                        <div className="font-medium text-gray-700">{rtoRpoData.trend.rtoPassRate || '-'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 mb-0.5">RPO 達標率</div>
                        <div className="font-medium text-gray-700">{rtoRpoData.trend.rpoPassRate || '-'}</div>
                      </div>
                    </div>
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
                                <span className="text-green-600">已上傳</span>
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
                                  {verifyingId === r.id ? '驗證中...' : '驗證'}
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
                                      備份已驗證（{formatDate(r.verifiedAt)}）
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
                        編輯
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
                      <ConfigField label="Tier 1 全量備份時間" value={configForm.tier1BackupTime || '04:00'} editing={editingConfig} type="time" onChange={v => setConfigForm(p => ({ ...p, tier1BackupTime: v }))} />
                      <ConfigField label="Tier 2 快照備份時間" value={configForm.tier2SnapshotTime || '04:30'} editing={editingConfig} type="time" onChange={v => setConfigForm(p => ({ ...p, tier2SnapshotTime: v }))} />
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
                      <ConfigField label="自動驗證時間" value={configForm.verifyTime || '06:00'} editing={editingConfig} type="time" onChange={v => setConfigForm(p => ({ ...p, verifyTime: v }))} />
                    </div>

                    <hr className="border-gray-100" />

                    <div className="grid grid-cols-2 gap-4">
                      <ConfigField label="Tier 1 本地保留天數" value={configForm.tier1RetainDays || 90} editing={editingConfig} type="number" min={1} suffix=" 天" onChange={v => setConfigForm(p => ({ ...p, tier1RetainDays: parseInt(v) }))} />
                      <ConfigField label="Tier 2 本地保留天數" value={configForm.tier2RetainDays || 30} editing={editingConfig} type="number" min={1} suffix=" 天" onChange={v => setConfigForm(p => ({ ...p, tier2RetainDays: parseInt(v) }))} />
                    </div>

                    <hr className="border-gray-100" />
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">RTO / RPO 目標</h4>

                    <div className="grid grid-cols-2 gap-4">
                      <ConfigField label="RTO 目標（分鐘）" value={configForm.rtoTargetMinutes || 60} editing={editingConfig} type="number" min={1} max={1440} suffix=" 分鐘" onChange={v => setConfigForm(p => ({ ...p, rtoTargetMinutes: parseInt(v) }))} />
                      <ConfigField label="RPO 目標（小時）" value={configForm.rpoTargetHours || 24} editing={editingConfig} type="number" min={1} max={168} suffix=" 小時" onChange={v => setConfigForm(p => ({ ...p, rpoTargetHours: parseInt(v) }))} />
                    </div>

                    <hr className="border-gray-100" />
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">還原演練排程</h4>

                    <div className="grid grid-cols-2 gap-4">
                      <ConfigField label="演練頻率（天）" value={configForm.drillFrequencyDays || 7} editing={editingConfig} type="number" min={1} max={90} suffix=" 天" onChange={v => setConfigForm(p => ({ ...p, drillFrequencyDays: parseInt(v) }))} />
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">啟用自動演練</label>
                        {editingConfig ? (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={configForm.drillEnabled !== false} onChange={e => setConfigForm(p => ({ ...p, drillEnabled: e.target.checked }))} className="rounded" />
                            <span className="text-sm text-gray-700">定期自動執行還原演練</span>
                          </label>
                        ) : (
                          <div className={`font-medium ${configForm.drillEnabled !== false ? 'text-green-600' : 'text-gray-400'}`}>
                            {configForm.drillEnabled !== false ? '已啟用' : '已停用'}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">演練時執行實際還原</label>
                        {editingConfig ? (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={configForm.drillAutoRestore !== false} onChange={e => setConfigForm(p => ({ ...p, drillAutoRestore: e.target.checked }))} className="rounded" />
                            <span className="text-sm text-gray-700">還原至暫時結構並驗證</span>
                          </label>
                        ) : (
                          <div className={`font-medium ${configForm.drillAutoRestore !== false ? 'text-green-600' : 'text-gray-400'}`}>
                            {configForm.drillAutoRestore !== false ? '已啟用' : '僅檔案驗證'}
                          </div>
                        )}
                      </div>
                    </div>

                    <hr className="border-gray-100" />

                    {/* 加密設定 */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">備份加密（AES-256-GCM）</label>
                      {editingConfig ? (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={!!configForm.encryptionEnabled} onChange={e => setConfigForm(p => ({ ...p, encryptionEnabled: e.target.checked }))} className="rounded" />
                          <span className="text-sm text-gray-700">啟用靜態加密（需設定 BACKUP_ENCRYPTION_KEY 環境變數）</span>
                        </label>
                      ) : (
                        <div className={`font-medium ${configForm.encryptionEnabled ? 'text-green-600' : 'text-gray-400'}`}>
                          {configForm.encryptionEnabled ? '已啟用' : '未啟用'}
                        </div>
                      )}
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
                  <h3 className="text-sm font-semibold text-amber-800 mb-2">注意事項</h3>
                  <ul className="text-xs text-amber-700 space-y-1">
                    <li>Tier 1 全量備份需要系統具備 pg_dump 工具與足夠磁碟空間</li>
                    <li>還原演練會在臨時 schema 中執行 pg_restore 測試，不影響正式資料</li>
                    <li>RTO 目標 = 還原可接受的最大時間；RPO 目標 = 可容忍的資料遺失時間</li>
                    <li>建議 RTO/RPO 演練頻率至少每 7 天一次，高風險環境建議每日</li>
                    <li>Tier 3 年度備份保存 7 年，不提供自動刪除</li>
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

function ConfigField({ label, value, editing, type, min, max, suffix, onChange }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {editing ? (
        <input
          type={type}
          min={min}
          max={max}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="border rounded px-2 py-1 text-sm w-full"
        />
      ) : (
        <div className="font-medium text-gray-700">{value}{suffix || ''}</div>
      )}
    </div>
  );
}

function formatDuration(ms) {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
