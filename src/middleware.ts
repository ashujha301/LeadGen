import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Pathname for post-login return URLs. Auth gating is in (app) layout. */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
