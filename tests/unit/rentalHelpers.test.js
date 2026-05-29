import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CONTRACT_STATUSES,
  getContractDisplayStatus,
  getTenantDisplayName,
} from '@/app/rentals/_lib/rentalHelpers.js';

describe('CONTRACT_STATUSES', () => {
  it('defines exactly four statuses', () => {
    expect(CONTRACT_STATUSES).toHaveLength(4);
  });

  it('each status has value, label, and color', () => {
    for (const s of CONTRACT_STATUSES) {
      expect(s).toHaveProperty('value');
      expect(s).toHaveProperty('label');
      expect(s).toHaveProperty('color');
    }
  });

  it('active status uses green color', () => {
    const active = CONTRACT_STATUSES.find(s => s.value === 'active');
    expect(active?.color).toContain('green');
  });

  it('terminated status uses red color', () => {
    const terminated = CONTRACT_STATUSES.find(s => s.value === 'terminated');
    expect(terminated?.color).toContain('red');
  });
});

describe('getContractDisplayStatus', () => {
  afterEach(() => vi.useRealTimers());

  it('returns the original status for non-active contracts', () => {
    expect(getContractDisplayStatus({ status: 'terminated', endDate: '2020-01-01' })).toBe('terminated');
    expect(getContractDisplayStatus({ status: 'pending', endDate: null })).toBe('pending');
  });

  it('returns expired for an active contract whose endDate is in the past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15)); // Jun 15, 2024
    expect(getContractDisplayStatus({ status: 'active', endDate: '2024-01-01' })).toBe('expired');
  });

  it('returns active for an active contract whose endDate is in the future', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15)); // Jun 15, 2024
    expect(getContractDisplayStatus({ status: 'active', endDate: '2025-01-01' })).toBe('active');
  });

  it('returns active when endDate equals today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15)); // Jun 15, 2024
    // endDate < todayStr() — same day means NOT expired yet
    expect(getContractDisplayStatus({ status: 'active', endDate: '2024-06-15' })).toBe('active');
  });

  it('handles missing endDate gracefully', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15));
    expect(getContractDisplayStatus({ status: 'active', endDate: null })).toBe('active');
    expect(getContractDisplayStatus({ status: 'active' })).toBe('active');
  });
});

describe('getTenantDisplayName', () => {
  it('returns fullName for individual tenants', () => {
    expect(getTenantDisplayName({
      tenantType: 'individual',
      fullName: '王大明',
      companyName: '測試公司',
    })).toBe('王大明');
  });

  it('returns companyName for company tenants', () => {
    expect(getTenantDisplayName({
      tenantType: 'company',
      fullName: '王大明',
      companyName: '台灣測試有限公司',
    })).toBe('台灣測試有限公司');
  });

  it('returns - for null or undefined tenant', () => {
    expect(getTenantDisplayName(null)).toBe('-');
    expect(getTenantDisplayName(undefined)).toBe('-');
  });
});
