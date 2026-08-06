# Agent 调试与日志规范（Fork）

本文约定 **Cursor / AI 助手** 在本仓库排查问题时的日志方式，避免使用无效的 HTTP ingest，并减少「改了源码但 `dist` 未更新」类部署陷阱。

---

## 能否看到之前的 HTTP 调试日志？

**通常看不到。** 本次联机自由选将问题排查时：

- 埋点使用了 `fetch('http://localhost:7430/ingest/...')`（Cursor Debug 模式的 ingest 服务）。
- 预期落盘路径为工作区 `.cursor/debug-<sessionId>.log`（NDJSON）。
- **复现后该文件不存在或为空**，助手无法根据 ingest 做假设验证，最终依赖 **浏览器堆栈** + **对比 `apps/core/mode/versus.js` 与 `dist/mode/versus.js`** 定位。

结论：**不要依赖 ingest HTTP 作为证据链**；助手应使用下文「文件 / 控制台」方式，并在验证后删除临时埋点。

---

## 禁止事项

| 禁止 | 说明 |
|------|------|
| `fetch('http://localhost:7430/ingest/...')` | Cursor Debug ingest；环境未启动或浏览器跨域时静默失败，助手读不到 |
| 向联机 WebSocket / 游戏业务接口打调试包 | 污染对战、难清理 |
| 长期保留 `#region agent log` 埋点 | 验证通过后必须删除 |
| 只改 `apps/core/**` 不更新运行中的 `dist/**` | 生产/PM2 常加载 `noname/dist`，见下文 |

---

## 推荐做法

### 1. 助手侧：直接写工作区日志文件（首选）

- 路径：`{工作区根}/.cursor/debug.log` 或 `.cursor/debug-<简短标识>.log`
- 格式：**NDJSON**（每行一个 JSON 对象）
- 操作：助手使用编辑/终端 **追加一行**，复现前 **清空该文件**（勿删其他会话的 `debug-*.log`）
- 字段建议：`timestamp`、`location`、`message`、`hypothesisId`、`data`（勿含 token、密码、PII）

示例（shell，在仓库 `noname` 目录）：

```bash
node scripts/agent-debug-append.mjs '{"location":"versus.js:OL2","message":"button click","data":{"dialogFound":true}}'
```

助手用 **Read 工具** 读取同一文件分析。

### 2. 浏览器内临时埋点

游戏主体在浏览器运行，**无法** 在无后端的情况下把日志写到用户磁盘。

| 场景 | 做法 |
|------|------|
| 快速验证 | `console.debug('[agent-debug]', JSON.stringify({ location, message, data }))`；复现后用户筛选控制台或粘贴给助手 |
| 需 NDJSON 文件 | 用 Node 跑脚本/单测，或复现步骤中由助手根据堆栈 + 源码推断（勿再开 ingest） |
| Electron / 带 `lib.node.fs` | 仅当确认运行时存在 Node fs 时，才可临时 `appendFile`（极少用） |

可选封装：`noname/util/agentDebugLog.js` 的 `agentDebugLog()` — 浏览器内仅 `console.debug`，不发起网络请求。

### 3. 构建与 dist 同步

修改 `apps/core/mode/*.js`（如 `versus.js`）等**非 Rollup 入口**文件后：

1. 改源码（`apps/core/mode/`、`apps/core/noname/` 等）
2. 在仓库 `noname` 根目录执行 **`pnpm build`**
3. 构建会自动：
   - `apps/core`：`buildIndividual("mode")` 将 `mode/` 下非入口文件复制到 `apps/core/dist/mode/`（`viteStaticCopy` + 构建结束后的 `syncStaticPackageFiles` 覆盖同步）。**非 moderned 武将包**（如 `character/shiji/`）也在此同步；目录同步前会先 `rmSync` 再 `cpSync`，否则 Node 不会覆盖目标目录里已有文件。
   - 联机沙盒 `broadcast` 中勿用裸标识符 **`top`**（会解析为 `window.top`），牌堆顶请用 `event.top` 传参或 `showCards` 的 `.set("top", cards)`（由 `content.ts` 的 `pileTop` 参数处理）。
   - 根目录：`scripts/build.ts` 将 `apps/core/dist` 合并到 **`noname/dist/`**
4. **无需** 手动 `cp mode/versus.js` 到 dist；若 dist 仍像旧版，先完整跑一遍 `pnpm build` 再强制刷新浏览器

打包进 `noname.js` 的模块（如 `connectFreeChoose.js`、`content.ts`）由 Vite 编译，同样只需 `pnpm build`。

否则浏览器可能仍加载旧 `dist/mode/versus.js`（例如缺少 `closeDialog`、null 判断等修复）。

---

## 临时埋点代码规范

1. 用 `// #region agent log` / `// #endregion` 包裹，便于折叠与搜索删除。
2. 每条日志对应明确假设编号（`hypothesisId`）。
3. 验证通过或用户确认修复后：**删除全部 region**，勿留 `fetch` / 多余 `console.debug`。
4. 不要提交 `.cursor/debug*.log`（见 `.gitignore`）。

---

## 相关文件

| 文件 | 用途 |
|------|------|
| `scripts/agent-debug-append.mjs` | Node 追加 NDJSON 到 `.cursor/debug.log` |
| `apps/core/noname/util/agentDebugLog.js` | 浏览器内 `console.debug` 封装（无 HTTP） |
| `AGENTS.md` § 给 AI 助手的特别提醒 | 摘要条目 |
| `docs/fork-features.md` | Fork 总览中的链接 |

---

## 检查清单（修复联机/选将类 bug 后）

- [ ] 已删除所有 `#region agent log`
- [ ] 未残留 `localhost:7430` / `ingest/` 字符串
- [ ] `pnpm build` 后 dist 中行为与源码一致
- [ ] 手测：联机 + 相关房间配置（如自由选将）
