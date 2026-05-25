# Fork 定制功能说明

本仓库（`Jeff114514/noname`）在 [libnoname/noname](https://github.com/libnoname/noname) 基础上增加了以下能力。修改联机、选将、房间配置或部署时优先阅读本文。

## 与上游同步

| 远程 | 用途 |
|------|------|
| `origin` | 本 Fork |
| `upstream` | 官方仓库 |

```bash
git fetch upstream main
git merge upstream/main
pnpm build
```

上游 #3838 已将内置事件实现从 `content.js` 迁移为 **`content.ts`**。合并时 Git 通常按文件重命名（相似度约 86%）自动合并；Fork 曾在 `content.js` 中的改动应落在 `content.ts` 内。合并后搜索 `getOLChangeCard`、`setupFreeChoose`、`roomConfigButton` 确认未丢失。

---

## 联机自由选将（`connectFreeChoose`）

**模块：** `apps/core/noname/game/connectFreeChoose.js`（经 `game/index.js` 挂到 `game`）

| 配置项 | 说明 |
|--------|------|
| `free_choose` | 单机 `lib.config`；联机同步到 `lib.configOL.free_choose` |
| `connect_free_choose` | 联机房间项，写入 `lib.configOL.free_choose` |

`game.isFreeChooseEnabled()`：联机读 `lib.configOL.free_choose === true`，单机读 `get.config("free_choose")`。

| API | 用途 |
|-----|------|
| `setupFreeChoose` / `teardownFreeChoose` | 挂载/移除 `ui.cheat2`，切换全将池 dialog |
| `setOLChoicePool` / `getOLChoicePool` | 主机记录每名玩家随机候选框 |
| `validateOLCharacterLinks` / `sanitizeOLCharacterResult` | 校验客机提交的武将 |
| `initPlayerFromOLResult` | 校验通过后 `player.init` |
| `getOLCharacterPool` | 自由选将开启时的合法全将池 |

**接入：**

1. **通用选将** — `content.ts` 的 `chooseControl`：满足条件时自动 `setupFreeChoose`，步骤结束 `teardownFreeChoose`。
2. **模式 OL** — `chooseButtonOL` 等：主机 `setOLChoicePool`，回调用 `initPlayerFromOLResult`（身份、国战、对抗、斗地主、单挑等已接入）。
3. **模式自建 UI** — `event.onfree` + `setupFreeChoose`（参考 `mode/single.js`）。

勿在各模式重复实现 `ui.cheat2` 与校验逻辑。

---

## 房间配置云端同步（`roomConfig`）

**模块：** `apps/core/noname/game/roomConfig.js`  
**桥接：** `lib["roomConfigBridge"]`（`game/index.js` 注册）  
**服务端：** `packages/server` 持久化 `dist/configs/shared.json`

| 能力 | 说明 |
|------|------|
| 保存/加载/删除 | `saveCloudConfig`、`getCloudConfigs`、`deleteCloudConfig` 等 |
| 应用到房间 | 写入 `lib.configOL` |
| UI | `library/index.js` 创建 `ui.roomConfigButton`；`content.ts` 的 `gameStart` 等流程清理该按钮 |

`lib.configOL` 写入时会去掉 `connect_` 前缀；手气卡等联机选项用 `game.getOLChangeCard()`（兼容 `connect_change_card`）。

---

## `content.ts` 中的 Fork 改动

文件路径：`apps/core/noname/library/element/content.ts`（由 `element/index.js` 导出 `Content`）。

| 函数/流程 | 改动要点 |
|-----------|----------|
| `gameDraw` 相关 | 联机 `change_card` 用 `game.getOLChangeCard()`；联机下手气卡 UI 交给 `replaceHandcardsOL` |
| `replaceHandcards` / `replaceHandcardsOL` | 联机多轮置换、`activePlayers`；远程玩家先 `send` 再处理本地 `game.me`（见 `step-to-async-guide.md`） |
| `gameStart` | 清理 `ui.roomConfigButton` |
| `chooseControl` | 自由选将 `setupFreeChoose` / `teardownFreeChoose` |

模式开局手气卡：调用 `game.replaceHandcardsAuto(players)`，勿在各模式重复判断配置。

---

## 部署

| 文件 | 说明 |
|------|------|
| `deploy.sh` | 一键检查环境、`pnpm build`、构建 fs/server、PM2 启动 |
| `DEPLOYMENT.md` | Docker、Nginx、HTTPS 等详细说明 |
| `ecosystem.config.cjs` | PM2：`noname-static`（8089）、`noname-websocket`（8082） |
