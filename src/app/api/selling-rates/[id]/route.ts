import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';
import { UpdateSellingRateSchema } from '@/modules/pricing/schema';
import { updateSellingRateForUser } from '@/modules/pricing/service';

const UuidSchema = z.string().uuid();

export async function PUT(
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
    const parsed = UpdateSellingRateSchema.safeParse(body);
    if (!parsed.success) {
      return fail('VALIDATION_FAILED', 'Invalid selling rate input', 422, parsed.error.flatten());
    }
    const result = await updateSellingRateForUser(user, id, parsed.data);
    return ok(result);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'FORBIDDEN') return fail('FORBIDDEN', 'Insufficient permissions', 403);
      if (err.message === 'NOT_FOUND') return fail('NOT_FOUND', 'Selling rate not found', 404);
    }
    console.error('Update selling rate error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'Failed to save selling rate', 500);
  }
}
