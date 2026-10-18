import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

const ONBOARDING_PATH = '/onboarding';
const ADMIN_PATH = '/admin';
const PROTECTED_PREFIXES = ['/dashboard', '/profile', '/onboarding', ADMIN_PATH];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  if (!token && isProtected) {
    const login = new URL('/auth/login', req.url);
    login.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(login);
  }

  // The admin API routes check the role themselves; this keeps the admin UI
  // shell from rendering for signed-in users who are not admins.
  if (token && pathname.startsWith(ADMIN_PATH) && token.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  if (token && pathname.startsWith('/onboarding')) {
    return NextResponse.next();
  }

  if (
    token &&
    token.emailVerified &&
    !token.onboardingCompleted &&
    !pathname.startsWith(ONBOARDING_PATH) &&
    !pathname.startsWith('/api') &&
    isProtected
  ) {
    return NextResponse.redirect(new URL(ONBOARDING_PATH, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
