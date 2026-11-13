"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AppData, Doc, DocKind, KNode, NewMapNode, Space } from "./types";
import { CAT_COLOR, CAT_LABEL, Markdownish, Modal, fmtMin, sum } from "./ui";
import { getLocalFile, putLocalFile } from "./fileStore";
import { TODAY } from "./data";
import PdfMap from "./PdfMap";
import { docNodeIds } from "./docLinks";

type Props = {
  data: AppData;
  activeSpace: string;
  onAddDocs: (docs: Doc[]) => void;
  onApplyAiMap: (spaceId: string, nodes: NewMapNode[], docId: string, rootId: string | null) => void;
  onToast: (text: string) => void;
  focusNodeId?: string | null;
  onClearFocus?: () => void;
};

type Group = { key: string; title: string; subtitle?: string; docs: Doc[] };

function topSubject(nodes: KNode[], nodeId?: string): KNode | null {
  if (!nodeId) return null;
  let cur = nodes.find((n) => n.id === nodeId);
  if (!cur) return null;
  while (cur.parentId) {
    const p = nodes.find((n) => n.id === cur?.parentId);
    if (!p) break;
    cur = p;
  }
  return cur;
}

function nodeLabel(nodes: KNode[], nodeId?: string): string {
  if (!nodeId) return "未挂节点";
  const n = nodes.find((x) => x.id === nodeId);
  return n?.title ?? "未挂节点";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function kindOf(file: File): DocKind | null {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/")) return "image";
  if (
    file.type === "text/markdown" ||
    file.type === "text/plain" ||
    /\.(md|markdown|txt)$/i.test(file.name)
  ) {
    return "md";
  }
  return null;
}

export default function Library({
  data,
  activeSpace,
  onAddDocs,
  onApplyAiMap,
  onToast,
  focusNodeId,
  onClearFocus,
}: Props) {
  const [kind, setKind] = useState<"all" | DocKind>("all");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<Doc | null>(null);
  const [mapDoc, setMapDoc] = useState<Doc | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setPreviewUrl(null);
    setPreviewLoading(Boolean(preview?.fileKey));
    if (preview?.fileKey) {
      void getLocalFile(preview.fileKey)
        .then((blob) => {
          if (cancelled || !blob) return;
          objectUrl = URL.createObjectURL(blob);
          setPreviewUrl(objectUrl);
        })
        .catch(() => {
          if (!cancelled) setPreviewLoading(false);
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false);
        });
    }
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [preview]);

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const targetNode = focusNodeId ? data.nodes.find((node) => node.id === focusNodeId) : null;
    const spaceId = targetNode?.spaceId ?? (activeSpace !== "all" ? activeSpace : data.spaces[0]?.id);
    if (!spaceId) {
      onToast("先建一个大类，再导入资料。");
      return;
    }
    setImporting(true);
    const next: Doc[] = [];
    try {
      for (const [index, file] of Array.from(files).entries()) {
        const kind = kindOf(file);
        if (!kind) {
          onToast(`跳过不支持的格式：${file.name}`);
          continue;
        }
        const id = `d-local-${Date.now()}-${index}`;
        const fileKey = `file-${id}`;
        await putLocalFile(fileKey, file);
        const body = kind === "md" ? await file.text() : undefined;
        const summary =
          kind === "md"
            ? (body ?? "").replace(/[#>*_`~-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 90) || "本机导入的 Markdown"
            : kind === "pdf"
              ? "本机导入的 PDF；原始文件保存在浏览器 IndexedDB。"
              : "本机导入的图片。";
        next.push({
          id,
          spaceId,
          nodeIds: targetNode?.id ? [targetNode.id] : [],
          title: file.name.replace(/\.[^.]+$/, ""),
          fileName: file.name,
          kind,
          summary,
          body,
          size: formatSize(file.size),
          mime: file.type || undefined,
          fileKey,
          updatedAt: TODAY,
        });
      }
      if (next.length) onAddDocs(next);
    } catch (error) {
      onToast(`导入失败：${error instanceof Error ? error.message : "无法写入本机文件库"}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const downloadPreview = async () => {
    if (!preview) return;
    try {
      const blob = preview.fileKey
        ? await getLocalFile(preview.fileKey)
        : preview.body
          ? new Blob([preview.body], { type: "text/markdown;charset=utf-8" })
          : null;
      if (!blob) {
        onToast("这份资料没有原始文件，无法下载。");
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = preview.fileName ?? preview.title;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      onToast("读取原始文件失败。");
    }
  };

  const docs = useMemo(() => {
    let list = data.docs.filter((d) => activeSpace === "all" || d.spaceId === activeSpace);
    if (focusNodeId) list = list.filter((d) => docNodeIds(d).includes(focusNodeId));
    if (kind !== "all") list = list.filter((d) => d.kind === kind);
    const q = query.trim();
    if (q) list = list.filter((d) => (d.title + " " + d.summary + " " + (d.body ?? "")).includes(q));
    return list;
  }, [data.docs, activeSpace, kind, query, focusNodeId]);

  const groups = useMemo<Group[]>(() => {
    const groups: Group[] = [];
    const push = (key: string, title: string, subtitle: string | undefined, d: Doc) => {
      let g = groups.find((x) => x.key === key);
      if (!g) {
        g = { key, title, subtitle, docs: [] };
        groups.push(g);
      }
      g.docs.push(d);
    };

    if (activeSpace === "all") {
      for (const sp of data.spaces) {
        for (const d of docs.filter((x) => x.spaceId === sp.id)) {
          push(`space-${sp.id}`, sp.name, sp.description, d);
        }
      }
    } else {
      for (const d of docs) {
        if (d.kind === "review") {
          push("reviews", "复盘笔记", "每日 / 每周", d);
          continue;
        }
        const sub = topSubject(data.nodes, docNodeIds(d)[0]);
        if (sub) push(`node-${sub.id}`, sub.title, "科目", d);
        else push("inbox", "未挂节点", "收纳箱", d);
      }
    }
    return groups;
  }, [docs, activeSpace, data.spaces, data.nodes]);

  const counts = useMemo(() => {
    const base = data.docs.filter((d) => activeSpace === "all" || d.spaceId === activeSpace);
    return {
      all: base.length,
      pdf: base.filter((d) => d.kind === "pdf").length,
      md: base.filter((d) => d.kind === "md").length,
      review: base.filter((d) => d.kind === "review").length,
      image: base.filter((d) => d.kind === "image").length,
    };
  }, [data.docs, activeSpace]);

  const previewSpace = preview ? data.spaces.find((s) => s.id === preview.spaceId) : null;
  const previewNodeList = preview
    ? docNodeIds(preview)
        .map((id) => data.nodes.find((node) => node.id === id))
        .filter((node): node is KNode => Boolean(node))
    : [];
  const mapSpace = mapDoc ? data.spaces.find((space) => space.id === mapDoc.spaceId) : null;
  const previewSessions = preview?.kind === "review" && preview.updatedAt
    ? data.sessions.filter((s) => s.date === preview.updatedAt)
    : [];
  const study = sum(previewSessions.filter((s) => s.cat === "study"));
  const planMin = sum(previewSessions.filter((s) => s.cat === "plan"));
  const leisure = sum(previewSessions.filter((s) => s.cat === "leisure"));

  return (
    <div>
      <header className="p-page-head">
        <div>
          <p className="p-page-meta">2026-11-10 周二 · {activeSpace === "all" ? "全部大类" : "当前大类"}</p>
          <h1 className="p-h1">知识库</h1>
          <p className="p-sub">
            书、笔记、每日复盘放在同一个架子上；PDF、Markdown、图片只是筛选条件，不是一级目录。
          </p>
        </div>
        <div className="p-head-stats">
          <div className="p-stat">
            <b>{counts.all}</b>
            <span>资料</span>
          </div>
          <div className="p-stat">
            <b>{counts.md}</b>
            <span>笔记</span>
          </div>
          <div className="p-stat">
            <b>{counts.review}</b>
            <span>复盘</span>
          </div>
          <div className="p-stat">
            <b>{counts.pdf}</b>
            <span>PDF</span>
          </div>
        </div>
      </header>

      <div className="p-lib-tools">
        {(
          [
            ["all", "全部"],
            ["pdf", "PDF"],
            ["md", "笔记"],
            ["review", "复盘"],
            ["image", "图片"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`p-chip${kind === k ? " is-on" : ""}`}
            onClick={() => setKind(k)}
          >
            {label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <div className="p-lib-search">
          <input
            className="p-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜标题 / 摘要 / 正文…"
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,image/*,.md,.markdown,.txt,text/markdown,text/plain,application/pdf"
          style={{ display: "none" }}
          onChange={(event) => void importFiles(event.target.files)}
        />
        <button
          className="p-button primary"
          type="button"
          disabled={importing}
          onClick={() => fileInputRef.current?.click()}
          title="文件保存在本机浏览器 IndexedDB"
        >
          {importing ? "正在导入…" : "＋ 导入文件"}
        </button>
      </div>

      {focusNodeId ? (
        <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <span className="p-tag accent">正在筛选节点：{nodeLabel(data.nodes, focusNodeId)}</span>
          {onClearFocus ? (
            <button className="p-button ghost sm" type="button" onClick={onClearFocus}>
              清除筛选
            </button>
          ) : null}
        </div>
      ) : null}

      {groups.length === 0 ? (
        <div className="p-empty">没有匹配的资料。换个筛选，或者上传一份。</div>
      ) : (
        <div className="p-shelf">
          {groups.map((g) => (
            <section className="p-shelf-group" key={g.key}>
              <div className="p-shelf-head">
                <h3>{g.title}</h3>
                {g.subtitle ? <span>{g.subtitle}</span> : null}
                <span style={{ marginLeft: "auto" }}>{g.docs.length} 份</span>
              </div>
              <div className="p-doc-grid">
                {g.docs.map((d) => {
                  const sp = data.spaces.find((s) => s.id === d.spaceId);
                  const linked = docNodeIds(d)
                    .map((id) => data.nodes.find((node) => node.id === id))
                    .filter((node): node is KNode => Boolean(node));
                  const n = linked[0];
                  const coverTitle =
                    d.kind === "review"
                      ? d.updatedAt
                      : (n?.title ?? d.title).slice(0, 8);
                  return (
                    <button key={d.id} type="button" className="p-doc-card" onClick={() => setPreview(d)}>
                      <div
                        className={`p-cover ${d.kind}`}
                        style={{ ["--cover" as string]: sp?.color ?? "#1d7a5a" }}
                        title={d.title}
                      >
                        <div className="p-cover-title">{coverTitle}</div>
                        <div className="p-cover-kind">{d.kind === "review" ? "复盘" : d.kind === "pdf" ? "PDF" : d.kind === "md" ? "笔记" : "图片"}</div>
                      </div>
                      <div className="p-doc-body">
                        <div className="p-doc-title">{d.title}</div>
                        <div className="p-doc-summary">{d.summary}</div>
                        <div className="p-doc-meta">
                          {d.kind === "review" ? (
                            <span className="p-node">复盘 · {(d.tags ?? ["每日"]).join(" / ")}</span>
                          ) : n ? (
                            <span className="p-node" title={linked.map((node) => node.title).join(" / ")}>
                              {n.title}
                              {linked.length > 1 ? ` +${linked.length - 1}` : ""}
                            </span>
                          ) : (
                            <span>未挂节点</span>
                          )}
                          <span className="p-size">
                            {d.pages ? `${d.pages} 页 · ` : ""}
                            {d.size ?? d.updatedAt}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {preview ? (
        <Modal
          title={preview.title}
          subtitle={`${preview.kind === "pdf" ? "PDF" : preview.kind === "md" ? "笔记" : preview.kind === "review" ? "复盘" : "图片"} · ${previewSpace?.name ?? ""} · 更新于 ${preview.updatedAt}`}
          onClose={() => setPreview(null)}
          wide
          footer={
            <>
              {preview.kind === "pdf" && preview.fileKey ? (
                <button
                  className="p-button"
                  type="button"
                  onClick={() => {
                    if (!data.spaces.some((space) => space.id === preview.spaceId)) {
                      onToast("这份 PDF 所属的大类已不存在，先重新导入。");
                      return;
                    }
                    setMapDoc(preview);
                    setPreview(null);
                  }}
                >
                  AI 整理成地图
                </button>
              ) : null}
              <button className="p-button" type="button" onClick={() => void downloadPreview()}>
                下载
              </button>
              <button className="p-button primary" type="button" onClick={() => setPreview(null)}>
                关闭
              </button>
            </>
          }
        >
          <div className="p-preview">
            <div className="p-preview-side">
              <div
                className={`p-cover ${preview.kind}`}
                style={{
                  ["--cover" as string]: previewSpace?.color ?? "#1d7a5a",
                  width: 112,
                  height: 148,
                  marginBottom: 12,
                }}
              >
                <div className="p-cover-title" style={{ fontSize: 11 }}>
                  {preview.title}
                </div>
                <div className="p-cover-kind">{preview.kind === "pdf" ? "PDF" : preview.kind === "md" ? "笔记" : preview.kind === "review" ? "复盘" : "图片"}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5 }}>
                <div>
                  <span className="p-faint">大类：</span>
                  {previewSpace?.name}
                </div>
                <div>
                  <span className="p-faint">关联节点：</span>
                  {previewNodeList.length ? (
                    <span className="p-linked-nodes">
                      {previewNodeList.map((node) => (
                        <span className="p-tag" key={node.id}>
                          {node.title}
                        </span>
                      ))}
                    </span>
                  ) : (
                    "未挂节点"
                  )}
                </div>
                {preview.pages ? (
                  <div>
                    <span className="p-faint">页数：</span>
                    {preview.pages}
                  </div>
                ) : null}
                {preview.size ? (
                  <div>
                    <span className="p-faint">大小：</span>
                    {preview.size}
                  </div>
                ) : null}
                <div>
                  <span className="p-faint">更新：</span>
                  {preview.updatedAt}
                </div>
              </div>
              <p className="p-tiny p-faint" style={{ marginTop: 14, lineHeight: 1.7 }}>
                {preview.summary}
              </p>
            </div>

            <div>
              {preview.kind === "pdf" && preview.fileKey ? (
                previewUrl ? (
                  <iframe className="p-pdf-frame" src={previewUrl} title={preview.title} />
                ) : (
                  <div className="p-preview-loading">
                    {previewLoading ? "正在读取本机 PDF…" : "没有读到原始 PDF 文件。"}
                  </div>
                )
              ) : preview.kind === "pdf" ? (
                <div className="p-preview-page">
                  <div style={{ fontSize: 9, letterSpacing: "0.18em", color: "#8a8f84", marginBottom: 18 }}>
                    {previewSpace?.name} · {previewNodeList[0]?.title ?? "未挂节点"}
                  </div>
                  <h3>{preview.title}</h3>
                  <p style={{ marginBottom: 12 }}>
                    第 1 章　{previewNodeList[0]?.title ?? "未挂节点"}
                  </p>
                  <p>
                    本节从基本概念开始，先把逻辑结构与存储结构分开，再讨论时间复杂度和空间复杂度的分析方法。
                    阅读时先合上书，自己推一遍循环嵌套的阶，再对照书上的结论。
                  </p>
                  <p>
                    练习：判断下列程序段的时间复杂度；写出推导过程，而不是只写答案。
                  </p>
                  <div style={{ marginTop: 26, fontSize: 9, color: "#a4a89e", textAlign: "right" }}>
                    {preview.pages ? `1 / ${preview.pages}` : ""}
                  </div>
                </div>
              ) : preview.kind === "md" ? (
                <div className="p-preview-body">
                  <Markdownish text={preview.body ?? preview.summary} />
                </div>
              ) : preview.kind === "review" ? (
                <div>
                  <div className="p-auto-facts" style={{ marginBottom: 14 }}>
                    <div className="p-auto-facts-head">
                      <b>当天的事实</b>
                      <span>{preview.updatedAt}</span>
                    </div>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11 }}>
                      <span>学习 {fmtMin(study)}</span>
                      <span style={{ color: CAT_COLOR.plan }}>计划 {fmtMin(planMin)}</span>
                      <span style={{ color: CAT_COLOR.leisure }}>娱乐 {fmtMin(leisure)}</span>
                    </div>
                    <div className="p-auto-list">
                      {previewSessions.filter((s) => s.minutes > 0).map((s) => (
                        <span key={s.id} className="p-tag">
                          {CAT_LABEL[s.cat]} · {s.task} {fmtMin(s.minutes)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="p-preview-body">
                    <Markdownish text={preview.body ?? ""} />
                  </div>
                </div>
              ) : preview.kind === "image" && preview.fileKey ? (
                previewUrl ? (
                  <img className="p-image-preview" src={previewUrl} alt={preview.title} />
                ) : (
                  <div className="p-preview-loading">
                    {previewLoading ? "正在读取本机图片…" : "没有读到原始图片文件。"}
                  </div>
                )
              ) : (
                <div
                  style={{
                    borderRadius: 10,
                    border: "1px solid var(--p-line)",
                    padding: 30,
                    background: `linear-gradient(145deg, ${previewSpace?.color ?? "#1d7a5a"}22, #fff)`,
                    minHeight: 260,
                    display: "grid",
                    placeItems: "center",
                    textAlign: "center",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, color: "var(--p-muted)" }}>图片预览</div>
                    <div style={{ fontSize: 18, fontWeight: 650, marginTop: 8 }}>{preview.title}</div>
                    <div className="p-tiny p-faint" style={{ marginTop: 6 }}>
                      {preview.summary}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Modal>
      ) : null}

      {mapDoc && mapSpace ? (
        <PdfMap
          doc={mapDoc}
          space={mapSpace}
          data={data}
          onApply={onApplyAiMap}
          onClose={() => setMapDoc(null)}
          onToast={onToast}
        />
      ) : null}
    </div>
  );
}
