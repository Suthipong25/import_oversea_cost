export const ROLES = ['admin', 'sales_co', 'sales_manager', 'management'] as const;
export type UserRole = (typeof ROLES)[number];

export type Permission =
  | 'shipments:read'
  | 'shipments:create'
  | 'shipments:edit_all'
  | 'suppliers:manage'
  | 'rates:ingest'
  | 'rates:verify'
  | 'comparisons:execute'
  | 'pricing:edit'
  | 'pricing:approve'
  | 'quotations:manage'
  | 'catalog:manage'
  | 'audit:read'
  | 'users:manage';

const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  admin: new Set<Permission>([
    'shipments:read',
    'shipments:create',
    'shipments:edit_all',
    'suppliers:manage',
    'rates:ingest',
    'rates:verify',
    'comparisons:execute',
    'pricing:edit',
    'pricing:approve',
    'quotations:manage',
    'catalog:manage',
    'audit:read',
    'users:manage',
  ]),
  sales_co: new Set<Permission>([
    'shipments:read',
    'shipments:create',
    'suppliers:manage',
    'rates:ingest',
    'rates:verify',
    'comparisons:execute',
    'pricing:edit',
    'quotations:manage',
  ]),
  sales_manager: new Set<Permission>([
    'shipments:read',
    'shipments:create',
    'shipments:edit_all',
    'suppliers:manage',
    'rates:ingest',
    'rates:verify',
    'comparisons:execute',
    'pricing:edit',
    'pricing:approve',
    'quotations:manage',
    'catalog:manage',
    'audit:read',
  ]),
  management: new Set<Permission>(['shipments:read', 'pricing:approve', 'audit:read']),
};

export function isUserRole(value: string): value is UserRole {
  return (ROLES as readonly string[]).includes(value);
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function canViewAllShipments(role: UserRole): boolean {
  return role === 'admin' || role === 'sales_manager' || role === 'management';
}
