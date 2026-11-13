"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AppData, KNode, PlanItem, View } from "./types";
import { fmtMin, sum } from "./ui";

type Action = { verb: string; title: string; detail?: string; why?: string };
type Proposal = {
  kind: "plan" | "reschedule" | "review";
  label: string;
  actions: Action[];
  status: "pending" | "accepted" | "rejected";
};
type Msg = {
  id: number;
  role: "user" | "ai";
  text: string;
  images?: string[];
  steps?: string[];
  proposal?: Proposal;
};

type Attachment = { id: string; name: string; url: string };

type Props = {
  open: boolean;
  onClose: () => void;
  data: AppData;
  view: View;
  activeSpace: string;
  selectedNode: KNode | null;
  onAddPlans: (items: PlanItem[]) => void;
  onReschedule: () => void;
  onToast: (text: string) => void;
};

const VIEW_LABEL: Record<View, string> = {
  today: "今日",
  map: "地图",
  plan: "计划",
  library: "知识库",
  review: "复盘",
  settings: "设置",
};

function imageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error(`${file.name} 不是图片`));
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      reject(new Error(`${file.name} 超过 15MB`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`读不到 ${file.name}`));
    reader.onload = () => {
      const source = String(reader.result ?? "");
      const image = new Image();
      image.onerror = () => reject(new Error(`${file.name} 无法解码`));
      image.onload = () => {
        const max = 1800;
        const scale = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("浏览器无法处理图片"));
          return;
        }
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      };
      image.src = source;
    };
    reader.readAsDataURL(file);
  });
}

export default function Assistant({
  open,
  onClose,
  data,
  view,
  activeSpace,
  selectedNode,
  onAddPlans,
  onReschedule,
  onToast,
}: Props) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: 1,
      role: "ai",
      text: "我在。可以让我排这周、被打乱后重排，或者拿事实说话做复盘。\n\n我不会给你规定「背单词 30 分钟」，时间由番茄Todo记。",
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [imageError, setImageError] = useState("");
  const timers = useRef<number[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const idRef = useRef(2);

  const space = data.spaces.find((s) => s.id === activeSpace);
  const context = selectedNode ? `${VIEW_LABEL[view]} · ${selectedNode.title}` : `${VIEW_LABEL[view]} · ${space?.name ?? "全部"}`;

  const week = data.sessions.filter((s) => s.date >= "2026-11-04" && s.date <= "2026-11-10");
  const study = sum(week.filter((s) => s.cat === "study"));
  const planMin = sum(week.filter((s) => s.cat === "plan"));
  const leisure = sum(week.filter((s) => s.cat === "leisure"));
  const dsMin = sum(week.filter((s) => s.nodeId?.startsWith("ky-408-ds")));

  const quick = useMemo(() => {
    if (view === "plan") return ["以王道数据结构为大纲排下周", "下周旅游三天，帮我重排", "这周只保三件"];
    if (view === "review") return ["这周我是不是在假努力", "给我三条批注", "下周只保什么"];
    if (view === "map") return ["数据结构我到底学到哪了", "这章算不算会", "哪些节点只有标记没有笔记"];
    if (view === "library") return ["这本书和哪几章有关", "帮我找数据结构笔记", "哪些资料还没挂节点"];
    return ["今天只剩 1 小时，砍到 3 件", "我今天还没导入番茄", "今天先做什么"];
  }, [view]);

  useEffect(() => {
    if (!open) return;
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking, steps, open]);

  useEffect(() => {
    return () => {
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (open) return;
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setThinking(false);
    setSteps([]);
    setAttachments([]);
    setImageError("");
  }, [open]);

  const stop = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    abortRef.current?.abort();
    abortRef.current = null;
    setThinking(false);
    setSteps([]);
    setMessages((m) => [
      ...m,
      { id: idRef.current++, role: "ai", text: "已中断。想继续就直接再发一条。" },
    ]);
  };

  const reply = (text: string): { text: string; proposal?: Proposal } => {
    if (/旅游|出行|打乱|重排|生病/.test(text)) {
      return {
        text: "下周出去三天，我不在这三天里排新内容。先把出发前和回来后各留一个缓冲，内容承诺从 5 件砍到 3 件。",
        proposal: {
          kind: "reschedule",
          label: "重排 · 第 2 周",
          status: "pending",
          actions: [
            { verb: "挪动", title: "数据结构：第 1 章 绪论", detail: "11-12 → 11-11", why: "出发前先做最难的，别留到回来" },
            { verb: "挪动", title: "操作系统：进程状态转换", detail: "11-14 → 11-17", why: "旅游期间不排新内容，回来再接" },
            { verb: "砍掉", title: "英语长难句 10 句", detail: "本周不做", why: "保三件；长难句可以拆成 5 句，下周继续" },
            { verb: "保留", title: "高数：极限定义与性质", detail: "11-16", why: "已经部分开始，断开成本高" },
          ],
        },
      };
    }
    if (/排|计划|大纲|电子书|王道|下周/.test(text)) {
      return {
        text: "我按《王道 2027 数据结构》1.1–1.2 做大纲，不写分钟。给你加两件内容，保留现有的操作系统任务。",
        proposal: {
          kind: "plan",
          label: "排内容 · 数据结构",
          status: "pending",
          actions: [
            { verb: "新建", title: "1.1 数据结构基本概念", detail: "完成标准：能区分逻辑结构/存储结构，举 3 个例子", why: "电子书 1.1 的范围" },
            { verb: "新建", title: "1.2 算法与复杂度", detail: "完成标准：推 8 道复杂度题，写推导过程", why: "最虚的科目先补基础" },
            { verb: "保留", title: "操作系统：进程状态转换", detail: "11-14", why: "408 另一门不能断" },
          ],
        },
      };
    }
    if (/假努力|复盘|批注|数据|事实/.test(text)) {
      return {
        text: `本周学习 ${fmtMin(study)}，计划 ${fmtMin(planMin)}，娱乐 ${fmtMin(leisure)}，数据结构 ${fmtMin(dsMin)}。\n\n计划占学习时间 ${study ? Math.round((planMin / study) * 100) : 0}%，娱乐占 ${study ? Math.round((leisure / study) * 100) : 0}%。最值得注意的不是娱乐，是「学习计划」本身占掉了四分之一的学习时间。\n\n下周别加新内容，先把数据结构补到「能复述」；娱乐不用戒，但别算进学习时长。`,
      };
    }
    if (/今天|砍|小时|先做/.test(text)) {
      return {
        text: "今天三件：数据结构复杂度、操作系统进程状态、英语长难句 5 句。其他不动。你只有 1 小时也够做完前两件的一部分，不按分钟切。",
        proposal: {
          kind: "reschedule",
          label: "今日 · 只保三件",
          status: "pending",
          actions: [
            { verb: "保留", title: "数据结构：复杂度", detail: "今天第一件", why: "最虚、最该在清醒时做" },
            { verb: "保留", title: "操作系统：进程状态", detail: "今天第二件", why: "408 主线" },
            { verb: "砍掉", title: "政治：马原", detail: "今天不做", why: "不是当前瓶颈" },
          ],
        },
      };
    }
    return {
      text: "我在。你可以说「排这周」「下周旅游重排」「拿事实复盘」，或者直接指定「以某本电子书为大纲」。",
    };
  };

  const addImages = async (files: File[]) => {
    if (!files.length) return;
    const room = Math.max(0, 4 - attachments.length);
    const picked = files.slice(0, room);
    if (files.length > room) setImageError("一次最多带 4 张图片。");
    else setImageError("");
    const next: Attachment[] = [];
    for (const file of picked) {
      try {
        const url = await imageToDataUrl(file);
        next.push({ id: `${Date.now()}-${next.length}`, name: file.name, url });
      } catch (error) {
        setImageError(error instanceof Error ? error.message : "图片读取失败");
      }
    }
    if (next.length) setAttachments((old) => [...old, ...next].slice(0, 4));
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const aiSystem = () => {
    const planLines = data.plans
      .slice(0, 8)
      .map(
        (p) =>
          `- ${p.title}｜${p.status}｜截止 ${p.deadline ?? "未设"}｜完成标准：${p.scope}｜依据：${p.basis}` +
          (p.doneAmount !== undefined || p.goalAmount
            ? `｜进度 ${p.doneAmount ?? 0}/${p.goalAmount ?? "?"}${p.unit ?? ""}`
            : "") +
          (p.deferReason ? `｜延期原因：${p.deferReason}` : ""),
      )
      .join("\n");
    const sessionLines = week
      .slice(0, 30)
      .map((s) => `- ${s.date} ${s.start} ${s.task} ${s.minutes} 分钟 ${s.cat}`)
      .join("\n");
    return [
      "你是个人学习系统「足迹」的规划与复盘助手。",
      "硬规则：只安排内容，不安排分钟；不估计用时；完成标准必须可核对；部分完成必须说明完成了多少；延期必须问原因；复盘只引用事实；信息不足时先问一个最关键的问题；不要使用夸张鼓励和空话。",
      "回答用简体中文，像真人讨论，别套固定标题模板，不要空话和过度排版。",
      "用户附图时，先说出图片里真正能看清的关键信息，再回答；看不清就说看不清，不要编。",
      `当前页面：${VIEW_LABEL[view]}；当前大类：${space?.name ?? "全部"}；当前节点：${selectedNode?.title ?? "未选择"}。`,
      `情况档案：${JSON.stringify(data.profile)}。`,
      `本周时间事实：学习 ${fmtMin(study)}，计划 ${fmtMin(planMin)}，娱乐 ${fmtMin(leisure)}，数据结构 ${fmtMin(dsMin)}。`,
      `当前计划：\n${planLines || "无"}`,
      `最近番茄记录：\n${sessionLines || "无"}`,
    ].join("\n");
  };

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    const images = attachments.map((item) => item.url);
    if ((!text && !images.length) || thinking) return;
    setInput("");
    setAttachments([]);
    setMessages((m) => [
      ...m,
      { id: idRef.current++, role: "user", text: text || "请看这几张图片。", images: images.length ? images : undefined },
    ]);
    setThinking(true);
    setSteps([]);

    if (images.length && !data.ai?.apiKey) {
      setMessages((m) => [
        ...m,
        {
          id: idRef.current++,
          role: "ai",
          text: "要读图片，需要先在设置里配置支持视觉输入的模型接口；现在没有 Key，我看不到图片。",
        },
      ]);
      setThinking(false);
      return;
    }

    if (data.ai?.apiKey) {
      const controller = new AbortController();
      abortRef.current = controller;
      const stepList = ["读取当前页面和最近事实", `调用 ${data.ai.model}`, "整理回答"];
      setSteps(stepList.slice(0, 2));
      try {
        const history = messages
          .filter((m) => m.role === "user" || m.role === "ai")
          .slice(-6)
          .map((m) => ({
            role: m.role === "ai" ? "assistant" : "user",
            content: m.images?.length
              ? [
                  { type: "text", text: m.text },
                  ...m.images.map((url) => ({ type: "image_url", image_url: { url } })),
                ]
              : m.text,
          }));
        const currentContent = images.length
          ? [
              { type: "text", text: text || "请看这几张图片。" },
              ...images.map((url) => ({ type: "image_url", image_url: { url } })),
            ]
          : text;
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            config: data.ai,
            messages: [
              { role: "system", content: aiSystem() },
              ...history,
              { role: "user", content: currentContent },
            ],
          }),
          signal: controller.signal,
        });
        const json = (await response.json()) as { text?: string; error?: string };
        if (!response.ok) throw new Error(json.error ?? `HTTP ${response.status}`);
        setMessages((m) => [
          ...m,
          { id: idRef.current++, role: "ai", text: json.text ?? "接口没有返回内容。", steps: stepList },
        ]);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setMessages((m) => [
          ...m,
          {
            id: idRef.current++,
            role: "ai",
            text: `接口调用失败：${error instanceof Error ? error.message : "未知错误"}\n\n到「设置 → AI 接口」检查 Base URL、模型和 Key。`,
            steps: ["调用接口失败"],
          },
        ]);
      } finally {
        abortRef.current = null;
        setThinking(false);
        setSteps([]);
      }
      return;
    }

    const stepList = ["读取本周内容与番茄记录", "检查知识树与依据", "生成动作并校验"];
    stepList.forEach((s, i) => {
      const t = window.setTimeout(() => {
        setSteps((prev) => [...prev, s]);
        if (i === stepList.length - 1) {
          const t2 = window.setTimeout(() => {
            const r = reply(text);
            setMessages((m) => [
              ...m,
              {
                id: idRef.current++,
                role: "ai",
                text: r.text,
                steps: stepList,
                proposal: r.proposal,
              },
            ]);
            setThinking(false);
            setSteps([]);
          }, 520);
          timers.current.push(t2);
        }
      }, 380 + i * 420);
      timers.current.push(t);
    });
  };

  const accept = (msgId: number) => {
    const msg = messages.find((m) => m.id === msgId);
    const p = msg?.proposal;
    if (!p || p.status !== "pending") return;
    if (p.kind === "plan") {
      const items: PlanItem[] = [
        {
          id: `p-ai-${Date.now()}`,
          spaceId: "ky",
          nodeId: "ky-408-ds-intro",
          title: "1.1 数据结构基本概念",
          scope: "能区分逻辑结构/存储结构，举 3 个例子",
          basis: "王道 2027 数据结构 1.1",
          priority: 1,
          deadline: "2026-11-12",
          status: "todo",
        },
        {
          id: `p-ai-${Date.now() + 1}`,
          spaceId: "ky",
          nodeId: "ky-408-ds",
          title: "1.2 算法与复杂度",
          scope: "推 8 道复杂度题，写推导过程",
          basis: "王道 2027 数据结构 1.2",
          priority: 1,
          deadline: "2026-11-13",
          status: "todo",
        },
      ];
      onAddPlans(items);
      onToast("已加入 2 条内容（没有分钟数）");
    } else if (p.kind === "reschedule") {
      onReschedule();
      onToast("已按提议重排：3 件保留，1 件砍掉");
    }
    setMessages((m) =>
      m.map((x) =>
        x.id === msgId && x.proposal ? { ...x, proposal: { ...x.proposal, status: "accepted" } } : x,
      ),
    );
  };

  const reject = (msgId: number) => {
    setMessages((m) =>
      m.map((x) =>
        x.id === msgId && x.proposal ? { ...x, proposal: { ...x.proposal, status: "rejected" } } : x,
      ),
    );
  };

  if (!open) return null;

  return (
    <>
      <div className="p-drawer-backdrop" onClick={onClose} />
      <aside className="p-drawer" aria-label="助手">
        <div className="p-drawer-head">
          <span className="p-dot" style={{ background: "var(--p-accent)", boxShadow: "0 0 0 4px rgba(29,122,90,.12)" }} />
          <b>助手</b>
          <span className="p-context-chip">{context}</span>
          <button className="p-close" type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="p-profile-strip">
          它知道：{data.profile.goal} · 最虚 {data.profile.weak} · {data.profile.busy} · 可学习日{" "}
          {data.profile.availableDays}。不知道的会先问。
          <span className={`p-ai-connection${data.ai?.apiKey ? " is-on" : ""}`}>
            {data.ai?.apiKey
              ? `接口：${data.ai.provider === "custom" ? "自定义" : data.ai.provider} · ${data.ai.model}`
              : "未配置 AI 接口，当前使用脚本回答；可在设置里填写 Key。"}
          </span>
        </div>

        <div className="p-chat" ref={chatRef}>
          {messages.map((m) => (
            <div key={m.id} className={`p-msg ${m.role}`}>
              <span className="p-who">{m.role === "user" ? "你" : "助手"}</span>
              <div style={{ minWidth: 0 }}>
                <div className="p-bubble">{m.text}</div>
                {m.images?.length ? (
                  <div className="p-msg-images">
                    {m.images.map((url, index) => (
                      <img key={index} src={url} alt={`附图 ${index + 1}`} />
                    ))}
                  </div>
                ) : null}
                {m.role === "ai" && m.steps ? (
                  <div className="p-steps">
                    {m.steps.map((s, i) => (
                      <span key={i}>
                        <i>✓</i>
                        {s}
                      </span>
                    ))}
                  </div>
                ) : null}
                {m.proposal ? (
                  <div className="p-proposal">
                    <div className="p-proposal-head">
                      <b>{m.proposal.label}</b>
                      <span>·</span>
                      <span>{m.proposal.status === "pending" ? "待确认" : m.proposal.status === "accepted" ? "已执行" : "已忽略"}</span>
                    </div>
                    {m.proposal.actions.map((a, i) => (
                      <div className="p-proposal-item" key={i}>
                        <span className={`p-verb ${a.verb === "挪动" ? "move" : a.verb === "砍掉" ? "cut" : ""}`}>
                          {a.verb}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div>{a.title}</div>
                          {a.detail ? <div className="p-tiny p-faint">{a.detail}</div> : null}
                          {a.why ? <span className="p-why">{a.why}</span> : null}
                        </div>
                      </div>
                    ))}
                    {m.proposal.status === "pending" ? (
                      <div className="p-proposal-actions">
                        <button className="p-button primary sm" type="button" onClick={() => accept(m.id)}>
                          执行
                        </button>
                        <button className="p-button sm" type="button" onClick={() => reject(m.id)}>
                          忽略
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {thinking ? (
            <div className="p-msg ai">
              <span className="p-who">助手</span>
              <div>
                <div className="p-bubble" style={{ color: "var(--p-faint)" }}>
                  正在读上下文…
                </div>
                <div className="p-steps">
                  {steps.map((s, i) => (
                    <span key={i}>
                      <i>✓</i>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="p-composer">
          <div className="p-quick">
            {quick.map((q) => (
              <button key={q} type="button" className="p-chip" onClick={() => send(q)} disabled={thinking}>
                {q}
              </button>
            ))}
          </div>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            style={{ display: "none" }}
            onChange={(event) => void addImages(Array.from(event.target.files ?? []))}
          />
          {attachments.length ? (
            <div className="p-attachments">
              {attachments.map((item) => (
                <div className="p-attachment" key={item.id}>
                  <img src={item.url} alt={item.name} />
                  <button
                    type="button"
                    aria-label={`移除 ${item.name}`}
                    onClick={() => setAttachments((old) => old.filter((entry) => entry.id !== item.id))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {imageError ? <p className="p-image-error">{imageError}</p> : null}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
              if (files.length) {
                event.preventDefault();
                void addImages(files);
              }
            }}
            placeholder="说人话：排计划、重排、复盘、问某本书；也可以直接贴图…"
          />
          <div className="p-composer-row">
            <button
              className="p-button sm"
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={thinking || attachments.length >= 4}
            >
              ＋ 图片
            </button>
            <span className="p-tiny p-faint">可附图 · Enter 发送</span>
            {thinking ? (
              <button className="p-button sm" type="button" onClick={stop}>
                停止
              </button>
            ) : (
              <button
                className="p-button primary sm"
                type="button"
                onClick={() => send()}
                disabled={!input.trim() && !attachments.length}
              >
                发送
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
