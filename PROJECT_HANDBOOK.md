# 足迹 · 项目总手册

> 一份文档覆盖：系统功能、架构、数据模型、AI 权限、仓库、Vercel 部署、阿里云域名、安全边界、存储上限、运维排错和后续路线。
>
> 最后核对时间：2026-11-13  
> 本文不记录任何密码、API Key 或私密令牌。若历史对话/截图中出现过 Key，必须先在服务商后台吊销。

---

## 1. 项目概述

「足迹」是一个个人学习系统，目标是把“目标情况 → 知识地图 → 本周内容 → 番茄事实 → 复盘”放在同一个入口里。

它刻意不做的事：

- 不排“每天背单词 30 分钟”这种分钟计划；
- 不伪造数据；
- 不把“标记已学”等同于“掌握”；
- 不把资料数量当作学习成果；
- 不在没有数据时编造记录。

默认是**完全空白**：没有大类、节点、资料、计划、番茄记录或复盘。首次使用需要新建目标，助手会先了解这个目标的情况。

---

## 2. 当前线上状态

| 项目 | 值 |
|---|---|
| 正式访问地址 | https://www.loogeking.top |
| 根域名 | https://loogeking.top → 308 → https://www.loogeking.top |
| 托管 | Vercel，Hobby 免费计划 |
| Vercel 项目 | `loogeking/self-app` |
| 默认 Vercel 地址 | `self-app-bay.vercel.app` |
| 仓库 | https://github.com/loogeking/self_app |
| 默认分支 | `main` |
| 最新功能提交（本文时） | `c137245 fix: show all parsed models in a select` |
| 线上检查 | `/` 返回 200，跳转 `/login`；响应头 `server: Vercel` |
| 服务器 | 不使用自购 VPS；Vercel 负责运行 |
| 数据库 | 无服务端数据库 |
| 文件存储 | 访问者浏览器 IndexedDB |

注意：

- `www.loogeking.top` 和 `self-app-bay.vercel.app` 在浏览器里是**两个不同来源**，资料不互通。正式使用只认 `https://www.loogeking.top`。
- `loogeking.top` 和 `www.loogeking.top` 也是不同来源；当前根域名 308 到 www，因此实际数据存在 www 下。不要以后随意切换主域名，否则浏览器会把它当成新站点。

### 近期验证记录（2026-11-13）

- `pnpm typecheck` 通过；
- `pnpm build` 通过；
- 密码登录/错误密码拒绝/退出登录验证通过；
- 真实番茄Todo文件：12 条、468 分钟、2026-10-26/27；
- PDF 提议：读取目录并生成 5 个节点，确认后写入；
- 节点 ↔ 资料多对多：同一资料关联两个节点、解绑不影响另一节点；
- docode `/models` 返回 6 个模型，页面下拉显示全部模型；
- 使用真实 Key 测试连接返回“连接成功”（Key 未写入仓库，且已要求吊销）。

测试截图在 `docs/screenshots/`。

### Vercel 环境变量

只配置一个：

```text
APP_PASSWORD=你的访问密码
```

不要配置 API Key、Base URL 或模型名。AI 配置在网页设置里，只保存在浏览器 `localStorage`。

改 `APP_PASSWORD` 后需要 **Redeploy** 才会生效。密码改变会让旧 Cookie 自动失效。

---

## 3. 域名与 DNS

域名注册商/解析：阿里云。

当前生效记录（来自 Vercel Domains 面板）：

```text
类型     主机记录   值
A        @          216.198.79.1
CNAME    www        aa92265edbb28452.vercel-dns-017.com
TTL      600
```

说明：

- Vercel 面板显示的值可能随项目变化，**以 Vercel 当前 Domains 页面为准**。
- 不要填入旧教程里的 `76.76.21.21`。
- 不要指向曾经那台 `43.226.47.2` VPS。
- 阿里云里要删除与 `@` / `www` 冲突的 parking、URL 转发、旧 A/CNAME 记录。
- 域名要完成实名认证。
- Vercel 自动签发 HTTPS；证书未签发时先检查 DNS、CAA 和冲突记录。
- 使用 Vercel 海外托管一般不需要国内 ICP 备案；但国内访问 Vercel 的速度可能不稳定，这是网络问题，不是代码问题。

---

## 4. 技术栈

| 类别 | 版本/说明 |
|---|---|
| Next.js | `16.4.5`，App Router，`output: "standalone"` |
| React | `19.3.1` |
| TypeScript | `5.9.3` |
| 包管理器 | `pnpm@10.33.2` |
| Node | `>=20.9`，本地使用 Node 24 |
| PDF 解析 | `pdfjs-dist@4.10.38` |
| 样式 | 纯 CSS，无 UI 框架 |
| 3D 地图 | Canvas 2D 三维投影，不是 WebGL/Three.js |
| PWA | `manifest` + `PwaRegister` + service worker |
| AI | OpenAI 兼容接口，经 `/api/ai/chat` 代理 |
| 认证 | `APP_PASSWORD` + HttpOnly Cookie |
| 数据 | localStorage + IndexedDB，无数据库 |

### 常用命令

```bash
pnpm install
pnpm dev          # 本地开发，http://localhost:3000
pnpm typecheck    # TypeScript 检查
pnpm build        # 生产构建 + 准备 standalone 资源
pnpm start        # 运行 standalone
```

`pnpm build` 会：

1. 执行 `next build --webpack`；
2. 执行 `scripts/prepare-standalone.mjs`，把 `public/` 和 `.next/static` 复制进 standalone；
3. 生成 `.next/standalone`，供本地生产或 Docker 使用。

---

## 5. 页面与路由

唯一入口是 `/`，通过查询参数切换视图：

```text
/?view=today
/?view=map&space=<spaceId>
/?view=plan&space=<spaceId>
/?view=library&space=<spaceId>
/?view=review&space=<spaceId>
/?view=settings&space=all
```

登录页：

```text
/login
```

旧路径 `/proto`、`/map`、`/plan`、`/library`、`/review`、`/settings` 在 `next.config.ts` 中重定向到根路径查询参数。

---

## 6. 目录结构

```text
src/
  app/
    layout.tsx                 根布局、PWA、元信息
    page.tsx                   登录校验后的唯一入口
    login/page.tsx             登录页
    proto.css                  全站样式、地图、弹窗、AI、资料库
    api/login/route.ts         密码校验与 Cookie
    api/logout/route.ts        退出登录
    api/ai/chat/route.ts       AI 聊天代理（需登录，支持文本/图片）
    api/ai/models/route.ts     模型列表代理（需登录）
  lib/auth.ts                  Cookie 哈希/会话校验
  components/
    PwaRegister.tsx            注册 service worker
    proto/
      Prototype.tsx            应用壳、状态、localStorage、视图、全部业务动作
      Today.tsx                今日、番茄导入、最近资料
      MapView.tsx              3D 知识地图、节点 CRUD、资料关联/预览
      Plan.tsx                 本周内容板、进度、延期
      Library.tsx              资料库、文件导入、多节点绑定、PDF 预览
      Review.tsx               每日/每周复盘、番茄历史导入
      Settings.tsx             大类、情况档案、AI 接口、映射、数据
      Assistant.tsx            助手、情况问答、PDF 建图、图片、导入回执
      PdfMap.tsx               AI 从 PDF 生成节点树、差异预览、确认写入
      pdfExtract.ts            PDF 书签/前 16 页文字提取
      docLinks.ts              Doc.nodeIds 多对多、资料数/状态同步
      fileStore.ts             IndexedDB 文件存取
      data.ts                  EMPTY / SEED 数据
      map408.ts                408 教材节点
      pomodoro.ts              SpreadsheetML `.xls` 解析与声明核对
      types.ts                 所有数据类型
      ui.tsx                   通用组件、格式化
public/
  pdf.worker.min.mjs           与 pdfjs-dist 版本匹配的 worker
  icon-*.png                   PWA 图标
scripts/
  prepare-standalone.mjs       复制静态资源到 standalone
  start-standalone.mjs         加载 .env.local、启动 standalone
docs/
  ARCHITECTURE.md              更细的架构说明
  screenshots/                 功能截图
```

---

## 7. 数据模型

核心类型在 `src/components/proto/types.ts`。

### Space（大类 / 目标）

```ts
type Space = {
  id: string;
  name: string;
  color: string;
  description: string;
  deadline?: string;
  situation?: Situation;
};
```

### Situation（每个目标自己的情况档案）

```ts
type Situation = {
  weak?: string;
  busy?: string;
  availableDays?: string;
  notes?: string;
  updatedAt?: string;
};
```

- 不再有全局 `profile`。
- 新建大类后助手自动弹出问答，保存到该大类的 `situation`。
- 之后可从助手顶部“更新情况”或设置里的情况档案列表修改。

### KNode（知识节点）

```ts
type KNode = {
  id: string;
  spaceId: string;
  parentId: string | null;
  title: string;
  state: "empty" | "marked" | "noted";
  notes: number;          // 直接关联的资料数
  custom?: boolean;
  ...
};
```

- `state=noted` 表示有关联资料，不代表掌握。
- `notes` 只计直接绑定资料，不计子节点。

### Doc（资料）与多对多

```ts
type Doc = {
  id: string;
  spaceId: string;
  title: string;
  kind: "pdf" | "md" | "image" | "review";
  nodeIds?: string[];      // 反向绑定多个节点
  fileKey?: string;        // IndexedDB 键
  ...
};
```

关系：

```text
一个 KNode  ←→  多个 Doc
一个 Doc    ←→  多个 KNode
```

- 节点详情里的“关联知识库资料”是多选弹窗。
- 取消勾选只解除当前节点，不删除资料。
- 删除节点只解除绑定，资料仍保留。
- 旧数据里的 `nodeId` 会在加载时合并到 `nodeIds`。
- `docLinks.ts` 负责迁移、计数和状态同步。

### AppData

```ts
type AppData = {
  spaces: Space[];
  nodes: KNode[];
  docs: Doc[];
  plans: PlanItem[];
  sessions: Session[];
  reviews: DailyReview[];
  prefs: Prefs;
  imports?: ImportBatch[];
  ai?: AiConfig;
};
```

---

## 8. 本地存储与数据边界

### localStorage

键名：

```text
footprint-v2
```

保存：大类、节点、计划、番茄、复盘、资料元数据、AI 配置、PWA 偏好。

旧键：

```text
footprint-v1
proto-v4
```

首次加载 v2 时会删除旧键；同时会清一次旧 API Key。这样旧演示/旧数据不会顶回来。

### IndexedDB

```text
DB: footprint-files
Store: files
```

保存 PDF、图片、Markdown 原始文件，使用 `Doc.fileKey` 关联。

### 关键事实

> **数据在浏览器，不在 Vercel，不在服务器。**

- 电脑和平板各一套数据；
- 同一台电脑不同的 Chrome/Edge 各一套；
- 无痕窗口关闭即失效；
- 清理站点数据会删除；
- 换域名（`www` ↔ 根域名 ↔ `vercel.app`）会换存储来源；
- 目前没有云同步，也没有导出/导入功能；
- 目前没有服务端备份能备份这些浏览器数据。

### 容量

- localStorage 元数据通常只有 MB 级，几万条番茄记录才可能接近上限。
- PDF 原文件在 IndexedDB，配额由浏览器决定，可能是几百 MB 到数 GB，取决于设备和磁盘剩余空间。
- 4 本教材通常没问题；几十本普通 PDF 可以；几百本大扫描件不可靠。
- Safari/iOS 更容易被系统回收；不要把它作为唯一备份。

查看配额（浏览器控制台）：

```js
await navigator.storage.estimate()
```

---

## 9. 登录与安全

### 登录流程

1. `/` 服务端校验 Cookie；
2. 未登录重定向 `/login`；
3. `/api/login` 用 `APP_PASSWORD` 的 SHA-256 派生 token；
4. 写入 HttpOnly、SameSite=Lax、生产环境 Secure 的 Cookie；
5. 有效期内访问 `/` 和 AI 接口。

### 受保护路由

- `/` 页面
- `/api/ai/chat`
- `/api/ai/models`

未登录调用 AI 接口返回 401。

### 重要限制

- 页面密码只保护入口，不加密浏览器里的数据。
- 能打开同一浏览器配置文件/DevTools 的人仍能读到 localStorage/IndexedDB。
- API Key 存在当前浏览器，不上传服务器（但会随 AI 请求经过代理）。
- 不要把密码或 Key 写进 GitHub、README、截图或对话。
- 曾经在对话/截图中暴露的 docode Key 必须吊销；本文不保存该 Key。

---

## 10. AI 功能与权限

### 当前 AI 能读

- 当前页面、当前目标名称/说明/截止/情况档案；
- 当前目标完整知识树（最多 240 个节点）；
- 资料库索引（标题、类型、挂载节点、摘要）；
- 前 8 条计划；
- 最近 30 条番茄记录；
- 当前消息附带的图片（最多 4 张，压缩后发送）；
- 最近 6 条聊天消息。

### 当前 AI 能提议

- 通过“从 PDF 建图”读取 PDF 书签/目录和前 16 页文字；
- 生成带页码的节点树提议；
- 前端显示“新增 / 已存在”，用户点确认后才写入；
- 只新增节点，不修改已有节点标题、状态或资料绑定。

### 当前 AI 不能

- 直接改 localStorage/IndexedDB；
- 直接删除、改名、移动节点；
- 清空数据或删除大类；
- 读完整本 PDF（只读书签/前部文字）；
- 对扫描件做 OCR（没有文字层会明确失败）；
- 自动执行任何写操作（必须用户确认）。

### 助手交互

- 新建目标 → 自动打开情况问答；
- 顶栏“更新情况”或直接说“更新情况”；
- 番茄导入后自动打开，先给事实回执；有 Key 再基于记录回应；
- 图片按钮/粘贴，最多 4 张；
- PDF 入口在资料预览和助手顶部“从 PDF 建图”。

### AI 设置

设置页支持：

- DeepSeek / OpenAI / 自定义兼容接口；
- Base URL、模型、API Key、温度；
- 解析模型：请求 `{baseUrl}/models`，解析 `data[].id`；
- 测试连接；
- 清除 Key；
- 模型列表现在是真正的 `<select>`，显示全部模型，并支持“手动输入其他模型名”。

温度：

- 0–0.3：稳定，适合提取/严格回答；
- 0.4–0.6：学习规划、复盘推荐；
- 0.8–1.0：发散、头脑风暴；
- API 路由会限制到 0–1.5。

PDF 建图内部固定温度 `0.2`，不受设置页温度影响。

---

## 11. 3D 知识地图

- 入口：`/?view=map&space=<id>`；
- 考研示例 226 个节点（408 + 数学 + 英语 + 政治）；
- 默认显示全部节点名称，可切“精简名称”；
- 自动旋转、拖动、滚轮/双指缩放、搜索定位；
- 节点状态：空心 / 半亮 / 发光；
- 新建大类没有节点时，可从空地图创建第一个根节点；
- 自建节点可改名、删除、添加子节点；
- 删除节点只解除资料绑定，不删资料；
- 资料数/状态由直接绑定资料自动同步。

---

## 12. 资料库

支持导入：

- PDF
- Markdown / TXT
- 图片

流程：

1. 资料库存 IndexedDB；
2. 元数据进 localStorage；
3. PDF 用浏览器原生查看器预览；
4. 图片原图显示；
5. Markdown 显示正文；
6. 下载读取原始文件；
7. 节点侧多选关联；
8. 资料预览显示全部关联节点。

AI PDF 建图：

1. 取 IndexedDB 原文件；
2. `pdfExtract.ts` 读书签/前 16 页文字；
3. 只把目录/前部文字发给模型；
4. 模型返回严格 JSON；
5. 前端校验并做新增/已存在差异；
6. 用户确认后写入新节点；
7. 新节点默认空心，PDF 挂到根节点。

限制：

- 扫描件没有文字层需要 OCR；
- 目前 AI 只新增节点，不做改名/移动/删除；
- 全书正文不会落库，只读取 PDF 前部内容。

---

## 13. 计划、番茄、复盘

### 计划

- 五列：待做 / 进行中 / 完成 / 部分完成 / 搁置；
- 内容、完成标准、依据、优先级、截止；
- 没有预计分钟；
- 记录完成量、说明、延期原因。

### 番茄 Todo 导入

- 支持 SpreadsheetML `.xls`（番茄Todo 导出）；
- 自动查找表头，兼容“专注时间 2026-10-27 16:00 至 16:36”；
- 按“日期 + 开始时间 + 待办名称”去重；
- 0 分钟保留但不计时；
- 复盘导入会核对文件声明条数和时长；
- 已验证真实文件：12 条、468 分钟、2026-10-26/27；
- 导入后助手自动给回执，有 Key 时由模型基于这批事实回应。

### 复盘

- 每日自由写；
- 自动事实块显示番茄、来源、完整时间；
- 每周统计时间构成、每日投入、内容完成/部分完成/延期；
- 无记录不伪造 0。

---

## 14. 部署

### 14.1 Vercel（当前方案）

1. Vercel → Add New → Project；
2. 导入 `loogeking/self_app`；
3. Framework Preset：Next.js；
4. Root Directory：`./`；
5. Install：`pnpm install`；
6. Build：`pnpm build`；
7. 环境变量：

```text
APP_PASSWORD=强密码
```

8. Deploy；
9. Settings → Domains 添加 `loogeking.top` 和 `www.loogeking.top`；
10. 阿里云添加 A/CNAME；
11. 等 Vercel 显示 Valid，自动签发 HTTPS；
12. 用 `https://www.loogeking.top` 正式使用。

Hobby 免费层正常注册/部署不需要信用卡；域名续费另算。免费额度以 Vercel 当前控制台为准。

### 14.2 自动更新

向 `main` push 会自动触发 Production 部署：

```bash
git add .
git commit -m "说明"
git push origin main
```

- 代码、页面、API、CSS 自动更新；
- 环境变量改动需要 Redeploy；
- DNS 改动不会跟代码走；
- 构建失败时 Vercel 保留上一个成功版本；
- 可在 Deployments 里回滚。

### 14.3 本地/Docker

```bash
pnpm install
cp .env.example .env.local
# 编辑 .env.local，设置 APP_PASSWORD
pnpm build
pnpm start
```

Docker：

```bash
docker build -t footprint .
docker run -d --name footprint --restart unless-stopped \
  -p 3000:3000 -e APP_PASSWORD='...' footprint
```

Docker 是可选方案；当前正式站使用 Vercel，不需要自己的服务器。

注意：生产环境 Cookie 带 `Secure`，通过纯 HTTP + 公网 IP 访问可能登录失败；使用 HTTPS 或 localhost。

---

## 15. 常见问题与排错

### 登录一直失败

- Vercel 是否设置 `APP_PASSWORD`；
- Key 是否拼成 `APP_PASSWORD`；
- 密码是否有空格/换行；
- 改环境变量后是否 Redeploy；
- 是否用 HTTPS；
- 是否访问了不同域名（www vs vercel.app）。

### 域名 Invalid

- 阿里云 A/CNAME 是否与 Vercel 当前面板一致；
- 是否删掉旧 parking 记录；
- 域名 DNS 服务器是否为阿里云；
- 是否完成实名；
- TTL/传播；
- CAA 是否阻止 Let's Encrypt。

### 模型解析只有一两个

已在 `c137245` 修复：原 `<datalist>` 会按当前值过滤，现改为 `<select>`，列出接口返回的全部模型，并提供“手动输入其他模型名”。

### AI 连接失败

- Base URL 要用 `https://.../v1`；
- 模型 ID 必须是 `/models` 返回的真实 ID；
- Key 是否有效；
- 是否 401/403/429/503；
- 是否把 Key 填到了正确输入框；
- 保存配置后再测试；
- 浏览器控制台看 `/api/ai/chat` 返回。

### PDF 建图失败

- 是否有文字层/书签；
- 扫描件是否有 OCR；
- PDF worker 是否 200（`/pdf.worker.min.mjs`）；
- 文件是否还在 IndexedDB；
- 是否已配置 AI Key；
- 模型是否支持长上下文。

### 数据突然空了

- 换了域名/设备/浏览器；
- 清了站点数据；
- 无痕窗口；
- 旧版 v1 数据被 v2 reset 清理（设计行为）；
- 当前没有云同步。

---

## 16. 已知限制

1. 没有云同步、账号体系和多端共享。
2. PDF 存在浏览器，20GB 服务器容量与它无关；Vercel 也不保存文件。
3. 没有导出/导入/整库备份功能。
4. 单密码，不是多用户系统。
5. API Key 在浏览器，公共设备不安全。
6. PDF 扫描件无 OCR。
7. AI 只提议新增节点，不能直接改名/移动/删除。
8. 3D 地图 Canvas 投影，不是 WebGL；节点更多时需要 LOD。
9. 国内访问 Vercel 可能慢/不稳定。
10. Vercel 免费额度、Supabase 等第三方政策会变。

---

## 17. 未来路线（若需要多设备）

推荐：

```text
Vercel（前端 + AI 代理 + 密码门）
    ↓
Supabase Postgres（AppData）
Supabase Storage（PDF/图片）
    ↓
浏览器 IndexedDB（缓存）
```

需要的工作：

- 服务端保存 `AppData`；
- PDF 上传到 Storage；
- 拉取/同步状态；
- 冲突处理；
- 旧浏览器数据一次性迁移；
- 备份与恢复；
- 可选的导出/导入。

免费额度有限，文件多时需要付费或换 R2/S3。当前版本没有实现这些。

---

## 18. 变更记录

```text
c137245  fix: show all parsed models in a select
6d2530e  feat: link nodes to multiple library documents
cb148a6  feat: AI PDF map proposals and pomodoro import reactions
ae4b63f  chore: reset legacy workspace data and document per-goal situations
a5a92b5  feat: empty workspace and per-goal situation onboarding
ea4d3ba  feat: protect app, import library files and review history, expand 3D map
6f7ea4b  Update README to reflect project content changes (remote)
```

---

## 19. 快速检查清单

```text
[ ] https://www.loogeking.top 能打开
[ ] 未登录会到 /login
[ ] APP_PASSWORD 登录成功
[ ] 设置里保存 AI 配置后显示“已配置”
[ ] 解析模型能显示全部模型
[ ] 测试连接成功
[ ] 知识库导入 PDF 成功
[ ] PDF 预览成功
[ ] 节点可以关联多份资料
[ ] 资料可以显示多个关联节点
[ ] 番茄导入后助手自动回执
[ ] 迁移/备份策略明确（当前仅浏览器本地）
```

---

## 20. 关键文件索引

| 需求 | 文件 |
|---|---|
| 页面壳/数据状态 | `src/components/proto/Prototype.tsx` |
| 登录验证 | `src/lib/auth.ts`、`src/app/api/login/route.ts` |
| AI 代理 | `src/app/api/ai/chat/route.ts` |
| 模型列表 | `src/app/api/ai/models/route.ts` |
| AI 助手 | `src/components/proto/Assistant.tsx` |
| PDF 建图 | `src/components/proto/PdfMap.tsx` |
| PDF 解析 | `src/components/proto/pdfExtract.ts` |
| 资料库 | `src/components/proto/Library.tsx` |
| 多对多 | `src/components/proto/docLinks.ts` |
| 3D 地图 | `src/components/proto/MapView.tsx` |
| 复盘 | `src/components/proto/Review.tsx` |
| 番茄解析 | `src/components/proto/pomodoro.ts` |
| 设置 | `src/components/proto/Settings.tsx` |
| 空/演示数据 | `src/components/proto/data.ts` |
| 类型 | `src/components/proto/types.ts` |
| 样式 | `src/app/proto.css` |
| 部署配置 | `next.config.ts`、`Dockerfile`、`.env.example` |

---

**一句话总结：**

> 这是一个部署在 Vercel 的单密码、本地优先个人学习系统；页面和 AI 代理在线，PDF/节点/记录存在各自浏览器里，目前不支持多设备同步。  
> 要平板和电脑共享，下一步必须接云端存储，而不是继续换托管。