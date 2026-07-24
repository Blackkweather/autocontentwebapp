// Session auth for Club OS. A signed (HMAC-SHA256) cookie replaces the old HTTP Basic Auth so we
// can show a real branded login page instead of the browser popup. Runs in both the Edge proxy
// and Node route handlers via Web Crypto (available in both runtimes).

export const SESSION_COOKIE = "clubos_session";
const SECRET = process.env.SESSION_SECRET || "club-os-dev-secret";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// Demo credentials. Override with ADMIN_USER / ADMIN_PASSWORD env vars in production.
export function checkCredentials(username: string, password: string): boolean {
  const user = process.env.ADMIN_USER || "admin";
  const pass = process.env.ADMIN_PASSWORD || "Admin123";
  return username === user && password === pass;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(sig));
}

export async function createSession(username: string): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ u: username, exp: Date.now() + MAX_AGE * 1000 })));
  return `${payload}.${await sign(payload)}`;
}

export async function verifySession(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if ((await sign(payload)) !== sig) return false;
  try {
    const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));
    return typeof json.exp === "number" && json.exp > Date.now();
  } catch {
    return false;
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
  secure: process.env.NODE_ENV === "production",
};
