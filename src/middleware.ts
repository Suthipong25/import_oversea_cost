import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE_NAME = 'perkin_session';
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/health'];

export function middleware(request: NextRequest) {
  // Direct internal mode by default (no login screen required unless REQUIRE_AUTH=true)
  if (process.env.REQUIRE_AUTH !== 'true') {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return NextResponse.next();
  }

  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!hasCookie) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
