"use client";

import { useMemo, useState } from "react";
import type { AppData, Doc, ImportBatch, PlanItem, Session, Space, TaskRoute } from "./types";
import { TODAY } from "./data";
import {
  CAT_COLOR,
  CAT_LABEL,
  Donut,
  Modal,
  fmtDateTime,
  fmtMin,
  fmtSavedAt,
  sum,
  weekdayCN,
} from "./ui";
import {
  classifyPomodoroTask,
  parsePomodoroSpreadsheetXml,
  pomodoroKey,
  toSession,
  type ParsedPomodoroRow,
} from "./pomodoro";

type Props = {
  data: AppData;
  activeSpace: string;
  onPlanStatus: (id: string, status: PlanItem["status"]) => void;
  onUpdatePlan: (id: string, patch: Partial<PlanItem>) => void;
  onOpenReview: () => void;
  onImport: (rows: Session[], batch: ImportBatch, routes: Record<string, TaskRoute>) => void;
  onOpenAssistant: () => void;
  onToast: (text: string) => void;
  onOpenDoc: (doc: Doc) => void;
};

const PRIORITY_LABEL: Record<number, string> = { 1: "优先", 2: "其次", 3: "有空" };

const QUOTES = [
  "先做最不想做的那一件，今天就不算被事情拖着走。",
  "不用等状态好，坐下来先做十分钟。",
  "把要做的事写清楚，比在心里反复催自己有用。",
  "今天比昨天多弄懂一个点，就已经在往前。",
  "稳住自己的节奏，别拿别人的进度吓自己。",
  "难题不会因为躲开而变简单，先拆开它。",
  "完成比完美重要，先把这一遍走完。",
];

function spaceName(spaces: Space[], id: string): string {
  return spaces.find((s) => s.id === id)?.name ?? id;
}

function spaceColor(spaces: Space[], id: string): string {
  return spaces.find((s) => s.id === id)?.color ?? "#466589";
}

export default function Today({
  data,
  activeSpace,
  onPlanStatus,
  onUpdatePlan,
  onOpenReview,
  onImport,
  onOpenAssistant,
  onToast,
  onOpenDoc,
}: Props) {
  const [importOpen, setImportOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedPomodoroRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [parseError, setParseError] = useState("");
  const [routes, setRoutes] = useState<Record<string, TaskRoute>>({});
  const [progressPlan, setProgressPlan] = useState<PlanItem | null>(null);
  const [progressDraft, setProgressDraft] = useState({ goal: "", done: "", unit: "道", note: "" });
  const [quoteIndex, setQuoteIndex] = useState(() => new Date().getDate() % QUOTES.length);

  const spaceFilter = (s: { spaceId: string }) =>
    activeSpace === "all" || s.spaceId === activeSpace;

  const todaysPlans = useMemo(
    () =>
      data.plans
        .filter(spaceFilter)
        .filter((p) => p.status === "doing" || p.status === "todo" || p.status === "partial")
        .sort((a, b) => a.priority - b.priority || (a.deadline ?? "").localeCompare(b.deadline ?? ""))
        .slice(0, 3),
    [data.plans, activeSpace],
  );

  const todaySessions = useMemo(
    () =>
      data.sessions
        .filter(
          (s) =>
            s.date === TODAY &&
            (activeSpace === "all" || !s.spaceId || s.spaceId === activeSpace),
        )
        .sort((a, b) => a.start.localeCompare(b.start)),
    [data.sessions, activeSpace],
  );

  const byCat = useMemo(() => {
    const out: Record<string, number> = { study: 0, plan: 0, leisure: 0, other: 0 };
    for (const s of todaySessions) out[s.cat] += s.minutes;
    return out;
  }, [todaySessions]);

  const totalToday = sum(todaySessions);
  const studyToday = byCat.study;

  const topStudyTask = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of todaySessions.filter((x) => x.cat === "study")) {
      map.set(s.task, (map.get(s.task) ?? 0) + s.minutes);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])[0];
  }, [todaySessions]);

  const todayReview = data.reviews.find((r) => r.date === TODAY);
  const recentDocs = useMemo(
    () =>
      data.docs
        .filter((d) => activeSpace === "all" || d.spaceId === activeSpace)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 4),
    [data.docs, activeSpace],
  );

  const activeSpaceInfo = data.spaces.find((s) => s.id === activeSpace) ?? null;
  const targetDate =
    activeSpace === "all" ? data.profile.examDate : activeSpaceInfo?.deadline ?? data.profile.examDate;
  const targetName =
    activeSpace === "all" || activeSpaceInfo?.id === "ky"
      ? "初试"
      : activeSpaceInfo?.name ?? "目标";
  const daysToTarget = Math.round(
    (Date.parse(targetDate + "T00:00:00Z") - Date.parse(TODAY + "T00:00:00Z")) / 86400000,
  );
  const profileBits = [
    data.profile.goal,
    data.profile.weak ? `最虚的是${data.profile.weak}` : "",
    data.profile.busy,
  ].filter(Boolean);
  const profileLine = profileBits.length
    ? `${profileBits.join(" · ")}。只定内容，不规定用多少分钟。`
    : "还没有填写情况档案；可以到设置里补，或在助手对话里更新。只定内容，不规定用多少分钟。";

  const factLine = totalToday
    ? `今天记录 ${fmtMin(totalToday)}：学习 ${fmtMin(byCat.study)}，计划 ${fmtMin(byCat.plan)}，娱乐 ${fmtMin(byCat.leisure)}。${
        topStudyTask ? `学习里最多的是「${topStudyTask[0]}」，${fmtMin(topStudyTask[1])}。` : ""
      }`
    : "今天还没有导入番茄记录。";

  const importedToday = todaySessions.filter((s) => s.source === "pomodoro").length;
  const seedToday = todaySessions.filter((s) => s.source === "seed" || !s.source).length;

  const uniqueTasks = useMemo(() => {
    const map = new Map<string, TaskRoute>();
    for (const row of parsed) {
      if (!routes[row.task]) {
        const route = classifyPomodoroTask(row.task, data.prefs.taskRoutes ?? {});
        map.set(row.task, route);
      }
    }
    return [...new Set(parsed.map((row) => row.task))].map((task) => ({
      task,
      route: routes[task] ?? map.get(task) ?? classifyPomodoroTask(task, data.prefs.taskRoutes ?? {}),
      count: parsed.filter((row) => row.task === task).length,
    }));
  }, [parsed, routes, data.prefs.taskRoutes]);

  const duplicateCount = useMemo(() => {
    const existing = new Set(data.sessions.map((s) => `${s.date}|${s.start}|${s.task.trim()}`));
    return parsed.filter((row) => existing.has(pomodoroKey(row))).length;
  }, [parsed, data.sessions]);

  const readFile = async (file: File) => {
    setParseError("");
    setParsed([]);
    setFileName(file.name);
    setHeaders([]);
    setSkipped(0);
    setRoutes({});
    try {
      const text = await file.text();
      const result = parsePomodoroSpreadsheetXml(text, file.name);
      setParsed(result.rows);
      setHeaders(result.headers);
      setSkipped(result.skipped);
      const next: Record<string, TaskRoute> = {};
      for (const task of new Set(result.rows.map((row) => row.task))) {
        next[task] = classifyPomodoroTask(task, data.prefs.taskRoutes ?? {});
      }
      setRoutes(next);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "文件解析失败。");
    }
  };

  const confirmImport = () => {
    if (!parsed.length) return;
    const importedAt = new Date().toISOString();
    const seen = new Set(data.sessions.map((s) => `${s.date}|${s.start}|${s.task.trim()}`));
    const fresh: ParsedPomodoroRow[] = [];
    let duplicates = 0;
    for (const row of parsed) {
      const key = pomodoroKey(row);
      if (seen.has(key)) {
        duplicates += 1;
        continue;
      }
      seen.add(key);
      fresh.push(row);
    }
    const rows = fresh.map((row) =>
      toSession(row, routes[row.task] ?? classifyPomodoroTask(row.task, data.prefs.taskRoutes ?? {}), importedAt),
    );
    const dates = rows.map((r) => r.date).sort();
    const batch: ImportBatch = {
      id: `import-${Date.now()}`,
      fileName,
      importedAt,
      rows: rows.length,
      duplicates,
      from: dates[0] ?? TODAY,
      to: dates[dates.length - 1] ?? TODAY,
    };
    onImport(rows, batch, routes);
    onToast(
      rows.length
        ? `已导入 ${rows.length} 条记录${duplicates ? `，跳过 ${duplicates} 条重复` : ""}。`
        : `没有新记录：${duplicates} 条已经导入过。`,
    );
    setImportOpen(false);
    setParsed([]);
    setFileName("");
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
    const done = Math.max(0, Number(progressDraft.done) || 0);
    onUpdatePlan(progressPlan.id, {
      status: "partial",
      goalAmount: goal || undefined,
      doneAmount: done || undefined,
      unit: progressDraft.unit.trim() || "项",
      progressNote: progressDraft.note.trim() || undefined,
    });
    setProgressPlan(null);
    onToast(`已记录「${progressPlan.title}」完成了多少。`);
  };

  return (
    <div>
      <header className="p-page-head">
        <div>
          <p className="p-page-meta">
            {TODAY} 周{weekdayCN(TODAY)} · 距{targetName} {daysToTarget} 天
          </p>
          <h1 className="p-h1">今天</h1>
          <p className="p-sub">
            {activeSpace === "all"
              ? profileLine
              : `${activeSpaceInfo?.name ?? "当前大类"} · ${activeSpaceInfo?.description ?? "按内容推进"}。只定今天要碰的内容。`}
          </p>
        </div>
        <div className="p-head-stats">
          <div className="p-stat">
            <b>{todaysPlans.length}</b>
            <span>今天的内容</span>
          </div>
          <div className="p-stat">
            <b>{fmtMin(studyToday)}</b>
            <span>今天学习</span>
          </div>
          <div className="p-stat">
            <b>{data.reviews.length}</b>
            <span>复盘笔记</span>
          </div>
          <div className="p-stat">
            <b>{fmtMin(totalToday)}</b>
            <span>总专注</span>
          </div>
        </div>
      </header>

      <div className="p-today-grid">
        <div>
          <div className="p-focus-list">
            {todaysPlans.length === 0 ? (
              <div className="p-empty">今天还没有内容。去计划里挑三件，或者让助手帮你排。</div>
            ) : null}
            {todaysPlans.map((p, i) => {
              const done = p.status === "done";
              const progress =
                p.goalAmount || p.doneAmount
                  ? `${p.doneAmount ?? 0}${p.unit ?? ""} / ${p.goalAmount ?? "?"}${p.unit ?? ""}`
                  : "";
              return (
                <article key={p.id} className={`p-focus-item${done ? " is-done" : ""}`}>
                  <div className="p-focus-index">
                    <b>{i + 1}</b>
                    <span>{PRIORITY_LABEL[p.priority]}</span>
                  </div>
                  <div>
                    <div className="p-focus-kicker">
                      <span className="p-space-name" style={{ color: spaceColor(data.spaces, p.spaceId) }}>
                        {spaceName(data.spaces, p.spaceId)}
                      </span>
                      <span className={`p-status ${p.status}`}>
                        {p.status === "doing" ? "进行中" : p.status === "partial" ? "部分完成" : "待做"}
                      </span>
                      {p.deadline ? <span>截止 {p.deadline}</span> : null}
                      {p.deferredFrom ? <span className="p-deferral-note">已从 {p.deferredFrom} 延期</span> : null}
                    </div>
                    <div className="p-focus-title">{p.title}</div>
                    <div className="p-focus-scope">{p.scope}</div>
                    {progress || p.progressNote ? (
                      <div className="p-progress-line">
                        {progress ? <b>{progress}</b> : <b>部分完成</b>}
                        {p.progressNote ? <span>{p.progressNote}</span> : null}
                      </div>
                    ) : null}
                    <div className="p-focus-meta">
                      <span>依据 · {p.basis}</span>
                      <span>不预设用时</span>
                    </div>
                  </div>
                  <div className="p-focus-actions">
                    {done ? (
                      <button className="p-button sm" type="button" onClick={() => onPlanStatus(p.id, "doing")}>
                        撤销
                      </button>
                    ) : (
                      <>
                        <button className="p-button sm primary" type="button" onClick={() => onPlanStatus(p.id, "done")}>
                          完成
                        </button>
                        <button className="p-button sm" type="button" onClick={() => openProgress(p)}>
                          部分完成
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="p-grid p-cols-2" style={{ marginTop: 14 }}>
            <section className="p-card p-review-entry">
              <div className="p-card-head">
                <h2>今日复盘</h2>
                <em>{todayReview ? "已保存" : "还没有写"}</em>
                <button className="p-button ghost sm p-right" type="button" onClick={onOpenReview}>
                  {todayReview ? "继续写" : "去写"}
                </button>
              </div>
              {todayReview ? (
                <>
                  <p className="p-review-excerpt">{todayReview.text}</p>
                  <p className="p-meta-line">
                    上次保存 {fmtSavedAt(todayReview.savedAt) || "时间未记录"}
                  </p>
                </>
              ) : (
                <div className="p-review-empty">
                  <p>今天还没有复盘。写下发生了什么，番茄记录会自动作为事实放在旁边。</p>
                  <button className="p-button primary sm" type="button" onClick={onOpenReview}>
                    写今天的复盘
                  </button>
                </div>
              )}
            </section>

            <section className="p-card">
              <div className="p-card-head">
                <h2>最近入库</h2>
                <em>{recentDocs.length} 份</em>
              </div>
              <div className="p-doc-mini-list">
                {recentDocs.map((d) => (
                  <button key={d.id} type="button" className="p-doc-mini" onClick={() => onOpenDoc(d)}>
                    <span>{d.title}</span>
                    <time>{d.updatedAt}</time>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>

        <aside className="p-today-side">
          <section className="p-card">
            <div className="p-card-head">
              <h2>今天的事实</h2>
              <em>{todaySessions.length} 条记录</em>
              <button className="p-button ghost sm p-right" type="button" onClick={() => setImportOpen(true)}>
                导入
              </button>
            </div>
            <div className="p-fact-donut">
              <Donut
                segments={[
                  { value: byCat.study, color: CAT_COLOR.study },
                  { value: byCat.plan, color: CAT_COLOR.plan },
                  { value: byCat.leisure, color: CAT_COLOR.leisure },
                  { value: byCat.other, color: CAT_COLOR.other },
                ]}
                center={fmtMin(totalToday)}
                sub="今天"
                size={124}
              />
              <div className="p-legend" style={{ flex: 1 }}>
                {(["study", "plan", "leisure"] as const).map((k) => (
                  <div className="p-legend-row" key={k}>
                    <span className="p-dot" style={{ background: CAT_COLOR[k] }} />
                    <span style={{ width: 34, color: "var(--p-muted)" }}>{CAT_LABEL[k]}</span>
                    <span className="p-bar">
                      <i style={{ width: `${totalToday ? (byCat[k] / totalToday) * 100 : 0}%`, background: CAT_COLOR[k] }} />
                    </span>
                    <span className="p-val">{fmtMin(byCat[k])}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="p-fact-line">{factLine}</p>
            <div className="p-session-list">
              {todaySessions.slice(0, 4).map((s) => (
                <div key={s.id} className="p-session-row">
                  <time>{fmtDateTime(s.date, s.start)}</time>
                  <span>{s.task}</span>
                  <b>{fmtMin(s.minutes)}</b>
                </div>
              ))}
            </div>
            <p className="p-source-line">
              {importedToday
                ? `${importedToday} 条来自番茄Todo导入${seedToday ? `，${seedToday} 条为示例记录` : ""}。`
                : todaySessions.length
                  ? "当前显示示例记录。导入自己的 .xls 后，复盘只使用实际导入的数据。"
                  : "今天还没有导入记录。"}
            </p>
          </section>

          <section className="p-card p-quote-card">
            <div className="p-card-head">
              <h2>今日一句</h2>
              <em>写给今天的自己</em>
            </div>
            <blockquote>{QUOTES[quoteIndex]}</blockquote>
            <div className="p-quote-actions">
              <button className="p-button sm" type="button" onClick={() => setQuoteIndex((v) => (v + 1) % QUOTES.length)}>
                换一句
              </button>
              <button className="p-button ghost sm" type="button" onClick={onOpenAssistant}>
                让助手看看今天
              </button>
            </div>
          </section>

          <section className="p-card">
            <div className="p-card-head">
              <h2>本周承诺</h2>
              <em>{data.plans.filter((p) => p.status === "done").length} 件完成</em>
            </div>
            <div className="p-commit-list">
              {data.plans.slice(0, 4).map((p) => (
                <div key={p.id} className="p-commit-row">
                  <span className={`p-status ${p.status}`}>
                    {p.status === "done"
                      ? "完成"
                      : p.status === "doing"
                        ? "进行中"
                        : p.status === "partial"
                          ? "部分"
                          : p.status === "shelved"
                            ? "搁置"
                            : "待做"}
                  </span>
                  <span>{p.title}</span>
                  {p.deadline ? <time>{p.deadline}</time> : null}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {progressPlan ? (
        <Modal
          title={`记录进度 · ${progressPlan.title}`}
          subtitle="完成多少就写多少，不用凑成完成。"
          onClose={() => setProgressPlan(null)}
          footer={
            <>
              <button className="p-button" type="button" onClick={() => setProgressPlan(null)}>
                取消
              </button>
              <button className="p-button primary" type="button" onClick={saveProgress}>
                保存进度
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
                placeholder="10"
              />
            </label>
            <label className="p-field">
              已完成
              <input
                className="p-input"
                inputMode="numeric"
                value={progressDraft.done}
                onChange={(e) => setProgressDraft({ ...progressDraft, done: e.target.value })}
                placeholder="6"
              />
            </label>
            <label className="p-field">
              单位
              <input
                className="p-input"
                value={progressDraft.unit}
                onChange={(e) => setProgressDraft({ ...progressDraft, unit: e.target.value })}
                placeholder="道 / 页 / 节"
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
              placeholder="例如：定义看完了，夹逼准则的题还不会，剩下 4 道下次继续。"
            />
          </label>
        </Modal>
      ) : null}

      {importOpen ? (
        <Modal
          title="导入番茄Todo记录"
          subtitle="选择导出的 .xls 文件；它实际是 SpreadsheetML XML，不会上传到服务器。"
          onClose={() => setImportOpen(false)}
          wide
          footer={
            <>
              <button className="p-button" type="button" onClick={() => setImportOpen(false)}>
                取消
              </button>
              <button className="p-button primary" type="button" onClick={confirmImport} disabled={!parsed.length}>
                {parsed.length ? `导入 ${parsed.length - duplicateCount} 条` : "先选择文件"}
              </button>
            </>
          }
        >
          <label className="p-file-drop">
            <input
              type="file"
              accept=".xls,.xml,text/xml,application/xml,application/vnd.ms-excel"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
              }}
            />
            <span>{fileName || "选择番茄Todo导出的 .xls 文件"}</span>
            <small>支持开始时间、待办名称、专注时长、心得、状态、完成度。0 分钟记录会保留，但不计入统计。</small>
          </label>

          {parseError ? <p className="p-inline-error">{parseError}</p> : null}

          {parsed.length ? (
            <>
              <div className="p-import-summary">
                <span>{fileName}</span>
                <span>{parsed.length} 条有效记录</span>
                {skipped ? <span>跳过 {skipped} 条缺少开始时间或待办名称</span> : null}
                <span>{duplicateCount} 条重复</span>
              </div>
              <div className="p-import-table-wrap">
                <table className="p-import-table">
                  <thead>
                    <tr>
                      <th>开始时间</th>
                      <th>待办</th>
                      <th>时长</th>
                      <th>心得</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 8).map((row) => (
                      <tr key={row.id}>
                        <td>{fmtDateTime(row.date, row.start)}</td>
                        <td>{row.task}</td>
                        <td>{fmtMin(row.minutes)}</td>
                        <td>{row.note ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-import-mapping">
                <div className="p-card-head">
                  <h2>归类</h2>
                  <em>第一次确认后记住；下次只改例外</em>
                </div>
                {uniqueTasks.map((item) => (
                  <div className="p-import-route" key={item.task}>
                    <span>{item.task}</span>
                    <small>{item.count} 条</small>
                    <select
                      className="p-select"
                      value={item.route.cat}
                      onChange={(event) => {
                        const cat = event.target.value as Session["cat"];
                        setRoutes((old) => ({
                          ...old,
                          [item.task]: { ...item.route, cat },
                        }));
                      }}
                    >
                      <option value="study">学习</option>
                      <option value="plan">计划</option>
                      <option value="leisure">娱乐</option>
                      <option value="other">其他</option>
                    </select>
                    <span className="p-route-target">
                      {item.route.nodeId
                        ? `挂到 ${data.nodes.find((n) => n.id === item.route.nodeId)?.title ?? "知识节点"}`
                        : item.route.spaceId
                          ? `归入 ${spaceName(data.spaces, item.route.spaceId)}`
                          : "未挂知识节点"}
                    </span>
                  </div>
                ))}
              </div>
              <p className="p-import-note">
                去重规则：同一天、同一开始时间、同一待办名称只保留一条。上次字段 {headers.slice(0, 6).join(" / ")}。
              </p>
            </>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}