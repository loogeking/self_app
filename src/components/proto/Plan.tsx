"use client";

import { useMemo, useState } from "react";
import type { AppData, PlanItem, PlanStatus, Space } from "./types";
import { CAT_COLOR, Modal, STATUS_LABEL, fmtMin, sum } from "./ui";

type Props = {
  data: AppData;
  activeSpace: string;
  onStatus: (id: string, status: PlanStatus) => void;
  onUpdatePlan: (id: string, patch: Partial<PlanItem>) => void;
  onAddPlan: (p: PlanItem) => void;
  onOpenAssistant: () => void;
  onToast: (text: string) => void;
};

const COLUMNS: { key: PlanStatus; title: string }[] = [
  { key: "todo", title: "待做" },
  { key: "doing", title: "进行中" },
  { key: "done", title: "完成" },
  { key: "partial", title: "部分完成" },
  { key: "shelved", title: "搁置" },
];

const PRIORITY: Record<number, string> = { 1: "优先", 2: "其次", 3: "有空" };

function spaceOf(spaces: Space[], id: string): Space | undefined {
  return spaces.find((s) => s.id === id);
}

export default function Plan({
  data,
  activeSpace,
  onStatus,
  onUpdatePlan,
  onAddPlan,
  onOpenAssistant,
  onToast,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({
    spaceId: activeSpace === "all" ? data.spaces[0]?.id ?? "" : activeSpace,
    title: "",
    scope: "",
    basis: "",
    priority: 1 as 1 | 2 | 3,
    deadline: "2026-11-14",
    goal: "",
    unit: "道",
  });
  const [progressPlan, setProgressPlan] = useState<PlanItem | null>(null);
  const [progressDraft, setProgressDraft] = useState({ goal: "", done: "", unit: "道", note: "" });
  const [deferPlan, setDeferPlan] = useState<PlanItem | null>(null);
  const [deferDraft, setDeferDraft] = useState({ date: "2026-11-17", reason: "" });

  const plans = useMemo(
    () => data.plans.filter((p) => activeSpace === "all" || p.spaceId === activeSpace),
    [data.plans, activeSpace],
  );

  const weekSessions = useMemo(
    () =>
      data.sessions.filter(
        (s) =>
          s.date >= "2026-11-04" &&
          s.date <= "2026-11-10" &&
          (activeSpace === "all" || !s.spaceId || s.spaceId === activeSpace),
      ),
    [data.sessions, activeSpace],
  );
  const study = sum(weekSessions.filter((s) => s.cat === "study"));
  const planMin = sum(weekSessions.filter((s) => s.cat === "plan"));
  const leisure = sum(weekSessions.filter((s) => s.cat === "leisure"));
  const done = plans.filter((p) => p.status === "done").length;
  const partial = plans.filter((p) => p.status === "partial").length;
  const deferred = plans.filter((p) => p.deferredFrom).length;

  const submit = () => {
    if (!draft.title.trim()) return;
    const p: PlanItem = {
      id: `p-${Date.now()}`,
      spaceId: draft.spaceId,
      title: draft.title.trim(),
      scope: draft.scope.trim() || "完成标准待补",
      basis: draft.basis.trim() || "自学",
      priority: draft.priority,
      deadline: draft.deadline,
      status: "todo",
      goalAmount: Number(draft.goal) > 0 ? Number(draft.goal) : undefined,
      unit: draft.goal ? draft.unit.trim() || "项" : undefined,
      updatedAt: new Date().toISOString(),
    };
    onAddPlan(p);
    setAddOpen(false);
    setDraft((d) => ({ ...d, title: "", scope: "", basis: "", goal: "" }));
    onToast("已加入本周内容");
  };

  const openProgress = (plan: PlanItem) => {
    setProgressPlan(plan);
    setProgressDraft({
      goal: plan.goalAmount ? String(plan.goalAmount) : "",
      done: plan.doneAmount ? String(plan.doneAmount) : "",
      unit: plan.unit ?? "道",
      note: plan.progressNote ?? "",
    });
  };

  const saveProgress = () => {
    if (!progressPlan) return;
    const goal = Math.max(0, Number(progressDraft.goal) || 0);
    const doneAmount = Math.max(0, Number(progressDraft.done) || 0);
    onUpdatePlan(progressPlan.id, {
      status: "partial",
      goalAmount: goal || undefined,
      doneAmount: doneAmount || undefined,
      unit: progressDraft.unit.trim() || "项",
      progressNote: progressDraft.note.trim() || undefined,
    });
    setProgressPlan(null);
    onToast("已记录完成量；复盘会按事实显示。");
  };

  const openDefer = (plan: PlanItem) => {
    setDeferPlan(plan);
    setDeferDraft({
      date: plan.deadline ?? "2026-11-17",
      reason: plan.deferReason ?? "",
    });
  };

  const saveDefer = () => {
    if (!deferPlan) return;
    if (!deferDraft.reason.trim()) {
      onToast("延期要写原因，复盘里才有据可查。");
      return;
    }
    onUpdatePlan(deferPlan.id, {
      deferredFrom: deferPlan.deferredFrom ?? deferPlan.deadline,
      deferredTo: deferDraft.date,
      deadline: deferDraft.date,
      deferReason: deferDraft.reason.trim(),
    });
    setDeferPlan(null);
    onToast("已延期，并保留原截止与原因。");
  };

  const statusChange = (plan: PlanItem, next: PlanStatus) => {
    if (next === "partial") {
      openProgress(plan);
      return;
    }
    onStatus(plan.id, next);
  };

  return (
    <div>
      <header className="p-page-head">
        <div>
          <p className="p-page-meta">2026-11-10 至 2026-11-16 · 第 2 周</p>
          <h1 className="p-h1">本周内容</h1>
          <p className="p-sub">
            只写做什么、做到什么程度、依据是什么。时间用番茄记录，不在这里预估。
          </p>
        </div>
        <div className="p-head-stats">
          <div className="p-stat">
            <b>{plans.length}</b>
            <span>本周承诺</span>
          </div>
          <div className="p-stat">
            <b>{done}</b>
            <span>完成</span>
          </div>
          <div className="p-stat">
            <b>{partial}</b>
            <span>部分完成</span>
          </div>
          <div className="p-stat">
            <b>{deferred}</b>
            <span>延期</span>
          </div>
        </div>
      </header>

      <div className="p-weekbar">
        <div className="p-week-nav">
          <button type="button" onClick={() => onToast("当前只显示本周")}>
            ‹
          </button>
          <span>2026-11-10 至 2026-11-16</span>
          <button type="button" onClick={() => onToast("当前只显示本周")}>
            ›
          </button>
        </div>
        <span className="p-meta-line">实际学习 {fmtMin(study)} · 计划 {fmtMin(planMin)} · 娱乐 {fmtMin(leisure)}</span>
        <span style={{ flex: 1 }} />
        <button className="p-button primary" type="button" onClick={() => setAddOpen(true)}>
          新建内容
        </button>
      </div>

      <div className="p-plan-grid">
        <div>
          <div className="p-board">
            {COLUMNS.map((col) => {
              const list = plans.filter((p) => p.status === col.key);
              return (
                <section className="p-board-col" key={col.key}>
                  <div className="p-board-col-head">
                    <b>{col.title}</b>
                    <span>{list.length}</span>
                  </div>
                  {list.map((p) => {
                    const sp = spaceOf(data.spaces, p.spaceId);
                    const progress =
                      p.goalAmount || p.doneAmount
                        ? `${p.doneAmount ?? 0}${p.unit ?? ""} / ${p.goalAmount ?? "?"}${p.unit ?? ""}`
                        : "";
                    return (
                      <article
                        key={p.id}
                        className={`p-plan-card${p.status === "shelved" ? " is-shelved" : ""}`}
                        style={{ ["--card-accent" as string]: sp?.color ?? "var(--p-accent)" }}
                      >
                        <div className="p-plan-topline">
                          <span className="p-dot" style={{ background: sp?.color ?? "var(--p-accent)" }} />
                          <span>{sp?.name}</span>
                          <span className="p-plan-priority">{PRIORITY[p.priority]}</span>
                        </div>
                        <div className="p-plan-title">{p.title}</div>
                        <div className="p-plan-scope">{p.scope}</div>
                        {progress ? (
                          <div className="p-plan-progress">
                            <span>{progress}</span>
                            <i>
                              <b
                                style={{
                                  width: `${p.goalAmount ? Math.min(100, ((p.doneAmount ?? 0) / p.goalAmount) * 100) : 0}%`,
                                }}
                              />
                            </i>
                          </div>
                        ) : null}
                        {p.progressNote ? <p className="p-plan-note">{p.progressNote}</p> : null}
                        {p.deferredFrom ? (
                          <p className="p-plan-deferred">
                            {p.deferredFrom} 延至 {p.deferredTo ?? p.deadline}
                            <span>{p.deferReason}</span>
                          </p>
                        ) : null}
                        <div className="p-plan-meta">
                          <time>{p.deadline ? `截止 ${p.deadline}` : "未设截止"}</time>
                          <select
                            value={p.status}
                            aria-label={`${p.title} 状态`}
                            onChange={(e) => statusChange(p, e.target.value as PlanStatus)}
                          >
                            {COLUMNS.map((c) => (
                              <option key={c.key} value={c.key}>
                                {c.title}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="p-plan-basis">依据 · {p.basis}</div>
                        <div className="p-plan-actions">
                          <button type="button" onClick={() => openProgress(p)}>
                            记录进度
                          </button>
                          <button type="button" onClick={() => openDefer(p)}>
                            延期
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  {list.length === 0 ? <div className="p-board-empty">这里还空着</div> : null}
                </section>
              );
            })}
          </div>
        </div>

        <aside className="p-plan-side">
          <section className="p-card">
            <div className="p-card-head">
              <h2>本周事实</h2>
              <em>番茄记录</em>
            </div>
            <div className="p-fact-list">
              <div className="p-fact-row">
                <span>学习</span>
                <b>{fmtMin(study)}</b>
              </div>
              <div className="p-fact-row">
                <span>计划</span>
                <b>{fmtMin(planMin)}</b>
              </div>
              <div className="p-fact-row">
                <span>娱乐</span>
                <b>{fmtMin(leisure)}</b>
              </div>
              <div className="p-fact-row">
                <span>内容完成</span>
                <b>
                  {done} / {plans.length}
                </b>
              </div>
              <div className="p-fact-row">
                <span>部分完成</span>
                <b>{partial} 件</b>
              </div>
            </div>
            <p className="p-note">
              计划时间、娱乐时间都算总专注，但复盘时会分开，不混成学习时长。
            </p>
          </section>

          <section className="p-card">
            <div className="p-card-head">
              <h2>让助手排内容</h2>
              <em>先问清楚，再给提议</em>
            </div>
            <p className="p-note">
              可以指定「以王道数据结构为大纲」或「按网课专题」。它只给提议，你确认后才进计划。
            </p>
            <button className="p-button primary" type="button" style={{ marginTop: 12 }} onClick={onOpenAssistant}>
              打开助手
            </button>
          </section>

          <section className="p-card">
            <div className="p-card-head">
              <h2>本周只保</h2>
              <em>内容不是时长</em>
            </div>
            <div className="p-keep-list">
              {plans
                .filter((p) => p.status === "doing" || p.status === "todo")
                .slice(0, 3)
                .map((p) => (
                  <div key={p.id}>
                    <span>保</span>
                    <p>{p.title}</p>
                  </div>
                ))}
            </div>
          </section>
        </aside>
      </div>

      {addOpen ? (
        <Modal
          title="新建内容"
          subtitle="写清完成标准；不用填预计分钟数。"
          onClose={() => setAddOpen(false)}
          footer={
            <>
              <button className="p-button" type="button" onClick={() => setAddOpen(false)}>
                取消
              </button>
              <button className="p-button primary" type="button" onClick={submit}>
                加入本周
              </button>
            </>
          }
        >
          <div className="p-form-stack">
            <label className="p-field">
              大类
              <select className="p-select" value={draft.spaceId} onChange={(e) => setDraft({ ...draft, spaceId: e.target.value })}>
                {data.spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="p-field">
              内容
              <input
                className="p-input"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="例如：数据结构第 1 章 绪论"
              />
            </label>
            <label className="p-field">
              完成标准
              <textarea
                className="p-textarea"
                style={{ minHeight: 76 }}
                value={draft.scope}
                onChange={(e) => setDraft({ ...draft, scope: e.target.value })}
                placeholder="看完 1.1–1.2；做完 8 道复杂度判断题；能自己推一遍"
              />
            </label>
            <label className="p-field">
              依据
              <input
                className="p-input"
                value={draft.basis}
                onChange={(e) => setDraft({ ...draft, basis: e.target.value })}
                placeholder="王道 2027 数据结构 1.1–1.2 / 网课第 3 讲 / 自学"
              />
            </label>
            <div className="p-form-grid three">
              <label className="p-field">
                优先级
                <select
                  className="p-select"
                  value={draft.priority}
                  onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) as 1 | 2 | 3 })}
                >
                  <option value={1}>优先</option>
                  <option value={2}>其次</option>
                  <option value={3}>有空</option>
                </select>
              </label>
              <label className="p-field">
                截止
                <input
                  className="p-input"
                  type="date"
                  value={draft.deadline}
                  onChange={(e) => setDraft({ ...draft, deadline: e.target.value })}
                />
              </label>
              <label className="p-field">
                目标数量（可选）
                <input
                  className="p-input"
                  inputMode="numeric"
                  value={draft.goal}
                  onChange={(e) => setDraft({ ...draft, goal: e.target.value })}
                  placeholder="8"
                />
              </label>
            </div>
            {draft.goal ? (
              <label className="p-field">
                单位
                <input
                  className="p-input"
                  value={draft.unit}
                  onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                  placeholder="道 / 页 / 节"
                />
              </label>
            ) : null}
            <p className="p-form-hint">没有「预计时长」。时间由番茄Todo记录，不在这里规划。</p>
          </div>
        </Modal>
      ) : null}

      {progressPlan ? (
        <Modal
          title={`记录进度 · ${progressPlan.title}`}
          subtitle="部分完成也要写清楚完成了多少。"
          onClose={() => setProgressPlan(null)}
          footer={
            <>
              <button className="p-button" type="button" onClick={() => setProgressPlan(null)}>
                取消
              </button>
              <button className="p-button primary" type="button" onClick={saveProgress}>
                保存
              </button>
            </>
          }
        >
          <div className="p-form-grid three">
            <label className="p-field">
              目标数量
              <input
                className="p-input"
                inputMode="numeric"
                value={progressDraft.goal}
                onChange={(e) => setProgressDraft({ ...progressDraft, goal: e.target.value })}
              />
            </label>
            <label className="p-field">
              已完成
              <input
                className="p-input"
                inputMode="numeric"
                value={progressDraft.done}
                onChange={(e) => setProgressDraft({ ...progressDraft, done: e.target.value })}
              />
            </label>
            <label className="p-field">
              单位
              <input
                className="p-input"
                value={progressDraft.unit}
                onChange={(e) => setProgressDraft({ ...progressDraft, unit: e.target.value })}
              />
            </label>
          </div>
          <label className="p-field" style={{ marginTop: 12 }}>
            完成到哪一步
            <textarea
              className="p-textarea"
              rows={3}
              value={progressDraft.note}
              onChange={(e) => setProgressDraft({ ...progressDraft, note: e.target.value })}
              placeholder="还差什么，为什么没做完。"
            />
          </label>
        </Modal>
      ) : null}

      {deferPlan ? (
        <Modal
          title={`延期 · ${deferPlan.title}`}
          subtitle="保留原截止日期，并写下延期原因。"
          onClose={() => setDeferPlan(null)}
          footer={
            <>
              <button className="p-button" type="button" onClick={() => setDeferPlan(null)}>
                取消
              </button>
              <button className="p-button primary" type="button" onClick={saveDefer}>
                确认延期
              </button>
            </>
          }
        >
          <div className="p-form-stack">
            <div className="p-defer-summary">
              <span>原截止</span>
              <b>{deferPlan.deadline ?? "未设置"}</b>
            </div>
            <label className="p-field">
              新截止
              <input
                className="p-input"
                type="date"
                value={deferDraft.date}
                onChange={(e) => setDeferDraft({ ...deferDraft, date: e.target.value })}
              />
            </label>
            <label className="p-field">
              延期原因
              <textarea
                className="p-textarea"
                rows={3}
                value={deferDraft.reason}
                onChange={(e) => setDeferDraft({ ...deferDraft, reason: e.target.value })}
                placeholder="例如：周三满课，状态图只画了一半。"
              />
            </label>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}