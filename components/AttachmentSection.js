'use client';

import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/context/ToastContext';

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function AttachmentSection({ sourceModule, sourceRecordId, canUpload = true, canDelete = true, userEmail = '' }) {
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (sourceRecordId) fetchAttachments();
  }, [sourceModule, sourceRecordId]);

  async function fetchAttachments() {
    try {
      const res = await fetch(`/api/attachments?sourceModule=${sourceModule}&sourceRecordId=${sourceRecordId}`);
      const data = await res.json();
      setAttachments(Array.isArray(data) ? data : []);
    } catch { setAttachments([]); }
  }

  async function handleUpload(files) {
    if (!files || files.length === 0) return;
    setUploading(true);

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sourceModule', sourceModule);
        formData.append('sourceRecordId', sourceRecordId.toString());
        formData.append('uploadedBy', userEmail);

        const res = await fetch('/api/attachments', { method: 'POST', body: formData });
        if (res.ok) {
          // success
        } else {
          const err = await res.json();
          showToast(err.error || '上傳失敗', 'error');
        }
      } catch {
        showToast('上傳發生錯誤', 'error');
      }
    }

    setUploading(false);
    fetchAttachments();
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  }

  function handleDragOver(e) {
    e.preventDefault();
    setDragOver(true);
  }

  async function handleDelete(id, fileName) {
    if (!confirm(`確定要刪除附件「${fileName}」？`)) return;
    try {
      const res = await fetch(`/api/attachments/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchAttachments();
      } else {
        const err = await res.json();
        showToast(err.error || '刪除失敗', 'error');
      }
    } catch {
      showToast('刪除發生錯誤', 'error');
    }
  }

  function getFileIcon(type) {
    if (type?.startsWith('image/')) return '🖼️';
    if (type === 'application/pdf') return '📄';
    if (type?.includes('word')) return '📝';
    if (type?.includes('sheet') || type === 'text/csv') return '📊';
    return '📎';
  }

  if (!sourceRecordId) return null;

  return (
    <div className="mt-4">
      <h4 className="text-sm font-medium text-gray-700 mb-2">附件</h4>

      {/* Upload area */}
      {canUpload && (
        <div
          className={`border-2 border-dashed rounded-lg p-4 text-center mb-3 transition-colors cursor-pointer ${
            dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xlsx,.csv"
            onChange={(e) => handleUpload(e.target.files)}
          />
          {uploading ? (
            <p className="text-sm text-blue-600">上傳中...</p>
          ) : (
            <p className="text-sm text-gray-500">
              拖曳檔案至此或點擊選擇（PDF/圖片/Word/Excel，上限 10MB）
            </p>
          )}
        </div>
      )}

      {/* Attachment list */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map(att => (
            <div key={att.id} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span>{getFileIcon(att.fileType)}</span>
                <span className="truncate font-medium">{att.fileName}</span>
                <span className="text-gray-400 whitespace-nowrap">{formatFileSize(att.fileSize)}</span>
              </div>
              <div className="flex items-center gap-2 ml-2">
                <button
                  onClick={() => window.open(`/api/attachments/${att.id}/preview`, '_blank')}
                  className="text-blue-600 hover:text-blue-800 text-xs"
                  title="預覽"
                >預覽</button>
                <button
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = `/api/attachments/${att.id}`;
                    a.download = att.fileName;
                    a.click();
                  }}
                  className="text-green-600 hover:text-green-800 text-xs"
                  title="下載"
                >下載</button>
                {canDelete && (
                  <button
                    onClick={() => handleDelete(att.id, att.fileName)}
                    className="text-red-600 hover:text-red-800 text-xs"
                    title="刪除"
                  >刪除</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {attachments.length === 0 && !canUpload && (
        <p className="text-sm text-gray-400">無附件</p>
      )}
    </div>
  );
}
