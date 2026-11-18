import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';
import { CreateShipmentSchema } from '@/modules/shipments/schema';
import { createShipmentForUser, listShipmentsForUser } from '@/modules/shipments/service';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  try {
    const items = await listShipmentsForUser(user);
    return ok(items);
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      return fail('FORBIDDEN', 'Insufficient permissions', 403);
    }
    console.error('List shipments error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'Failed to list shipments', 500);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  try {
    const body = await request.json().catch(() => null);
    const parsed = CreateShipmentSchema.safeParse(body);
    if (!parsed.success) {
      return fail('VALIDATION_FAILED', 'Invalid shipment input', 422, parsed.error.flatten());
    }

    const ip = request.headers.get('x-forwarded-for');
    const created = await createShipmentForUser(user, parsed.data, ip);
    return ok(created, 201);
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      return fail('FORBIDDEN', 'You do not have permission to create shipments', 403);
    }
    console.error('Create shipment error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'Failed to create shipment', 500);
  }
}
