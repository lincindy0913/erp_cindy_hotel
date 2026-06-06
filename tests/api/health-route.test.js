import { vi, describe, it, expect, afterEach } from 'vitest';
import { GET } from '@/app/api/health/route.js';

const originalNodeEnv = process.env.NODE_ENV;
afterEach(() => { process.env.NODE_ENV = originalNodeEnv; });

describe('GET /api/health', () => {
  it('returns 200 with status:ok and timestamp', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('timestamp');
  });

  it('non-production: includes version and environment', async () => {
    process.env.NODE_ENV = 'development';
    const body = await (await GET()).json();
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('environment');
  });

  it('production: omits version and environment', async () => {
    process.env.NODE_ENV = 'production';
    const body = await (await GET()).json();
    expect(body).not.toHaveProperty('version');
    expect(body).not.toHaveProperty('environment');
  });
});
