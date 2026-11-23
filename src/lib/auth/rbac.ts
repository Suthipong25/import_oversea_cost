/**
 * บทบาทผู้ใช้งานทั้งหมดในระบบ (4 ระดับสิทธิ์):
 * - admin: ผู้ดูแลระบบสูงสุด ทำได้ทุกฟังก์ชัน
 * - sales_co: พนักงานประสานงานขาย (สร้างงาน, แกะราคา Agent, ตรวจสอบ, ส่งขออนุมัติราคา, ทำใบเสนอราคา)
 * - sales_manager: หัวหน้าฝ่ายขาย (ทำได้ทุกอย่างเหมือน sales_co + อนุมัติราคาขาย + ดูงานลูกทีมทุกคน)
 * - management: ผู้บริหาร (ดูภาพรวม, อนุมัติราคาขาย, ตรวจสอบ Audit Log)
 */
export const ROLES = ['admin', 'sales_co', 'sales_manager', 'management'] as const;
export type UserRole = (typeof ROLES)[number];

/**
 * สิทธิ์การทำงานเฉพาะด้าน (Granular Permissions) ในระบบ
 */
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

/**
 * ตารางสิทธิ์ของแต่ละบทบาท (Role-Permission Matrix)
 */
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

/**
 * ตรวจสอบว่าเป็นสตริงบทบาทที่ถูกต้องในระบบหรือไม่
 */
export function isUserRole(value: string): value is UserRole {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * ตรวจสอบว่าบทบาทที่ระบุมีสิทธิ์ในการดำเนินการนั้นๆ หรือไม่
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/**
 * ตรวจสอบว่าบทบาทนี้มีสิทธิ์มองเห็นงานเปรียบเทียบของทุกคนในบริษัทหรือไม่
 * (sales_co จะเห็นเฉพาะงานที่ตนเองเป็นผู้รับผิดชอบเท่านั้น)
 */
export function canViewAllShipments(role: UserRole): boolean {
  return role === 'admin' || role === 'sales_manager' || role === 'management';
}
