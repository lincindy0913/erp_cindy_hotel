import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/health/route.js';

describe('GET /api/health', () => {
  it('returns 200 and status ok', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('environment');
  });
});
