import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { canViewAllShipments, hasPermission, isUserRole } from '@/lib/auth/rbac';

describe('Password Hashing (scrypt)', () => {
  it('verifies matching password and rejects wrong password', () => {
    const hash = hashPassword('Perkin2026!');
    expect(hash).toContain(':');
    expect(verifyPassword('Perkin2026!', hash)).toBe(true);
    expect(verifyPassword('WrongPassword', hash)).toBe(false);
    expect(verifyPassword('Perkin2026!', 'malformed-hash')).toBe(false);
  });

  it('produces unique salted hashes for the same password', () => {
    const h1 = hashPassword('Perkin2026!');
    const h2 = hashPassword('Perkin2026!');
    expect(h1).not.toBe(h2);
  });
});

describe('RBAC Permissions Matrix', () => {
  it('validates known roles only', () => {
    expect(isUserRole('admin')).toBe(true);
    expect(isUserRole('sales_co')).toBe(true);
    expect(isUserRole('sales_manager')).toBe(true);
    expect(isUserRole('management')).toBe(true);
    expect(isUserRole('superuser')).toBe(false);
  });

  it('grants sales_co operational compare permissions but blocks admin/audit management', () => {
    expect(hasPermission('sales_co', 'shipments:create')).toBe(true);
    expect(hasPermission('sales_co', 'rates:verify')).toBe(true);
    expect(hasPermission('sales_co', 'comparisons:execute')).toBe(true);
    expect(hasPermission('sales_co', 'users:manage')).toBe(false);
    expect(hasPermission('sales_co', 'audit:read')).toBe(false);
    expect(canViewAllShipments('sales_co')).toBe(false);
  });

  it('keeps management read-only while allowing global visibility and audit inspection', () => {
    expect(hasPermission('management', 'shipments:read')).toBe(true);
    expect(hasPermission('management', 'audit:read')).toBe(true);
    expect(hasPermission('management', 'shipments:create')).toBe(false);
    expect(hasPermission('management', 'rates:verify')).toBe(false);
    expect(canViewAllShipments('management')).toBe(true);
  });
});
