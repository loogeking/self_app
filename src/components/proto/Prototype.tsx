"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type {
  AiConfig,
  AiPulse,
  AppData,
  Doc,
  ImportBatch,
  KNode,
  NewMapNode,
  PlanItem,
  Session,
  Situation,
  Space,
  TaskRoute,
  View,
} from "./types";
import { EMPTY, SEED, TODAY } from "./data";
import { docNodeIds, normalizeDocLinks, syncNodeDocCounts } from "./docLinks";
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
  return normalizeDocLinks({
    ...data,
    ai: data.ai ?? { ...SEED.ai! },
    imports: data.imports ?? [],
  });
}

export default function Prototype() {
  const [data, setData] = useState<AppData>(() => clone(EMPTY));
  const [view, setView] = useState<View>("today");
  const [activeSpace, setActiveSpace] = useState<string>("all");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [aiPulse, setAiPulse] = useState<AiPulse | null>(null);
  const [situationSpaceId, setSituationSpaceId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<KNode | null>(null);
  const [libraryFocus, setLibraryFocus] = useState<string | null>(null);
  const [reviewInitial, setReviewInitial] = useState<string | undefined>(undefined);
  const [reviewKey, setReviewKey] = useState(0);
  const [linkNode, setLinkNode] = useState<KNode | null>(null);
  const [linkIds, setLinkIds] = useState<string[]>([]);
  const [linkQuery, setLinkQuery] = useState("");
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
    ? data.docs.filter((d) => {
        if (d.spaceId !== mapSpace.id) return false;
        const linked = docNodeIds(d);
        return !linked.length || linked.some((id) => mapNodeIds.has(id));
      })
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

  const applyAiMap = (
    spaceId: string,
    incoming: NewMapNode[],
    docId: string,
    rootId: string | null,
  ) => {
    if (!incoming.length) return;
    const added: KNode[] = incoming.map((node) => ({
      ...node,
      state: "empty",
      notes: 0,
      custom: true,
    }));
    setData((d) => {
      const docs = d.docs.map((doc) => {
        if (doc.id !== docId) return doc;
        const ids = new Set(docNodeIds(doc));
        if (rootId) ids.add(rootId);
        return { ...doc, spaceId, nodeIds: [...ids] };
      });
      const nodes = syncNodeDocCounts([...d.nodes, ...added], docs);
      return { ...d, nodes, docs };
    });
    showToast(`AI 提议已写入：新增 ${added.length} 个节点，先都是空心。`);
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
      const docs = d.docs.map((doc) => ({
        ...doc,
        nodeIds: docNodeIds(doc).filter((id) => !remove.has(id)),
      }));
      const nodes = syncNodeDocCounts(d.nodes.filter((n) => !remove.has(n.id)), docs);
      return { ...d, nodes, docs };
    });
    showToast(`已删除「${node.title}」；关联资料本身保留，仅解除这些节点的绑定。`);
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

  const openLinks = (node: KNode) => {
    setLinkNode(node);
    setLinkIds(data.docs.filter((doc) => docNodeIds(doc).includes(node.id)).map((doc) => doc.id));
    setLinkQuery("");
  };

  const saveLinks = () => {
    if (!linkNode) return;
    const selected = new Set(linkIds);
    const docs = data.docs.map((doc) => {
      const ids = new Set(docNodeIds(doc));
      if (selected.has(doc.id)) ids.add(linkNode.id);
      else ids.delete(linkNode.id);
      return { ...doc, nodeIds: [...ids] };
    });
    const nodes = syncNodeDocCounts(data.nodes, docs);
    const next = nodes.find((node) => node.id === linkNode.id) ?? null;
    setData((d) => ({ ...d, docs, nodes }));
    setSelectedNode((current) => (current && current.id === linkNode.id ? next : current));
    setLinkNode(null);
    showToast(`「${linkNode.title}」的关联资料已更新。`);
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
    const keys = new Set(data.sessions.map((s) => `${s.date}|${s.start}|${s.task.trim()}`));
    const fresh = rows.filter((row) => !keys.has(`${row.date}|${row.start}|${row.task.trim()}`));
    setData((d) => ({
      ...d,
      sessions: [...fresh, ...d.sessions],
      imports: [batch, ...(d.imports ?? [])],
      prefs: { ...d.prefs, taskRoutes: { ...(d.prefs.taskRoutes ?? {}), ...routes } },
    }));
    if (fresh.length) {
      setAiPulse({ id: Date.now(), kind: "import", sessions: fresh, batch });
      setAssistantOpen(true);
    }
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
    setAiPulse(null);
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
    setAiPulse(null);
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
              setLibraryFocus(docNodeIds(doc)[0] ?? null);
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
              onLinkDocs={openLinks}
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
            onApplyAiMap={applyAiMap}
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
        pulse={aiPulse}
        situationSpace={situationSpace}
        onSaveSituation={saveSituation}
        onEditSituation={editSituation}
        onDoneSituation={() => setSituationSpaceId(null)}
        onApplyAiMap={applyAiMap}
        onAddPlans={addPlans}
        onReschedule={reschedule}
        onToast={showToast}
      />

      {linkNode ? (
        <Modal
          title={`关联资料 · ${linkNode.title}`}
          subtitle="一个节点可以关联多份 PDF、Markdown 或图片；同一份资料也可以关联多个节点。"
          onClose={() => setLinkNode(null)}
          footer={
            <>
              <button className="p-button" type="button" onClick={() => setLinkNode(null)}>
                取消
              </button>
              <button className="p-button primary" type="button" onClick={saveLinks}>
                保存关联（{linkIds.length}）
              </button>
            </>
          }
        >
          <div className="p-link-modal">
            <input
              className="p-input"
              value={linkQuery}
              onChange={(event) => setLinkQuery(event.target.value)}
              placeholder="搜索资料标题或摘要…"
            />
            <p className="p-tiny p-faint">
              已关联 {linkIds.length} 份。取消勾选只会解除这个节点的绑定，不会删除资料。
            </p>
            <div className="p-link-list">
              {data.docs
                .filter((doc) => {
                  const q = linkQuery.trim().toLowerCase();
                  return !q || `${doc.title} ${doc.summary}`.toLowerCase().includes(q);
                })
                .map((doc) => {
                  const checked = linkIds.includes(doc.id);
                  const otherLinks = docNodeIds(doc).filter((id) => id !== linkNode.id).length;
                  const space = data.spaces.find((item) => item.id === doc.spaceId);
                  return (
                    <label className={`p-link-row${checked ? " is-on" : ""}`} key={doc.id}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setLinkIds((old) =>
                            checked ? old.filter((id) => id !== doc.id) : [...old, doc.id],
                          )
                        }
                      />
                      <span className="p-link-kind">{doc.kind === "pdf" ? "PDF" : doc.kind === "md" ? "MD" : doc.kind === "image" ? "IMG" : "复"}</span>
                      <span className="p-link-copy">
                        <b>{doc.title}</b>
                        <small>
                          {space?.name ?? "未分类"} · {doc.size ?? doc.updatedAt}
                          {otherLinks ? ` · 已关联 ${otherLinks} 个其他节点` : ""}
                        </small>
                      </span>
                    </label>
                  );
                })}
              {!data.docs.length ? (
                <p className="p-empty">资料库还是空的。先去知识库导入 PDF、Markdown 或图片。</p>
              ) : null}
            </div>
          </div>
        </Modal>
      ) : null}

      {toast ? <div className="p-toast">{toast}</div> : null}
    </div>
  );
}
