import { describe, it, expect, vi, afterEach } from 'vitest';
import { todayStr, localDateStr } from '@/lib/localDate.js';

// These functions exist to avoid the UTC-midnight shift that
// Date.toISOString() produces in timezones ahead of UTC.

describe('localDateStr', () => {
  it('formats a Date object as YYYY-MM-DD in local timezone', () => {
    // new Date(y, m, d) constructs in LOCAL time — no UTC offset risk
    expect(localDateStr(new Date(2024, 0, 5))).toBe('2024-01-05');
  });

  it('pads single-digit month and day with a leading zero', () => {
    expect(localDateStr(new Date(2024, 1, 3))).toBe('2024-02-03');
    expect(localDateStr(new Date(2024, 8, 9))).toBe('2024-09-09');
  });

  it('handles year-end date without UTC shift', () => {
    // Dec 31 — in UTC+8, toISOString() might show Dec 30 if time is before 8:00 AM
    expect(localDateStr(new Date(2023, 11, 31))).toBe('2023-12-31');
  });

  it('defaults to today when called without arguments', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 2, 15, 0, 0, 0)); // Mar 15 2025 midnight local
    expect(localDateStr()).toBe('2025-03-15');
    vi.useRealTimers();
  });
});

describe('todayStr', () => {
  afterEach(() => vi.useRealTimers());

  it('returns today in YYYY-MM-DD format', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15)); // Jun 15, 2024
    expect(todayStr()).toBe('2024-06-15');
  });

  it('produces the same result as localDateStr(new Date())', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1)); // Jan 1, 2026
    expect(todayStr()).toBe(localDateStr(new Date()));
  });

  it('pads month and day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 9)); // Jan 9
    expect(todayStr()).toBe('2024-01-09');
  });
});
