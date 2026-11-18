import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';
import { ReturnSellingRateSchema } from '@/modules/pricing/schema';
import { returnSellingRate } from '@/modules/pricing/service';

const UuidSchema = z.string().uuid();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  const { id } = await context.params;
  if (!UuidSchema.safeParse(id).success) {
    return fail('VALIDATION_FAILED', 'Invalid selling rate ID', 422);
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = ReturnSellingRateSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        'VALIDATION_FAILED',
        parsed.error.issues[0]?.message ?? 'กรุณาระบุเหตุผลที่ส่งกลับแก้ไข',
        422
      );
    }
    const updated = await returnSellingRate(user, id, parsed.data);
    return ok(updated);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'FORBIDDEN') return fail('FORBIDDEN', 'ไม่มีสิทธิ์ส่งกลับรายการนี้', 403);
      if (err.message === 'NOT_FOUND') return fail('NOT_FOUND', 'Selling rate not found', 404);
      if (err.message === 'INVALID_STATE') {
        return fail('INVALID_STATE_TRANSITION', 'รายการนี้ไม่ได้อยู่ในสถานะรออนุมัติ', 409);
      }
    }
    console.error('Return selling rate error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'Failed to return selling rate', 500);
  }
}
