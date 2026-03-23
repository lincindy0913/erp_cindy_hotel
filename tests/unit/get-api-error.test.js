import { describe, it, expect } from 'vitest';
import { getApiError } from '../../lib/get-api-error.js';

describe('getApiError', () => {
  it('returns 未知錯誤 for null/undefined', () => {
    expect(getApiError(null)).toBe('未知錯誤');
    expect(getApiError(undefined)).toBe('未知錯誤');
  });

  it('returns data.error when string', () => {
    expect(getApiError({ error: '權限不足' })).toBe('權限不足');
  });

  it('returns nested error.message', () => {
    expect(getApiError({ error: { message: 'nested' } })).toBe('nested');
  });

  it('returns data.message', () => {
    expect(getApiError({ message: 'bad request' })).toBe('bad request');
  });

  it('returns 未知錯誤 when no known field', () => {
    expect(getApiError({ foo: 1 })).toBe('未知錯誤');
  });
});
