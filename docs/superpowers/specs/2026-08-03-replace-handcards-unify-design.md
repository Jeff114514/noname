# 手气卡统一到独立事件 — 设计规格

日期：2026-08-03  
状态：已确认（brainstorming）  
范围：正确性修复 + 结构整理；配置次数扩展为可自定义数值

## 背景与问题

当前 Fork 手气卡存在多条路径叠用：

1. `content.ts` 的 `gameDraw` 内联单机手气卡 UI（once/twice 状态机）
2. `replaceHandcards`（单机事件，仅询问一次）
3. `replaceHandcardsOL`（联机多轮，并行询问 + 串行换牌）
4. 模式侧 `game.replaceHandcardsAuto`（Fork 统一入口）与 `versus.js` 等残留手写判断

由此导致：

- 单机开局可能 **二次询问**（`gameDraw` 后再跑 `replaceHandcards`）
- 次数语义不一致（单机独立事件不支持多轮）
- 弃牌/摸牌/`otherPile`/`gaintag` 逻辑复制三份，后续易漂移
- 配置仅支持 `disabled` / `once` / `twice` / `unlimited`，无法设任意次数

## 目标

1. **单一权威路径**：开局手气卡只走 `replaceHandcards` / `replaceHandcardsOL`，由 `replaceHandcardsAuto` 统一创建
2. **`gameDraw` 只负责发牌**：删除内联手气卡 UI 与硬编码禁用分支
3. **单机/联机次数语义一致**，并支持自定义正整数次数
4. **抽取共享换牌**，保留 `otherPile` / `gaintag` 与联机 `broadcastAll` 行为
5. **例外只靠配置**：不在 Auto/`gameDraw` 写死模式黑名单（如斗地主 online 继续靠菜单隐藏配置项）

非目标：不改手气卡以外的摸牌规则；不重做房间配置云端协议（仅补齐新配置键同步）。

## 架构

```
模式 start
  → game.gameDraw(...)           // 仅发牌 + Begin 注入 otherPile/gaintag
  → game.replaceHandcardsAuto(players)
       ├─ 未开启 → no-op
       └─ 开启 → game.replaceHandcards(players)
            ├─ 单机 → Content.replaceHandcards（多轮）
            └─ 联机 → Content.replaceHandcardsOL（多轮）
                 └─ 共用 swapStartHand(player, event)
```

### 组件职责

| 组件 | 职责 |
|------|------|
| `gameDraw` | 开局发牌（`otherPile` / `gaintag` / `doubleDraw` / `_start_cards`）；**不**读 `change_card` 做置换、**不**弹手气卡 |
| `game.getChangeCardRemaining()`（新建） | 把单机/联机配置归一为剩余次数：`0` / 正整数 / `Infinity` |
| `game.getOLChangeCard()` | 保留为薄封装：联机且 `getChangeCardRemaining() !== 0` 时返回原始配置键值（供旧调用），否则 `null` |
| `game.replaceHandcardsAuto(players)` | 唯一开局入口；归一后为 `0` 则 return，否则创建事件并设置 `event.changeCardRemaining` |
| `game.replaceHandcards(...)` | 创建事件；联机挂 `replaceHandcardsOL`，单机挂 `replaceHandcards` |
| `swapStartHand(player, event)` | 共享：弃旧手牌 → 摸等量 → 应用 gaintag → 更新 `_start_cards`；联机弃牌/带标记获得须 `broadcastAll` |
| 菜单配置 | `change_card` / `connect_change_card` + 自定义次数旁路键 |

## 配置模型

### 菜单项

`change_card` / `connect_change_card` 的 `item`：

| 键 | 展示 |
|----|------|
| `disabled` | 禁用 |
| `once` | 一次 |
| `twice` | 两次 |
| `unlimited` | 无限 |
| `custom` | 自定义 |

选 `custom` 时显示次数控件，写入旁路配置：

- 单机：`change_card_num`（正整数）
- 联机房间：`connect_change_card_num`；同步到 `lib.configOL` 时去 `connect_` 前缀 → `change_card_num`

各模式 `update`：值为 `custom` 时显示次数控件，否则隐藏。斗地主 online 等继续 **隐藏** 整项手气卡配置（与现有 `map.connect_change_card.hide()` 一致），不在运行时黑名单禁用。

### 运行时归一

输入 → `remaining`：

| 配置 | 结果 |
|------|------|
| `disabled` / `false` / `null` / `undefined` / `0` / `"0"` | `0` |
| `once` | `1` |
| `twice` | `2` |
| `custom` | 读取 `change_card_num`（联机读 `lib.configOL.change_card_num` 等）；非正整数 → `0` |
| 正整数或数字字符串 `"3"` 等 | 该次数（兼容扩展存档） |
| `unlimited` / `-1` | `Infinity` |

「是否开启」：`remaining !== 0`。

每轮结束后：若有限次数则 `remaining -= 1`；到 `0` 结束循环；`Infinity` 不减，仅将本轮拒绝置换的玩家移出活跃集。

旧档仅含 `once`/`twice`/`unlimited`/`disabled` 无需迁移。

## 事件行为

### 单机 `replaceHandcards`

- 仅当 `game.me` ∈ `event.players`、有手牌、非 `_status.auto` 时询问
- 多轮：按 `remaining` 循环；拒绝则结束；接受则 `swapStartHand(game.me, event)`
- 保留与现 `gameDraw` 一致的可选 `game.changeCoin(-3)`（若存在 `game.changeCoin`）
- UI 使用 `chooseBool`，全路径（单机/联机）统一文案为「是否使用手气卡？」

### 联机 `replaceHandcardsOL`

- 保留 Fork 已验证模型：每轮对 `activePlayers` **并行** `choose`，再对接受方 **串行** `swapStartHand`（保证牌堆顺序）
- 遵守联机 OL 约定：先向 `current != game.me` 的在线玩家 `send`，再处理本地 `game.me`；聚合时按需 `pause`
- 弃牌路径必须 `broadcastAll`；带 `gaintag` 的获得同样 `broadcastAll`
- `activePlayers` 初始为 `event.players`；每轮结束后缩为接受集合

### `swapStartHand`

逻辑对齐现有三处拷贝：

1. `hs = player.getCards("h")`
2. 清除 gaintag；`otherPile[playerid].discard` 或 `card.discard(false)`
3. `otherPile[playerid].getCards(hs.length)` 或 `get.cards(hs.length)`
4. `event.gaintag[playerid]` 为函数/字符串/数组时按现约定 `directgain`
5. `player._start_cards = player.getCards("h")`（或等价格）

放置位置：优先 `content.ts` 内模块级函数，由 `replaceHandcards` / `replaceHandcardsOL` 调用；若需被技能复用再提升到 `game`。

## 模式与同步改动

1. 所有已调用 Auto 的模式保持 `gameDraw` + `replaceHandcardsAuto`
2. `versus.js` 中手写 `get.config("change_card") != "disabled"` + `replaceHandcards` 改为 `replaceHandcardsAuto`
3. 从 `gameDraw` 删除：`event.changeCard` 赋值、联机/斗地主硬编码、`是否使用手气卡？` 循环整段
4. `roomConfig`（及必要的 knownKeys / sync）：纳入 `change_card_num` / `connect_change_card_num`
5. 文档：`docs/fork-features.md`、`AGENTS.md` 手气卡相关句更新为「仅独立事件 + 自定义次数」

## 技能兼容

已双挂 `gameDrawBegin` + `replaceHandcardsBegin` 的技能（如陈寿 `otherPile`、烈袁绍袁术 `gaintag`）保持不变：

- 初始发牌仍靠 `gameDrawBegin`
- 置换轮次靠 `replaceHandcardsBegin` 注入同一事件字段

不要求技能改监听；实现后需手测这两类武将。

## 错误与边界

- `custom` 但次数缺失/非正：视为未开启（Auto no-op）
- 玩家手牌数为 0：不询问该玩家
- 联机中途掉线：按现 `choose` 失败路径视为拒绝（不置换）
- 无限次数：拒绝后移出活跃集，避免死循环；全员拒绝或活跃集空则结束

## 测试计划

手动回归（项目无单测套件）：

1. 单机身份：禁用 / 一次 / 两次 / 无限 / 自定义(如 5) — 次数正确、**无二次弹窗**
2. 联机身份：同上；多人并行询问、串行换牌、客机手牌可见同步
3. 国战、对抗、斗地主（非 online）冒烟；斗地主 online 菜单不选手气卡且不弹窗
4. 陈寿专属牌堆、烈袁绍袁术初始标记在置换后仍正确
5. 云端房间配置应用后，`custom` + 次数生效
6. `pnpm build` 通过

## 实现落点（供 writing-plans）

| 区域 | 路径 |
|------|------|
| 入口与归一 | `apps/core/noname/game/index.js` |
| 事件内容 | `apps/core/noname/library/element/content.ts` |
| 菜单项 | `apps/core/noname/library/index.js`（各模式 `change_card` / `connect_change_card`） |
| 房间同步 | `apps/core/noname/game/roomConfig.js` |
| 模式清理 | `apps/core/mode/versus.js` 等 |
| 文档 | `docs/fork-features.md`、`AGENTS.md` |

## 决议摘要

- 优化方向：正确性 + 重构（C）
- 权威路径：独立事件（方案 1）；`gameDraw` 不再内联手气卡
- 模式例外：仅配置/菜单显隐（B），无运行时黑名单
- UI：禁用 / 一次 / 两次 / 无限 / 自定义；自定义次数存 `change_card_num` / `connect_change_card_num`（A）
