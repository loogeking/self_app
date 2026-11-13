import { NextResponse } from "next/server";
import type { AiConfig } from "@/components/proto/types";
import { isAuthed } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  let config: Partial<AiConfig>;
  try {
    config = ((await request.json()) as { config?: Partial<AiConfig> }).config ?? {};
  } catch {
    return NextResponse.json({ error: "请求体不是有效 JSON。" }, { status: 400 });
  }

  const baseUrl = String(config.baseUrl ?? "").trim().replace(/\/+$/, "");
  const apiKey = String(config.apiKey ?? "").trim();
  if (!baseUrl || !apiKey) {
    return NextResponse.json({ error: "缺少 Base URL 或 API Key。" }, { status: 400 });
  }

  let endpoint: string;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return NextResponse.json({ error: "Base URL 必须是 HTTPS（本地调试可用 localhost）。" }, { status: 400 });
    }
    endpoint = /\/models$/i.test(baseUrl) ? baseUrl : `${baseUrl}/models`;
  } catch {
    return NextResponse.json({ error: "Base URL 格式不正确。" }, { status: 400 });
  }

  try {
    const response = await fetch(endpoint, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(30000),
    });
    const raw = await response.text();
    let data: unknown = null;
    try {
      data = JSON.parse(raw);
    } catch {
      /* keep raw */
    }
    if (!response.ok) {
      return NextResponse.json(
        { error: `模型列表返回 ${response.status}：${raw.slice(0, 400) || "没有错误详情"}` },
        { status: 502 },
      );
    }
    const list =
      data && typeof data === "object" && Array.isArray((data as { data?: unknown[] }).data)
        ? (data as { data: { id?: unknown }[] }).data
        : [];
    const models = list
      .map((item) => (typeof item?.id === "string" ? item.id.trim() : ""))
      .filter(Boolean);
    return NextResponse.json({ models });
  } catch (error) {
    return NextResponse.json(
      { error: `无法获取模型列表：${error instanceof Error ? error.message : "请求失败"}` },
      { status: 502 },
    );
  }
}