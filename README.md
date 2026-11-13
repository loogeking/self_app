# 足迹

一个不需要登录的个人学习系统前端。它只回答四件事：今天碰什么、学过什么、留下了什么证据、这周事实如何。

数据是本地 mock，改动保存在浏览器 `localStorage`，不连接数据库，也不上传文件。

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

把仓库导入 Vercel，Framework 选择 Next.js，构建命令 `pnpm build`，不需要环境变量。

### Docker

```bash
docker build -t footprint .
docker run --rm -p 3000:3000 footprint
```

`next.config.ts` 已启用 `output: "standalone"`，Docker 镜像只带运行所需文件。

## 数据与边界

- 首次打开是空工作区：没有计划、番茄记录、复盘、资料和已学状态，只保留 408 教材目录骨架。
- 设置里可以手动“载入示例数据”，也可以随时“清空我的数据”。
- 示例与种子数据在 `src/components/proto/data.ts`。
- 番茄Todo 导出的 `.xls` 实际是 SpreadsheetML XML，由 `src/components/proto/pomodoro.ts` 在浏览器中解析。
- 导入按「日期 + 开始时间 + 待办名称」去重；0 分钟记录保留但不计入统计。
- 数据只存在当前浏览器的 `localStorage`，键名 `footprint-v1`。
- 助手在未配置 API 时使用脚本回答；配置 Key 后通过 `/api/ai/chat` 请求 OpenAI 兼容接口。

## 结构

完整的模块职责、数据流、3D 地图与 AI 配置说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

```text
src/app/
  layout.tsx          根布局、PWA、元信息
  page.tsx            唯一入口
  proto.css           全部界面样式
  api/ai/chat/route.ts AI 请求代理
src/components/proto/
  Prototype.tsx       壳、状态、localStorage、视图切换
  Today.tsx           今日内容、事实、番茄导入
  MapView.tsx         可旋转 3D 知识图谱、节点增删改查
  Plan.tsx            周内容板、进度、延期
  Library.tsx         书 / 笔记 / 复盘
  Review.tsx          每日复盘与每周事实统计
  Settings.tsx        大类、番茄映射、数据
  Assistant.tsx       全局助手
  data.ts             原型种子数据
  map408.ts           408 教材节节点
  pomodoro.ts         SpreadsheetML 导入解析
  types.ts / ui.tsx   类型与通用组件
```
