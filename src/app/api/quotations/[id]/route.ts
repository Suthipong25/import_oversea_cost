import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';
import { UpdateQuotationDraftSchema } from '@/modules/quotations/schema';
import { updateQuotationDraft } from '@/modules/quotations/service';

const UuidSchema = z.string().uuid();

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  const { id } = await context.params;
  if (!UuidSchema.safeParse(id).success) {
    return fail('VALIDATION_FAILED', 'Invalid quotation ID', 422);
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = UpdateQuotationDraftSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        'VALIDATION_FAILED',
        parsed.error.issues[0]?.message ?? 'Invalid quotation data',
        422,
        parsed.error.flatten()
      );
    }

    const res = await updateQuotationDraft(user, id, parsed.data);
    return ok(res);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'FORBIDDEN') return fail('FORBIDDEN', 'Insufficient permissions', 403);
      if (err.message === 'NOT_FOUND') return fail('NOT_FOUND', 'Quotation not found', 404);
      if (err.message === 'QUOTATION_IMMUTABLE') {
        return fail(
          'INVALID_STATE_TRANSITION',
          'ใบเสนอราคาที่ส่งแล้วไม่สามารถแก้ไขทับได้ กรุณากด "สร้าง Revision ใหม่"',
          409
        );
      }
    }
    console.error('Update quotation error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'Failed to update quotation', 500);
  }
}
