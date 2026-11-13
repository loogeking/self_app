"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type {
  AiConfig,
  AppData,
  Doc,
  ImportBatch,
  KNode,
  PlanItem,
  Session,
  Situation,
  Space,
  TaskRoute,
  View,
} from "./types";
import { EMPTY, SEED, TODAY } from "./data";
import Today from "./Today";
import MapView from "./MapView";
import Plan from "./Plan";
import Library from "./Library";
import Review from "./Review";
import Settings from "./Settings";
import Assistant from "./Assistant";
import { Modal, weekdayCN } from "./ui";

const KEY = "footprint-v2";
const V2_RESET_KEY = "footprint-v2-reset";
const AI_CLEAR_KEY = "footprint-ai-key-cleared-v2";

const NAV: { key: View; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "map", label: "地图" },
  { key: "plan", label: "计划" },
  { key: "library", label: "知识库" },
  { key: "review", label: "复盘" },
  { key: "settings", label: "设置" },
];

function clone(data: AppData): AppData {
  return JSON.parse(JSON.stringify(data)) as AppData;
}

function withDefaults(data: AppData): AppData {
  return {
    ...data,
    ai: data.ai ?? { ...SEED.ai! },
    imports: data.imports ?? [],
  };
}

export default function Prototype() {
  const [data, setData] = useState<AppData>(() => clone(EMPTY));
  const [view, setView] = useState<View>("today");
  const [activeSpace, setActiveSpace] = useState<string>("all");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [situationSpaceId, setSituationSpaceId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<KNode | null>(null);
  const [libraryFocus, setLibraryFocus] = useState<string | null>(null);
  const [reviewInitial, setReviewInitial] = useState<string | undefined>(undefined);
  const [reviewKey, setReviewKey] = useState(0);
  const [noteNode, setNoteNode] = useState<KNode | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      // v2 起改为全空工作区：一次性清除旧版演示数据与旧 Key。
      if (!localStorage.getItem(V2_RESET_KEY)) {
        localStorage.removeItem("footprint-v1");
        localStorage.removeItem("proto-v4");
        localStorage.setItem(V2_RESET_KEY, "1");
      }
      // 清理旧版本可能存下的 API Key；只清一次，之后在设置里重新填写的 Key 会正常保留。
      if (!localStorage.getItem(AI_CLEAR_KEY)) {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as AppData;
          if (parsed.ai?.apiKey) {
            parsed.ai = { ...parsed.ai, apiKey: "" };
            localStorage.setItem(KEY, JSON.stringify(parsed));
          }
        }
        localStorage.removeItem("proto-v4");
        localStorage.setItem(AI_CLEAR_KEY, "1");
      }
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppData;
        if (parsed && Array.isArray(parsed.spaces)) setData(withDefaults(parsed));
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);

    // 方便直接打开某个视图：/proto?view=map&space=ky
    const p = new URLSearchParams(window.location.search);
    const v = p.get("view") as View | null;
    if (v && NAV.some((n) => n.key === v)) setView(v);
    const sp = p.get("space");
    if (sp) setActiveSpace(sp);
    if (p.get("assistant") === "1") setAssistantOpen(true);
    const d = p.get("date");
    if (d) {
      setReviewInitial(d);
      setReviewKey((k) => k + 1);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }, [data, hydrated]);

  const showToast = (text: string) => {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  };

  const syncUrl = (nextView: View, nextSpace: string, extra?: Record<string, string>) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (nextView !== "today") params.set("view", nextView);
    if (nextSpace && nextSpace !== "all") params.set("space", nextSpace);
    if (extra) for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/?${query}` : "/");
  };

  const go = (next: View) => {
    let nextSpace = activeSpace;
    setView(next);
    if (next !== "map") setSelectedNode(null);
    if (next === "map" && activeSpace === "all") {
      nextSpace = data.spaces[0]?.id ?? "all";
      setActiveSpace(nextSpace);
    }
    if (next === "library") setLibraryFocus(null);
    syncUrl(next, nextSpace);
  };

  const chooseSpace = (id: string) => {
    if (view === "map" && id === "all") {
      const first = data.spaces[0]?.id ?? "all";
      setActiveSpace(first);
      syncUrl(view, first);
      return;
    }
    setActiveSpace(id);
    setSelectedNode(null);
    setLibraryFocus(null);
    syncUrl(view, id);
  };

  const mapSpace = data.spaces.find((s) => s.id === activeSpace) ?? data.spaces[0] ?? null;
  const mapNodes = mapSpace ? data.nodes.filter((n) => n.spaceId === mapSpace.id) : [];
  const mapNodeIds = new Set(mapNodes.map((n) => n.id));
  const mapDocs = mapSpace
    ? data.docs.filter((d) => d.spaceId === mapSpace.id && (!d.nodeId || mapNodeIds.has(d.nodeId)))
    : [];

  const updatePlanStatus = (id: string, status: PlanItem["status"]) => {
    setData((d) => ({
      ...d,
      plans: d.plans.map((p) =>
        p.id === id
          ? {
              ...p,
              status,
              updatedAt: new Date().toISOString(),
              doneAmount:
                status === "done" && p.goalAmount
                  ? p.goalAmount
                  : status === "todo" && !p.doneAmount
                    ? undefined
                    : p.doneAmount,
            }
          : p,
      ),
    }));
  };

  const updatePlan = (id: string, patch: Partial<PlanItem>) => {
    setData((d) => ({
      ...d,
      plans: d.plans.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
      ),
    }));
  };

  const addMapNode = (parent: KNode | null, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    const spaceId = parent?.spaceId ?? (activeSpace !== "all" ? activeSpace : data.spaces[0]?.id);
    if (!spaceId) {
      showToast("先新建一个大类，再添加节点。");
      return;
    }
    const node: KNode = {
      id: `${spaceId}-custom-${Date.now()}`,
      spaceId,
      parentId: parent?.id ?? null,
      title: clean,
      state: "empty",
      notes: 0,
      custom: true,
    };
    setData((d) => ({ ...d, nodes: [...d.nodes, node] }));
    showToast(`已添加「${clean}」。它先是空心，学过之后再标记。`);
  };

  const updateMapNode = (node: KNode, title: string) => {
    const clean = title.trim();
    if (!clean || !node.custom) return;
    setData((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (n.id === node.id ? { ...n, title: clean } : n)),
    }));
    showToast(`已改名为「${clean}」。`);
  };

  const deleteMapNode = (node: KNode) => {
    if (!node.custom) return;
    setData((d) => {
      const remove = new Set<string>([node.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const item of d.nodes) {
          if (item.parentId && remove.has(item.parentId) && !remove.has(item.id)) {
            remove.add(item.id);
            changed = true;
          }
        }
      }
      return {
        ...d,
        nodes: d.nodes.filter((n) => !remove.has(n.id)),
        docs: d.docs.map((doc) =>
          doc.nodeId && remove.has(doc.nodeId) ? { ...doc, nodeId: node.parentId ?? undefined } : doc,
        ),
      };
    });
    showToast(`已删除「${node.title}」；相关笔记已移到上一级。`);
  };

  const updateAi = (ai: AiConfig) => setData((d) => ({ ...d, ai }));

  const addDocs = (docs: Doc[]) => {
    if (!docs.length) return;
    setData((d) => ({ ...d, docs: [...docs, ...d.docs] }));
    showToast(`已导入 ${docs.length} 份资料到本机资料库。`);
  };

  const addPlan = (p: PlanItem) => {
    setData((d) => ({ ...d, plans: [p, ...d.plans] }));
  };

  const addPlans = (items: PlanItem[]) => {
    setData((d) => ({ ...d, plans: [...items, ...d.plans] }));
  };

  const reschedule = () => {
    setData((d) => ({
      ...d,
      plans: d.plans.map((p) => {
        if (p.id === "p1") return { ...p, deadline: "2026-11-11", status: "doing" as const };
        if (p.id === "p2") return { ...p, deadline: "2026-11-17" };
        if (p.id === "p3") return { ...p, status: "shelved" as const };
        if (p.id === "p5") return { ...p, status: "doing" as const };
        return p;
      }),
    }));
  };

  const markNode = (node: KNode, source: string) => {
    setData((d) => ({
      ...d,
      nodes: d.nodes.some((n) => n.id === node.id)
        ? d.nodes.map((n) => n.id === node.id && n.state === "empty"
            ? { ...n, state: "marked", source, lastAt: TODAY } : n)
        : [...d.nodes, { ...node, state: "marked", source, lastAt: TODAY }],
    }));
    showToast(`已标记「${node.title}」为已学（${source}）`);
    setSelectedNode((n) => (n && n.id === node.id ? { ...n, state: "marked", source, lastAt: TODAY } : n));
  };

  const openNote = (node: KNode) => {
    setNoteNode(node);
    setNoteTitle("");
    setNoteBody("");
  };

  const saveNote = () => {
    if (!noteNode) return;
    const title = noteTitle.trim() || `${noteNode.title} 笔记`;
    const body = noteBody.trim() || `# ${title}\n\n`;
    const doc: Doc = {
      id: `d-note-${Date.now()}`,
      spaceId: noteNode.spaceId,
      nodeId: noteNode.id,
      title,
      kind: "md",
      summary: body.replace(/[#>*_`~-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 90) || "新笔记",
      body,
      updatedAt: TODAY,
    };
    setData((d) => ({
      ...d,
      docs: [doc, ...d.docs],
      nodes: (d.nodes.some((n) => n.id === noteNode.id) ? d.nodes : [...d.nodes, noteNode]).map((n) =>
        n.id === noteNode.id
          ? {
              ...n,
              state: "noted",
              notes: n.notes + 1,
              lastAt: TODAY,
              source: n.source ?? "笔记",
            }
          : n,
      ),
    }));
    setSelectedNode((n) =>
      n && n.id === noteNode.id
        ? { ...n, state: "noted", notes: n.notes + 1, lastAt: TODAY, source: n.source ?? "笔记" }
        : n,
    );
    setNoteNode(null);
    showToast("笔记已保存，节点已点亮");
  };

  const saveReview = (date: string, text: string, tags: string[]) => {
    const first = text.split("\n").find((l) => l.trim())?.trim() ?? "每日复盘";
    const summary = text.replace(/\s+/g, " ").trim().slice(0, 90) || "（空复盘）";
    const spaceId = activeSpace !== "all" ? activeSpace : data.spaces[0]?.id ?? "ky";
    setData((d) => {
      const exists = d.reviews.some((r) => r.date === date);
      const reviews = exists
        ? d.reviews.map((r) =>
            r.date === date ? { ...r, text, tags, savedAt: new Date().toISOString() } : r,
          )
        : [...d.reviews, { date, text, tags, savedAt: new Date().toISOString() }];
      const docId = `d-rev-${date}`;
      const doc: Doc = {
        id: docId,
        spaceId,
        title: `${date} · ${first.slice(0, 16)}`,
        kind: "review",
        summary,
        body: text,
        updatedAt: date,
        tags,
      };
      const docs = d.docs.some((x) => x.id === docId)
        ? d.docs.map((x) => (x.id === docId ? { ...x, ...doc } : x))
        : [doc, ...d.docs];
      return { ...d, reviews, docs };
    });
  };

  const importSessions = (
    rows: Session[],
    batch: ImportBatch,
    routes: Record<string, TaskRoute>,
  ) => {
    setData((d) => {
      const keys = new Set(d.sessions.map((s) => `${s.date}|${s.start}|${s.task.trim()}`));
      const fresh = rows.filter((r) => !keys.has(`${r.date}|${r.start}|${r.task.trim()}`));
      return {
        ...d,
        sessions: [...fresh, ...d.sessions],
        imports: [batch, ...(d.imports ?? [])],
        prefs: { ...d.prefs, taskRoutes: { ...(d.prefs.taskRoutes ?? {}), ...routes } },
      };
    });
  };

  const addSpace = (s: Space) => {
    setData((d) => ({ ...d, spaces: [...d.spaces, s] }));
    setActiveSpace(s.id);
    setSituationSpaceId(s.id);
    setAssistantOpen(true);
  };
  const editSpace = (s: Space) =>
    setData((d) => ({ ...d, spaces: d.spaces.map((x) => (x.id === s.id ? s : x)) }));

  const saveSituation = (spaceId: string, situation: Situation, deadline?: string) => {
    setData((d) => ({
      ...d,
      spaces: d.spaces.map((space) =>
        space.id === spaceId
          ? {
              ...space,
              deadline: deadline?.trim() || undefined,
              situation: { ...situation, updatedAt: new Date().toISOString() },
            }
          : space,
      ),
    }));
    setSituationSpaceId(null);
    showToast("情况档案已保存。");
  };

  const editSituation = (space: Space) => {
    setActiveSpace(space.id);
    setSituationSpaceId(space.id);
    setAssistantOpen(true);
  };

  const deleteSpace = (id: string) => {
    setData((d) => ({
      ...d,
      spaces: d.spaces.filter((s) => s.id !== id),
      nodes: d.nodes.filter((n) => n.spaceId !== id),
      docs: d.docs.filter((x) => x.spaceId !== id),
      plans: d.plans.filter((p) => p.spaceId !== id),
      sessions: d.sessions.filter((s) => s.spaceId !== id),
    }));
    if (activeSpace === id) setActiveSpace("all");
    if (situationSpaceId === id) setSituationSpaceId(null);
  };

  const reset = () => {
    setData(clone(EMPTY));
    setActiveSpace("all");
    setView("today");
    setSituationSpaceId(null);
    setAssistantOpen(false);
    syncUrl("today", "all");
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  };

  const loadDemo = () => {
    setData(clone(SEED));
    setActiveSpace("all");
    setView("today");
    setSituationSpaceId(null);
    setAssistantOpen(false);
    syncUrl("today", "all");
    showToast("已载入示例数据；可在设置里再次清空。");
  };

  const openReview = (date?: string) => {
    const nextDate = date ?? TODAY;
    setReviewInitial(nextDate);
    setReviewKey((k) => k + 1);
    setView("review");
    syncUrl("review", activeSpace, { date: nextDate });
  };

  const currentSpace = activeSpace === "all" ? null : data.spaces.find((s) => s.id === activeSpace) ?? null;
  const situationSpace = situationSpaceId
    ? data.spaces.find((space) => space.id === situationSpaceId) ?? null
    : null;
  const headerDeadline = activeSpace === "all" ? undefined : currentSpace?.deadline;
  const headerDays = headerDeadline
    ? Math.ceil(
        (Date.parse(headerDeadline + "T00:00:00Z") - Date.parse(TODAY + "T00:00:00Z")) / 86400000,
      )
    : null;
  const countdown =
    headerDays === null
      ? ""
      : ` · 距${activeSpace === "all" || currentSpace?.id === "ky" ? "初试" : currentSpace?.name ?? "目标"} ${headerDays} 天`;
  const accent = currentSpace?.color ?? "#466589";
  const rootStyle = {
    "--p-accent": accent,
    "--p-accent-2": `color-mix(in srgb, ${accent} 78%, #162033)`,
    "--kg-accent": accent,
    "--kg-cyan": accent,
  } as CSSProperties;

  return (
    <div
      className={`p-root${view === "map" ? " is-map-view" : ""}`}
      data-space={activeSpace}
      style={rootStyle}
    >
      <header className="p-top">
        <div className="p-brand">
          <span className="p-mark" />
          足迹
        </div>
        <nav className="p-nav">
          {NAV.map((n) => (
            <button
              key={n.key}
              type="button"
              className={`p-nav-item${view === n.key ? " is-on" : ""}`}
              onClick={() => go(n.key)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="p-top-actions">
          <span className="p-date-label">
            {TODAY} 周{weekdayCN(TODAY)}{countdown}
          </span>
          <button className="p-assistant-btn" type="button" onClick={() => setAssistantOpen(true)}>
            助手
            <i />
          </button>
        </div>
      </header>

      <div className="p-spacebar">
        <button
          type="button"
          className={`p-space-chip${activeSpace === "all" ? " is-on" : ""}`}
          onClick={() => chooseSpace("all")}
        >
          全部
        </button>
        {data.spaces.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`p-space-chip${activeSpace === s.id ? " is-on" : ""}`}
            onClick={() => chooseSpace(s.id)}
          >
            <span className="p-dot" style={{ background: s.color }} />
            {s.name}
          </button>
        ))}
        <button
          type="button"
          className="p-space-add"
          onClick={() => {
            setView("settings");
            showToast("在设置里新建/编辑大类");
          }}
          aria-label="新增大类"
        >
          +
        </button>
        <span style={{ flex: 1 }} />
      </div>

      <main className="p-main">
        {view === "today" ? (
          <Today
            data={data}
            activeSpace={activeSpace}
            onPlanStatus={updatePlanStatus}
            onUpdatePlan={updatePlan}
            onOpenReview={() => openReview(TODAY)}
            onImport={importSessions}
            onOpenAssistant={() => setAssistantOpen(true)}
            onToast={showToast}
            onOpenDoc={(doc) => {
              setView("library");
              setActiveSpace(doc.spaceId);
              setLibraryFocus(doc.nodeId ?? null);
              syncUrl("library", doc.spaceId);
            }}
          />
        ) : null}

        {view === "map" ? (
          mapSpace ? (
            <MapView
              key={mapSpace.id}
              space={mapSpace}
              nodes={mapNodes}
              docs={mapDocs}
              onMark={markNode}
              onWriteNote={openNote}
              onOpenLibrary={(node) => {
                setActiveSpace(node.spaceId);
                setLibraryFocus(node.id);
                setView("library");
                syncUrl("library", node.spaceId);
              }}
              onAddNode={addMapNode}
              onUpdateNode={updateMapNode}
              onDeleteNode={deleteMapNode}
              onSelectNode={setSelectedNode}
              onToast={showToast}
            />
          ) : (
            <div className="p-empty">先建一个大类，再来看足迹。</div>
          )
        ) : null}

        {view === "plan" ? (
          <Plan
            data={data}
            activeSpace={activeSpace}
            onStatus={updatePlanStatus}
            onUpdatePlan={updatePlan}
            onAddPlan={addPlan}
            onOpenAssistant={() => setAssistantOpen(true)}
            onToast={showToast}
          />
        ) : null}

        {view === "library" ? (
          <Library
            data={data}
            activeSpace={activeSpace}
            focusNodeId={libraryFocus}
            onClearFocus={() => setLibraryFocus(null)}
            onAddDocs={addDocs}
            onToast={showToast}
          />
        ) : null}

        {view === "review" ? (
          <Review
            key={reviewKey}
            data={data}
            activeSpace={activeSpace}
            initialDate={reviewInitial}
            onSaveReview={saveReview}
            onImport={importSessions}
            onToast={showToast}
          />
        ) : null}

        {view === "settings" ? (
          <Settings
            data={data}
            onAddSpace={addSpace}
            onEditSpace={editSpace}
            onDeleteSpace={deleteSpace}
            onUpdateAi={updateAi}
            onEditSituation={editSituation}
            onReset={reset}
            onLoadDemo={loadDemo}
            onToast={showToast}
          />
        ) : null}
      </main>

      <nav className="p-bottom-nav">
        {NAV.map((n) => (
          <button
            key={n.key}
            type="button"
            className={view === n.key ? "is-on" : ""}
            onClick={() => go(n.key)}
          >
            {n.label}
          </button>
        ))}
      </nav>

      <Assistant
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        data={data}
        view={view}
        activeSpace={activeSpace}
        selectedNode={selectedNode}
        situationSpace={situationSpace}
        onSaveSituation={saveSituation}
        onEditSituation={editSituation}
        onDoneSituation={() => setSituationSpaceId(null)}
        onAddPlans={addPlans}
        onReschedule={reschedule}
        onToast={showToast}
      />

      {noteNode ? (
        <Modal
          title={`写笔记 · ${noteNode.title}`}
          subtitle="学完之后留下证据；保存后节点会从空心变成有笔记。"
          onClose={() => setNoteNode(null)}
          footer={
            <>
              <button className="p-button" type="button" onClick={() => setNoteNode(null)}>
                取消
              </button>
              <button className="p-button primary" type="button" onClick={saveNote}>
                保存并点亮
              </button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              className="p-input"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="标题"
            />
            <textarea
              className="p-textarea"
              style={{ minHeight: 180 }}
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder={"# 标题\n\n写下你学到的东西；保存后节点会从空心变成有笔记。"}
            />
          </div>
        </Modal>
      ) : null}

      {toast ? <div className="p-toast">{toast}</div> : null}
    </div>
  );
}
