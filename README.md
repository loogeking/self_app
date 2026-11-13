# 足迹

一个带访问密码的个人学习系统前端。它只回答四件事：今天碰什么、学过什么、留下了什么证据、这周事实如何。

学习数据保存在浏览器 `localStorage`，原件不落在服务器；访问密码由服务端 Cookie 校验。

## 访问密码

复制 `.env.example` 为 `.env.local`，设置：

```text
APP_PASSWORD=你的密码
```

未设置 `APP_PASSWORD` 时系统会保持锁定。部署到 Vercel / Docker 时必须在平台环境变量里配置同名变量。

首次加载旧版本数据时会自动清除浏览器里保存的 API Key（只清一次），设置页重新填写的 Key 之后会正常保留。

## 技术栈

- Next.js 16（App Router）
- React 19
- TypeScript 5.9
- 纯 CSS / Canvas 2D

## 本地运行

要求 Node.js >= 20.9，包管理器用 pnpm。

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:3000/`。

## 生产构建

```bash
pnpm build
pnpm start
```

类型检查：

```bash
pnpm typecheck
```

## 部署

### Vercel

把仓库导入 Vercel，Framework 选择 Next.js，构建命令 `pnpm build`，并在 Project Settings 里配置环境变量 `APP_PASSWORD`。

### Docker

```bash
docker build -t footprint .
docker run --rm -p 3000:3000 -e APP_PASSWORD=你的密码 footprint
```

`next.config.ts` 已启用 `output: "standalone"`，Docker 镜像只带运行所需文件。

## 数据与边界

- 首次打开是彻底空工作区：没有大类、节点、计划、番茄记录、复盘或资料。
- 新建大类后助手会自动弹出，先记录这个目标的情况档案；每个大类各有一份，后续可从“更新情况”或设置修改。
- 设置里可以手动“载入示例数据”，也可以随时“清空我的数据”。
- 示例与种子数据在 `src/components/proto/data.ts`。
- 番茄Todo 导出的 `.xls` 实际是 SpreadsheetML XML，由 `src/components/proto/pomodoro.ts` 在浏览器中解析；复盘页和今日页共用。
- 导入按「日期 + 开始时间 + 待办名称」去重；0 分钟记录保留但不计入统计。复盘导入会先核对文件声明的条数和时长。
- 知识库支持导入 PDF、图片、Markdown；原始文件保存在浏览器 IndexedDB，不进入 localStorage。
- PDF 预览和助手都能“AI 整理成地图”：读 PDF 目录/前部文字，先生成新增节点提议，确认后才写入地图。
- 学习数据只存在当前浏览器的 `localStorage`，键名 `footprint-v2`。从旧版升级时会一次性清掉 `footprint-v1` 的演示数据。
- 助手在未配置 API 时使用脚本回答；配置 Key 后通过需要登录的 `/api/ai/chat` 请求 OpenAI 兼容接口。
- 每次导入番茄记录后会打开助手，先给导入事实回执；配置 Key 时再由模型基于这批记录回应。
- AI 设置里的“解析模型”会从 `{baseUrl}/models` 读取模型列表；助手最多可带 4 张图片，需模型支持视觉输入。
- 不要把包含 API Key 的界面截图发给别人；如果已经发出，立刻去服务商后台吊销。

## 结构

完整的模块职责、数据流、3D 地图与 AI 配置说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

```text
src/app/
  layout.tsx          根布局、PWA、元信息
  page.tsx            登录后的唯一入口
  login/page.tsx      访问密码页
  proto.css           全部界面样式
  api/login/route.ts  密码校验、写 Cookie
  api/logout/route.ts 退出登录
  api/ai/chat/route.ts AI 请求代理（需登录）
src/lib/auth.ts       Cookie 哈希与会话校验
src/components/proto/
  Prototype.tsx       壳、状态、localStorage、视图切换、旧 Key 清理
  Today.tsx           今日内容、事实、番茄导入
  MapView.tsx         可旋转 3D 知识图谱、全量标签、节点增删改查
  Plan.tsx            周内容板、进度、延期
  Library.tsx         书 / 笔记 / 复盘、本机文件导入
  Review.tsx          每日复盘、每周统计、番茄历史导入
  Settings.tsx        大类、各目标情况档案、AI 接口、数据
  Assistant.tsx       全局助手、目标情况问答、真实 AI 或脚本模式
  data.ts             全空 EMPTY / 演示 SEED 数据
  map408.ts           408 教材节节点
  pomodoro.ts         SpreadsheetML 解析与导出汇总核对
  fileStore.ts        IndexedDB 文件存取
  pdfExtract.ts       PDF 目录/文字层提取
  PdfMap.tsx          AI 建图提议、差异预览、确认写入
  types.ts / ui.tsx   类型与通用组件
```
