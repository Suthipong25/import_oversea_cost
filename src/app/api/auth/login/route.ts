import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { fail, ok } from '@/lib/http/response';

const LoginSchema = z.object({
  email: z.string().trim().email('Valid email is required').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return fail('VALIDATION_FAILED', 'Invalid login credentials format', 422, parsed.error.flatten());
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);

    if (!user || !user.isActive || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return fail('UNAUTHORIZED', 'Invalid email or password', 401);
    }

    await createSession(user.id);

    return ok({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    });
  } catch (err) {
    console.error('Login error:', err);
    return fail('INTERNAL_SERVER_ERROR', 'Unable to process login', 500);
  }
}
