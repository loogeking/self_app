"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Doc, KNode, Space } from "./types";
import { Markdownish, Modal } from "./ui";

type Props = {
  space: Space;
  nodes: KNode[];
  docs: Doc[];
  onMark: (node: KNode, source: string) => void;
  onWriteNote: (node: KNode) => void;
  onOpenLibrary: (node: KNode) => void;
  onAddNode: (parent: KNode, title: string) => void;
  onUpdateNode: (node: KNode, title: string) => void;
  onDeleteNode: (node: KNode) => void;
  onSelectNode?: (node: KNode | null) => void;
  onToast: (text: string) => void;
};

type Point = { x: number; y: number };
type World = Point & { z: number; node: KNode; depth: number; root: string };
type Layout = Map<string, World>;
type Projected = World & { sx: number; sy: number; scale: number; alpha: number };
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
    siblings.push(node);
    children.set(node.parentId, siblings);
  });
  const roots = nodes.filter((node) => !node.parentId || !byId.has(node.parentId));
  const anchors = new Map<string, Point>();
  const subjects: Point[] = [
    { x: 0.3, y: 0.28 },
    { x: 0.72, y: 0.31 },
    { x: 0.31, y: 0.72 },
    { x: 0.69, y: 0.73 },
  ];
  const place = (node: KNode, x: number, y: number, depth: number, root: string) => {
    if (layout.has(node.id)) return;
    layout.set(node.id, { node, x, y, z: 0, depth, root });
    anchors.set(node.id, { x, y });
    (children.get(node.id) ?? []).forEach((child, index, siblings) => {
      if (depth === 0 && roots.length === 1) {
        const point = subjects[index % subjects.length];
        place(child, point.x, point.y, 1, root);
        return;
      }
      const angle = index * 2.399963 + hash(node.id) * 6.28;
      const distance = (depth === 1 ? 0.105 : 0.052) + 0.012 * Math.min(3, depth);
      const spread = Math.sqrt(index + 1) / Math.sqrt(Math.max(1, siblings.length));
      place(
        child,
        Math.max(0.05, Math.min(0.95, x + Math.cos(angle) * distance * (0.45 + spread))),
        Math.max(0.05, Math.min(0.95, y + Math.sin(angle) * distance * (0.45 + spread))),
        depth + 1,
        root,
      );
    });
  };
  roots.forEach((root, index) =>
    place(
      root,
      roots.length === 1 ? 0.5 : 0.25 + (index % 3) * 0.25,
      roots.length === 1 ? 0.5 : 0.3 + Math.floor(index / 3) * 0.35,
      0,
      root.id,
    ),
  );

  // 3D: keep the cluster geometry, add root-specific depth and deterministic jitter.
  const rootIndex = new Map(roots.map((root, index) => [root.id, index]));
  layout.forEach((item) => {
    const rootI = rootIndex.get(item.root) ?? 0;
    const rootZ = roots.length === 1 ? 0 : [-0.62, 0.58, -0.45, 0.5][rootI % 4];
    const spread = item.depth <= 1 ? 0.9 : item.depth === 2 ? 0.62 : 0.45;
    item.x = (item.x - 0.5) * 2.55;
    item.y = (0.5 - item.y) * 2.1;
    item.z = rootZ + (hash(item.node.id) - 0.5) * spread;
  });
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

function isCustom(node: KNode): boolean {
  return Boolean(node.custom) || node.id.startsWith("ky-408-custom-");
}

function typeLabel(kind: Doc["kind"]): string {
  return kind === "md" ? "笔记" : kind === "pdf" ? "PDF" : kind === "review" ? "复盘" : "图片";
}

export default function MapView({
  space,
  nodes,
  docs,
  onMark,
  onWriteNote,
  onOpenLibrary,
  onAddNode,
  onUpdateNode,
  onDeleteNode,
  onSelectNode,
  onToast,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    nodes.find((node) => node.state === "noted")?.id ?? nodes[0]?.id ?? null,
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [zoom, setZoom] = useState(1);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["ky-408", "ky-408-ds"]));
  const [markOpen, setMarkOpen] = useState(false);
  const [markSource, setMarkSource] = useState("自学");
  const [customOpen, setCustomOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Doc | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [rotateLabel, setRotateLabel] = useState("旋转中");

  const accent = space.color;
  const pointers = useRef(new Map<number, Point>());
  const pinchDistance = useRef(0);
  const hoverRef = useRef<string | null>(null);
  const autoRef = useRef(true);
  const projectionRef = useRef<Projected[]>([]);
  const rotationRef = useRef({
    yaw: -0.38,
    pitch: 0.2,
    zoom: 1,
    dragging: false,
    moved: 0,
    lastX: 0,
    lastY: 0,
    interactionUntil: 0,
    target: null as { yaw: number; pitch: number } | null,
  });

  const layoutKey = useMemo(
    () =>
      nodes
        .map((node) => `${node.id}:${node.parentId ?? ""}:${node.state}:${node.notes}`)
        .join("|"),
    [nodes],
  );
  const layout = useMemo(() => layoutGraph(nodes), [layoutKey]);
  const selected = selectedId ? nodes.find((node) => node.id === selectedId) ?? null : null;
  const matchingIds = useMemo(() => {
    const term = query.trim().toLowerCase();
    return new Set(
      nodes
        .filter((node) => !term || node.title.toLowerCase().includes(term))
        .map((node) => node.id),
    );
  }, [nodes, query]);
  const selectedDocs = useMemo(() => {
    if (!selected) return [];
    const ids = descendants(nodes, selected.id);
    return docs.filter((doc) => doc.nodeId && ids.has(doc.nodeId));
  }, [docs, nodes, selected]);
  const roots = useMemo(() => nodes.filter((node) => node.parentId === null), [nodes]);
  const stats = useMemo(
    () => ({
      total: nodes.length,
      marked: nodes.filter((node) => node.state !== "empty").length,
      noted: nodes.filter((node) => node.state === "noted").length,
    }),
    [nodes],
  );
  const selectedIsCustom = selected ? isCustom(selected) : false;
  const childCount = selected ? nodes.filter((node) => node.parentId === selected.id).length : 0;

  useEffect(() => {
    if (window.matchMedia("(max-width: 900px)").matches) {
      setLeftOpen(false);
      setRightOpen(false);
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAutoRotate(false);
      autoRef.current = false;
    }
  }, []);

  useEffect(() => {
    onSelectNode?.(selected);
  }, [onSelectNode, selected]);

  useEffect(() => {
    if (selectedId && nodes.some((node) => node.id === selectedId)) return;
    setSelectedId(nodes[0]?.id ?? null);
  }, [nodes, selectedId]);

  useEffect(() => {
    autoRef.current = autoRotate;
    setRotateLabel(autoRotate ? "旋转中" : "已暂停");
  }, [autoRotate]);

  const aimAt = (node: KNode) => {
    const point = layout.get(node.id);
    if (!point) return;
    const len = Math.hypot(point.x, point.z) || 0.001;
    const targetYaw = Math.atan2(point.x, point.z) + Math.PI;
    const z1 = -len;
    const targetPitch = Math.max(-1.15, Math.min(1.15, Math.atan2(point.y, z1)));
    rotationRef.current.target = { yaw: targetYaw, pitch: targetPitch };
    rotationRef.current.interactionUntil = performance.now() + 5200;
    rotationRef.current.zoom = Math.max(1.12, rotationRef.current.zoom);
    setZoom(rotationRef.current.zoom);
  };

  useEffect(() => {
    const term = query.trim();
    if (!term) return;
    const hit = nodes.find((node) => node.title.toLowerCase().includes(term.toLowerCase()));
    if (!hit) return;
    setSelectedId(hit.id);
    setRightOpen(true);
    aimAt(hit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const choose = (id: string) => {
    setSelectedId(id);
    setRightOpen(true);
    if (window.matchMedia("(max-width: 900px)").matches) setLeftOpen(false);
  };

  const hit = (event: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best: string | null = null;
    let bestDistance = 24;
    for (const item of projectionRef.current) {
      if (filter !== "all" && item.node.state !== filter) continue;
      const distance = Math.hypot(item.sx - x, item.sy - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = item.node.id;
      }
    }
    return best;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let animation = 0;
    let last = performance.now();
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

    const draw = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const rot = rotationRef.current;

      if (rot.target) {
        const deltaYaw = Math.atan2(
          Math.sin(rot.target.yaw - rot.yaw),
          Math.cos(rot.target.yaw - rot.yaw),
        );
        rot.yaw += deltaYaw * 0.095;
        rot.pitch += (rot.target.pitch - rot.pitch) * 0.095;
        if (Math.abs(deltaYaw) < 0.01 && Math.abs(rot.target.pitch - rot.pitch) < 0.01) {
          rot.target = null;
        }
      } else if (autoRef.current && now > rot.interactionUntil) {
        rot.yaw += dt * 0.00008;
      }

      context.clearRect(0, 0, width, height);
      context.fillStyle = "#070c13";
      context.fillRect(0, 0, width, height);

      const glow = context.createRadialGradient(
        width * 0.52,
        height * 0.48,
        10,
        width * 0.52,
        height * 0.48,
        Math.max(width, height) * 0.62,
      );
      glow.addColorStop(0, `${accent}18`);
      glow.addColorStop(0.55, `${accent}06`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      const cosYaw = Math.cos(rot.yaw);
      const sinYaw = Math.sin(rot.yaw);
      const cosPitch = Math.cos(rot.pitch);
      const sinPitch = Math.sin(rot.pitch);
      const unit = Math.min(width, height) * (width < 620 ? 0.74 : 0.46) * rot.zoom;
      const cx = width / 2;
      const cy = height / 2;
      const world = [...layout.values()];
      const projected: Projected[] = world.map((point) => {
        const x1 = point.x * cosYaw - point.z * sinYaw;
        const z1 = point.x * sinYaw + point.z * cosYaw;
        const y1 = point.y * cosPitch - z1 * sinPitch;
        const z2 = point.y * sinPitch + z1 * cosPitch;
        const perspective = 3.1 / (3.4 + z2);
        return {
          ...point,
          sx: cx + x1 * unit * perspective * 0.78,
          sy: cy - y1 * unit * perspective * 0.78,
          scale: perspective,
          alpha: Math.max(0.18, Math.min(1, (1.6 - z2) / 2.6)),
        };
      });
      projected.sort((a, b) => b.z - a.z);
      projectionRef.current = projected;

      const branchId = hoverRef.current || selectedId;
      const activeBranch = branchId ? descendants(nodes, branchId) : new Set<string>();
      const projectedById = new Map(projected.map((item) => [item.node.id, item]));

      nodes.forEach((node) => {
        if (!node.parentId) return;
        const from = projectedById.get(node.parentId);
        const to = projectedById.get(node.id);
        if (!from || !to) return;
        const visibleFrom = filter === "all" || from.node.state === filter;
        const visibleTo = filter === "all" || to.node.state === filter;
        if (!visibleFrom && !visibleTo) return;
        const emphasized = activeBranch.has(node.id) && activeBranch.has(node.parentId);
        const alpha = Math.min(from.alpha, to.alpha) * (emphasized ? 0.65 : 0.16);
        context.beginPath();
        context.moveTo(from.sx, from.sy);
        context.lineTo(to.sx, to.sy);
        context.strokeStyle = emphasized ? `${accent}c4` : `rgba(155, 185, 214, ${alpha})`;
        context.lineWidth = emphasized ? 1.15 : 0.55;
        context.stroke();
      });

      const labels: { x: number; y: number; width: number; height: number }[] = [];
      projected.forEach((item) => {
        const isRoot = item.depth === 0;
        const matches = matchingIds.has(item.node.id);
        const visible = filter === "all" || item.node.state === filter;
        const hot = hoverRef.current === item.node.id || selectedId === item.node.id;
        const inBranch = activeBranch.has(item.node.id);
        const base =
          item.depth === 0 ? 6.4 : item.depth === 1 ? 5.3 : item.depth === 2 ? 3.5 : 2.35;
        const radius = Math.max(1.25, base * item.scale);
        let alpha = visible ? item.alpha : 0.04;
        if (query && !matches) alpha *= 0.12;
        if (hoverRef.current && !inBranch && !hot) alpha *= 0.42;
        if (!visible) alpha = 0.04;
        context.globalAlpha = alpha;

        if (hot || item.node.state === "noted") {
          context.beginPath();
          context.arc(item.sx, item.sy, radius * (hot ? 3.1 : 2.2), 0, Math.PI * 2);
          context.fillStyle = hot ? `${accent}38` : `${accent}1c`;
          context.fill();
        }
        context.beginPath();
        context.arc(item.sx, item.sy, radius, 0, Math.PI * 2);
        if (item.node.state === "empty") {
          context.fillStyle = "#0a141c";
          context.fill();
          context.strokeStyle = hot ? PALE : "rgba(190, 210, 230, 0.78)";
          context.lineWidth = hot ? 1.35 : 0.8;
          context.stroke();
        } else if (item.node.state === "marked") {
          context.fillStyle = `${accent}66`;
          context.fill();
          context.strokeStyle = accent;
          context.lineWidth = 0.9;
          context.stroke();
        } else {
          context.shadowColor = accent;
          context.shadowBlur = hot ? 16 : 9;
          context.fillStyle = accent;
          context.fill();
          context.shadowBlur = 0;
        }
        if (isCustom(item.node)) {
          context.beginPath();
          context.arc(item.sx, item.sy, radius + 2.4, 0, Math.PI * 2);
          context.strokeStyle = "rgba(255,255,255,.45)";
          context.lineWidth = 0.65;
          context.stroke();
        }
        if (selectedId === item.node.id) {
          context.beginPath();
          context.arc(item.sx, item.sy, radius + 7, 0, Math.PI * 2);
          context.strokeStyle = PALE;
          context.lineWidth = 0.9;
          context.stroke();
        }

        const showLabel =
          isRoot ||
          item.depth <= 1 ||
          hot ||
          item.node.state === "noted" ||
          (item.depth === 2 && item.alpha > 0.55 && hash(item.node.id) > 0.3) ||
          (item.depth >= 3 && rot.zoom > 1.2 && item.alpha > 0.68 && hash(item.node.id) > 0.55);
        if (showLabel) {
          const label = shortLabel(item.node.title);
          const fontSize = item.depth <= 1 ? 12.5 : item.depth === 2 ? 10.5 : 9.5;
          context.font = `${item.depth <= 1 ? 600 : 400} ${fontSize}px "Segoe UI", "PingFang SC", sans-serif`;
          context.fillStyle = hot
            ? PALE
            : item.node.state === "noted"
              ? "rgba(235, 243, 252, .95)"
              : "rgba(185, 204, 224, .82)";
          const rightSide = item.sx > width * 0.7;
          context.textAlign = rightSide ? "right" : "left";
          const labelX = item.sx + (rightSide ? -radius - 6 : radius + 6);
          const labelY = item.sy + fontSize / 3;
          const textWidth = context.measureText(label).width;
          const box = {
            x: labelX + (rightSide ? -textWidth : 0),
            y: labelY - fontSize,
            width: textWidth,
            height: fontSize + 3,
          };
          const clash = labels.some(
            (other) =>
              !(
                box.x > other.x + other.width ||
                box.x + box.width < other.x ||
                box.y > other.y + other.height ||
                box.y + box.height < other.y
              ),
          );
          if (!clash || hot || selectedId === item.node.id) {
            labels.push(box);
            context.fillText(label, labelX, labelY);
          }
        }
        context.globalAlpha = 1;
      });

      animation = requestAnimationFrame(draw);
    };
    animation = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
    };
  }, [accent, filter, layout, matchingIds, nodes, selectedId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      const next = Math.max(0.65, Math.min(2.6, rotationRef.current.zoom * (event.deltaY < 0 ? 1.1 : 0.91)));
      rotationRef.current.zoom = next;
      rotationRef.current.interactionUntil = performance.now() + 2800;
      setZoom(next);
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, []);

  const onPointerDown = (event: React.PointerEvent) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const rot = rotationRef.current;
    rot.interactionUntil = performance.now() + 2600;
    if (pointers.current.size > 1) {
      const points = [...pointers.current.values()];
      pinchDistance.current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      rot.dragging = false;
      return;
    }
    rot.dragging = true;
    rot.moved = 0;
    rot.lastX = event.clientX;
    rot.lastY = event.clientY;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const rot = rotationRef.current;
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (pointers.current.size > 1) {
      const points = [...pointers.current.values()];
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (pinchDistance.current > 0) {
        const next = Math.max(0.65, Math.min(2.6, rot.zoom * (distance / pinchDistance.current)));
        rot.zoom = next;
        setZoom(next);
      }
      pinchDistance.current = distance;
      return;
    }
    if (rot.dragging) {
      const dx = event.clientX - rot.lastX;
      const dy = event.clientY - rot.lastY;
      rot.yaw += dx * 0.0065;
      rot.pitch = Math.max(-1.15, Math.min(1.15, rot.pitch + dy * 0.005));
      rot.moved += Math.abs(dx) + Math.abs(dy);
      rot.lastX = event.clientX;
      rot.lastY = event.clientY;
      rot.interactionUntil = performance.now() + 3200;
      rot.target = null;
      return;
    }
    const id = hit(event);
    if (id !== hoverRef.current) {
      hoverRef.current = id;
      setHoverId(id);
      canvasRef.current?.style.setProperty("cursor", id ? "pointer" : "grab");
    }
  };

  const onPointerUp = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchDistance.current = 0;
    const rot = rotationRef.current;
    if (!rot.dragging) return;
    rot.dragging = false;
    if (rot.moved < 6) {
      const id = hit(event);
      if (id) choose(id);
    }
  };

  const resetView = () => {
    const rot = rotationRef.current;
    rot.yaw = -0.38;
    rot.pitch = 0.2;
    rot.zoom = 1;
    rot.target = null;
    rot.interactionUntil = performance.now() + 500;
    setZoom(1);
  };

  const focusNode = (node: KNode) => {
    choose(node.id);
    aimAt(node);
  };

  const stateText = selected ? statusLabel(selected) : "选择一个节点查看足迹";

  return (
    <section
      className="kg-map"
      aria-label={`${space.name} 3D 足迹地图`}
      style={{ "--kg-accent": accent, "--kg-cyan": accent } as CSSProperties}
    >
      <div className="kg-map-toolbar">
        <div className="kg-toolbar-title">
          <span className="kg-app-dot" />
          <div>
            <strong>{space.name}{space.id === "ky" ? " / 408" : ""}</strong>
            <span>3D 学习足迹 · 只记录接触与笔记</span>
          </div>
        </div>
        <div className="kg-toolbar-tools">
          <button
            className="kg-toolbar-panel-button"
            type="button"
            aria-expanded={leftOpen}
            onClick={() => {
              setLeftOpen(!leftOpen);
              if (window.innerWidth <= 900) setRightOpen(false);
            }}
          >
            目录
          </button>
          <button
            className="kg-toolbar-panel-button"
            type="button"
            aria-expanded={rightOpen}
            onClick={() => {
              setRightOpen(!rightOpen);
              if (window.innerWidth <= 900) setLeftOpen(false);
            }}
          >
            详情
          </button>
          <label className="kg-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索节点"
              aria-label="搜索节点"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="清除搜索">
                ×
              </button>
            ) : null}
          </label>
          <div className="kg-filter" role="group" aria-label="节点筛选">
            {(["all", "noted", "marked", "empty"] as Filter[]).map((value) => (
              <button
                key={value}
                type="button"
                className={filter === value ? "is-on" : ""}
                onClick={() => setFilter(value)}
              >
                {value === "all" ? "全部" : value === "noted" ? "有笔记" : value === "marked" ? "标记" : "未学"}
              </button>
            ))}
          </div>
          <button
            className={`kg-toolbar-panel-button kg-rotate-button${autoRotate ? " is-on" : ""}`}
            type="button"
            aria-pressed={autoRotate}
            onClick={() => setAutoRotate((value) => !value)}
          >
            {rotateLabel}
          </button>
          <button className="kg-icon-button" type="button" onClick={resetView} title="重置视角" aria-label="重置视角">
            ⌗
          </button>
        </div>
      </div>

      <div className="kg-workspace" data-left={leftOpen} data-right={rightOpen}>
        <aside hidden={!leftOpen} className={`kg-sidebar ${leftOpen ? "is-open" : ""}`}>
          <div className="kg-sidebar-head">
            <div>
              <span className="kg-kicker">当前大类</span>
              <h2>{space.name}</h2>
            </div>
            <button type="button" onClick={() => setLeftOpen(false)} aria-label="收起目录">
              ‹
            </button>
          </div>
          <div className="kg-tree-meta">
            <span>学习足迹</span>
            <span>{stats.total} 个节点</span>
          </div>
          <div className="kg-tree">
            {(() => {
              const renderTree = (node: KNode, depth = 0): React.ReactNode => {
                const children = nodes.filter((child) => child.parentId === node.id);
                const open = expanded.has(node.id);
                return (
                  <div key={node.id}>
                    <div className="kg-tree-line" style={{ paddingLeft: depth * 12 }}>
                      {children.length ? (
                        <button
                          className="kg-tree-expander"
                          type="button"
                          aria-label={`${open ? "折叠" : "展开"}${node.title}`}
                          aria-expanded={open}
                          onClick={() =>
                            setExpanded((old) => {
                              const next = new Set(old);
                              if (open) next.delete(node.id);
                              else next.add(node.id);
                              return next;
                            })
                          }
                        >
                          {open ? "⌄" : "›"}
                        </button>
                      ) : (
                        <span className="kg-tree-expander" />
                      )}
                      <button
                        type="button"
                        className={`kg-tree-root ${selectedId === node.id ? "is-selected" : ""}`}
                        onClick={() => focusNode(node)}
                      >
                        <span className="kg-tree-status" data-state={node.state} />
                        <span>{shortLabel(node.title)}</span>
                        {isCustom(node) ? <i className="kg-custom-mark">自</i> : null}
                        {children.length ? <em>{children.length}</em> : null}
                      </button>
                    </div>
                    {open ? children.map((child) => renderTree(child, depth + 1)) : null}
                  </div>
                );
              };
              return roots.map((root) => renderTree(root));
            })()}
          </div>
          <div className="kg-sidebar-foot">
            <span className="kg-signal" />
            数据来自学习记录与笔记，不代表掌握度
          </div>
        </aside>

        <div className="kg-canvas-column" ref={frameRef}>
          <div className="kg-canvas-head">
            <div className="kg-breadcrumb">
              <span>{space.name}</span>
              <i>/</i>
              <span>{space.id === "ky" ? "408" : "足迹"}</span>
              <i>/</i>
              <strong>{selected?.title ?? "全景"}</strong>
            </div>
            <div className="kg-canvas-actions">
              {query ? (
                <span role="status">
                  {matchingIds.size ? `${matchingIds.size} 个匹配` : "没有匹配的节点"}
                </span>
              ) : null}
              <span className="kg-live-dot" />
              <span>3D</span>
              <span className="kg-divider" />
              拖动旋转 · 滚轮缩放
            </div>
          </div>
          <div className="kg-canvas-frame">
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={() => {
                hoverRef.current = null;
                setHoverId(null);
              }}
              aria-label="可旋转的三维学习足迹图谱"
            />
            <div className="kg-graph-caption">
              <span>{stats.total} 个节点</span>
              <span>{Math.round(zoom * 100)}%</span>
            </div>
            <div className="kg-map-zoom">
              <button
                type="button"
                onClick={() => {
                  const next = Math.min(2.6, rotationRef.current.zoom * 1.18);
                  rotationRef.current.zoom = next;
                  setZoom(next);
                }}
              >
                +
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => {
                  const next = Math.max(0.65, rotationRef.current.zoom / 1.18);
                  rotationRef.current.zoom = next;
                  setZoom(next);
                }}
              >
                −
              </button>
            </div>
            {hoverId ? (
              <div className="kg-hover-card">
                <strong>{nodes.find((node) => node.id === hoverId)?.title}</strong>
                <span>
                  {nodes.find((node) => node.id === hoverId)
                    ? statusLabel(nodes.find((node) => node.id === hoverId) as KNode)
                    : ""}
                </span>
              </div>
            ) : null}
          </div>
          <div className="kg-statusbar">
            <span>
              <i className="kg-status-dot empty" />
              未学 {stats.total - stats.marked}
            </span>
            <span>
              <i className="kg-status-dot marked" />
              标记 {nodes.filter((node) => node.state === "marked").length}
            </span>
            <span>
              <i className="kg-status-dot noted" />
              有笔记 {stats.noted}
            </span>
            <span className="kg-status-note">点亮只表示接触过；证据在笔记和复盘里</span>
          </div>
        </div>

        <aside hidden={!rightOpen} className={`kg-inspector ${rightOpen ? "is-open" : ""}`}>
          <div className="kg-inspector-head">
            <div>
              <span className="kg-kicker">选中的节点</span>
              <h2>节点详情</h2>
            </div>
            <button type="button" onClick={() => setRightOpen(false)} aria-label="收起详情">
              ›
            </button>
          </div>
          {selected ? (
            <>
              <div className="kg-selected-node">
                <span className="kg-node-orb" data-state={selected.state} />
                <div>
                  <span className="kg-kicker">
                    {isCustom(selected) ? "自建节点" : selected.parentId ? "当前节点" : "科目"}
                  </span>
                  <h3>{selected.title}</h3>
                </div>
              </div>
              <div className="kg-fact-box">
                <span className="kg-fact-label">足迹状态</span>
                <strong>{stateText}</strong>
                <p>{selected.lastAt ? `最近记录 ${selected.lastAt}` : "还没有学习记录"}</p>
              </div>
              <div className="kg-inspector-section">
                <div className="kg-section-title">
                  本节点及下级资料 <span>{selectedDocs.length}</span>
                </div>
                {selectedDocs.length ? (
                  selectedDocs.slice(0, 5).map((doc) => (
                    <button
                      key={doc.id}
                      className="kg-doc-row"
                      type="button"
                      onClick={() => setPreviewDoc(doc)}
                    >
                      <span className="kg-doc-icon">{doc.kind === "md" ? "≡" : "▧"}</span>
                      <span>
                        <strong>{doc.title}</strong>
                        <small>{typeLabel(doc.kind)} · {doc.updatedAt}</small>
                      </span>
                      <b>›</b>
                    </button>
                  ))
                ) : (
                  <p className="kg-empty-copy">这里还没有挂笔记或资料。</p>
                )}
              </div>
              <div className="kg-inspector-section">
                <div className="kg-section-title">操作</div>
                <div className="kg-action-stack">
                  {selected.state === "empty" ? (
                    <button type="button" className="kg-primary-action" onClick={() => setMarkOpen(true)}>
                      <span>＋</span>标记已学
                    </button>
                  ) : null}
                  <button type="button" className="kg-secondary-action" onClick={() => onWriteNote(selected)}>
                    <span aria-hidden="true">＋</span>
                    {selected.state === "marked" ? "补一篇笔记" : "写笔记"}
                  </button>
                  <button type="button" className="kg-secondary-action" onClick={() => onOpenLibrary(selected)}>
                    <span>▤</span>在知识库查看
                  </button>
                  <button
                    type="button"
                    className="kg-secondary-action"
                    onClick={() => {
                      setCustomTitle("");
                      setCustomOpen(true);
                    }}
                  >
                    <span>＋</span>添加子节点
                  </button>
                  {selectedIsCustom ? (
                    <>
                      <button
                        type="button"
                        className="kg-secondary-action"
                        onClick={() => {
                          setEditTitle(selected.title);
                          setEditOpen(true);
                        }}
                      >
                        <span>✎</span>编辑标题
                      </button>
                      <button
                        type="button"
                        className="kg-secondary-action kg-danger-action"
                        onClick={() => setDeleteOpen(true)}
                      >
                        <span>−</span>删除节点
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="kg-inspector-section kg-meaning">
                <div className="kg-section-title">节点状态</div>
                <p>
                  空心 = 尚未学过
                  <br />
                  半亮 = 标记已学，但没有笔记
                  <br />
                  发光 = 学过且留下笔记
                  <br />
                  分类只表示接触过，不代表掌握。
                </p>
              </div>
            </>
          ) : (
            <div className="kg-empty-inspector">选择一个节点，查看它留下的事实。</div>
          )}
        </aside>
      </div>

      {previewDoc ? (
        <Modal
          title={previewDoc.title}
          subtitle={`${typeLabel(previewDoc.kind)} · ${previewDoc.updatedAt}${
            selected ? ` · ${selected.title}` : ""
          }`}
          onClose={() => setPreviewDoc(null)}
          wide
          footer={
            <>
              <button className="p-button" type="button" onClick={() => setPreviewDoc(null)}>
                关闭
              </button>
              {previewDoc.nodeId ? (
                <button
                  className="p-button primary"
                  type="button"
                  onClick={() => {
                    const linked = nodes.find((node) => node.id === previewDoc.nodeId);
                    setPreviewDoc(null);
                    if (linked) onOpenLibrary(linked);
                  }}
                >
                  在知识库查看
                </button>
              ) : null}
            </>
          }
        >
          <div className="kg-note-preview">
            <p className="kg-note-summary">{previewDoc.summary}</p>
            {previewDoc.kind === "md" || previewDoc.kind === "review" ? (
              <div className="p-preview-body">
                <Markdownish text={previewDoc.body ?? previewDoc.summary} />
              </div>
            ) : (
              <div className="kg-note-file">
                <strong>{typeLabel(previewDoc.kind)}</strong>
                <span>
                  {previewDoc.pages ? `${previewDoc.pages} 页 · ` : ""}
                  {previewDoc.size ?? ""}
                </span>
                <p>文件预览在知识库里打开；这里先显示摘要和挂载位置。</p>
              </div>
            )}
          </div>
        </Modal>
      ) : null}

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

      {editOpen && selected ? (
        <Modal
          title="编辑节点标题"
          subtitle="只改标题，节点下的笔记和状态不会丢。"
          onClose={() => setEditOpen(false)}
          footer={
            <>
              <button className="p-button" type="button" onClick={() => setEditOpen(false)}>
                取消
              </button>
              <button
                className="p-button primary"
                type="button"
                disabled={!editTitle.trim()}
                onClick={() => {
                  onUpdateNode(selected, editTitle);
                  setEditOpen(false);
                }}
              >
                保存
              </button>
            </>
          }
        >
          <label className="p-field">
            节点标题
            <input
              className="p-input"
              autoFocus
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
            />
          </label>
        </Modal>
      ) : null}

      {deleteOpen && selected ? (
        <Modal
          title={`删除「${selected.title}」？`}
          subtitle="只删除你自建的节点；它下面的自建节点会一起删除，笔记会移到上一级。"
          onClose={() => setDeleteOpen(false)}
          footer={
            <>
              <button className="p-button" type="button" onClick={() => setDeleteOpen(false)}>
                取消
              </button>
              <button
                className="p-button primary"
                type="button"
                onClick={() => {
                  const parentId = selected.parentId;
                  onDeleteNode(selected);
                  setDeleteOpen(false);
                  setSelectedId(parentId);
                }}
              >
                删除
              </button>
            </>
          }
        >
          <p className="p-sub">
            当前节点下有 {childCount} 个直接子节点；相关笔记会保留并移动到上一级。
          </p>
        </Modal>
      ) : null}

      {markOpen && selected ? (
        <Modal
          title={`标记「${selected.title}」为已学`}
          subtitle="记录你接触过它，不表示已经掌握。"
          onClose={() => setMarkOpen(false)}
          footer={
            <>
              <button className="p-button" type="button" onClick={() => setMarkOpen(false)}>
                取消
              </button>
              <button
                className="p-button primary"
                type="button"
                onClick={() => {
                  onMark(selected, markSource);
                  setMarkOpen(false);
                }}
              >
                标记
              </button>
            </>
          }
        >
          <p className="p-sub" style={{ marginBottom: 14 }}>
            没有笔记也算足迹，但周复盘会把它标出来。来源可选。
          </p>
          <div className="p-swatches">
            {["自学", "网课", "电子书", "其他"].map((source) => (
              <button
                key={source}
                type="button"
                className={`p-chip${markSource === source ? " is-on" : ""}`}
                onClick={() => setMarkSource(source)}
              >
                {source}
              </button>
            ))}
          </div>
        </Modal>
      ) : null}
    </section>
  );
}