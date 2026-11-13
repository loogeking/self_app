import { NextResponse } from "next/server";
import type { AiConfig } from "@/components/proto/types";
import { isAuthed } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type Message = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };

type Body = {
  config?: Partial<AiConfig>;
  messages?: Message[];
};

function cleanParts(parts: unknown[]): ContentPart[] {
  return parts
    .map((part): ContentPart | null => {
      if (!part || typeof part !== "object") return null;
      const value = part as { type?: unknown; text?: unknown; image_url?: { url?: unknown } };
      if (value.type === "text" && typeof value.text === "string") {
        return { type: "text", text: value.text.slice(0, 8000) };
      }
      if (
        value.type === "image_url" &&
        typeof value.image_url?.url === "string" &&
        /^data:image\/(png|jpe?g|webp);base64,/i.test(value.image_url.url) &&
        value.image_url.url.length < 8_000_000
      ) {
        return { type: "image_url", image_url: { url: value.image_url.url } };
      }
      return null;
    })
    .filter((part): part is ContentPart => Boolean(part))
    .slice(0, 5);
}

function cleanMessages(input: unknown): Message[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item): item is Message => {
      if (!item || typeof item !== "object") return false;
      const role = (item as { role?: unknown }).role;
      return ["system", "user", "assistant"].includes(String(role));
    })
    .slice(-20)
    .map((item) => {
      if (typeof item.content === "string") {
        return { ...item, content: item.content.slice(0, 12000) };
      }
      if (Array.isArray(item.content)) {
        return { ...item, content: cleanParts(item.content) };
      }
      return { ...item, content: "" };
    })
    .filter((item) =>
      typeof item.content === "string" ? Boolean(item.content.trim()) : item.content.length > 0,
    );
}

export async function POST(request: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "请求体不是有效 JSON。" }, { status: 400 });
  }

  const config = body.config ?? {};
  const baseUrl = String(config.baseUrl ?? "").trim().replace(/\/+$/, "");
  const apiKey = String(config.apiKey ?? "").trim();
  const model = String(config.model ?? "").trim();
  const messages = cleanMessages(body.messages);

  if (!baseUrl || !apiKey || !model) {
    return NextResponse.json({ error: "缺少 Base URL、模型或 API Key。" }, { status: 400 });
  }
  if (!messages.length) {
    return NextResponse.json({ error: "没有可发送的消息。" }, { status: 400 });
  }

  let endpoint: string;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      return NextResponse.json({ error: "Base URL 必须是 HTTPS（本地调试可用 localhost）。" }, { status: 400 });
    }
    endpoint = /\/chat\/completions$/i.test(baseUrl) ? baseUrl : `${baseUrl}/chat/completions`;
  } catch {
    return NextResponse.json({ error: "Base URL 格式不正确。" }, { status: 400 });
  }

  const temperature = Math.min(1.5, Math.max(0, Number(config.temperature ?? 0.6)));

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature, stream: false }),
      signal: AbortSignal.timeout(45000),
    });
    const raw = await response.text();
    let data: unknown = null;
    try {
      data = JSON.parse(raw);
    } catch {
      /* keep raw for error */
    }
    if (!response.ok) {
      const detail =
        data && typeof data === "object" && "error" in data
          ? JSON.stringify((data as { error: unknown }).error).slice(0, 500)
          : raw.slice(0, 500);
      return NextResponse.json(
        { error: `接口返回 ${response.status}：${detail || "没有错误详情"}` },
        { status: 502 },
      );
    }
    const content =
      data && typeof data === "object"
        ? (data as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]?.message?.content
        : null;
    if (typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "接口返回了空内容。" }, { status: 502 });
    }
    return NextResponse.json({ text: content.trim() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "请求失败";
    return NextResponse.json({ error: `无法连接接口：${message}` }, { status: 502 });
  }
}