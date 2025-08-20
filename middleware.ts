// middleware.ts (project root)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  const { pathname, searchParams } = req.nextUrl;

  // Protect all /dashboard routes
  if (pathname.startsWith('/dashboard') && !session) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    // tell home page to open the login modal, and remember where we wanted to go
    url.searchParams.set('login', '1');
    url.searchParams.set('redirect', pathname + (searchParams.toString() ? `?${searchParams}` : ''));
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
