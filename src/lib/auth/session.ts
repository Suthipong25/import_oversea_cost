import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { eq, and, gt, asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sessions, users } from '@/lib/db/schema';
import { isUserRole, type UserRole } from './rbac';

export const SESSION_COOKIE_NAME = 'perkin_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export async function createSession(userId: string): Promise<void> {
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    userId,
    tokenHash,
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (rawToken) {
    const tokenHash = hashToken(rawToken);
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

async function getDefaultInternalUser(): Promise<AuthUser | null> {
  const preferred = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
    })
    .from(users)
    .where(and(eq(users.email, 'admin@perkin.co.th'), eq(users.isActive, true)))
    .limit(1);

  const fallback =
    preferred[0] ??
    (
      await db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          role: users.role,
        })
        .from(users)
        .where(eq(users.isActive, true))
        .orderBy(asc(users.createdAt))
        .limit(1)
    )[0];

  if (!fallback || !isUserRole(fallback.role)) return null;

  return {
    id: fallback.id,
    email: fallback.email,
    fullName: fallback.fullName,
    role: fallback.role,
  };
}

/**
 * อ่านผู้ใช้ปัจจุบันจาก Session Cookie (`perkin_session` เก็บเป็น SHA-256 hash ในตาราง sessions)
 *
 * โหมดการใช้งาน 2 แบบ (ควบคุมด้วย ENV `REQUIRE_AUTH`):
 * - `REQUIRE_AUTH="true"`: บังคับ Login — หากไม่มี Cookie หรือหมดอายุจะคืน null
 * - ค่าเริ่มต้น (ไม่ใช่ `"true"`): โหมดใช้งานภายในบริษัท — ใช้บัญชี admin@perkin.co.th ให้อัตโนมัติ
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (rawToken) {
    const tokenHash = hashToken(rawToken);
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        isActive: users.isActive,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
      .limit(1);

    const row = rows[0];
    if (row && row.isActive && isUserRole(row.role)) {
      return {
        id: row.id,
        email: row.email,
        fullName: row.fullName,
        role: row.role,
      };
    }
  }

  // Direct internal mode (no login required unless REQUIRE_AUTH=true)
  if (process.env.REQUIRE_AUTH !== 'true') {
    return getDefaultInternalUser();
  }

  return null;
}
