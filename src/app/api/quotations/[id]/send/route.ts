import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';
import { MarkQuotationSentSchema } from '@/modules/quotations/schema';
import { markQuotationSent } from '@/modules/quotations/service';

const UuidSchema = z.string().uuid();

export async function POST(
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
    const parsed = MarkQuotationSentSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        'VALIDATION_FAILED',
        parsed.error.issues[0]?.message ?? 'กรุณาระบุช่องทางและผู้รับใบเสนอราคา',
        422
      );
    }

    const res = await markQuotationSent(user, id, parsed.data);
    return ok(res);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'FORBIDDEN') return fail('FORBIDDEN', 'Insufficient permissions', 403);
      if (err.message === 'NOT_FOUND') return fail('NOT_FOUND', 'Quotation not found', 404);
      if (err.message === 'INVALID_STATE') {
        return fail('INVALID_STATE_TRANSITION', 'ใบเสนอราคานี้ถูกส่งไปแล้ว', 409);
      }
    }
    console.error('Mark quotation sent error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'Failed to mark quotation sent', 500);
  }
}
