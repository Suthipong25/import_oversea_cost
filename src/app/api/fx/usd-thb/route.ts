import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { fail } from '@/lib/http/response';
import { getLiveUsdToThbRate } from '@/lib/fx/live-rate';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail('UNAUTHORIZED', 'Authentication required', 401);

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get('refresh') === '1';

  const snapshot = await getLiveUsdToThbRate({ forceRefresh });
  return NextResponse.json(
    { success: true, data: snapshot },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
