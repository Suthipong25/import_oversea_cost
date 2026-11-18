import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';
import { CreateSupplierSchema } from '@/modules/suppliers/schema';
import { deleteSupplierForUser, updateSupplierForUser } from '@/modules/suppliers/service';

const UuidParamSchema = z.string().uuid('Invalid agent ID');

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  const { id } = await context.params;
  const parsedId = UuidParamSchema.safeParse(id);
  if (!parsedId.success) {
    return fail('VALIDATION_FAILED', 'Invalid agent ID format', 422);
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = CreateSupplierSchema.safeParse(body);
    if (!parsed.success) {
      return fail('VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ครบถ้วน', 422);
    }
    const updated = await updateSupplierForUser(user, parsedId.data, parsed.data);
    return ok(updated);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'FORBIDDEN') return fail('FORBIDDEN', 'ไม่มีสิทธิ์แก้ไขรายชื่อ Agent', 403);
      if (err.message === 'NOT_FOUND') return fail('NOT_FOUND', 'ไม่พบรายชื่อ Agent', 404);
    }
    console.error('Update supplier error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'แก้ไขรายชื่อ Agent ไม่สำเร็จ', 500);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  const { id } = await context.params;
  const parsed = UuidParamSchema.safeParse(id);
  if (!parsed.success) {
    return fail('VALIDATION_FAILED', 'Invalid agent ID format', 422);
  }

  try {
    const res = await deleteSupplierForUser(user, parsed.data);
    return ok(res);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'FORBIDDEN') return fail('FORBIDDEN', 'ไม่มีสิทธิ์ลบรายชื่อ Agent', 403);
      if (err.message === 'NOT_FOUND') return fail('NOT_FOUND', 'ไม่พบรายชื่อ Agent ที่ต้องการลบ', 404);
      if (err.message === 'SUPPLIER_IN_USE') {
        return fail(
          'INVALID_STATE_TRANSITION',
          'ไม่สามารถลบ Agent นี้ได้ เนื่องจากมีใบเสนอราคาที่ผูกอยู่ในงานเปรียบเทียบ',
          409
        );
      }
    }
    console.error('Delete supplier error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'ลบรายชื่อ Agent ไม่สำเร็จ', 500);
  }
}
