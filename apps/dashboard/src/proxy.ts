import { NextResponse, type NextRequest } from "next/server";

// Gates the entire app — admin page and every /api/* route. Every route here can trigger
// paid API calls (Groq, Replicate, SocialCrawl, Google, Brave) or mutate storage,
// and none of them had any access control before this. Fails closed: if credentials aren't
// configured in the deployment environment, nothing is reachable rather than everything.
const REALM = "Amaze Live";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function proxy(request: NextRequest) {
  const expectedUser = process.env.ADMIN_USER;
  const expectedPass = process.env.ADMIN_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return new NextResponse("Admin credentials are not configured for this deployment.", { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    try {
      const decoded = atob(authHeader.slice(6));
      const sep = decoded.indexOf(":");
      const suppliedUser = decoded.slice(0, sep);
      const suppliedPass = decoded.slice(sep + 1);
      if (timingSafeEqual(suppliedUser, expectedUser) && timingSafeEqual(suppliedPass, expectedPass)) {
        return NextResponse.next();
      }
    } catch {
      // fall through to 401
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${REALM}"` },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
