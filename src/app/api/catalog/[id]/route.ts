import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';
import { CreateCatalogSubjectSchema } from '@/modules/rates/schema';
import {
  deleteCatalogSubjectForUser,
  updateCatalogSubjectForUser,
} from '@/modules/rates/service';

const UuidSchema = z.string().uuid('Invalid subject ID');

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  const { id } = await context.params;
  const parsedId = UuidSchema.safeParse(id);
  if (!parsedId.success) {
    return fail('VALIDATION_FAILED', 'Invalid subject ID', 422);
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = CreateCatalogSubjectSchema.safeParse(body);
    if (!parsed.success) {
      return fail('VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง', 422);
    }
    const updated = await updateCatalogSubjectForUser(user, parsedId.data, parsed.data);
    return ok(updated);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'FORBIDDEN') return fail('FORBIDDEN', 'ไม่มีสิทธิ์แก้ไขหัวข้อ', 403);
      if (err.message === 'NOT_FOUND') return fail('NOT_FOUND', 'ไม่พบหัวข้อที่ต้องการแก้ไข', 404);
    }
    console.error('Update catalog subject error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'แก้ไขหัวข้อไม่สำเร็จ', 500);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  const { id } = await context.params;
  const parsedId = UuidSchema.safeParse(id);
  if (!parsedId.success) {
    return fail('VALIDATION_FAILED', 'Invalid subject ID', 422);
  }

  try {
    const res = await deleteCatalogSubjectForUser(user, parsedId.data);
    return ok(res);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'FORBIDDEN') return fail('FORBIDDEN', 'ไม่มีสิทธิ์ลบหัวข้อ', 403);
      if (err.message === 'NOT_FOUND') return fail('NOT_FOUND', 'ไม่พบหัวข้อที่ต้องการลบ', 404);
    }
    console.error('Delete catalog subject error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'ลบหัวข้อไม่สำเร็จ', 500);
  }
}
