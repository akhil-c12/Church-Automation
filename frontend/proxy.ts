import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: avoids flashing the app shell to signed-out visitors.
// Real authentication happens in the backend on every /api request.
const SESSION_COOKIES = ["__Host-cbd_session", "cbd_session"];

export function proxy(request: NextRequest) {
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (!hasSession) {
    const url = request.nextUrl.clone();
    const next = request.nextUrl.pathname + request.nextUrl.search;
    url.pathname = "/login";
    url.search = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except the login page, the API proxy, and static assets.
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp|txt)$).*)"],
};
