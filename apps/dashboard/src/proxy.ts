import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

// Gates the whole app behind a session cookie — but ONLY when auth is turned on. Auth is
// opt-in via the AUTH_ENABLED env var so the app can be viewed openly until credentials are
// configured; set AUTH_ENABLED=true (plus ADMIN_USER/ADMIN_PASSWORD) to switch the gate on.
// When enabled: the login page and auth endpoints are always reachable; everything else needs
// a valid session — unauthenticated API calls get 401, page requests redirect to /login.
const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Auth off → open access to the whole app.
  if (!AUTH_ENABLED) return NextResponse.next();

  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const valid = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (valid) return NextResponse.next();

  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
