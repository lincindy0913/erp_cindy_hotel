'use client';

import { useState, useEffect, useCallback } from 'react';
import FetchErrorBanner from '@/components/FetchErrorBanner';

const TIER_LABELS = {
  tier1_full:       { label: 'Tier 1 全量備份', desc: 'pg_dump 完整資料庫', color: 'bg-red-100 text-red-800' },
  tier2_snapshot:   { label: 'Tier 2 快照備份', desc: '快取彙總表 JSON', color: 'bg-blue-100 text-blue-800' },
  tier3_full:       { label: 'Tier 3 完整匯出', desc: '所有資料表 JSON', color: 'bg-purple-100 text-purple-800' },
  tier3_yearend:    { label: 'Tier 3 年度備份', desc: '年結自動觸發', color: 'bg-purple-100 text-purple-800' },
};

const TRIGGER_LABELS = { manual: '手動', scheduled: '排程', year_end: '年結' };

const STATUS_BADGE = {
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed:   'bg-green-100 text-green-800',
  failed:      'bg-red-100 text-red-800',
};
const STATUS_LABELS = { in_progress: '進行中', completed: '已完成', failed: '失敗' };

function formatBytes(bytes) {
  if (!bytes) return '—';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDt(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('zh-TW', { hour12: false });
}

export default function BackupPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [confirmTier, setConfirmTier] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchRecords = useCallback(async () => {
    setFetchError(null);
    try {
      const res = await fetch('/api/backup');
      if (!res.ok) throw new Error('備份記錄載入失敗，請稍後再試');
      const data = await res.json();
      setRecords(data.records || []);
    } catch (e) {
      setFetchError(e.message || '備份記錄載入失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Auto-refresh every 5s while any backup is in_progress
  useEffect(() => {
    const hasRunning = records.some(r => r.status === 'in_progress');
    if (!hasRunning) return;
    const timer = setInterval(fetchRecords, 8000);
    return () => clearInterval(timer);
  }, [records, fetchRecords]);

  async function triggerBackup(tier) {
    setTriggering(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || '觸發備份失敗');
      }
      setSuccessMsg(`備份任務 #${data.id} 已啟動 (${TIER_LABELS[tier]?.label})`);
      await fetchRecords();
    } catch (e) {
      setError(e.message);
    } finally {
      setTriggering(false);
      setConfirmTier(null);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">資料備份管理</h1>
        <p className="text-sm text-gray-500 mt-1">三層備份架構：pg_dump 全量、快照備份、完整 JSON 匯出</p>
      </div>

      {fetchError && <FetchErrorBanner message={fetchError} onRetry={fetchRecords} />}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}
      {successMsg && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">{successMsg}</div>
      )}

      {/* Trigger Panel */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">手動觸發備份</h2>
        <div className="flex flex-wrap gap-3">
          {['tier1_full', 'tier2_snapshot', 'tier3_full'].map(tier => {
            const meta = TIER_LABELS[tier];
            return (
              <button
                key={tier}
                onClick={() => setConfirmTier(tier)}
                disabled={triggering}
                className="flex flex-col items-start px-4 py-3 border border-gray-200 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-colors disabled:opacity-50 text-left"
              >
                <span className="text-sm font-medium text-gray-900">{meta.label}</span>
                <span className="text-xs text-gray-500 mt-0.5">{meta.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Confirm Modal */}
      {confirmTier && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-80">
            <h3 className="font-semibold text-gray-900 mb-2">確認觸發備份</h3>
            <p className="text-sm text-gray-600 mb-4">
              確定要觸發 <strong>{TIER_LABELS[confirmTier]?.label}</strong>？<br />
              {confirmTier === 'tier1_full' && <span className="text-amber-600">需要 pg_dump 工具，請確認環境已安裝。</span>}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmTier(null)}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >取消</button>
              <button
                onClick={() => triggerBackup(confirmTier)}
                disabled={triggering}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >{triggering ? '啟動中...' : '確認執行'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Records Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">備份紀錄</h2>
          <button
            onClick={fetchRecords}
            className="text-xs text-indigo-600 hover:text-indigo-800"
          >重新整理</button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">載入中...</div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">尚無備份紀錄</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">類型</th>
                <th className="px-4 py-2 text-left">觸發</th>
                <th className="px-4 py-2 text-left">狀態</th>
                <th className="px-4 py-2 text-right">檔案大小</th>
                <th className="px-4 py-2 text-left">SHA256</th>
                <th className="px-4 py-2 text-left">建立時間</th>
                <th className="px-4 py-2 text-left">完成時間</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={r.id} className={`border-t border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                  <td className="px-4 py-2 text-gray-500">{r.id}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_LABELS[r.tier]?.color || 'bg-gray-100 text-gray-600'}`}>
                      {TIER_LABELS[r.tier]?.label || r.tier}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{TRIGGER_LABELS[r.triggerType] || r.triggerType}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                    {r.status === 'in_progress' && (
                      <span className="ml-1 inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatBytes(r.fileSize)}</td>
                  <td className="px-4 py-2 text-gray-400 font-mono text-xs">
                    {r.sha256 ? r.sha256.slice(0, 12) + '…' : '—'}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{formatDt(r.createdAt)}</td>
                  <td className="px-4 py-2 text-gray-600">{formatDt(r.completedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-4 text-xs text-gray-400">
        備份檔案儲存於 <code className="bg-gray-100 px-1 rounded">BACKUP_ROOT</code> 環境變數指定的路徑。
        Railway 部署環境的本地磁碟為暫存性，重新部署後備份檔案將消失。建議搭配外部儲存（S3/NAS）。
      </p>
    </div>
  );
}
