import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';
import { CreateSupplierSchema } from '@/modules/suppliers/schema';
import { createSupplierForUser, listSuppliers } from '@/modules/suppliers/service';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  const items = await listSuppliers();
  return ok(items);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  try {
    const body = await request.json().catch(() => null);
    const parsed = CreateSupplierSchema.safeParse(body);
    if (!parsed.success) {
      return fail('VALIDATION_FAILED', 'Invalid Agent details', 422, parsed.error.flatten());
    }
    const created = await createSupplierForUser(user, parsed.data);
    return ok(created, 201);
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      return fail('FORBIDDEN', 'Insufficient permissions', 403);
    }
    console.error('Create supplier error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'Failed to create Agent', 500);
  }
}
