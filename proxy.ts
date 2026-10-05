import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const loggedIn = request.cookies.get("logged_in")?.value;
  const { pathname, searchParams } = request.nextUrl;

  if (pathname.startsWith("/chats") && !loggedIn) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // `logged_in` is a client-written hint, not proof of a session — the real
  // credential is the httpOnly `token` JWT, which the API can reject at any
  // time. So this convenience redirect must never fire on the bounce-back
  // from an expired session: lib/api.ts sends 401s to /login?expired=1, and
  // honouring the hint there would push the user straight back to /chats,
  // which 401s again — an endless /login <-> /chats loop.
  if (pathname === "/login" && loggedIn && !searchParams.has("expired")) {
    return NextResponse.redirect(new URL("/chats", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
