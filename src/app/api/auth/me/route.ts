import { getCurrentUser } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return fail('UNAUTHORIZED', 'Not authenticated', 401);
  }
  return ok(user);
}
