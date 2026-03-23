import { describe, it, expect } from 'vitest';
import {
  PERMISSIONS,
  ROLE_CODES,
  ROLE_DEFAULTS,
  hasPermission,
  hasAnyPermission,
  hasRoleConflict,
} from '@/lib/permissions.js';

describe('hasPermission', () => {
  it('returns false for invalid input', () => {
    expect(hasPermission(null, PERMISSIONS.SALES_VIEW)).toBe(false);
    expect(hasPermission(undefined, PERMISSIONS.SALES_VIEW)).toBe(false);
    expect(hasPermission('x', PERMISSIONS.SALES_VIEW)).toBe(false);
  });

  it('grants * as superuser', () => {
    expect(hasPermission(['*'], PERMISSIONS.SETTINGS_EDIT)).toBe(true);
  });

  it('checks exact permission', () => {
    expect(hasPermission([PERMISSIONS.SALES_VIEW], PERMISSIONS.SALES_VIEW)).toBe(true);
    expect(hasPermission([PERMISSIONS.SALES_VIEW], PERMISSIONS.SALES_CREATE)).toBe(false);
  });
});

describe('hasAnyPermission', () => {
  it('returns false for invalid input', () => {
    expect(hasAnyPermission(null, [PERMISSIONS.SALES_VIEW])).toBe(false);
  });

  it('returns true if any permission matches', () => {
    expect(
      hasAnyPermission([PERMISSIONS.PURCHASING_VIEW], [
        PERMISSIONS.SALES_CREATE,
        PERMISSIONS.PURCHASING_VIEW,
      ])
    ).toBe(true);
  });

  it('returns false if none match', () => {
    expect(
      hasAnyPermission([PERMISSIONS.PURCHASING_VIEW], [PERMISSIONS.USER_MANAGE])
    ).toBe(false);
  });
});

describe('hasRoleConflict', () => {
  it('detects finance + cashier', () => {
    expect(hasRoleConflict([ROLE_CODES.FINANCE, ROLE_CODES.CASHIER])).toBe(true);
    expect(hasRoleConflict([ROLE_CODES.FINANCE])).toBe(false);
  });
});

describe('ROLE_DEFAULTS', () => {
  it('admin role includes all PERMISSIONS keys', () => {
    const adminPerms = ROLE_DEFAULTS[ROLE_CODES.ADMIN];
    const all = Object.values(PERMISSIONS);
    expect(adminPerms.length).toBe(all.length);
    for (const p of all) {
      expect(adminPerms).toContain(p);
    }
  });

  it('viewer cannot manage users', () => {
    expect(ROLE_DEFAULTS[ROLE_CODES.VIEWER]).not.toContain(PERMISSIONS.USER_MANAGE);
  });
});
