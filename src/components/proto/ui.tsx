"use client";

import { useEffect, type ReactNode } from "react";
import type { PlanStatus, SessionCat } from "./types";

export const CAT_LABEL: Record<SessionCat, string> = {
  study: "学习",
  plan: "计划",
  leisure: "娱乐",
  other: "其他",
};

export const CAT_COLOR: Record<SessionCat, string> = {
  study: "#2f5fa8",
  plan: "#a97b2f",
  leisure: "#c56f5c",
  other: "#7d8798",
};

export const STATUS_LABEL: Record<PlanStatus, string> = {
  todo: "待做",
  doing: "进行中",
  done: "已完成",
  partial: "部分完成",
  shelved: "搁置",
};

export const STATUS_COLOR: Record<PlanStatus, string> = {
  todo: "#788394",
  doing: "#3f6fb0",
  done: "#2f5f98",
  partial: "#c2873d",
  shelved: "#9ca4b0",
};

export function fmtMin(n: number): string {
  if (!n) return "0 分";
  if (n < 60) return `${n} 分`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

export function fmtDate(iso: string): string {
  return iso.replaceAll("-", ".");
}

export function fmtDateFull(iso: string): string {
  if (!iso) return "未填写";
  return iso;
}

export function fmtDateTime(date: string, start?: string): string {
  const clock = start && start.length >= 4 ? start : "时间未记录";
  return `${fmtDateFull(date)} ${clock}`;
}

export function fmtSavedAt(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function weekdayCN(iso: string): string {
  const d = new Date(iso + "T00:00:00Z").getUTCDay();
  return ["日", "一", "二", "三", "四", "五", "六"][d];
}

export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000,
  );
}

export function byDate<T extends { date: string }>(rows: T[], date: string): T[] {
  return rows.filter((x) => x.date === date);
}

export function sum(rows: { minutes: number }[]): number {
  return rows.reduce((s, r) => s + r.minutes, 0);
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="p-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`p-modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true">
        <div className="p-modal-head">
          <div>
            {subtitle ? <p className="p-modal-sub">{subtitle}</p> : null}
            <h2>{title}</h2>
          </div>
          <button className="p-close" type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        {children}
        {footer ? <div className="p-modal-actions">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Donut({
  segments,
  size = 132,
  thickness = 13,
  center,
  sub,
}: {
  segments: { value: number; color: string; label?: string }[];
  size?: number;
  thickness?: number;
  center?: string;
  sub?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(16,21,19,0.07)"
        strokeWidth={thickness}
      />
      {total > 0 &&
        segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      <text
        x={size / 2}
        y={size / 2 - 2}
        textAnchor="middle"
        fontSize={(center ?? fmtMin(total)).length > 5 ? 13 : 21}
        fontWeight="600"
        fill="var(--p-ink)"
        fontFamily="var(--p-sans)"
      >
        {center ?? fmtMin(total)}
      </text>
      <text
        x={size / 2}
        y={size / 2 + 17}
        textAnchor="middle"
        fontSize="10"
        fill="var(--p-faint)"
      >
        {sub ?? "合计"}
      </text>
    </svg>
  );
}

export function StackBar({
  segments,
  height = 9,
}: {
  segments: { value: number; color: string }[];
  height?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="p-stack-row" style={{ height }}>
      {segments.map((s, i) => (
        <i key={i} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
      ))}
    </div>
  );
}

export function DayBars({
  days,
  series,
  max,
  height = 120,
}: {
  days: string[];
  series: { key: string; color: string }[];
  max: number;
  height?: number;
}) {
  return (
    <div className="p-bar-chart" style={{ height }}>
      {days.map((d) => (
        <div className="p-bar-col" key={d} title={d}>
          <div className="p-bar-stack" style={{ flexDirection: "column-reverse" }}>
            {series.map((s) => (
              <i
                key={s.key}
                style={{
                  height: `${Math.max(1, (Number(s.key.split(":")[0]) / Math.max(1, max)) * 100)}%`,
                  background: s.color,
                }}
              />
            ))}
          </div>
          <span className="p-bar-label">{fmtDate(d)}</span>
        </div>
      ))}
    </div>
  );
}

export function Markdownish({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    out.push(
      <ul key={`l${out.length}`}>
        {list.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const line of lines) {
    if (line.startsWith("- ")) {
      list.push(line.slice(2));
      continue;
    }
    flush();
    if (line.startsWith("# ")) out.push(<h1 key={out.length}>{line.slice(2)}</h1>);
    else if (line.startsWith("## ")) out.push(<h2 key={out.length}>{line.slice(3)}</h2>);
    else if (!line.trim()) out.push(<div key={out.length} style={{ height: 6 }} />);
    else out.push(<p key={out.length}>{line}</p>);
  }
  flush();
  return <div>{out}</div>;
}
