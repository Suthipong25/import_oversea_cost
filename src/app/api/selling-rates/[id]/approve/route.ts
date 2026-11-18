import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';
import { approveSellingRate } from '@/modules/pricing/service';

const UuidSchema = z.string().uuid();

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  const { id } = await context.params;
  if (!UuidSchema.safeParse(id).success) {
    return fail('VALIDATION_FAILED', 'Invalid selling rate ID', 422);
  }

  try {
    const updated = await approveSellingRate(user, id);
    return ok(updated);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'FORBIDDEN') return fail('FORBIDDEN', 'ไม่มีสิทธิ์อนุมัติราคาขาย', 403);
      if (err.message === 'NOT_FOUND') return fail('NOT_FOUND', 'Selling rate not found', 404);
      if (err.message === 'MAKER_CHECKER_BLOCKED') {
        return fail('MAKER_CHECKER_BLOCKED', 'ผู้สร้างไม่สามารถอนุมัติราคาขายของตนเองได้ (Maker-Checker)', 403);
      }
      if (err.message === 'INVALID_STATE') {
        return fail('INVALID_STATE_TRANSITION', 'รายการนี้ไม่ได้อยู่ในสถานะรออนุมัติ', 409);
      }
    }
    console.error('Approve selling rate error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'Failed to approve selling rate', 500);
  }
}
