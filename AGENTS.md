<!-- AGENTS.md for 无名杀（Noname）项目 -->

> 本文件供 AI 编程助手阅读。阅读者应当被视作对项目一无所知。
> 本项目主要使用中文进行注释和文档编写，因此本指南使用中文撰写。

---

## 项目概览

**无名杀（Noname）** 是一款基于 HTML5/Web 技术栈开发的开源卡牌策略游戏，玩法和世界观与《三国杀》类似。项目采用 **GPL-3.0-only** 协议开源。

项目核心是一个浏览器内运行的游戏引擎，支持：
- 网页端直接游玩（Chromium >= 91 或 Safari >= 16.4）
- Electron 桌面客户端（Windows / macOS / Linux）
- Android 移动端（基于 Capacitor）
- 联机对战（基于 WebSocket 自建服务器）

代码仓库地址：https://github.com/libnoname/noname

**本仓库为 Fork**（`Jeff114514/noname`），在 upstream `libnoname/noname` 基础上增加了房间配置云端同步、联机自由选将、一键部署脚本等定制功能。日常开发需同时关注上游更新与 Fork 特有逻辑。

| 远程 | 用途 |
|------|------|
| `origin` | 本 Fork（推送目标） |
| `upstream` | 上游官方仓库（拉取合并） |

与上游同步推荐在本地执行 `git fetch upstream main && git merge upstream/main`；上游大版本曾将 `content.js` 重构为 `content.ts`（#3838），Git 会按重命名合并，一般不必手动搬运 diff。

---

## 技术栈

| 层级 | 技术 | 实际版本（参考） |
|------|------|-----------------|
| 语言 | TypeScript、JavaScript（ES Modules） | TS ^5.9.3 |
| 前端框架 | Vue 3（部分 UI 和扩展使用） | ^3.5.28 |
| 构建工具 | Vite 7、tsup、tsx | Vite ^7.3.1、tsup ^8.5.1、tsx ^4.21.0 |
| 包管理器 | pnpm（workspace 模式） | >= 9（仓库使用 pnpm 10） |
| 桌面端 | Electron 39 + vite-plugin-electron | electron ^39.5.2、vite-plugin-electron ^0.29.0 |
| 移动端 | Capacitor 8（Android） | @capacitor/core ^8.1.0 |
| 后端/文件服务 | Fastify 5（`@noname/fs`） | fastify + @fastify/static + @fastify/cors |
| 联机服务器 | 原生 WebSocket（`ws` 库，`@noname/server`） | ws ^8.19.0 |
| 代码规范 | ESLint 9 + Prettier 3 | eslint ^9.39.2、prettier ^3.8.1 |
| 进程管理 | PM2（生产部署） | — |

---

## 项目结构（Monorepo）

本项目使用 pnpm workspace 管理多包结构，`pnpm-workspace.yaml` 中定义了：

```yaml
packages:
  - apps/*
  - packages/*
  - packages/extension/*
```

`sharedWorkspaceLockfile: false` 表示每个子包使用各自的 lockfile 段。

```
├── apps/
│   ├── core/          # 游戏本体（核心代码、资源、模式、武将、卡牌）
│   ├── electron/      # Electron 桌面客户端打包
│   └── mobile/        # Capacitor Android 客户端
├── packages/
│   ├── extension/     # 扩展包目录（目前为空，仅作为 workspace 挂载点）
│   ├── fs/            # 文件系统服务（Fastify，提供本地文件读写 HTTP API）
│   ├── jit/           # Vue SFC / TypeScript 运行时编译服务（Service Worker）
│   └── server/        # 联机对战 WebSocket 服务器
├── scripts/           # 根目录构建/开发脚本 + 扩展模板
├── docs/              # 项目文档（中文）
└── dist/              # 生产构建输出目录
```

### `apps/core` —— 游戏核心

**包名：** `noname`（产品名：无名杀，版本 `1.11.3`）

这是最重要的目录，包含完整的游戏运行时：

| 目录 | 说明 |
|------|------|
| `noname/` | 核心引擎模块：ai、game、get、init、library、status、ui、util |
| `noname/game/connectFreeChoose.js` | Fork：联机/单机自由选将（候选池、校验、UI） |
| `noname/game/roomConfig.js` | Fork：房间配置云端保存与应用 |
| `noname/library/element/` | 游戏事件系统（GameEvent）、玩家、卡牌、技能等基础元素 |
| `noname/library/element/content.ts` | 内置事件步骤实现（原 `content.js`，已 TypeScript 化） |
| `noname/init/` | 启动流程、配置加载、资源导入、安全沙箱 |
| `mode/` | 游戏模式（如身份局 `identity`、国战 `guozhan` 等） |
| `character/` | 武将包（standard、shenhua、sp、mobile、tw 等 26 个包） |
| `card/` | 卡牌包定义 |
| `extension/` | 内置扩展（含 legacy 单文件扩展和现代化目录扩展） |
| `audio/` | 音效与语音 |
| `image/` | 图片素材 |
| `theme/` | UI 主题 |
| `layout/` | 布局样式 |
| `index.html` | 浏览器入口 |
| `noname.js` | 核心模块统一导出文件（导出六个单例 + rootURL） |
| `game/config.json` | 默认游戏配置，含 `moderned_characters` / `moderned_modes` 列表 |
| `vite.config.ts` | Vite 开发配置（端口 8080，代理文件 API 到 8089） |

#### 核心单例对象

游戏运行依赖六个全局单例，统一从 `noname.js` 导出：

| 对象 | 职责 | 对应文件 |
|------|------|----------|
| `lib` | 静态库：技能表、卡牌表、武将表、翻译、配置、内容模板 | `noname/library/index.js` |
| `game` | 游戏行为 API、事件创建、流程控制；挂载 `connectFreeChoose`、`roomConfig` 等子模块 | `noname/game/index.js` |
| `ui` | DOM 创建、界面交互、视觉呈现 | `noname/ui/index.js` |
| `get` | 查询、计算、转换工具函数 | `noname/get/index.js` |
| `ai` | AI 评估与决策逻辑 | `noname/ai/index.js` |
| `_status` | 运行时状态（当前事件、玩家、阶段等） | `noname/status/index.js` |

#### 事件驱动架构

无名杀的核心是 **GameEvent 异步事件系统**。所有游戏行为（摸牌、出牌、造成伤害、选择目标等）都是 `GameEvent` 节点，通过 `next` 队列、生命周期触发（Before / Begin / End / After）和技能触发串联成一棵有序执行的事件树。

关键文件：
- `noname/library/element/gameEvent.ts` —— GameEvent 实现
- `noname/library/element/content.ts` —— 内置事件内容（phase、draw、damage、chooseControl 等）；上游 #3838 起由 `content.js` 迁移为 TypeScript，经 `element/index.js` 的 `export { Content } from "./content.ts"` 导出
- `noname/library/element/GameEvent/compilers/` —— 内容编译器（Step / Async / Array）

> **修改 `Content` 时**：只编辑 `content.ts`，勿再创建或引用 `content.js`。Fork 曾在旧版 `content.js` 中改过手气卡、房间按钮清理、自由选将挂载等逻辑，合并上游后这些改动应落在 `content.ts` 对应函数内。

**GameEvent 核心机制：**

- **`next` 队列**：`GameEvent` 的 `next` 字段是一个 **Proxy 数组**。向其中 push 子事件时，会自动设置 `childEvent.parent = 当前事件`。`loop()` 在每个生命周期节点前都会 `await this.waitNext()`，按 FIFO 顺序 drain `next` 队列中的子事件。
- **`after` 队列**：`after` 是普通数组，用于存放"当前事件主体完成后再执行"的事件。在 `loop()` 中，只有当 `_triggered >= 3`（即 End/After 阶段）且 `after` 有内容时，才会将 `after` 中的事件迁移到 `next` 中执行。
- **生命周期状态机**：`_triggered` 字段控制事件生命周期：
  - `0` → 触发 `nameBefore`
  - `1` → 触发 `nameBegin`
  - `2` → 执行 `content`（编译后的异步函数）
  - `3` → 触发 `nameEnd`
  - `4` → 触发 `nameAfter`，然后 drain `after[]`
- **`await` 语义**：`GameEvent` 实现了 `PromiseLike<void>`。`await player.draw(2)` 时，`player.draw()` 创建的 `draw` 事件会被 push 到当前事件的 `next` 队列，`await` 则等待父事件的 `waitNext()` drain 到它才继续。
- **技能触发**：`event.trigger(name)` 查找 `lib.hookmap[name]`，按座次遍历玩家收集技能，创建 `arrangeTrigger` 事件，再逐个创建 `createTrigger` 事件执行技能 `cost` 和 `content`。

#### 启动流程

```
index.html
  -> noname/entry.ts
  -> boot()                    （noname/init/index.ts）
  -> 加载配置 / 资源 / 模式 / 武将包 / 卡包 / 扩展
  -> ui.create.arena()         （创建游戏界面）
  -> game.createEvent("game")  （创建根事件）
  -> game.loop()               （启动事件系统）
  -> 模式 start 流程
  -> chooseCharacter -> gameStart -> gameDraw -> phaseLoop
```

**启动阶段分工：**

- `noname/init/import.ts` —— 负责动态 `import()` 加载模式/武将包/卡包/扩展，并调用 `game.import()` 将内容注册到 `lib.imported`。`game.import()` 会返回一个 Promise 并跟踪在 `_status.importing` 中，boot 会等待这些 Promise 完成。
- `noname/init/loading.ts` —— 负责将 `lib.imported` 中的内容**混入全局运行时**：
  - `loadMode()` 通过 `mixinLibrary()` 将模式的 `skill`/`translate`/`character` 等注入 `lib`，通过 `mixinGeneral()` 将 `mode.game`/`mode.ui`/`mode.get`/`mode.ai` 混入对应单例。
  - `loadCharacter()` 将武将包数据写入 `lib.character` 和 `lib.skill`。
  - `loadCard()` 将卡牌定义写入 `lib.card` 和 `lib.cardPack`。
  - `loadExtension()` 执行扩展的 `content` 函数并注入其角色/卡牌/技能。

#### 武将包与模式的现代化

`game/config.json` 中的 `moderned_characters` 列表定义了已现代化的武将包：

```json
["bingshi", "clan", "collab", "diy", "huicui", "jsrg", "key", "standard", "shenhua", "extra", "refresh", "old", "sixiang", "sxrm", "yijiang"]
```

这些包采用目录结构，构建时会被 Vite 打包为单文件；未现代化的包则作为原始文件直接复制到 `dist/`。

**现代化武将包目录结构**（以 `character/standard/` 为例）：
```
character/standard/
├── index.js          # 入口，导入各子模块，调用 game.import("character", ...)
├── character.js      # 武将定义
├── skill.js          # 技能定义（导出对象）
├── translate.js      # 翻译
├── card.js           # 卡牌（如有）
├── intro.js          # 武将介绍
├── characterTitle.js # 称号
├── pinyin.js         # 拼音
├── voices.js         # 语音台词
└── sort.js           # 分包排序
```

**现代化模式目录结构**（以 `mode/guozhan/` 为例）：
```
mode/guozhan/
├── index.js          # export default { name: "guozhan", start, ... }
├── meta.js
└── src/
    ├── main.js       # start / startBefore / onreinit
    ├── character/    # 武将数据（按类别拆分）
    ├── skill/        # 技能定义
    ├── card/         # 卡牌定义
    ├── translate/    # 翻译
    ├── voices/       # 语音
    ├── info/         # 牌堆定义等
    ├── patch/        # 模式对 game/get/content/player 的覆盖
    └── help/         # 帮助文本 / Vue 组件
```

`moderned_modes` 列表同理，目前仅 `guozhan` 已完成现代化。

### `apps/electron` —— 桌面客户端

- **包名：** `@noname/electron`
- 依赖 `vite-plugin-electron`，打包主进程（`app/main.ts`）和预加载脚本（`app/preload.ts`）
- 主进程内嵌 `@noname/fs` 文件服务（端口 8089）
- 开发时加载 `http://localhost:8080`，生产环境加载 `http://localhost:8089/index.html`
- 启用 `nodeIntegration: true`、`contextIsolation: false`，使用 `@electron/remote` 构建原生菜单
- 打包配置 `asar: false`，构建脚本 `build.ts` 调用 `electron-builder`
- 打包输出到根目录 `output/`，支持 Windows（nsis）、macOS（dmg/zip）、Linux（AppImage）

### `apps/mobile` —— Android 客户端

- **包名：** `@noname/mobile`
- 基于 Capacitor 8，`capacitor.config.ts` 中 `webDir: "../../dist"`
- 自定义 `SafFs` 插件桥接 Android Storage Access Framework（SAF）文件操作（原生实现为 Kotlin `SafFsPlugin.kt`）
- `afterSync.ts` 解决 Capacitor sync 后 Android `aapt` 忽略隐藏目录的问题（将 `.pnpm` 重命名为 `_pnpm`）
- 无独立前端构建流程，直接复用根目录 `dist/` 输出

### `packages/fs` —— Fastify 文件服务

- **包名：** `@noname/fs`
- 端口：**8089**
- 提供 HTTP API，所有接口返回 JSON 包装 `{ success, code, data?, errorMsg? }`：
  - `/readFile`、`/readFileAsText`、`/writeFile`、`/getFileList`
  - `/createDir`、`/removeDir`、`/removeFile`、`/checkFile`、`/checkDir`
- `ensureSafe` 函数防止路径遍历攻击：将请求路径限制在配置的 `dirname` 目录内，通过 `path.normalize` 校验最终路径是否以 `dirname` 开头
- 支持 Node.js SEA（Single Executable Application）打包为独立可执行文件（`build.ts` + `sea-config.json`）
- `tsup.config.ts` 同时构建 ESM 和 CJS 两种格式

### `packages/server` —— WebSocket 联机服务器

- **包名：** `@noname/server`
- 端口：**8082**，监听 `0.0.0.0:8082`
- 基于 `ws` 库的 `WebSocketServer`
- 连接后 2 秒内必须发送 `key` 消息进行鉴权，否则断开；每 60 秒心跳检测
- 协议：房主（owner）发送结构化 JSON 数组 `["server", "<type>", ...args]`，服务端通过 `handlers` 处理；`slaves` 的消息直接转发给房主
- 支持房间创建、加入、配置持久化（`dist/configs/shared.json`，最多 50 条）、心跳检测、踢人/封禁等
- 全局状态：`clients`、`rooms`、`events`、`bannedKeys`、`bannedIps`

### `packages/jit` —— 浏览器 JIT 编译服务

- **包名：** `@noname/jit`
- Vite 插件形式，在构建时向 HTML 注入 Service Worker 注册脚本
- Service Worker 仅拦截 `localhost`、`127.0.0.1`、`10.0.2.2` 上路径以 `/extension` 或 `/jit-test.ts` 开头的请求
- 支持运行时编译：
  - `.ts` → `typescript.transpileModule`（module: ES2015，target: ES2020）
  - `.vue` → `@vue/compiler-sfc`（含 script、template、style 完整处理，支持 scoped）
  - `.css` → 注入 `<style>` 或返回原始内容
  - `.json`、Web Worker、`?raw`、`?url` 等资源
- `entry.ts` 负责注册 SW，首次加载会注销旧 SW 并自动刷新页面；注册后通过动态导入 `/jit-test.ts` 检测 TS 编译能力，结果存入 `sessionStorage.canUseTs`

### `packages/extension` —— 扩展工作区

- 当前目录**为空**（仅含 `.gitignore`），作为 pnpm workspace 挂载点
- 扩展模板位于 `scripts/extension-template/`，提供 **default** 和 **vue** 两种模板
- `pnpm init:extension <name> --author 作者名` 在 `packages/extension/<name>/` 生成模板
- 扩展构建输出到 `apps/core/extension/{info.name}/`，使用 `preserveModules: true` 且不带哈希
- `apps/core/extension/` 下还包含若干内置 legacy 扩展（单文件 `extension.js` 形式）

---

## 构建与运行命令

### 环境要求

- Node.js `^20.19.0 || >=22.12.0`（CI 使用 Node.js 25）
- pnpm `>= 9`（仓库使用 pnpm 10）

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
# 启动完整开发环境（同时启动 Vite 前端 8080 端口 + 文件服务 8089 端口 + 扩展监视）
pnpm dev
```

`scripts/dev.ts` 会并发启动三个进程：
1. `@noname/fs` 开发服务器（`--debug --dirname=../../apps/core`）
2. 所有 workspace 扩展的 `build:watch`
3. `noname` 的 Vite 开发服务器（`--open`）

开发时：
- 前端 Vite 服务器运行在 `127.0.0.1:8080`
- 文件系统服务（`@noname/fs`）运行在 `127.0.0.1:8089`
- Vite 代理将 `/readFile`、`/writeFile` 等接口转发到文件服务

### 生产构建

```bash
# 构建所有子包并合并输出到 dist/
pnpm build
```

`scripts/build.ts` 的执行逻辑：
1. `pnpm -F noname... build` —— 构建核心（含其 workspace 依赖）
2. `pnpm -F ./packages/extension/** build` —— 构建所有扩展
3. 清空并重建根目录 `dist/`，合并以下内容：
   - `apps/core/dist` → `dist/`
   - `apps/core/audio` → `dist/audio`
   - `apps/core/image` → `dist/image`
   - `apps/core/extension` → `dist/extension`
   - `docs/`、`.nomedia`、`LICENSE`、`README.md` → `dist/`

> 核心构建使用 `preserveModules: true` 且文件名不含内容哈希，因为游戏通过固定路径动态加载模块。

```bash
# 构建后启动静态文件服务器（8089 端口）
pnpm serve

# 构建 + 启动（一键）
pnpm start
```

### Electron 打包

```bash
# 先确保 pnpm build 成功
pnpm -F @noname/electron build:win   # Windows（NSIS）
pnpm -F @noname/electron build:mac   # macOS（DMG + zip，arm64 + x64）
pnpm -F @noname/electron build:linux # Linux（AppImage）
```

输出目录：`output/`

### 联机服务器

```bash
# 启动 WebSocket 联机服务器（监听 8082 端口）
pnpm -F @noname/server dev
```

### 扩展初始化

```bash
# 创建新扩展模板（默认模板）
pnpm init:extension my-extension --author 作者名

# 创建支持 Vue 的扩展
pnpm init:extension my-extension --author 作者名 --vue
```

模板生成在 `packages/extension/<name>/`，构建后输出到 `apps/core/extension/<name>/`。

### 其他命令

```bash
# ESLint 代码检查（全仓库递归）
pnpm lint

# 生成测试/离线包（output/testpack/）
pnpm generateTestPack
```

---

## 代码风格规范

### Prettier 配置

配置位于根目录 `prettier.config.js`：

- 使用 **Tab** 缩进（`useTabs: true`）
- Tab 宽度：4
- 行尾：`lf`
- 分号：`true`
- 尾随逗号：`es5`
- `printWidth: Infinity`（不自动换行）
- 箭头函数参数：省略括号（`arrowParens: "avoid"`）

### ESLint 配置

配置位于根目录 `eslint.config.js`，采用 ESLint 9 Flat Config：

- 使用 `@eslint/js` + `typescript-eslint` + `eslint-plugin-vue`
- `vue-eslint-parser` 处理 Vue 单文件组件
- 全局变量包含 `browser`、`es2015`、`node`、`worker`、`serviceWorker`
- 忽略路径：`dist/`、`output/`、`node_modules/`
- 关闭了较多严格规则以兼容大量历史代码：
  - `@typescript-eslint/no-explicit-any: 0`
  - `@typescript-eslint/no-unused-vars: 0`
  - `no-undef: 0`
  - `prefer-const: 0`
  - `no-console: 0`
- 允许空 catch（`allowEmptyCatch: true`）
- `ts-ignore` 和 `ts-nocheck` 允许使用（`@typescript-eslint/ban-ts-comment` 设为允许）

### TypeScript 配置

根目录 `tsconfig.json`：

- `target: ESNext`，`module: ESNext`，`moduleResolution: Bundler`
- `strict: true`，但 `noImplicitAny: false`
- `allowSyntheticDefaultImports` 和 `esModuleInterop` 启用
- 排除 `dist`、`output`、`node_modules`

### 提交前检查

提交前应当运行：

```bash
pnpm lint
```

如果没有任何输出，说明检查通过，可以提交。

---

## 代码组织与架构

### 动态导入与模式加载

游戏模式、武将包、卡包和扩展均通过动态 `import()` 加载：

```javascript
// 模式
await import("/mode/identity.js");

// 现代模式（目录形式）
await import("/mode/guozhan/index.js");

// 武将包
await import("/character/standard/skill.js");
```

导入后通过 `game.import(type, content)` 注册到 `lib.imported`。

### 路径别名

Vite 配置中定义了：
- `@` -> `/noname`
- `noname` -> `/noname.js`

### 技能代码形式

项目支持三种技能内容写法，**最终都通过 `ArrayCompiler` 执行**：

| 写法 | 编译路径 | 说明 |
|------|----------|------|
| **Step Content** | `StepCompiler` 解析 `"step 0"` 拆成函数数组 → `ArrayCompiler` | 旧代码大量存在 |
| **Async Content** | `AsyncCompiler` 包装为单元素数组 → `ArrayCompiler` | **推荐写法** |
| **Array Content** | 直接进入 `ArrayCompiler` | v1.10.15 后作为统一底层 |

示例：
```javascript
// 旧式
content: function () {
    "step 0"
    player.draw(2);
    "step 1"
    player.chooseToDiscard(2, true);
}

// 新式（推荐）
async content(event, trigger, player) {
    await player.draw(2);
    await player.chooseToDiscard(2, true);
}
```

**Step 转 Async 的核心规则：**
- `event.finish()` → `return;`
- `event.goto(n)` / `event.redo()` → `if/while/for/break/continue`
- 跨 step 的 `result` → `const result = await xxx.forResult()`
- 跨 step 的 `event.xxx` → 优先用局部变量

**Step 转 Async 的陷阱（不应 `await` 的调度型调用）：**

以下函数内部会创建事件，但会将其从当前 `next` 队列移除并挂到 `after` 或父级队列中，因此**只调用不等待**：

```javascript
// ❌ 错误：await player.showCharacter(0);
player.showCharacter(0);            // 亮将事件被挂到 after

// ❌ 错误：await player.insertPhase();
player.insertPhase();               // 额外回合被插到 phaseLoop 队列

// ❌ 错误：await event.insertAfter(content, { player });
event.insertAfter(content, { player }); // 事件被挂到当前事件的 after

// ❌ 错误：await player.changeZhuanhuanji("skillName");
player.changeZhuanhuanji("skillName"); // 转换技变更事件被挂到 after

// ❌ 错误：await player.logSkill("skillName", targets);
player.logSkill("skillName", targets); // 日志事件被挂到 after
```

识别模式：如果代码中有 `event.next.remove(next)` 后将 `next` push 到 `trigger.after` / `evt.after` / 父事件 `next` 等，则该事件属于调度型，不应 `await`。

**联机模式下的 for 循环陷阱：**

在联机 OL 事件（如 `replaceHandcardsOL`）中，以下写法会导致排在 `game.me` 后面的在线玩家收不到 `send` 指令：

```javascript
// ❌ 错误：await 阻塞了后续玩家的 send
for (const current of event.players) {
    if (current.isOnline()) {
        current.send(send);
        current.wait(sendback);
    } else if (current == game.me) {
        const next = game.me.chooseBool("...");
        const result = await next.forResult();  // ⚠️ 阻塞循环！
        game.me.unwait(result);
    }
}
```

正确写法（参考 `chooseCardOL`、`replaceHandcardsOL`）：

```javascript
// ✅ 正确：先向远程玩家 send，再 await 本地 game.me（房主也在线时不可对 game.me 走 send）
while (true) {
    delete event.resultOL;
    for (const current of event.activePlayers) {
        if (current.isOnline() && current != game.me) {
            current.send(send);
            current.wait(sendback);
        }
    }
    for (const current of event.activePlayers) {
        if (current == game.me) {
            const next = game.me.chooseBool("...");
            game.me.wait(sendback);
            const result = await next.forResult();
            game.me.unwait(result);
        }
    }
    if (withol && !event.resultOL) await game.pause();
    // ...
}
```

联机手气卡配置读取：房间配置写入 `lib.configOL` 时会去掉 `connect_` 前缀，应使用 `game.getOLChangeCard()`（即 `lib.configOL.change_card`，并兼容 `connect_change_card`）。各模式开局请调用 `game.replaceHandcardsAuto(players)`，不要重复判断配置。

**联机自由选将（`connectFreeChoose`）：**

自由选将逻辑已抽到 `noname/game/connectFreeChoose.js`，并通过 `game` 对象对外暴露（`game.isFreeChooseEnabled`、`game.setupFreeChoose` 等）。修改联机选将或防作弊校验时，优先改该模块，避免在各模式重复实现 `ui.cheat2` 与校验代码。

| 配置项 | 作用域 | 说明 |
|--------|--------|------|
| `free_choose` | 单机 + 联机 | 按模式保存在 `lib.config`；联机房间内也会同步到 `lib.configOL.free_choose` |
| `connect_free_choose` | 联机房间 | 身份局、国战、对抗、斗地主、单挑等模式的房间项；`onclick` 写入 `lib.configOL.free_choose` |

`game.isFreeChooseEnabled()`：联机时读 `lib.configOL.free_choose === true`（默认关闭），单机时读 `get.config("free_choose")`。

核心 API（均在 `game` 上）：

| 方法 | 用途 |
|------|------|
| `setupFreeChoose(event, options?)` / `teardownFreeChoose()` | 在选将 `dialog` 上挂载/移除「自由选将」控件（`ui.cheat2`），切换到全将池 `characterDialog` |
| `setOLChoicePool(playerid, list)` / `getOLChoicePool(playerid)` | 主机记录每名玩家的随机候选框；客机提交选将时用于校验 |
| `validateOLCharacterLinks` / `sanitizeOLCharacterResult` | 校验联机提交的 `result.links` 是否在合法池内 |
| `initPlayerFromOLResult(player, result, options?)` | 校验通过后调用 `player.init`；非法且存在随机池时回退为池中随机一名 |
| `getOLCharacterPool(extraFilter?)` | 联机合法全将池（自由选将开启时使用） |

接入方式：

1. **通用 `chooseControl` 选将**（`library/element/content.ts` 内 `chooseControl` 步骤）：单机且 dialog 为武将选择时，若 `game.isFreeChooseEnabled()` 则自动 `setupFreeChoose`，步骤结束 `teardownFreeChoose`。
2. **模式 OL 流程**（`chooseButtonOL` 等）：主机在分发候选前调用 `game.setOLChoicePool(playerid, sublist)`；回调内用 `game.initPlayerFromOLResult(player, result)` 替代直接 `player.init(...)`。已接入：身份局、国战、对抗、斗地主、单挑等。
3. **模式内自建自由选将 UI**：设置 `event.onfree` / `next.set("onfree", true)`，并调用 `game.setupFreeChoose`；流程结束时调用 `game.teardownFreeChoose()`（参考 `single.js` 无限火力）。

校验规则简述：自由选将开启时，提交的武将须在 `getOLCharacterPool()` 内（含 `characterReplace` 别名）；关闭时须在 `setOLChoicePool` 记录的随机候选内。修改新模式联机选将时，应同时处理上述记录与校验，否则客机可提交池外武将。

**Fork 定制功能**（房间配置、联机自由选将、`content.ts` 改动、部署）：详见 `docs/fork-features.md`。

技能定义参考：`docs/lib-skill-format.md`
异步写法参考：`docs/async-guide.md`
Step 转 Async 完整指南：`docs/step-to-async-guide.md`
启动与事件流程参考：`docs/game-startup-flow.md`、`docs/game-event-flow.md`

---

## 测试策略

**本项目没有传统的单元测试或集成测试套件。** 质量保障主要依赖：

1. **ESLint 静态检查** —— `pnpm lint`
2. **手动游戏测试** —— 在浏览器/Electron 中实际运行对局验证逻辑
3. **生成测试包** —— `pnpm generateTestPack` 用于生成含完整素材的离线测试包

修改核心事件系统、技能编译器、或大量武将技能后，应在本地启动游戏进行实际对局测试。

---

## CI/CD 与自动化

仓库配置了 GitHub Actions，工作流文件位于 `.github/workflows/`：

| 工作流 | 触发条件 | 作用 |
|--------|----------|------|
| `build.yml` | `main` 分支 push | 构建项目并将 `dist/` 强制推送到 `build-output` 分支 |
| `lint-check.yml` | 向 `main` 分支提 PR | 对变更的包运行 ESLint 检查（monorepo 感知，仅 lint 受影响包） |
| `nightly-publish.yml` | 每日定时（21:11 UTC）+ 手动触发 | 构建并生成测试包，作为 Artifacts 上传（保留 7 天） |
| `close-stale-issues.yml` | 每日定时（11:49 UTC） | 自动关闭标注 `needs more info` 且 60 天无活动的 Issue |

- CI 使用 **pnpm 10** 和 **Node.js 25**
- `lint-check.yml` 使用 `pnpm --filter "...[${{ github.base_ref }}]" --filter "!./" lint` 实现仅对变更包做 lint

### 部署脚本

根目录 `deploy.sh` 用于自托管服务器一键部署：
1. 检查 Node.js（>= 20）、pnpm、PM2 环境
2. 执行 `pnpm install`
3. 执行 `pnpm build`（若 `dist/` 已存在则跳过）
4. 构建 `@noname/fs` 和 `@noname/server`
5. 通过 PM2 启动/重启服务

---

## 部署说明

### 静态部署

```bash
pnpm build
pnpm serve
```

`dist/` 目录可直接作为静态资源部署到任意 Web 服务器或 CDN。

### 完整部署（含联机）

1. 启动静态文件服务：`pnpm serve`（或 `@noname/fs`）
2. 启动联机服务器：`pnpm -F @noname/server dev`
3. 使用 Nginx 反向代理（参考项目根目录 `noname.nginx.conf`）

项目根目录还提供了宝塔面板配置示例：`nginx-jump-server-baota.conf`

### PM2 生产部署

根目录 `ecosystem.config.cjs` 已配置好两个进程：
- `noname-static` —— 静态文件服务（`packages/fs/dist/entry.cjs`，端口 8089）
- `noname-websocket` —— 联机服务（`packages/server/dist/index.cjs`，端口 8082）

配置细节：
- `cwd` 锁定为项目根目录（`__dirname`）
- 内存上限 1GB，启用自动重启与日志轮转
- 日志输出到 `logs/noname-static-*.log` 和 `logs/noname-websocket-*.log`

先执行构建：
```bash
pnpm build
pnpm -F @noname/fs build
pnpm -F @noname/server build
```

然后启动：
```bash
pm2 start ecosystem.config.cjs
```

---

## 安全与沙箱

- 扩展代码运行在沙箱 Realm 中（`noname/init/security.ts` 相关逻辑），除非处于调试模式或使用 Safari
- `@noname/fs` 限制所有文件操作必须在配置的 `dirname` 目录内，`ensureSafe` 通过 `path.normalize` + 前缀校验防止路径遍历
- 项目使用 GPL-3.0-only 协议，二次分发需保留代码出处

---

## 给 AI 助手的特别提醒

1. **不要假设有测试文件**：修改后请通过 `pnpm lint` 检查语法，并建议在本地 `pnpm dev` 启动游戏进行实际验证。
2. **保持代码风格一致**：使用 Tab 缩进，遵循现有文件中的代码风格。项目历史代码中存在大量旧式写法，新代码优先使用 Async Content。
3. **理解事件系统**：几乎所有游戏逻辑都基于 `GameEvent` 和 `game.createEvent()`。修改技能、卡牌或模式时，务必理解事件生命周期（Before / Begin / End / After）和 `await` 语义。
4. **多平台兼容性**：代码需要同时运行在浏览器、Electron 和 Android WebView 中，避免使用平台专属的 API。
5. **扩展机制**：新增武将或技能通常应当作为扩展或在现有 `character/` 包下进行，避免直接修改核心引擎除非必要。
6. **中文为主**：项目注释、文档、用户界面文本均以中文为主。涉及武将名、技能名、卡牌名时请使用游戏内的标准中文术语。
7. **构建产物无哈希**：核心构建使用 `preserveModules: true` 且文件名不含内容哈希，因为游戏通过固定路径动态加载模块。
8. **现代包 vs 旧包**：修改 `character/` 或 `mode/` 下的代码时，注意区分已现代化的目录结构包（有 `index.ts`，在 `moderned_characters` / `moderned_modes` 列表中）和传统的单文件包，它们的构建处理方式不同。
9. **文件编码与缩进陷阱**：大量历史 `.js` 使用 **Tab 缩进** 和 **CRLF 换行**（`\r\n`），如 `library/index.js`；新迁移的 `content.ts` 等文件可能为 LF。替换前确认目标文件的实际换行与缩进，避免匹配失败。
10. **联机自由选将**：联机选将结果须经 `game.initPlayerFromOLResult` 与 `game.setOLChoicePool` 配合校验；UI 与全将池逻辑见 `noname/game/connectFreeChoose.js`，勿在模式里复制一套 `ui.cheat2`。
11. **内置事件内容在 `content.ts`**：手气卡（`replaceHandcards` / `replaceHandcardsOL`）、`gameStart` 清理、`chooseControl` 自由选将钩子等 Fork 改动均在此文件；合并上游后应用 `git diff` 或搜索 `getOLChangeCard`、`setupFreeChoose`、`roomConfigButton` 确认未丢失。
12. **与上游合并**：存在 `upstream` 远程时定期 `git fetch upstream && git merge upstream/main`；若 GitHub 网页提示冲突而本地 merge 成功，以本地三方合并结果为准，合并后务必 `pnpm build` 并手测联机相关功能。
13. **调试日志**：**禁止** ingest HTTP；用 `.cursor/debug.log` 或 `console.debug('[agent-debug]', …)`。改 `mode/*.js` 后执行 **`pnpm build`** 即可同步到 `dist`（勿手抄 `cp`）。详见 `docs/agent-debugging.md`。

---

## 关键文档索引

| 文档 | 内容 |
|------|------|
| `docs/fork-features.md` | **Fork 定制**：联机自由选将、房间配置、`content.ts` 改动、上游合并 |
| `docs/agent-debugging.md` | **Agent 调试**：禁止 ingest HTTP、文件日志、dist 同步、埋点清理 |
| `docs/how-to-start.md` | 环境搭建与启动指南 |
| `docs/game-startup-flow.md` | 游戏从启动到进行时的完整流程 |
| `docs/game-event-flow.md` | GameEvent 事件系统详解（含 `content.ts` 内置事件表） |
| `docs/async-guide.md` | Async Content 技能写法介绍 |
| `docs/step-to-async-guide.md` | Step Content 转 Async Content 指南 |
| `docs/lib-skill-format.md` | lib.skill 技能格式速查 |
| `docs/skin-guide.md` | 皮肤制作指南 |
| `docs/audio-guide.md` | 音频规范 |
| `DEPLOYMENT.md` | 在线服务部署指南（含 Docker、Nginx、PM2、HTTPS） |
| `deploy.sh` | Fork：一键部署脚本（依赖检查、build、PM2 启动） |
