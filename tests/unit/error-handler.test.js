import { describe, it, expect, afterEach } from 'vitest';
import { createErrorResponse, ErrorCodes } from '@/lib/error-handler.js';

describe('createErrorResponse', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('returns JSON body with error message and status', async () => {
    const res = createErrorResponse('TEST', '發生錯誤', 422);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('發生錯誤');
    expect(body.code).toBe('TEST');
  });

  it('omits code when not provided', async () => {
    const res = createErrorResponse(null, '無代碼', 400);
    const body = await res.json();
    expect(body.error).toBe('無代碼');
    expect(body.code).toBeUndefined();
  });

  it('includes details only in development', async () => {
    process.env.NODE_ENV = 'development';
    const res = createErrorResponse('X', 'msg', 400, { hint: 'debug' });
    const body = await res.json();
    expect(body.details).toEqual({ hint: 'debug' });
  });

  it('excludes details in production', async () => {
    process.env.NODE_ENV = 'production';
    const res = createErrorResponse('X', 'msg', 400, { hint: 'debug' });
    const body = await res.json();
    expect(body.details).toBeUndefined();
  });
});

describe('ErrorCodes', () => {
  it('has stable HTTP status for auth errors', () => {
    expect(ErrorCodes.UNAUTHORIZED.status).toBe(401);
    expect(ErrorCodes.FORBIDDEN.status).toBe(403);
  });
});
