import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';
import { CopyBaselineRowSchema } from '@/modules/rates/schema';
import { copyRowAcrossShipmentRates } from '@/modules/rates/service';

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
    const parsed = CopyBaselineRowSchema.safeParse(body);
    if (!parsed.success) {
      return fail('VALIDATION_FAILED', 'Invalid copy payload', 422, parsed.error.flatten());
    }
    const result = await copyRowAcrossShipmentRates(user, id, parsed.data);
    return ok(result);
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      return fail('FORBIDDEN', 'Insufficient permissions', 403);
    }
    console.error('Copy baseline row error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'Failed to copy row', 500);
  }
}
