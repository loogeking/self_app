"use client";

import { useMemo, useState } from "react";
import type { AiConfig, AiProvider, AppData, Space } from "./types";
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

type PropsWithAi = Props & {
  onUpdateAi: (ai: AiConfig) => void;
  onEditSituation: (space: Space) => void;
  onLoadDemo: () => void;
};

const AI_PRESETS: Record<AiProvider, Pick<AiConfig, "baseUrl" | "model">> = {
  deepseek: { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
  custom: { baseUrl: "", model: "" },
};

export default function Settings({
  data,
  onAddSpace,
  onEditSpace,
  onDeleteSpace,
  onUpdateAi,
  onEditSituation,
  onLoadDemo,
  onReset,
  onToast,
}: PropsWithAi) {
  const [editing, setEditing] = useState<Space | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Space | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const draftInit = { name: "", color: COLORS[0], description: "", deadline: "" };
  const [draft, setDraft] = useState(draftInit);
  const [aiDraft, setAiDraft] = useState<AiConfig>(
    data.ai ?? {
      provider: "deepseek",
      baseUrl: AI_PRESETS.deepseek.baseUrl,
      model: AI_PRESETS.deepseek.model,
      apiKey: "",
      temperature: 0.6,
    },
  );
  const [showKey, setShowKey] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [aiTest, setAiTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState("");
  const [manualModel, setManualModel] = useState(false);

  const saveAi = () => {
    if (!aiDraft.baseUrl.trim() || !aiDraft.model.trim()) {
      onToast("先填 Base URL 和模型名。");
      return;
    }
    onUpdateAi({
      ...aiDraft,
      baseUrl: aiDraft.baseUrl.trim().replace(/\/+$/, ""),
      model: aiDraft.model.trim(),
      apiKey: aiDraft.apiKey.trim(),
    });
    onToast("AI 接口配置已保存到本机。");
  };

  const testAi = async () => {
    if (!aiDraft.baseUrl.trim() || !aiDraft.model.trim() || !aiDraft.apiKey.trim()) {
      setAiTest({ ok: false, text: "先填 Base URL、模型和 API Key。" });
      return;
    }
    setTestingAi(true);
    setAiTest(null);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          config: aiDraft,
          messages: [{ role: "user", content: "只回复：连接成功" }],
        }),
      });
      const json = (await response.json()) as { text?: string; error?: string };
      if (!response.ok) throw new Error(json.error ?? `HTTP ${response.status}`);
      setAiTest({ ok: true, text: `连接成功：${json.text ?? "接口可用"}` });
    } catch (error) {
      setAiTest({ ok: false, text: error instanceof Error ? error.message : "测试失败" });
    } finally {
      setTestingAi(false);
    }
  };

  const loadModels = async () => {
    if (!aiDraft.baseUrl.trim() || !aiDraft.apiKey.trim()) {
      setModelError("先填 Base URL 和 API Key，再拉取模型列表。");
      return;
    }
    setLoadingModels(true);
    setModelError("");
    try {
      const response = await fetch("/api/ai/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: aiDraft }),
      });
      const json = (await response.json()) as { models?: string[]; error?: string };
      if (!response.ok) throw new Error(json.error ?? `HTTP ${response.status}`);
      const list = (json.models ?? []).filter(Boolean);
      setModels(list);
      if (list.length) setManualModel(false);
      if (!list.length) {
        setModelError("接口没有返回模型 id；可以手动填写模型名。");
      } else if (!list.includes(aiDraft.model)) {
        setAiDraft((current) => ({ ...current, model: list[0] }));
        onToast(`已解析 ${list.length} 个模型，当前模型不在列表里，已切到 ${list[0]}。`);
      } else {
        onToast(`已解析 ${list.length} 个模型。`);
      }
    } catch (error) {
      setModelError(error instanceof Error ? error.message : "拉取模型失败");
    } finally {
      setLoadingModels(false);
    }
  };

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
              <h2>AI 接口</h2>
              <em>{data.ai?.apiKey ? "已配置" : "未配置"}</em>
              <span className={`p-ai-status${data.ai?.apiKey ? " is-on" : ""}`}>
                {data.ai?.apiKey
                  ? `${data.ai.provider === "custom" ? "自定义" : data.ai.provider} · ${data.ai.model}`
                  : "助手当前为脚本模式"}
              </span>
            </div>
            <div className="p-ai-grid">
              <label className="p-field">
                服务商
                <select
                  className="p-select"
                  value={aiDraft.provider}
                  onChange={(event) => {
                    const provider = event.target.value as AiProvider;
                    const preset = AI_PRESETS[provider];
                    setAiDraft((current) => ({
                      ...current,
                      provider,
                      baseUrl: preset.baseUrl || current.baseUrl,
                      model: preset.model || current.model,
                    }));
                  }}
                >
                  <option value="deepseek">DeepSeek</option>
                  <option value="openai">OpenAI</option>
                  <option value="custom">自定义 OpenAI 兼容接口</option>
                </select>
              </label>
              <label className="p-field">
                模型
                {models.length && !manualModel ? (
                  <select
                    className="p-select"
                    value={aiDraft.model}
                    onChange={(event) => {
                      if (event.target.value === "__manual") {
                        setManualModel(true);
                        return;
                      }
                      setAiDraft({ ...aiDraft, model: event.target.value });
                    }}
                  >
                    {!models.includes(aiDraft.model) && aiDraft.model ? (
                      <option value={aiDraft.model}>{aiDraft.model}（当前）</option>
                    ) : null}
                    {models.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                    <option value="__manual">手动输入其他模型名…</option>
                  </select>
                ) : (
                  <>
                    <input
                      className="p-input"
                      value={aiDraft.model}
                      onChange={(event) => setAiDraft({ ...aiDraft, model: event.target.value })}
                      placeholder="deepseek-chat"
                    />
                    {models.length ? (
                      <button
                        className="p-field-link"
                        type="button"
                        onClick={() => setManualModel(false)}
                      >
                        从解析列表选择
                      </button>
                    ) : null}
                  </>
                )}
              </label>
              <label className="p-field p-ai-wide">
                Base URL
                <input
                  className="p-input"
                  value={aiDraft.baseUrl}
                  onChange={(event) => setAiDraft({ ...aiDraft, baseUrl: event.target.value })}
                  placeholder="https://api.deepseek.com/v1"
                />
              </label>
              <label className="p-field p-ai-wide">
                API Key
                <span className="p-secret-input">
                  <input
                    className="p-input"
                    type={showKey ? "text" : "password"}
                    value={aiDraft.apiKey}
                    onChange={(event) => setAiDraft({ ...aiDraft, apiKey: event.target.value })}
                    placeholder="sk-…"
                    autoComplete="off"
                  />
                  <button type="button" onClick={() => setShowKey((value) => !value)}>
                    {showKey ? "隐藏" : "显示"}
                  </button>
                </span>
              </label>
              <label className="p-field">
                温度
                <input
                  className="p-input"
                  inputMode="decimal"
                  value={aiDraft.temperature}
                  onChange={(event) =>
                    setAiDraft({ ...aiDraft, temperature: Number(event.target.value) || 0 })
                  }
                  placeholder="0.6"
                />
              </label>
            </div>
            <div className="p-ai-actions">
              <button className="p-button primary sm" type="button" onClick={saveAi}>
                保存配置
              </button>
              <button
                className="p-button sm"
                type="button"
                onClick={() => void loadModels()}
                disabled={loadingModels}
              >
                {loadingModels ? "解析中…" : "解析模型"}
              </button>
              <button className="p-button sm" type="button" onClick={() => void testAi()} disabled={testingAi}>
                {testingAi ? "测试中…" : "测试连接"}
              </button>
              <button
                className="p-button ghost sm"
                type="button"
                onClick={() => {
                  const cleared = { ...aiDraft, apiKey: "" };
                  setAiDraft(cleared);
                  onUpdateAi(cleared);
                  setAiTest(null);
                  onToast("已清除本机保存的 API Key。");
                }}
              >
                清除 Key
              </button>
            </div>
            {modelError ? <p className="p-ai-test is-error">{modelError}</p> : null}
            {models.length ? (
              <p className="p-note">
                已从接口解析 {models.length} 个模型；模型输入框可以直接选。
              </p>
            ) : null}
            {aiTest ? (
              <p className={`p-ai-test${aiTest.ok ? " is-ok" : " is-error"}`}>{aiTest.text}</p>
            ) : null}
            <p className="p-note">
              Key 只保存在当前浏览器的 localStorage；请求经本站的 `/api/ai/chat` 转发，不写入仓库或服务器日志。
              不要把包含 Key 的截图发给任何人。
            </p>
          </section>

          <section className="p-card">
            <div className="p-card-head">
              <h2>情况档案</h2>
              <em>每个目标一份</em>
            </div>
            {data.spaces.length ? (
              <div className="p-situation-list">
                {data.spaces.map((space) => (
                  <div className="p-situation-row" key={space.id}>
                    <span className="p-dot" style={{ background: space.color }} />
                    <div>
                      <b>{space.name}</b>
                      <small>
                        {space.deadline ? `截止 ${space.deadline}` : "未设截止"}
                        {space.situation?.weak ? ` · 最虚 ${space.situation.weak}` : " · 还没有情况档案"}
                      </small>
                    </div>
                    <button className="p-button ghost sm" type="button" onClick={() => onEditSituation(space)}>
                      更新
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-note">
                还没有目标。新建大类后，助手会自动弹出，先了解这个目标的情况。
              </p>
            )}
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
              <em>只存在本机浏览器</em>
            </div>
            <p className="p-tiny p-faint" style={{ lineHeight: 1.7 }}>
              默认是空工作区：没有计划、番茄记录、复盘、资料和已学状态，只保留 408 目录骨架。
              所有改动保存在 localStorage。
            </p>
            <div className="p-ai-actions">
              <button className="p-button sm" type="button" onClick={() => setResetOpen(true)}>
                清空我的数据
              </button>
              <button
                className="p-button ghost sm"
                type="button"
                onClick={() => {
                  onLoadDemo();
                }}
              >
                载入示例数据
              </button>
              <button
                className="p-button ghost sm"
                type="button"
                onClick={() => {
                  void fetch("/api/logout", { method: "POST" }).finally(() => {
                    window.location.replace("/login");
                  });
                }}
              >
                退出登录
              </button>
            </div>
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

      {resetOpen ? (
        <Modal
          title="清空所有本机数据？"
          subtitle="会删除计划、番茄记录、复盘、资料、自建节点、AI Key 和大类改动。"
          onClose={() => setResetOpen(false)}
          footer={
            <>
              <button className="p-button" type="button" onClick={() => setResetOpen(false)}>
                取消
              </button>
              <button
                className="p-button primary"
                type="button"
                onClick={() => {
                  onReset();
                  setResetOpen(false);
                  onToast("已清空，回到空工作区。");
                }}
              >
                清空
              </button>
            </>
          }
        >
          <p className="p-sub">
            408 教材目录骨架会保留，所有学习状态恢复为空心，其他内容为空。
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
