"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppData, PlanStatus, Session } from "./types";
import { TODAY } from "./data";
import {
  CAT_COLOR,
  CAT_LABEL,
  Donut,
  StackBar,
  STATUS_LABEL,
  fmtDateTime,
  fmtMin,
  fmtSavedAt,
  sum,
  weekdayCN,
} from "./ui";

type Props = {
  data: AppData;
  activeSpace: string;
  initialDate?: string;
  onSaveReview: (date: string, text: string, tags: string[]) => void;
  onToast: (text: string) => void;
};

const WEEK_START = "2026-11-04";
const WEEK_END = "2026-11-10";
const WEEK_DAYS = [
  "2026-11-04",
  "2026-11-05",
  "2026-11-06",
  "2026-11-07",
  "2026-11-08",
  "2026-11-09",
  "2026-11-10",
];

function weekSessions(sessions: Session[]): Session[] {
  return sessions.filter((s) => s.date >= WEEK_START && s.date <= WEEK_END);
}

function statusCounts(plans: { status: PlanStatus }[]) {
  const out: Record<PlanStatus, number> = { todo: 0, doing: 0, done: 0, partial: 0, shelved: 0 };
  for (const p of plans) out[p.status]++;
  return out;
}

export default function Review({ data, activeSpace, initialDate, onSaveReview, onToast }: Props) {
  const dates = useMemo(() => {
    const set = new Set<string>(data.reviews.map((r) => r.date));
    set.add(TODAY);
    for (const s of data.sessions) if (s.date >= "2026-10-24") set.add(s.date);
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [data.reviews, data.sessions]);

  const [tab, setTab] = useState<"daily" | "weekly">("daily");
  const [date, setDate] = useState(initialDate ?? data.reviews[data.reviews.length - 1]?.date ?? TODAY);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "weekly") setTab("weekly");
  }, []);

  const [draft, setDraft] = useState(data.reviews.find((r) => r.date === date)?.text ?? "");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (initialDate) setDate(initialDate);
  }, [initialDate]);

  useEffect(() => {
    setDraft(data.reviews.find((r) => r.date === date)?.text ?? "");
    setSavedAt(data.reviews.find((r) => r.date === date)?.savedAt ?? null);
  }, [date, data.reviews]);

  const scopedSessions = data.sessions.filter(
    (s) => activeSpace === "all" || !s.spaceId || s.spaceId === activeSpace,
  );
  const sessions = scopedSessions
    .filter((s) => s.date === date)
    .sort((a, b) => a.start.localeCompare(b.start));
  const study = sum(sessions.filter((s) => s.cat === "study"));
  const planMin = sum(sessions.filter((s) => s.cat === "plan"));
  const leisure = sum(sessions.filter((s) => s.cat === "leisure"));
  const total = sum(sessions);
  const importedSessions = sessions.filter((s) => s.source === "pomodoro");
  const sampleSessions = sessions.filter((s) => s.source === "seed" || !s.source);
  const spaceName = data.spaces.find((s) => s.id === activeSpace)?.name;
  const dayReview = data.reviews.find((r) => r.date === date);

  const week = weekSessions(scopedSessions);
  const wStudy = sum(week.filter((s) => s.cat === "study"));
  const wPlan = sum(week.filter((s) => s.cat === "plan"));
  const wLeisure = sum(week.filter((s) => s.cat === "leisure"));
  const plans = data.plans.filter((p) => activeSpace === "all" || p.spaceId === activeSpace);
  const counts = statusCounts(plans);
  const done = counts.done;
  const partialPlans = plans.filter((p) => p.status === "partial");
  const deferredPlans = plans.filter((p) => p.deferredFrom);
  const dsMin = sum(
    week.filter((s) => s.nodeId?.startsWith("ky-408-ds") || s.task.includes("数据结构")),
  );
  const planRatio = wStudy ? Math.round((wPlan / wStudy) * 100) : 0;
  const leisureRatio = wStudy ? Math.round((wLeisure / wStudy) * 100) : 0;

  const weekImported = week.filter((s) => s.source === "pomodoro");
  const weekSample = week.filter((s) => s.source === "seed" || !s.source);
  const weekImports = (data.imports ?? []).filter((batch) => batch.from <= WEEK_END && batch.to >= WEEK_START);
  const coveredDays = new Set(week.map((s) => s.date)).size;

  const weekLit = data.nodes.filter(
    (n) => (activeSpace === "all" || n.spaceId === activeSpace) && n.lastAt && n.lastAt >= WEEK_START,
  ).length;

  const maxDay = Math.max(1, ...WEEK_DAYS.map((d) => sum(week.filter((s) => s.date === d))));

  const save = () => {
    onSaveReview(date, draft.trim(), [spaceName ?? "复盘"]);
    setSavedAt(new Date().toISOString());
    onToast("已保存到知识库「复盘」");
  };

  const headline = activeSpace === "all"
    ? `本周学习 ${fmtMin(wStudy)}，计划 ${fmtMin(wPlan)}，娱乐 ${fmtMin(wLeisure)}。${partialPlans.length} 件部分完成，${deferredPlans.length} 件延期。`
    : `${spaceName}：本周学习 ${fmtMin(wStudy)}，计划 ${fmtMin(wPlan)}，娱乐 ${fmtMin(wLeisure)}；${done}/${plans.length} 件完成。`;

  return (
    <div>
      <header className="p-page-head">
        <div>
          <p className="p-page-meta">2026-11-10 周二 · 数据截至今天</p>
          <h1 className="p-h1">复盘</h1>
          <p className="p-sub">
            每日复盘由你写，事实从番茄记录来；每周复盘直接给事实、图和批注，不提问。
          </p>
        </div>
        <div className="p-head-stats">
          <div className="p-stat">
            <b>{data.reviews.length}</b>
            <span>复盘笔记</span>
          </div>
          <div className="p-stat">
            <b>{fmtMin(wStudy)}</b>
            <span>本周学习</span>
          </div>
          <div className="p-stat">
            <b>
              {done}/{plans.length}
            </b>
            <span>内容完成</span>
          </div>
          <div className="p-stat">
            <b>{deferredPlans.length}</b>
            <span>延期</span>
          </div>
        </div>
      </header>

      <div className="p-review-tabs">
        <button type="button" className={tab === "daily" ? "is-on" : ""} onClick={() => setTab("daily")}>
          每日复盘
        </button>
        <button type="button" className={tab === "weekly" ? "is-on" : ""} onClick={() => setTab("weekly")}>
          每周统计
        </button>
      </div>

      {tab === "daily" ? (
        <div className="p-daily-grid">
          <aside className="p-date-panel">
            <div className="p-date-list">
              {dates.map((d) => {
                const saved = data.reviews.some((r) => r.date === d);
                const count = data.sessions.filter((s) => s.date === d).length;
                return (
                  <button
                    key={d}
                    type="button"
                    className={`p-date-item${d === date ? " is-on" : ""}`}
                    onClick={() => setDate(d)}
                  >
                    <span>
                      <b>{d}</b>
                      <small>周{weekdayCN(d)} · {count} 条记录</small>
                    </span>
                    {saved ? <i className="p-saved" /> : <span className="p-tiny p-faint">未写</span>}
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="p-card">
            <div className="p-editor">
              <div className="p-editor-head">
                <div>
                  <h2>{date} 周{weekdayCN(date)}</h2>
                  <p>{savedAt ? `上次保存 ${fmtSavedAt(savedAt)}` : "还没有保存过"}</p>
                </div>
                <span className="p-tag">{spaceName ?? "全部大类"}</span>
              </div>

              <div className="p-auto-facts">
                <div className="p-card-head">
                  <h3>当天的事实</h3>
                  <em>{sessions.length} 条记录</em>
                </div>
                <div className="p-fact-kpis">
                  <div>
                    <b>{fmtMin(total)}</b>
                    <span>总专注</span>
                  </div>
                  <div>
                    <b>{fmtMin(study)}</b>
                    <span>学习</span>
                  </div>
                  <div>
                    <b>{fmtMin(planMin)}</b>
                    <span>计划</span>
                  </div>
                  <div>
                    <b>{fmtMin(leisure)}</b>
                    <span>娱乐</span>
                  </div>
                </div>
                <StackBar
                  segments={[
                    { value: study, color: CAT_COLOR.study },
                    { value: planMin, color: CAT_COLOR.plan },
                    { value: leisure, color: CAT_COLOR.leisure },
                  ]}
                />
                {sessions.length ? (
                  <div className="p-session-table">
                    {sessions.map((s) => (
                      <div key={s.id} className="p-session-table-row">
                        <time>{fmtDateTime(s.date, s.start)}</time>
                        <span>{s.task}</span>
                        <em>{CAT_LABEL[s.cat]}</em>
                        <b>{fmtMin(s.minutes)}</b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="p-note" style={{ marginTop: 10 }}>
                    这一天还没有番茄记录。去今日页导入 .xls 后，这里才会出现真实条目。
                  </p>
                )}
                <p className="p-source-line">
                  {importedSessions.length
                    ? `其中 ${importedSessions.length} 条来自导入${sampleSessions.length ? `，${sampleSessions.length} 条为原型示例` : ""}。`
                    : sessions.length
                      ? "当前全部是原型示例记录，导入自己的文件后会以导入记录为准。"
                      : "暂无数据来源。"}
                </p>
              </div>

              <label className="p-field">
                今天发生了什么
                <textarea
                  className="p-textarea"
                  style={{ minHeight: 240 }}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={"今天哪件事最值？哪件事在耗时间？明天先保什么？"}
                />
              </label>

              <div className="p-editor-footer">
                <button className="p-button primary" type="button" onClick={save} disabled={!draft.trim()}>
                  保存到知识库
                </button>
                <span>{draft.length} 字 · 保存到「复盘 / {date}」</span>
                {dayReview?.savedAt ? <span>上次保存 {fmtSavedAt(dayReview.savedAt)}</span> : null}
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="p-report">
          <div className="p-report-head">
            <div>
              <p className="p-page-meta">第 2 周 · 2026-11-04 至 2026-11-10</p>
              <div className="p-headline">{headline}</div>
            </div>
            <div className="p-report-actions">
              <span>下次自动生成：周日 20:00</span>
              <button
                className="p-button sm"
                type="button"
                onClick={() => onToast("原型：真实环境会重新读取本周数据并重算")}
              >
                重新计算
              </button>
            </div>
          </div>

          <div className="p-kpis">
            <div className="p-kpi">
              <b>{fmtMin(wStudy)}</b>
              <span>学习</span>
            </div>
            <div className="p-kpi">
              <b>{fmtMin(wPlan)}</b>
              <span>计划</span>
            </div>
            <div className="p-kpi">
              <b>{fmtMin(wLeisure)}</b>
              <span>娱乐</span>
            </div>
            <div className="p-kpi">
              <b>
                {done}/{plans.length}
              </b>
              <span>内容完成</span>
            </div>
            <div className="p-kpi">
              <b>{partialPlans.length}</b>
              <span>部分完成</span>
            </div>
            <div className="p-kpi">
              <b>{deferredPlans.length}</b>
              <span>延期</span>
            </div>
          </div>

          <div className="p-data-strip">
            <div>
              <span>数据覆盖</span>
              <b>{coveredDays} / 7 天</b>
            </div>
            <div>
              <span>导入记录</span>
              <b>{weekImported.length} 条</b>
            </div>
            <div>
              <span>导入批次</span>
              <b>{weekImports.length} 次</b>
            </div>
            <p>
              {weekImports.length
                ? `最近一次：${weekImports[0].fileName}，${fmtSavedAt(weekImports[0].importedAt)}，${weekImports[0].from} 至 ${weekImports[0].to}。`
                : `本周没有导入批次，统计里${weekSample.length ? `含有 ${weekSample.length} 条原型示例记录` : "暂无记录"}。`}
            </p>
          </div>

          <div className="p-chart-grid">
            <section className="p-chart-card">
              <div className="p-card-head">
                <h2>时间构成</h2>
                <em>学习 / 计划 / 娱乐</em>
              </div>
              <div className="p-chart">
                <Donut
                  segments={[
                    { value: wStudy, color: CAT_COLOR.study },
                    { value: wPlan, color: CAT_COLOR.plan },
                    { value: wLeisure, color: CAT_COLOR.leisure },
                  ]}
                  center={fmtMin(wStudy + wPlan + wLeisure)}
                  sub="本周"
                  size={156}
                />
              </div>
              <div className="p-chart-legend">
                <span>
                  <i style={{ background: CAT_COLOR.study }} />
                  学习 {fmtMin(wStudy)}
                </span>
                <span>
                  <i style={{ background: CAT_COLOR.plan }} />
                  计划 {fmtMin(wPlan)}（{planRatio}%）
                </span>
                <span>
                  <i style={{ background: CAT_COLOR.leisure }} />
                  娱乐 {fmtMin(wLeisure)}（{leisureRatio}%）
                </span>
              </div>
            </section>

            <section className="p-chart-card">
              <div className="p-card-head">
                <h2>每天实际投入</h2>
                <em>空白就是没有记录</em>
              </div>
              <div className="p-bar-chart">
                {WEEK_DAYS.map((d) => {
                  const dayRows = week.filter((s) => s.date === d);
                  const st = sum(dayRows.filter((s) => s.cat === "study"));
                  const pl = sum(dayRows.filter((s) => s.cat === "plan"));
                  const le = sum(dayRows.filter((s) => s.cat === "leisure"));
                  const dayTotal = st + pl + le;
                  return (
                    <div className="p-bar-col" key={d}>
                      <div className="p-bar-stack">
                        {le > 0 ? <i style={{ height: `${(le / maxDay) * 100}%`, background: CAT_COLOR.leisure }} /> : null}
                        {pl > 0 ? <i style={{ height: `${(pl / maxDay) * 100}%`, background: CAT_COLOR.plan }} /> : null}
                        {st > 0 ? <i style={{ height: `${(st / maxDay) * 100}%`, background: CAT_COLOR.study }} /> : null}
                      </div>
                      <span>{d}</span>
                      <small>{dayTotal ? fmtMin(dayTotal) : "无记录"}</small>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="p-chart-grid">
            <section className="p-chart-card">
              <div className="p-card-head">
                <h2>内容完成情况</h2>
                <em>{plans.length} 件承诺</em>
              </div>
              <div className="p-stack-row" style={{ height: 14 }}>
                {(
                  [
                    ["done", "#2f5f98"],
                    ["doing", "#7396c9"],
                    ["partial", "#c2873d"],
                    ["todo", "#c9d0db"],
                    ["shelved", "#9ca4b0"],
                  ] as const
                ).map(([k, color]) =>
                  counts[k] ? (
                    <i
                      key={k}
                      title={`${STATUS_LABEL[k]} ${counts[k]}`}
                      style={{ width: `${(counts[k] / Math.max(1, plans.length)) * 100}%`, background: color }}
                    />
                  ) : null,
                )}
              </div>
              <div className="p-chart-legend">
                {(["done", "doing", "partial", "todo", "shelved"] as const).map((k) => (
                  <span key={k}>
                    <i
                      style={{
                        background:
                          k === "done"
                            ? "#2f5f98"
                            : k === "doing"
                              ? "#7396c9"
                              : k === "partial"
                                ? "#c2873d"
                                : k === "todo"
                                  ? "#c9d0db"
                                  : "#9ca4b0",
                      }}
                    />
                    {STATUS_LABEL[k]} {counts[k]}
                  </span>
                ))}
              </div>
              <div className="p-plan-facts">
                {partialPlans.map((p) => (
                  <div key={p.id}>
                    <span>部分</span>
                    <p>
                      <b>{p.title}</b>
                      <em>
                        {p.doneAmount ?? 0}
                        {p.unit ?? ""} / {p.goalAmount ?? "?"}
                        {p.unit ?? ""}
                      </em>
                      {p.progressNote ? <small>{p.progressNote}</small> : <small>没有写完成到哪一步。</small>}
                    </p>
                  </div>
                ))}
                {deferredPlans.map((p) => (
                  <div key={p.id}>
                    <span className="is-deferred">延期</span>
                    <p>
                      <b>{p.title}</b>
                      <em>
                        {p.deferredFrom} → {p.deferredTo ?? p.deadline}
                      </em>
                      <small>{p.deferReason ?? "没有写原因。"}</small>
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="p-chart-card">
              <div className="p-card-head">
                <h2>足迹增量</h2>
                <em>本周有活动的节点</em>
              </div>
              <div className="p-footprint-tags">
                {data.nodes
                  .filter((n) => (activeSpace === "all" || n.spaceId === activeSpace) && n.lastAt && n.lastAt >= WEEK_START)
                  .map((n) => {
                    const sp = data.spaces.find((s) => s.id === n.spaceId);
                    return (
                      <span
                        key={n.id}
                        style={{ borderColor: sp?.color ?? "var(--p-accent)" }}
                        title={`${n.title} · ${n.state === "noted" ? "有笔记" : "标记已学"} · ${n.lastAt}`}
                      >
                        {n.title}
                        <small>{n.lastAt}</small>
                      </span>
                    );
                  })}
              </div>
              <p className="p-note">
                {weekLit} 个节点本周有活动。发光表示有笔记，半亮表示标记过，不能当作掌握。
              </p>
            </section>
          </div>

          <section className="p-chart-card">
            <div className="p-card-head">
              <h2>据实批注</h2>
              <em>只引用上面的记录</em>
            </div>
            <div className="p-annotations">
              <div className="p-annotation">
                <span>计划</span>
                <p>
                  计划记录 <b>{fmtMin(wPlan)}</b>，相当于学习的 <b>{planRatio}%</b>；本周计划类记录{" "}
                  <b>{week.filter((s) => s.cat === "plan").length}</b> 条。
                  {planRatio >= 25 ? " 排计划占了不小的一块，先看它有没有换来做题。" : " 比例不高，计划没有挤掉主要学习。"}
                </p>
              </div>
              <div className="p-annotation">
                <span>娱乐</span>
                <p>
                  娱乐记录 <b>{fmtMin(wLeisure)}</b>，相当于学习的 <b>{leisureRatio}%</b>。它单独统计，不算进学习时长。
                </p>
              </div>
              <div className="p-annotation">
                <span>内容</span>
                <p>
                  本周完成 <b>{done}</b> 件，部分完成 <b>{partialPlans.length}</b> 件，延期 <b>{deferredPlans.length}</b> 件。
                  {partialPlans.length ? " 部分完成的完成量已在上方列出；没写完成说明的，复盘时补上。" : " 没有部分完成记录。"}
                </p>
              </div>
            </div>
          </section>

          <section className="p-chart-card">
            <div className="p-card-head">
              <h2>下周只保三件</h2>
              <em>内容加完成标准，不写分钟</em>
            </div>
            <div className="p-next-grid">
              {plans
                .filter((p) => p.status === "doing" || p.status === "todo")
                .slice(0, 3)
                .map((p) => (
                  <div className="p-next-card" key={p.id}>
                    <b>{p.title}</b>
                    <span>{p.scope}</span>
                    <span>依据 · {p.basis}</span>
                    {p.deadline ? <time>截止 {p.deadline}</time> : null}
                  </div>
                ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}