import { describe, it, expect } from 'vitest';
import {
  MAX_FILE_SIZE,
  validateFile,
  formatFileSize,
  ALLOWED_MIME_TYPES,
} from '@/lib/file-validation.js';

describe('validateFile', () => {
  it('rejects missing file', () => {
    const r = validateFile(null);
    expect(r.valid).toBe(false);
    expect(r.error).toContain('未選擇');
  });

  it('rejects oversize file', () => {
    const r = validateFile({ size: MAX_FILE_SIZE + 1, type: 'application/pdf' });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('超過');
  });

  it('rejects unknown mime', () => {
    const r = validateFile({ size: 100, type: 'application/x-msdownload' });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('不支援');
  });

  it('accepts allowed pdf', () => {
    const r = validateFile({ size: 1024, type: 'application/pdf' });
    expect(r.valid).toBe(true);
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toContain('B');
  });

  it('formats KB', () => {
    expect(formatFileSize(2048)).toContain('KB');
  });

  it('formats MB', () => {
    expect(formatFileSize(2 * 1024 * 1024)).toContain('MB');
  });
});

describe('ALLOWED_MIME_TYPES', () => {
  it('includes pdf and xlsx', () => {
    expect(ALLOWED_MIME_TYPES['application/pdf']).toBeDefined();
    expect(
      ALLOWED_MIME_TYPES['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    ).toBeDefined();
  });
});
