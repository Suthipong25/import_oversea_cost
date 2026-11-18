import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';
import { CreateCatalogSubjectSchema } from '@/modules/rates/schema';
import { createCatalogSubjectForUser } from '@/modules/rates/service';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  try {
    const body = await request.json().catch(() => null);
    const parsed = CreateCatalogSubjectSchema.safeParse(body);
    if (!parsed.success) {
      return fail('VALIDATION_FAILED', 'Invalid subject name', 422, parsed.error.flatten());
    }
    const created = await createCatalogSubjectForUser(user, parsed.data);
    return ok(created, 201);
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      return fail('FORBIDDEN', 'Insufficient permissions', 403);
    }
    console.error('Create catalog subject error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'Failed to add subject', 500);
  }
}
