import { NextResponse } from "next/server";
import { SESSION_COOKIE, checkCredentials, createSession, cookieOptions } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username ?? "");
  const password = String(body.password ?? "");
  if (!checkCredentials(username, password)) {
    return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(username), cookieOptions);
  return res;
}
