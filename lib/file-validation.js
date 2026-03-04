// spec17 - 附件管理檔案驗證

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const ALLOWED_MIME_TYPES = {
  'application/pdf': { ext: 'pdf', label: 'PDF' },
  'image/jpeg': { ext: 'jpg', label: 'JPEG' },
  'image/png': { ext: 'png', label: 'PNG' },
  'image/webp': { ext: 'webp', label: 'WebP' },
  'application/msword': { ext: 'doc', label: 'Word' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', label: 'Word' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', label: 'Excel' },
  'text/csv': { ext: 'csv', label: 'CSV' },
};

export function validateFile(file) {
  if (!file) return { valid: false, error: '未選擇檔案' };
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `檔案大小超過 ${MAX_FILE_SIZE / 1024 / 1024}MB 上限` };
  }
  if (!ALLOWED_MIME_TYPES[file.type]) {
    const allowed = Object.values(ALLOWED_MIME_TYPES).map(t => t.label).join(', ');
    return { valid: false, error: `不支援的檔案格式，允許：${allowed}` };
  }
  return { valid: true };
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
