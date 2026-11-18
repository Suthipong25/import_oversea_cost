import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';
import { deleteRateRecordForUser } from '@/modules/rates/service';

const UuidSchema = z.string().uuid();

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ rateId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  const { rateId } = await context.params;
  if (!UuidSchema.safeParse(rateId).success) {
    return fail('VALIDATION_FAILED', 'Invalid rate ID', 422);
  }

  try {
    const res = await deleteRateRecordForUser(user, rateId);
    return ok(res);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'FORBIDDEN') return fail('FORBIDDEN', 'Insufficient permissions', 403);
      if (err.message === 'NOT_FOUND') return fail('NOT_FOUND', 'Rate record not found', 404);
    }
    console.error('Delete rate error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'Failed to delete rate', 500);
  }
}
