import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, expectedToken, sameToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = expectedToken();
  if (!expected) {
    return NextResponse.json(
      { error: "系统未设置 APP_PASSWORD；请先在环境变量里配置访问密码。" },
      { status: 500 },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "请求格式不正确。" }, { status: 400 });
  }

  const hashedCandidate = createHash("sha256").update(`footprint:${password}`).digest("hex");
  if (!sameToken(hashedCandidate, expected)) {
    return NextResponse.json({ error: "密码不正确。" }, { status: 401 });
  }

  const host = request.headers.get("host") ?? "";
  const secure =
    process.env.NODE_ENV === "production" &&
    !host.startsWith("localhost") &&
    !host.startsWith("127.0.0.1");
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: AUTH_COOKIE,
    value: expected,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}