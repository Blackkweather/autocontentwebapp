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

/** Credential pairs this deployment accepts. Two sources, both optional, combined:
 *   - ADMIN_USER + ADMIN_PASSWORD — the original single-admin pair (kept for compatibility).
 *   - ADMIN_USERS — one or more "user:password" pairs, comma- or newline-separated, so a
 *     deployment can grant several people their own login (e.g. "ilyas:pw1,soufiane:pw2").
 *  All logins carry the same full-admin access; there's only one role in this app. */
function allowedCredentials(): Array<{ user: string; pass: string }> {
  const creds: Array<{ user: string; pass: string }> = [];

  const singleUser = process.env.ADMIN_USER;
  const singlePass = process.env.ADMIN_PASSWORD;
  if (singleUser && singlePass) creds.push({ user: singleUser, pass: singlePass });

  const multi = process.env.ADMIN_USERS;
  if (multi) {
    for (const pair of multi.split(/[,\n]/)) {
      const trimmed = pair.trim();
      if (!trimmed) continue;
      const sep = trimmed.indexOf(":"); // first colon only — passwords may not contain ':'
      if (sep === -1) continue;
      const user = trimmed.slice(0, sep).trim();
      const pass = trimmed.slice(sep + 1).trim();
      if (user && pass) creds.push({ user, pass });
    }
  }

  return creds;
}

export function proxy(request: NextRequest) {
  const allowed = allowedCredentials();

  if (allowed.length === 0) {
    return new NextResponse("Admin credentials are not configured for this deployment.", { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    try {
      const decoded = atob(authHeader.slice(6));
      const sep = decoded.indexOf(":");
      const suppliedUser = decoded.slice(0, sep);
      const suppliedPass = decoded.slice(sep + 1);
      // Compare against every accepted pair; timing-safe on each field.
      const matches = allowed.some(
        (c) => timingSafeEqual(suppliedUser, c.user) && timingSafeEqual(suppliedPass, c.pass)
      );
      if (matches) {
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
