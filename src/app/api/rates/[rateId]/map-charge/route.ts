import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';
import { MapUnmappedChargeSchema } from '@/modules/comparison/schema';
import { mapUnmappedChargeForUser } from '@/modules/comparison/service';

const UuidSchema = z.string().uuid();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ rateId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  const { rateId } = await context.params;
  if (!UuidSchema.safeParse(rateId).success) {
    return fail('VALIDATION_FAILED', 'Invalid rate ID', 422);
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = MapUnmappedChargeSchema.safeParse(body);
    if (!parsed.success) {
      return fail('VALIDATION_FAILED', 'Invalid mapping input', 422, parsed.error.flatten());
    }
    const res = await mapUnmappedChargeForUser(user, rateId, parsed.data);
    return ok(res);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'FORBIDDEN') return fail('FORBIDDEN', 'Insufficient permissions', 403);
      if (err.message === 'NOT_FOUND') return fail('NOT_FOUND', 'Charge or subject not found', 404);
    }
    console.error('Map unmapped charge error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'Failed to map charge', 500);
  }
}
