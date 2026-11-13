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

- 初始数据在 `src/components/proto/data.ts`，界面会明确标注“原型示例”。
- 番茄Todo 导出的 `.xls` 实际是 SpreadsheetML XML，由 `src/components/proto/pomodoro.ts` 在浏览器中解析。
- 导入按「日期 + 开始时间 + 待办名称」去重；0 分钟记录保留但不计入统计。
- 数据只存在当前浏览器的 `localStorage`，键名 `proto-v4`，设置页可以重置。
- 助手目前是脚本化交互，不调用真实模型 API。

## 结构

```text
src/app/
  layout.tsx          根布局、PWA、元信息
  page.tsx            唯一入口
  proto.css           全部界面样式
src/components/proto/
  Prototype.tsx       壳、状态、localStorage、视图切换
  Today.tsx           今日内容、事实、番茄导入
  MapView.tsx         深色知识图谱
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

旧数据库实现和原始 PDF 素材已移出项目，仓库只保留部署所需内容。