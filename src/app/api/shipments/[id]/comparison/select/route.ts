import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';
import { SelectWinningAgentSchema } from '@/modules/comparison/schema';
import { selectWinningAgentForShipment } from '@/modules/comparison/service';

const UuidSchema = z.string().uuid();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  const { id } = await context.params;
  if (!UuidSchema.safeParse(id).success) {
    return fail('VALIDATION_FAILED', 'Invalid shipment ID', 422);
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = SelectWinningAgentSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        'VALIDATION_FAILED',
        parsed.error.issues[0]?.message ?? 'Invalid selection input',
        422,
        parsed.error.flatten()
      );
    }

    const comparison = await selectWinningAgentForShipment(user, id, parsed.data);
    return ok(comparison, 201);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'FORBIDDEN') return fail('FORBIDDEN', 'Insufficient permissions', 403);
      if (err.message === 'NOT_FOUND') return fail('NOT_FOUND', 'Shipment not found', 404);
      if (err.message === 'MIN_TWO_VERIFIED_RATES') {
        return fail(
          'INVALID_STATE_TRANSITION',
          'ต้องกดยืนยันข้อมูล (Verify) อย่างน้อย 2 Agent ก่อนจึงจะบันทึกเลือก Agent ได้',
          409
        );
      }
      if (err.message === 'SELECTED_RATE_NOT_VERIFIED') {
        return fail(
          'INVALID_STATE_TRANSITION',
          'ต้องกดยืนยันข้อมูล (Verify) ของ Agent นี้ก่อนเลือก',
          409
        );
      }
    }
    console.error('Select winning agent error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'ไม่สามารถบันทึกการเลือก Agent ได้', 500);
  }
}
