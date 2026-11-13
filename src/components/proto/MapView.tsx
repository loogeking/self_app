"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Doc, KNode, Space } from "./types";
import { Modal } from "./ui";

type Props = {
  space: Space;
  nodes: KNode[];
  docs: Doc[];
  onMark: (node: KNode, source: string) => void;
  onWriteNote: (node: KNode) => void;
  onOpenLibrary: (node: KNode) => void;
  onAddNode: (parent: KNode, title: string) => void;
  onSelectNode?: (node: KNode | null) => void;
  onToast: (text: string) => void;
};

type Point = { x: number; y: number };
type GraphPoint = Point & { node: KNode; depth: number; root: string };
type Layout = Map<string, GraphPoint>;
type Filter = "all" | "noted" | "marked" | "empty";

const PALE = "#f4f8ff";
function hash(input: string): number {
  let value = 2166136261;
  for (let i = 0; i < input.length; i += 1) value = Math.imul(value ^ input.charCodeAt(i), 16777619);
  return (value >>> 0) / 4294967296;
}

function layoutGraph(nodes: KNode[]): Layout {
  const layout: Layout = new Map();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string, KNode[]>();
  nodes.forEach((node) => {
    if (!node.parentId) return;
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node); children.set(node.parentId, siblings);
  });
  const roots = nodes.filter((node) => !node.parentId || !byId.has(node.parentId));
  const anchors = new Map<string, Point>();
  const subjects: Point[] = [{ x: .29, y: .27 }, { x: .72, y: .30 }, { x: .31, y: .72 }, { x: .69, y: .73 }];
  const place = (node: KNode, x: number, y: number, depth: number, root: string) => {
    if (layout.has(node.id)) return;
    layout.set(node.id, { node, x, y, depth, root }); anchors.set(node.id, { x, y });
    (children.get(node.id) ?? []).forEach((child, i, siblings) => {
      if (depth === 0 && roots.length === 1) {
        const point = subjects[i % subjects.length]; place(child, point.x, point.y, 1, root); return;
      }
      const angle = i * 2.399963 + hash(node.id) * 6.28;
      const distance = (depth === 1 ? .105 : .052) * Math.sqrt(i + 1) / Math.sqrt(siblings.length) + .02;
      place(child, x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, depth + 1, root);
    });
  };
  roots.forEach((root,i) => place(root, roots.length === 1 ? .5 : .25 + (i % 3) * .25, roots.length === 1 ? .49 : .3 + Math.floor(i / 3) * .35, 0, root.id));
  // A deterministic spring relaxation gives unequal branch lengths and separates neighbouring labels.
  const points = [...layout.values()];
  for (let step = 0; step < 150; step++) {
    const forces = points.map(() => ({ x: 0, y: 0 }));
    points.forEach((point,i) => {
      const anchor = anchors.get(point.node.id)!;
      forces[i].x += (anchor.x - point.x) * .12;
      forces[i].y += (anchor.y - point.y) * .12;
      for (let j=i+1; j<points.length; j++) {
        let dx=point.x-points[j].x, dy=point.y-points[j].y;
        if (Math.abs(dx)+Math.abs(dy)<.0001) { dx=.001; dy=.001; }
        const squared=dx*dx+dy*dy;
        const strength=Math.min(.018,.000008 / Math.max(.00008,squared));
        const distance=Math.sqrt(squared);
        forces[i].x+=dx/distance*strength; forces[i].y+=dy/distance*strength;
        forces[j].x-=dx/distance*strength; forces[j].y-=dy/distance*strength;
      }
    });
    points.forEach((point,i) => {
      const cooling=.2*(1-step/200);
      point.x=Math.max(.055,Math.min(.945,point.x+forces[i].x*cooling));
      point.y=Math.max(.06,Math.min(.94,point.y+forces[i].y*cooling));
    });
  }
  return layout;
}

function descendants(nodes: KNode[], id: string): Set<string> {
  const result = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    nodes.forEach((node) => {
      if (node.parentId && result.has(node.parentId) && !result.has(node.id)) {
        result.add(node.id);
        changed = true;
      }
    });
  }
  return result;
}

function statusLabel(node: KNode): string {
  if (node.state === "noted") return `有笔记 · ${node.notes} 篇`;
  if (node.state === "marked") return `标记已学${node.source ? ` · ${node.source}` : ""}`;
  return "未学";
}

function shortLabel(title: string): string {
  return title.replace(/^第\s*\d+\s*章\s*/, "").replace(/^\d+(\.\d+)+\s*/, "");
}

export default function MapView({
  space,
  nodes,
  docs,
  onMark,
  onWriteNote,
  onOpenLibrary,
  onAddNode,
  onSelectNode,
  onToast,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(nodes.find((node) => node.state === "noted")?.id ?? nodes[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [zoom, setZoom] = useState(1);
  const [leftOpen, setLeftOpen] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["ky-408", "ky-408-ds"]));
  const [rightOpen, setRightOpen] = useState(true);
  const [markOpen, setMarkOpen] = useState(false);
  const [markSource, setMarkSource] = useState("自学");
  const [customOpen, setCustomOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const accent = space.color;
  const pointers = useRef(new Map<number, Point>());
  const pinchDistance = useRef(0);
  const viewRef = useRef({ panX: 0, panY: 0, dragging: false, moved: 0, lastX: 0, lastY: 0 });
  const layoutKey = useMemo(() => nodes.map((node) => `${node.id}:${node.parentId ?? ""}:${node.state}:${node.notes}`).join("|"), [nodes]);
  const layout = useMemo(() => layoutGraph(nodes), [layoutKey]);
  const selected = selectedId ? nodes.find((node) => node.id === selectedId) ?? null : null;
  const matchingIds = useMemo(() => {
    const term = query.trim().toLowerCase();
    return new Set(nodes.filter((node) => !term || node.title.toLowerCase().includes(term)).map((node) => node.id));
  }, [nodes, query]);
  const selectedDocs = useMemo(() => {
    if (!selected) return [];
    const ids = descendants(nodes, selected.id);
    return docs.filter((doc) => doc.nodeId && ids.has(doc.nodeId));
  }, [docs, nodes, selected]);
  const roots = useMemo(() => nodes.filter((node) => node.parentId === null), [nodes]);
  const stats = useMemo(
    () => ({ total: nodes.length, marked: nodes.filter((node) => node.state !== "empty").length, noted: nodes.filter((node) => node.state === "noted").length }),
    [nodes],
  );

  useEffect(() => {
    if (window.matchMedia("(max-width: 900px)").matches) { setLeftOpen(false); setRightOpen(false); }
  }, []);

  useEffect(() => {
    onSelectNode?.(selected);
  }, [onSelectNode, selected]);

  useEffect(() => {
    if (selectedId && nodes.some((node) => node.id === selectedId)) return;
    setSelectedId(nodes[0]?.id ?? null);
  }, [nodes, selectedId]);

  useEffect(() => {
    const term = query.trim();
    if (!term) return;
    const hitNode = nodes.find((node) => node.title.toLowerCase().includes(term.toLowerCase()));
    if (hitNode) {
      setSelectedId(hitNode.id);
      setRightOpen(true);
      const point = layout.get(hitNode.id);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (point && rect) {
        viewRef.current.panX = -(point.x - 0.5) * rect.width * zoom;
        viewRef.current.panY = -(point.y - 0.5) * rect.height * zoom;
      }
    }
  }, [layout, nodes, query]);

  const choose = (id: string) => {
    setSelectedId(id);
    setRightOpen(true);
    if (window.matchMedia("(max-width: 900px)").matches) setLeftOpen(false);
  };

  const pointAt = (event: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const view = viewRef.current;
    return {
      x: (event.clientX - rect.left - rect.width / 2 - view.panX) / (rect.width * zoom) + 0.5,
      y: (event.clientY - rect.top - rect.height / 2 - view.panY) / (rect.height * zoom) + 0.5,
    };
  };

  const hit = (event: { clientX: number; clientY: number }) => {
    const point = pointAt(event);
    let best: string | null = null;
    let distance = 0.028 / zoom;
    layout.forEach((item) => {
      const current = Math.hypot(item.x - point.x, item.y - point.y);
      if (current < distance && (filter === "all" || item.node.state === filter)) {
        distance = current;
        best = item.node.id;
      }
    });
    return best;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let animation = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(frame);

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const view = viewRef.current;
      const centerX = width / 2 + view.panX;
      const centerY = height / 2 + view.panY;
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#070d11";
      context.fillRect(0, 0, width, height);
      context.save();
      context.translate(centerX - width / 2, centerY - height / 2);
      context.translate(width / 2, height / 2);
      context.scale(zoom, zoom);
      const xOf = (value: number) => (value - 0.5) * width;
      const yOf = (value: number) => (value - 0.5) * height;
      const activeBranch = selectedId ? descendants(nodes, selectedId) : new Set<string>();

      const drawLine = (from: GraphPoint, to: GraphPoint, emphasized: boolean) => {
        const visibleFrom = filter === "all" || from.node.state === filter;
        const visibleTo = filter === "all" || to.node.state === filter;
        if (!visibleFrom && !visibleTo) return;
        context.beginPath();
        context.moveTo(xOf(from.x), yOf(from.y));
        context.lineTo(xOf(to.x), yOf(to.y));
        context.strokeStyle = emphasized ? `${accent}b8` : "rgba(148, 178, 204, .24)";
        context.lineWidth = (emphasized ? 1.45 : 0.62) / zoom;
        context.stroke();
      };

      nodes.forEach((node) => {
        if (!node.parentId) return;
        const from = layout.get(node.parentId);
        const to = layout.get(node.id);
        if (from && to) drawLine(from, to, activeBranch.has(node.id) && activeBranch.has(node.parentId));
      });
      nodes.filter((parent) => nodes.some((node) => node.parentId === parent.id)).forEach((root) => {
        const rootItems = nodes.filter((node) => node.parentId === root.id);
        rootItems.forEach((left, index) => {
          rootItems.slice(index + 1, index + 2).forEach((right) => {
            const from = layout.get(left.id);
            const to = layout.get(right.id);
            if (from && to) drawLine(from, to, activeBranch.has(left.id) && activeBranch.has(right.id));
          });
        });
      });

      const labels: { x: number; y: number; width: number; height: number }[] = [];
      layout.forEach((item) => {
        const isRoot = item.depth === 0;
        const matches = matchingIds.has(item.node.id);
        const isVisible = filter === "all" || item.node.state === filter;
        const isHot = hoverId === item.node.id || selectedId === item.node.id;
        const isBranch = activeBranch.has(item.node.id);
        const x = xOf(item.x);
        const y = yOf(item.y);
        const nodeRadius = isRoot ? 5 : item.depth === 1 ? 6 : item.depth === 2 ? 3.7 : 2.1;
        const alpha = !isVisible ? 0.06 : query && !matches ? 0.1 : hoverId && !isBranch && !isHot ? 0.34 : 1;
        context.globalAlpha = alpha;
        if (isHot || item.node.state === "noted") {
          context.beginPath();
          context.arc(x, y, nodeRadius * (isHot ? 3.3 : 2.6), 0, Math.PI * 2);
          context.fillStyle = isHot ? `${accent}2e` : `${accent}18`;
          context.fill();
        }
        context.beginPath();
        context.arc(x, y, nodeRadius, 0, Math.PI * 2);
        if (item.node.state === "empty") {
          context.fillStyle = "#0b151b";
          context.fill();
          context.strokeStyle = isHot ? PALE : "rgba(196, 211, 225, .78)";
          context.lineWidth = (isHot ? 1.4 : 0.8) / zoom;
          context.stroke();
        } else if (item.node.state === "marked") {
          context.fillStyle = `${accent}66`;
          context.fill();
          context.strokeStyle = accent;
          context.lineWidth = 0.8 / zoom;
          context.stroke();
        } else {
          context.shadowColor = accent;
          context.shadowBlur = isHot ? 15 : 7;
          context.fillStyle = accent;
          context.fill();
          context.shadowBlur = 0;
        }
        if (item.node.lastAt && item.node.state !== "empty") {
          context.beginPath();
          context.arc(x, y, nodeRadius + 4 / zoom, 0, Math.PI * 2);
          context.strokeStyle = "rgba(155, 239, 248, .24)";
          context.lineWidth = 0.6 / zoom;
          context.stroke();
        }
        const showLabel = isRoot || item.depth <= 2 || isHot || zoom > 1.22 || item.node.state === "noted" || (item.depth === 3 && hash(item.node.id) > .57);
        if (showLabel) {
          const label = shortLabel(item.node.title);
          const fontSize = item.depth <= 1 ? 13 : item.depth === 2 ? 11 : 10;
          context.font = `${isRoot || item.depth === 1 ? 600 : 400} ${fontSize / zoom}px "Segoe UI", "PingFang SC", sans-serif`;
          context.fillStyle = isHot ? PALE : item.node.state === "noted" ? "rgba(233, 241, 250, .94)" : "rgba(190, 207, 224, .8)";
          context.textAlign = item.x > 0.72 ? "right" : "left";
          const labelX = x + (item.x > 0.72 ? -nodeRadius - 5 / zoom : nodeRadius + 5 / zoom);
          const labelY = y + fontSize / zoom / 3;
          const textWidth = context.measureText(label).width;
          const box = { x: labelX + (item.x > 0.72 ? -textWidth : 0), y: labelY - fontSize / zoom, width: textWidth, height: fontSize / zoom + 3 };
          const clash = labels.some((other) => !(box.x > other.x + other.width || box.x + box.width < other.x || box.y > other.y + other.height || box.y + box.height < other.y));
          if (!clash || isHot || item.node.state === "noted") {
            labels.push(box);
            context.fillText(label, labelX, labelY);
          }
        }
        context.globalAlpha = 1;
      });
      context.restore();
      animation = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
    };
  }, [accent, filter, hoverId, layout, matchingIds, nodes, roots, selectedId, zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((value) => Math.max(0.62, Math.min(2.4, value * (event.deltaY < 0 ? 1.1 : 0.91))));
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, []);

  const onPointerDown = (event: React.PointerEvent) => {
    const view = viewRef.current;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size > 1) {
      const points = [...pointers.current.values()];
      pinchDistance.current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      view.dragging = false;
      return;
    }
    view.dragging = true;
    view.moved = 0;
    view.lastX = event.clientX;
    view.lastY = event.clientY;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const view = viewRef.current;
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size > 1) {
      const points = [...pointers.current.values()];
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (pinchDistance.current > 0) {
        const ratio = distance / pinchDistance.current;
        setZoom((value) => Math.max(0.62, Math.min(2.4, value * ratio)));
      }
      pinchDistance.current = distance;
      return;
    }
    if (view.dragging) {
      const dx = event.clientX - view.lastX;
      const dy = event.clientY - view.lastY;
      view.panX += dx;
      view.panY += dy;
      view.moved += Math.abs(dx) + Math.abs(dy);
      view.lastX = event.clientX;
      view.lastY = event.clientY;
      return;
    }
    const id = hit(event);
    setHoverId(id);
    canvasRef.current?.style.setProperty("cursor", id ? "pointer" : "grab");
  };

  const onPointerUp = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchDistance.current = 0;
    const view = viewRef.current;
    if (!view.dragging) return;
    view.dragging = false;
    if (view.moved < 6) {
      const id = hit(event);
      if (id) choose(id);
    }
  };

  const resetView = () => {
    viewRef.current.panX = 0;
    viewRef.current.panY = 0;
    setZoom(1);
  };

  const focusNode = (node: KNode) => {
    choose(node.id);
    const point = layout.get(node.id);
    if (!point || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    viewRef.current.panX = -(point.x - 0.5) * rect.width * zoom;
    viewRef.current.panY = -(point.y - 0.5) * rect.height * zoom;
  };

  const stateText = selected ? statusLabel(selected) : "选择一个节点查看足迹";

  return (
    <section
      className="kg-map"
      aria-label={`${space.name} 足迹地图`}
      style={{ "--kg-accent": accent, "--kg-cyan": accent } as CSSProperties}
    >
      <div className="kg-map-toolbar">
        <div className="kg-toolbar-title">
          <span className="kg-app-dot" />
          <div>
            <strong>{space.name}{space.id === "ky" ? " / 408" : ""}</strong>
            <span>学习足迹 · 只记录接触与笔记</span>
          </div>
        </div>
        <div className="kg-toolbar-tools">
          <button className="kg-toolbar-panel-button" type="button" aria-expanded={leftOpen} onClick={() => { setLeftOpen(!leftOpen); if (window.innerWidth <= 900) setRightOpen(false); }}>目录</button>
          <button className="kg-toolbar-panel-button" type="button" aria-expanded={rightOpen} onClick={() => { setRightOpen(!rightOpen); if (window.innerWidth <= 900) setLeftOpen(false); }}>检查器</button>
          <label className="kg-search">
            <span aria-hidden="true">⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索节点" aria-label="搜索节点" />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label="清除搜索">×</button> : null}
          </label>
          <div className="kg-filter" role="group" aria-label="节点筛选">
            {(["all", "noted", "marked", "empty"] as Filter[]).map((value) => (
              <button key={value} type="button" className={filter === value ? "is-on" : ""} onClick={() => setFilter(value)}>
                {value === "all" ? "全部" : value === "noted" ? "有笔记" : value === "marked" ? "标记" : "未学"}
              </button>
            ))}
          </div>
          <button className="kg-icon-button" type="button" onClick={resetView} title="重置视图" aria-label="重置视图">⌗</button>
        </div>
      </div>

      <div className="kg-workspace" data-left={leftOpen} data-right={rightOpen}>
        <aside hidden={!leftOpen} className={`kg-sidebar ${leftOpen ? "is-open" : ""}`}>
          <div className="kg-sidebar-head">
            <div><span className="kg-kicker">当前大类</span><h2>{space.name}</h2></div>
            <button type="button" onClick={() => setLeftOpen(false)} aria-label="收起目录">‹</button>
          </div>
          <div className="kg-tree-meta"><span>学习足迹</span><span>{stats.total} 个节点</span></div>
          <div className="kg-tree">
            {(() => {
              const renderTree = (node: KNode, depth = 0): React.ReactNode => {
                const children = nodes.filter((child) => child.parentId === node.id);
                const open = expanded.has(node.id);
                return <div key={node.id}>
                  <div className="kg-tree-line" style={{ paddingLeft: depth * 12 }}>
                    {children.length ? <button className="kg-tree-expander" type="button" aria-label={`${open ? "折叠" : "展开"}${node.title}`} aria-expanded={open} onClick={() => setExpanded((old) => { const next = new Set(old); if (open) next.delete(node.id); else next.add(node.id); return next; })}>{open ? "⌄" : "›"}</button> : <span className="kg-tree-expander" />}
                    <button type="button" className={`kg-tree-root ${selectedId === node.id ? "is-selected" : ""}`} onClick={() => focusNode(node)}><span className="kg-tree-status" data-state={node.state} /><span>{shortLabel(node.title)}</span>{children.length ? <em>{children.length}</em> : null}</button>
                  </div>
                  {open ? children.map((child) => renderTree(child,depth+1)) : null}
                </div>;
              };
              return roots.map((root) => renderTree(root));
            })()}
          </div>
          <div className="kg-sidebar-foot"><span className="kg-signal" />数据来自学习记录与笔记，不代表掌握度</div>
        </aside>

        <div className="kg-canvas-column" ref={frameRef}>
          <div className="kg-canvas-head">
            <div className="kg-breadcrumb"><span>{space.name}</span><i>/</i><span>{space.id === "ky" ? "408" : "足迹"}</span><i>/</i><strong>{selected?.title ?? "全景"}</strong></div>
            <div className="kg-canvas-actions">{query ? <span role="status">{matchingIds.size ? `${matchingIds.size} 个匹配` : "没有匹配的节点"}</span> : null}<span className="kg-live-dot" />学习足迹 <span className="kg-divider" />拖动 · 滚轮缩放</div>
          </div>
          <div className="kg-canvas-frame">
            <canvas ref={canvasRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={() => setHoverId(null)} aria-label="可交互的学习足迹知识图谱" />
            <div className="kg-graph-caption"><span>{stats.total} 个节点</span><span>{Math.round(zoom * 100)}%</span></div>
            <div className="kg-map-zoom"><button type="button" onClick={() => setZoom((value) => Math.min(2.4, value * 1.18))}>+</button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.max(0.62, value / 1.18))}>−</button></div>
            {hoverId ? <div className="kg-hover-card"><strong>{nodes.find((node) => node.id === hoverId)?.title}</strong><span>{nodes.find((node) => node.id === hoverId) ? statusLabel(nodes.find((node) => node.id === hoverId) as KNode) : ""}</span></div> : null}
          </div>
          <div className="kg-statusbar">
            <span><i className="kg-status-dot empty" />未学 {stats.total - stats.marked}</span><span><i className="kg-status-dot marked" />标记 {nodes.filter((node) => node.state === "marked").length}</span><span><i className="kg-status-dot noted" />有笔记 {stats.noted}</span><span className="kg-status-note">点亮只表示接触过；证据在笔记和复盘里</span>
          </div>
        </div>

        <aside hidden={!rightOpen} className={`kg-inspector ${rightOpen ? "is-open" : ""}`}>
          <div className="kg-inspector-head"><div><span className="kg-kicker">选中的节点</span><h2>节点详情</h2></div><button type="button" onClick={() => setRightOpen(false)} aria-label="收起详情">›</button></div>
          {selected ? (
            <>
              <div className="kg-selected-node"><span className="kg-node-orb" data-state={selected.state} /><div><span className="kg-kicker">{selected.parentId ? "当前节点" : "科目"}</span><h3>{selected.title}</h3></div></div>
              <div className="kg-fact-box"><span className="kg-fact-label">足迹状态</span><strong>{stateText}</strong><p>{selected.lastAt ? `最近记录 ${selected.lastAt}` : "还没有学习记录"}</p></div>
              <div className="kg-inspector-section"><div className="kg-section-title">本节点及下级资料 <span>{selectedDocs.length}</span></div>{selectedDocs.length ? selectedDocs.slice(0, 5).map((doc) => <button key={doc.id} className="kg-doc-row" type="button" onClick={() => { const linked = doc.nodeId ? nodes.find((node) => node.id === doc.nodeId) : null; if (linked) onOpenLibrary(linked); else onToast(`预览：${doc.title}（原型）`); }}><span className="kg-doc-icon">{doc.kind === "md" ? "≡" : "▧"}</span><span><strong>{doc.title}</strong><small>{doc.kind === "md" ? "笔记" : doc.kind === "pdf" ? "PDF" : doc.kind === "review" ? "复盘" : "图片"} · {doc.updatedAt}</small></span><b>›</b></button>) : <p className="kg-empty-copy">这里还没有挂笔记或资料。</p>}</div>
              <div className="kg-inspector-section"><div className="kg-section-title">操作</div><div className="kg-action-stack">{selected.state === "empty" ? <button type="button" className="kg-primary-action" onClick={() => setMarkOpen(true)}><span>＋</span>标记已学</button> : null}<button type="button" className="kg-secondary-action" onClick={() => onWriteNote(selected)}><span aria-hidden="true">＋</span>{selected.state === "marked" ? "补一篇笔记" : "写笔记"}</button><button type="button" className="kg-secondary-action" onClick={() => onOpenLibrary(selected)}><span>▤</span>在知识库查看</button><button type="button" className="kg-secondary-action" onClick={() => { setCustomTitle(""); setCustomOpen(true); }}><span>＋</span>添加子节点</button></div></div>
              <div className="kg-inspector-section kg-meaning"><div className="kg-section-title">节点状态</div><p>空心 = 尚未学过<br />半亮 = 标记已学，但没有笔记<br />发光 = 学过且留下笔记<br />分类只表示接触过，不代表掌握。</p></div>
            </>
          ) : <div className="kg-empty-inspector">选择一个节点，查看它留下的事实。</div>}
        </aside>
      </div>

      {customOpen && selected ? (
        <Modal
          title={`在「${selected.title}」下面加内容`}
          subtitle="只添加你自己的标题；新节点先是空心，学过之后再标记。"
          onClose={() => setCustomOpen(false)}
          footer={
            <>
              <button className="p-button" type="button" onClick={() => setCustomOpen(false)}>
                取消
              </button>
              <button
                className="p-button primary"
                type="button"
                disabled={!customTitle.trim()}
                onClick={() => {
                  onAddNode(selected, customTitle);
                  setCustomOpen(false);
                }}
              >
                添加
              </button>
            </>
          }
        >
          <label className="p-field">
            节点标题
            <input
              className="p-input"
              autoFocus
              value={customTitle}
              onChange={(event) => setCustomTitle(event.target.value)}
              placeholder="例如：进程同步与互斥、二叉树遍历手推"
            />
          </label>
        </Modal>
      ) : null}

      {markOpen && selected ? <Modal title={`标记「${selected.title}」为已学`} subtitle="记录你接触过它，不表示已经掌握。" onClose={() => setMarkOpen(false)} footer={<><button className="p-button" type="button" onClick={() => setMarkOpen(false)}>取消</button><button className="p-button primary" type="button" onClick={() => { onMark(selected, markSource); setMarkOpen(false); }}>标记</button></>}><p className="p-sub" style={{ marginBottom: 14 }}>没有笔记也算足迹，但周复盘会把它标出来。来源可选。</p><div className="p-swatches">{["自学", "网课", "电子书", "其他"].map((source) => <button key={source} type="button" className={`p-chip${markSource === source ? " is-on" : ""}`} onClick={() => setMarkSource(source)}>{source}</button>)}</div></Modal> : null}
    </section>
  );
}
