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
  steps?: string[];
  proposal?: Proposal;
};

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
  const timers = useRef<number[]>([]);
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
    };
  }, []);

  useEffect(() => {
    if (open) return;
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setThinking(false);
    setSteps([]);
  }, [open]);

  const stop = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
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

  const send = (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || thinking) return;
    setInput("");
    setMessages((m) => [...m, { id: idRef.current++, role: "user", text }]);
    setThinking(true);
    setSteps([]);

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
        </div>

        <div className="p-chat" ref={chatRef}>
          {messages.map((m) => (
            <div key={m.id} className={`p-msg ${m.role}`}>
              <span className="p-who">{m.role === "user" ? "你" : "助手"}</span>
              <div style={{ minWidth: 0 }}>
                <div className="p-bubble">{m.text}</div>
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
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="说人话：排计划、重排、复盘、问某本书…"
          />
          <div className="p-composer-row">
            <span className="p-tiny p-faint">Enter 发送 · Shift+Enter 换行</span>
            {thinking ? (
              <button className="p-button sm" type="button" onClick={stop}>
                停止
              </button>
            ) : (
              <button className="p-button primary sm" type="button" onClick={() => send()} disabled={!input.trim()}>
                发送
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
