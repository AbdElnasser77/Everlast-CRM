import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const loggedIn = request.cookies.get("logged_in")?.value;
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/chats") && !loggedIn) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname === "/login" && loggedIn) {
    return NextResponse.redirect(new URL("/chats", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
