# Fork 定制功能说明

本仓库（`Jeff114514/noname`）在 [libnoname/noname](https://github.com/libnoname/noname) 基础上增加了联机房间配置、联机自由选将、部署脚本及部分模式/内容层修复。修改联机、选将、房间配置、部署或合并上游时**优先阅读本文**；引擎架构与通用开发约定见 [`../AGENTS.md`](../AGENTS.md)。

---

## 与上游同步

| 远程 | 用途 |
|------|------|
| `origin` | 本 Fork（推送目标） |
| `upstream` | 官方仓库（拉取合并） |

```bash
git fetch upstream main
git merge upstream/main
pnpm build   # 在 noname 仓库根目录执行
```

- 上游 **#3838** 已将内置事件实现从 `content.js` 迁移为 **`content.ts`**。合并时 Git 通常按重命名自动合并；Fork 曾在 `content.js` 中的改动应落在 `content.ts` 内。
- 合并后全文搜索确认未丢失：`getOLChangeCard`、`setupFreeChoose`、`roomConfigButton`、`connectFreeChoose`、`refreshConnectNickname`。
- 合并后务必 **`pnpm build`**，并手测：联机建房、自由选将、应用房间配置、手气卡。

**调试约定**（详见 [`agent-debugging.md`](agent-debugging.md)）：勿用 `localhost:7430/ingest`；助手日志写 `.cursor/debug.log` 或 `console.debug('[agent-debug]')`；改 `mode/*.js` 后对比 `dist/mode/` 与源码是否一致。

---

## 构建与 `dist`（Fork 部署必知）

浏览器 / PM2 / Nginx 加载的是仓库根目录 **`dist/`**，不是 `apps/core/` 源码。

| 步骤 | 说明 |
|------|------|
| `pnpm -F noname build` | `apps/core/scripts/build.ts`：Vite 打 `noname.js` 等 + `syncSourceMirror()` + 各包体 `syncStaticPackageFiles` |
| 根目录 `pnpm build` | `scripts/build.ts`：将 `apps/core/dist` 合并到 **`dist/`**，并复制 audio/image/extension 等 |

要点：

- **`mode/identity.js`、`mode/versus.js`** 等多为非 Rollup 入口，构建结束时从 **`apps/core/mode/`** 覆盖到 **`apps/core/dist/mode/`**，再随根 build 进入 **`dist/mode/`**。
- 改 **`noname/game/connectFreeChoose.js`**、**`content.ts`** 等打包入口：同样只需根目录 **`pnpm build`**，勿手抄 `cp`。
- 目录同步前会先 **`rmSync` 再 `cpSync`**（见 `syncStaticPackageFiles`），避免 `dist` 里残留旧子文件。

本地开发：`pnpm dev`（8080 + 8089）；验证生产产物：根目录 `pnpm build` 后 `pnpm serve` 或 `deploy.sh`。

---

## 联机自由选将（`connectFreeChoose`）

**模块：** `apps/core/noname/game/connectFreeChoose.js`（由 `noname/game/index.js` 挂到 `game`）

| 配置项 | 说明 |
|--------|------|
| `free_choose` | 单机 `lib.config`；联机同步到 `lib.configOL.free_choose` |
| `connect_free_choose` | 联机房间项（身份、国战、对抗、斗地主、单挑等），`onclick` 写入 `lib.configOL.free_choose` |

`game.isFreeChooseEnabled()`：联机为 `lib.configOL.free_choose === true`（默认关）；单机为 `get.config("free_choose")`。

| API | 用途 |
|-----|------|
| `setupFreeChoose` / `teardownFreeChoose` | 挂载/移除 `ui.cheat2`，切换全将池 `characterDialog` |
| `resetFreeChooseSelection` | 切换 dialog 时清空 `_buttonChoice` 等缓存 |
| `refreshFreeChooseDialogCheck` | `uncheck("button")` + `game.check()` 刷新按钮高亮 |
| `isOnFreeChooseDialog` | 判断是否处于自由选将 dialog |
| `setOLChoicePool` / `getOLChoicePool` | 主机记录每名玩家随机候选框 |
| `validateOLCharacterLinks` / `sanitizeOLCharacterResult` | 校验客机提交的武将 |
| `initPlayerFromOLResult` | 校验通过后 `player.init` |
| `getOLCharacterPool` | 自由选将开启时的合法全将池 |
| `installFreeChooseFilterButton` / `installFreeChooseButtonHandler` | 模式侧按钮与点击处理（如对抗） |

**接入方式：**

1. **通用选将** — `content.ts` 的 `chooseControl`：`setupFreeChoose` 在 `game.check()` 之前执行，步骤结束 `teardownFreeChoose`。
2. **模式 OL** — `chooseButtonOL` 等：主机 `setOLChoicePool`，回调用 `initPlayerFromOLResult`（身份、国战、对抗、斗地主、单挑等已接入）。
3. **模式自建 UI** — `event.onfree` + `setupFreeChoose`（参考 `mode/single.js`）。

**校验：** 自由选将开 → 武将须在 `getOLCharacterPool()` 内（含 `characterReplace`）；关 → 须在 `setOLChoicePool` 记录的候选内。勿在各模式复制 `ui.cheat2` 与校验代码。

### 已知问题与修复要点

| 问题 | 处理 |
|------|------|
| 点击「自由选将」报错 `_checked` on string `button` | 禁止 `game.check("button")`；使用 `game.uncheck("button")` 后 `game.check()`（见 `refreshFreeChooseDialogCheck`） |
| 2v2 联机武将全灰、一进界面就有确认 | `versus.js`：`chooseButton(true).set("selectButton", [1, 2])`；`broadcast` 同步 `_status.characterlist`；切换 dialog 时 `resetFreeChooseSelection` |
| 改源码不生效 | 根目录 `pnpm build`，强刷；核对 `dist/noname/game/connectFreeChoose.js` |

---

## 房间配置云端同步（`roomConfig`）

**模块：** `apps/core/noname/game/roomConfig.js`  
**桥接：** `lib["roomConfigBridge"]`（`game/index.js` 注册）  
**服务端：** `packages/server` 持久化 `dist/configs/shared.json`

| 能力 | 说明 |
|------|------|
| 保存/加载/删除 | `saveCloudConfig`、`getCloudConfigs`、`deleteCloudConfig` 等 |
| 应用到房间 | 写入 `lib.config`；联机中 `syncConfigOL` + `pushConfigOLToRoom` 同步 `lib.configOL` |
| UI | `library/index.js` 创建 `ui.roomConfigButton`；`content.ts` 的 `gameStart` 等清理该按钮 |
| 大厅昵称 | `refreshConnectNickname()`：应用配置后刷新联机大厅显示 |

`lib.configOL` 写入时会去掉 `connect_` 前缀；手气卡等用 **`game.getOLChangeCard()`**（兼容 `connect_change_card`）。模式开局调用 **`game.replaceHandcardsAuto(players)`**，勿重复判断配置。

### 联机昵称（Fork 修复）

- 展示与发送：`get.connectNickname()`（`noname/get/index.js`），过滤误存为武将 id 的旧配置。
- `library/index.js` 联机项：`connect_nickname` 勿绑错 `onclick`（曾误用 `connect_avatar`）；`init` 建议为「无名玩家」。
- 菜单（`ui/create/menu/`）：仅昵称有改动时再 `saveConfig`；`optionsMenu` / `startMenu` 等对 `init === undefined` 勿误保存。
- 应用云端房间配置后调用 **`game.roomConfig.refreshConnectNickname()`**。

---

## `content.ts` 中的 Fork 改动

路径：`apps/core/noname/library/element/content.ts`（`element/index.js` 导出 `Content`）。**只改 `.ts`，勿恢复 `content.js`。**

| 函数/流程 | 改动要点 |
|-----------|----------|
| `gameDraw` 相关 | 联机 `change_card` 用 `game.getOLChangeCard()`；联机手气卡 UI 走 `replaceHandcardsOL` |
| `replaceHandcards` / `replaceHandcardsOL` | 联机多轮、`activePlayers`；**先**对在线他人 `send`，**再** `await` 本地 `game.me`（见 `step-to-async-guide.md`） |
| `gameStart` | 清理 `ui.roomConfigButton` |
| `chooseControl` | `setupFreeChoose` / `teardownFreeChoose`；与 `resetFreeChooseSelection`、 `game.check()` 顺序正确 |
| `showCards` / 牌堆顶 | 联机 broadcast 用 `pileTop` 等参数，避免沙盒里裸写 `top` → `window.top` |

---

## 身份局：新手教程（`mode/identity.js`）

首次进入且 `lib.config.new_tutorial` 未设置时，会询问是否进入新手向导。

| 用户操作 | 预期行为（Fork） |
|----------|------------------|
| **跳过向导** | 清除 `directstart`、`show_splash_off` 后 **`location.reload()`**，回到启动 **splash 模式选择**（身份/国战/对决等） |
| **继续并完成教程** | 仍进入原身份局开局流程（`chooseCharacter` 等） |

注意：

- 勿用 **`game.reload()`** 实现跳过（会写入 `show_splash_off`，下次不再显示 splash）。
- 勿仅用 **`ui.click.configMenu()`**（易变成空界面，不是模式选择页）。
- 跳过前已 `saveConfig("new_tutorial", true)`，再次进身份局不再弹教程（可能仍显示更新日志）。

---

## 联机技能与 `broadcast`（维护规范）

适用于 Fork 上修过的技能及后续新增联机逻辑：

- `game.broadcast` / `broadcastAll` 的函数体**不能引用闭包**；参数须可被 `get.stringifiedResult` 序列化。
- **不要** `broadcastAll` 传入完整 **`GameEvent`**；改传 `player`、牌名、花色、`type2` 字符串等（参考 `jianying_mark`）。
- **`game.online === true`（客机）** 时 `broadcastAll` 直接 return，仅房主执行并下发。
- `game.getAllGlobalHistory("useCard")` + **`history.indexOf(event)`** 在联机常失败 → 用栈顶/前一项并判断 **`evt?.card`**；`logAudio` 须防空。  
  **示例：** 书张芝 `mb_zhangzhi` / `mbshiju`（`character/mobile/skill.js`）已改为 `getMbshijuPreviousUseCard` + `updateMbshijuRecord`。

---

## 部署

| 文件 | 说明 |
|------|------|
| `deploy.sh` | 在仓库根执行：检查 Node/pnpm/PM2 → `pnpm install` → **始终** `pnpm build` → 构建 fs/server → PM2 启停 |
| `DEPLOYMENT.md` | Docker、Nginx、HTTPS 等 |
| `ecosystem.config.cjs` | PM2：`noname-static`（8089）、`noname-websocket`（8082） |
| `noname.nginx.conf`（父目录可选） | 反向代理示例 |

```bash
cd /path/to/noname
bash deploy.sh
# 或手动：
pnpm build && pnpm -F @noname/fs build && pnpm -F @noname/server build
pm2 start ecosystem.config.cjs
```

静态资源根目录指向 **`dist/`**（或经 `@noname/fs` 提供同一目录）。

---

## 故障速查（Fork 相关）

| 现象 | 优先检查 |
|------|----------|
| 自由选将一点就报错 | `game.check()` 而非 `game.check("button")`；`dist/noname/game/connectFreeChoose.js` |
| 改 `versus.js` / `identity.js` 无效 | 根目录 `pnpm build`；`dist/mode/` 与 `apps/core/mode/` 是否一致 |
| 联机某武将每行动一步报错 | 技能 `broadcastAll` 是否传 Event；`getAllGlobalHistory` + `indexOf` |
| 保存配置后昵称变 id | `get.connectNickname`、`roomConfig.refreshConnectNickname`、菜单保存逻辑 |
| 跳过教程进人机或空界面 | `identity.js` 跳过分支是否 reload splash |
| 部署后仍是旧逻辑 | `deploy.sh` 是否完整 build；PM2 restart；浏览器强刷 |

---

## 相关文档

| 文档 | 内容 |
|------|------|
| [`../AGENTS.md`](../AGENTS.md) | 全项目架构、GameEvent、命令、AI 维护清单 |
| [`agent-debugging.md`](agent-debugging.md) | 调试日志、dist 同步、埋点清理 |
| [`step-to-async-guide.md`](step-to-async-guide.md) | 联机 `send` / `await` 顺序 |
| [`DEPLOYMENT.md`](../DEPLOYMENT.md) | 完整部署说明 |
