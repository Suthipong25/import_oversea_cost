import { destroySession } from '@/lib/auth/session';
import { ok } from '@/lib/http/response';

export async function POST() {
  await destroySession();
  return ok({ loggedOut: true });
}
