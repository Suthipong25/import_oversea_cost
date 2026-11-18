import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';
import { RequestApprovalSchema } from '@/modules/pricing/schema';
import { requestSellingRateApproval } from '@/modules/pricing/service';

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
    const body = await request.json().catch(() => ({}));
    const parsed = RequestApprovalSchema.safeParse(body);
    if (!parsed.success) {
      return fail('VALIDATION_FAILED', 'Invalid request notes', 422, parsed.error.flatten());
    }
    const updated = await requestSellingRateApproval(user, id, parsed.data);
    return ok(updated);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'FORBIDDEN') return fail('FORBIDDEN', 'Insufficient permissions', 403);
      if (err.message === 'NOT_FOUND') return fail('NOT_FOUND', 'Selling rate not found', 404);
      if (err.message === 'EMPTY_SELLING_PRICE') {
        return fail('VALIDATION_FAILED', 'กรุณากรอกราคาขายอย่างน้อย 1 รายการและกดบันทึกก่อนส่งขออนุมัติ', 422);
      }
      if (err.message === 'INVALID_STATE') {
        return fail('INVALID_STATE_TRANSITION', 'ไม่สามารถส่งขออนุมัติจากสถานะปัจจุบันได้', 409);
      }
    }
    console.error('Request approval error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'Failed to request approval', 500);
  }
}
