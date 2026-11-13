"use client";

import { useMemo, useState } from "react";
import type { AppData, Space } from "./types";
import { Modal } from "./ui";

type Props = {
  data: AppData;
  onAddSpace: (s: Space) => void;
  onEditSpace: (s: Space) => void;
  onDeleteSpace: (id: string) => void;
  onReset: () => void;
  onToast: (text: string) => void;
};

const COLORS = ["#2f5fa8", "#b96b12", "#6b52b8", "#3f6f9b", "#a94a4a", "#6f7550"];

export default function Settings({ data, onAddSpace, onEditSpace, onDeleteSpace, onReset, onToast }: Props) {
  const [editing, setEditing] = useState<Space | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Space | null>(null);

  const draftInit = { name: "", color: COLORS[0], description: "", deadline: "" };
  const [draft, setDraft] = useState(draftInit);

  const counts = useMemo(() => {
    const map = new Map<string, { nodes: number; docs: number }>();
    for (const s of data.spaces) map.set(s.id, { nodes: 0, docs: 0 });
    for (const n of data.nodes) {
      const c = map.get(n.spaceId);
      if (c) c.nodes++;
    }
    for (const d of data.docs) {
      const c = map.get(d.spaceId);
      if (c) c.docs++;
    }
    return map;
  }, [data.nodes, data.docs, data.spaces]);

  const openAdd = () => {
    setDraft(draftInit);
    setAdding(true);
    setEditing(null);
  };
  const openEdit = (s: Space) => {
    setDraft({ name: s.name, color: s.color, description: s.description, deadline: s.deadline ?? "" });
    setEditing(s);
    setAdding(false);
  };

  const submit = () => {
    if (!draft.name.trim()) return;
    if (editing) {
      onEditSpace({
        ...editing,
        name: draft.name.trim(),
        color: draft.color,
        description: draft.description.trim(),
        deadline: draft.deadline || undefined,
      });
      onToast("大类已更新");
    } else {
      onAddSpace({
        id: `sp-${Date.now()}`,
        name: draft.name.trim(),
        color: draft.color,
        description: draft.description.trim(),
        deadline: draft.deadline || undefined,
      });
      onToast("新大类已建立");
    }
    setAdding(false);
    setEditing(null);
  };

  const modalOpen = adding || Boolean(editing);

  return (
    <div>
      <header className="p-page-head">
        <div>
          <p className="p-page-meta">2026-11-10 周二 · 大类与数据</p>
          <h1 className="p-h1">设置</h1>
          <p className="p-sub">
            大类是顶层容器，可以增删改；每个大类有自己的一棵树和书架。今日默认跨大类聚合。
          </p>
        </div>
        <button className="p-button primary" type="button" onClick={openAdd}>
          ＋ 新建大类
        </button>
      </header>

      <div className="p-settings-grid">
        <section className="p-card">
          <div className="p-card-head">
            <h2>大类</h2>
            <em>{data.spaces.length} 个 · 增删改查</em>
          </div>
          <div>
            {data.spaces.map((s) => {
              const c = counts.get(s.id);
              return (
                <div className="p-space-row" key={s.id}>
                  <span className="p-space-swatch" style={{ background: s.color }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="p-space-name">{s.name}</div>
                    <div className="p-space-desc">
                      {s.description}
                      {s.deadline ? ` · 截止 ${s.deadline}` : ""}
                    </div>
                  </div>
                  <span className="p-space-count" style={{ marginLeft: "auto" }}>
                    {c?.nodes ?? 0} 节点 · {c?.docs ?? 0} 资料
                  </span>
                  <div className="p-space-ops">
                    <button className="p-button ghost sm" type="button" onClick={() => openEdit(s)}>
                      编辑
                    </button>
                    <button className="p-button ghost sm" type="button" onClick={() => setDeleting(s)}>
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="p-tiny p-faint" style={{ marginTop: 12, lineHeight: 1.7 }}>
            删除大类会连同它的节点和资料一起移除；真实后端会先让你迁移或归档。
          </p>

          <div className="p-divider" />
          <div className="p-card-head">
            <h2>番茄Todo 映射</h2>
            <em>第一次导入后记住，之后只改例外</em>
          </div>
          <div>
            {Object.entries(data.prefs.taskRoutes ?? {}).slice(0, 8).map(([from, route]) => {
              const node = route.nodeId ? data.nodes.find((n) => n.id === route.nodeId) : null;
              const space = route.spaceId ? data.spaces.find((s) => s.id === route.spaceId) : null;
              const target =
                route.cat === "plan"
                  ? "计划"
                  : route.cat === "leisure"
                    ? "娱乐"
                    : route.cat === "other"
                      ? "其他"
                      : `${space?.name ?? "学习"}${node ? ` / ${node.title}` : ""}`;
              return (
                <div className="p-space-row" key={from} style={{ padding: "7px 0" }}>
                  <span className="p-tag">{from}</span>
                  <span className="p-faint" style={{ fontSize: 11 }}>
                    →
                  </span>
                  <span style={{ fontSize: 12 }}>{target}</span>
                  <span className="p-space-count" style={{ marginLeft: "auto" }}>
                    已记住
                  </span>
                </div>
              );
            })}
          </div>
          <p className="p-tiny p-faint" style={{ marginTop: 8 }}>
            「学习计划」不算学习，「玩cs」不算努力；周复盘会把它们分开。
          </p>
        </section>

        <div className="p-settings-side">
          <section className="p-card">
            <div className="p-card-head">
              <h2>情况档案</h2>
              <em>助手读这个</em>
            </div>
            <div className="p-profile">
              <div className="p-profile-row">
                <span>目标</span>
                <b>{data.profile.goal}</b>
              </div>
              <div className="p-profile-row">
                <span>考试</span>
                <b>{data.profile.examDate}</b>
              </div>
              <div className="p-profile-row">
                <span>最虚</span>
                <b>{data.profile.weak}</b>
              </div>
              <div className="p-profile-row">
                <span>最忙</span>
                <b>{data.profile.busy}</b>
              </div>
              <div className="p-profile-row">
                <span>可学习日</span>
                <b>{data.profile.availableDays}</b>
              </div>
            </div>
            <button
              className="p-button sm"
              style={{ marginTop: 12 }}
              type="button"
              onClick={() => onToast("原型：真实环境里通过对话更新，AI 提议、你确认")}
            >
              通过对话更新
            </button>
          </section>

          <section className="p-card">
            <div className="p-card-head">
              <h2>复盘节奏</h2>
              <em>周日 20:00</em>
            </div>
            <div className="p-profile">
              <div className="p-profile-row">
                <span>周复盘</span>
                <b>
                  每周{data.prefs.reviewDay === "sunday" ? "日" : data.prefs.reviewDay} {data.prefs.reviewTime}
                </b>
              </div>
              <div className="p-profile-row">
                <span>周起始</span>
                <b>{data.prefs.weekStart === "monday" ? "周一" : "周日"}</b>
              </div>
              <div className="p-profile-row">
                <span>「学习计划」</span>
                <b>归为计划</b>
              </div>
              <div className="p-profile-row">
                <span>「玩cs」</span>
                <b>归为娱乐</b>
              </div>
            </div>
            <p className="p-tiny p-faint" style={{ marginTop: 10, lineHeight: 1.7 }}>
              周复盘到点自动生成一版；你也可以随时手动重算。
            </p>
          </section>

          <section className="p-card">
            <div className="p-card-head">
              <h2>数据</h2>
              <em>原型数据存在本机</em>
            </div>
            <p className="p-tiny p-faint" style={{ lineHeight: 1.7 }}>
              当前是前端原型，改动保存在 localStorage；重置会回到初始演示数据。
            </p>
            <button
              className="p-button sm"
              style={{ marginTop: 10 }}
              type="button"
              onClick={() => {
                onReset();
                onToast("已重置演示数据");
              }}
            >
              重置演示数据
            </button>
          </section>
        </div>
      </div>

      {modalOpen ? (
        <Modal
          title={editing ? `编辑「${editing.name}」` : "新建大类"}
          subtitle="名称、说明、截止日期和颜色；颜色会贯穿该大类的页面与图表。"
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          footer={
            <>
              <button
                className="p-button"
                type="button"
                onClick={() => {
                  setAdding(false);
                  setEditing(null);
                }}
              >
                取消
              </button>
              <button className="p-button primary" type="button" onClick={submit}>
                {editing ? "保存" : "建立"}
              </button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label className="p-field">
              名称
              <input
                className="p-input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="例如：秋招 / 英语六级"
              />
            </label>
            <label className="p-field">
              一句话说明
              <input
                className="p-input"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="这个大类装什么"
              />
            </label>
            <label className="p-field">
              截止（可选）
              <input
                className="p-input"
                type="date"
                value={draft.deadline}
                onChange={(e) => setDraft({ ...draft, deadline: e.target.value })}
              />
            </label>
            <div className="p-field">
              颜色
              <div className="p-swatches">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`p-swatch${draft.color === c ? " is-on" : ""}`}
                    style={{ background: c }}
                    onClick={() => setDraft({ ...draft, color: c })}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
          </div>
        </Modal>
      ) : null}

      {deleting ? (
        <Modal
          title={`删除「${deleting.name}」？`}
          subtitle="删除后不可撤销；先确认节点和资料是否需要迁移。"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button className="p-button" type="button" onClick={() => setDeleting(null)}>
                取消
              </button>
              <button
                className="p-button primary"
                type="button"
                onClick={() => {
                  onDeleteSpace(deleting.id);
                  setDeleting(null);
                  onToast(`已删除大类「${deleting.name}」`);
                }}
              >
                删除
              </button>
            </>
          }
        >
          <p className="p-sub">
            会删除该大类下 {counts.get(deleting.id)?.nodes ?? 0} 个节点和{" "}
            {counts.get(deleting.id)?.docs ?? 0} 份资料。真实后端会先提供迁移/归档。
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
