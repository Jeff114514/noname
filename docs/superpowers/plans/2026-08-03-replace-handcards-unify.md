# 手气卡统一到独立事件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 开局手气卡只走 `replaceHandcards` / `replaceHandcardsOL`，去掉 `gameDraw` 内联 UI，统一多轮次数语义，并支持「自定义」次数。

**Architecture:** `replaceHandcardsAuto` 用 `getChangeCardRemaining()` 归一配置后创建事件；`content.ts` 内 `swapStartHand` 供单机/联机共用；菜单增加 `custom` + `change_card_num` / `connect_change_card_num`。

**Tech Stack:** TypeScript/JavaScript（`content.ts`、`game/index.js`）、无名杀事件系统、pnpm build。项目无传统单测套件；纯函数用 `node --input-type=module -e` 断言，其余靠 lint/build + 手测。

**Spec:** `docs/superpowers/specs/2026-08-03-replace-handcards-unify-design.md`

---

## File Structure

| 文件 | 职责 |
|------|------|
| `apps/core/noname/game/changeCardConfig.js`（新建） | 纯函数：配置 → `remaining`；无 DOM/游戏状态依赖，便于 node 断言 |
| `apps/core/noname/game/index.js` | 挂载 `getChangeCardRemaining` / 改写 `getOLChangeCard` / `replaceHandcards` / `replaceHandcardsAuto` |
| `apps/core/noname/library/element/content.ts` | 删除 `gameDraw` 手气卡；实现 `swapStartHand`；重写单机/联机多轮 |
| `apps/core/noname/library/index.js` | 各模式 `change_card`/`connect_change_card` 增加 `custom`；新增次数 input；`update` 显隐 |
| `apps/core/noname/game/roomConfig.js` | knownKeys 纳入 `connect_change_card_num` |
| `apps/core/mode/versus.js` | 残留手写改为 `replaceHandcardsAuto` |
| `docs/fork-features.md`、`AGENTS.md` | 文档同步 |

---

### Task 1: 纯函数 `normalizeChangeCardRemaining`

**Files:**
- Create: `apps/core/noname/game/changeCardConfig.js`

- [ ] **Step 1: 写模块（含可测纯函数）**

```javascript
/**
 * 将手气卡配置归一为剩余次数。
 * @param {unknown} changeCard `disabled`|`once`|`twice`|`unlimited`|`custom`|number|string
 * @param {unknown} customNum `change_card_num` 旁路值
 * @returns {number} `0` | 正整数 | `Infinity`
 */
export function normalizeChangeCardRemaining(changeCard, customNum) {
	if (changeCard === false || changeCard == null || changeCard === "disabled") {
		return 0;
	}
	if (changeCard === "once") {
		return 1;
	}
	if (changeCard === "twice") {
		return 2;
	}
	if (changeCard === "unlimited" || changeCard === -1 || changeCard === "-1") {
		return Infinity;
	}
	if (changeCard === "custom") {
		const n = typeof customNum === "number" ? customNum : Number(customNum);
		if (!Number.isFinite(n) || n <= 0) {
			return 0;
		}
		return Math.floor(n);
	}
	const n = typeof changeCard === "number" ? changeCard : Number(changeCard);
	if (!Number.isFinite(n) || n <= 0) {
		return 0;
	}
	return Math.floor(n);
}
```

- [ ] **Step 2: 用 node 断言覆盖规格表**

Run:

```bash
node --input-type=module -e "import { normalizeChangeCardRemaining as n } from './apps/core/noname/game/changeCardConfig.js'; const eq=(a,b,m)=>{if(a!==b){throw new Error(m+': '+a+'!=='+b)}}; eq(n('disabled'),0,'dis'); eq(n(false),0,'f'); eq(n(null),0,'null'); eq(n('once'),1,'once'); eq(n('twice'),2,'twice'); eq(n('unlimited'),Infinity,'unl'); eq(n(-1),Infinity,'-1'); eq(n('custom',5),5,'c5'); eq(n('custom',0),0,'c0'); eq(n('custom','x'),0,'cx'); eq(n('3'),3,'s3'); eq(n(4),4,'4'); console.log('ok')"
```

Expected: 打印 `ok`，exit 0。

- [ ] **Step 3: Commit**

```bash
git add apps/core/noname/game/changeCardConfig.js
git commit -m "feat: add normalizeChangeCardRemaining helper"
```

---

### Task 2: 挂到 `game` 并改写 Auto / getOLChangeCard

**Files:**
- Modify: `apps/core/noname/game/index.js`（imports 顶部 + 约 1790–1832 行）

- [ ] **Step 1: 在文件顶部 import 附近增加**

```javascript
import { normalizeChangeCardRemaining } from "./changeCardConfig.js";
```

（与现有 `./roomConfig.js`、`./connectFreeChoose.js` 同级。）

- [ ] **Step 2: 替换 `getOLChangeCard` / `replaceHandcards` / `replaceHandcardsAuto` 为**

```javascript
getChangeCardRemaining() {
	if (_status.connectMode && lib.configOL) {
		const changeCard = lib.configOL.change_card || lib.configOL.connect_change_card;
		const customNum = lib.configOL.change_card_num ?? lib.configOL.connect_change_card_num;
		return normalizeChangeCardRemaining(changeCard, customNum);
	}
	return normalizeChangeCardRemaining(get.config("change_card"), get.config("change_card_num"));
}
getOLChangeCard() {
	if (!_status.connectMode || !lib.configOL) {
		return null;
	}
	if (game.getChangeCardRemaining() === 0) {
		return null;
	}
	return lib.configOL.change_card || lib.configOL.connect_change_card || null;
}
replaceHandcards(...args) {
	var next = game.createEvent("replaceHandcards");
	if (Array.isArray(args[0])) {
		next.players = args[0];
	} else {
		next.players = [];
		for (var i = 0; i < args.length; i++) {
			// @ts-expect-error ignore
			if (get.itemtype(args[i]) == "player") {
				next.players.push(args[i]);
			}
		}
	}
	next.changeCardRemaining = game.getChangeCardRemaining();
	if (_status.connectMode) {
		next.changeCard = game.getOLChangeCard();
		next.setContent("replaceHandcardsOL");
	} else {
		next.setContent("replaceHandcards");
	}
}
/**
 * @param {Player[]} players
 */
replaceHandcardsAuto(players) {
	if (game.getChangeCardRemaining() === 0) {
		return;
	}
	game.replaceHandcards(players);
}
```

- [ ] **Step 3: 确认无其它调用依赖「`getOLChangeCard` 返回 once/twice 字符串做状态机」**

Search: `getOLChangeCard` / `event.changeCard`  
若 `content.ts` 仍用 `event.changeCard == "once"` 状态机，Task 3/4 会改为读 `event.changeCardRemaining`；本任务只保证 Auto 用 remaining。

- [ ] **Step 4: Commit**

```bash
git add apps/core/noname/game/index.js
git commit -m "feat: wire getChangeCardRemaining into replaceHandcardsAuto"
```

---

### Task 3: `content.ts` — `swapStartHand` + 删 `gameDraw` 手气卡 + 重写单机/联机

**Files:**
- Modify: `apps/core/noname/library/element/content.ts`

- [ ] **Step 1: 在 `Content` 对象之前（或同文件顶部 import 区后）增加模块级函数**

```typescript
type ReplaceHandcardsEvent = {
	otherPile?: Record<string, { getCards?: (num: number) => Card[]; discard?: (card: Card) => void }>;
	gaintag?: Record<string, any>;
};

function swapStartHand(player: Player, event: ReplaceHandcardsEvent, { broadcast = false } = {}) {
	const hs = player.getCards("h");
	const cards: Card[] = [];
	const otherGetCards = event.otherPile?.[player.playerid]?.getCards;
	const otherDiscard = event.otherPile?.[player.playerid]?.discard;

	const loseHs = () => {
		game.addVideo("lose", player, [get.cardsInfo(hs), [], [], []]);
		for (const card of hs) {
			card.removeGaintag(true);
			if (otherDiscard) {
				otherDiscard(card);
			} else {
				card.discard(false);
			}
		}
	};

	if (broadcast) {
		game.broadcastAll(
			(p, hand, discardFn) => {
				game.addVideo("lose", p, [get.cardsInfo(hand), [], [], []]);
				for (const card of hand) {
					card.removeGaintag(true);
					if (discardFn) {
						discardFn(card);
					} else {
						card.discard(false);
					}
				}
			},
			player,
			hs,
			otherDiscard
		);
	} else {
		loseHs();
	}

	if (otherGetCards) {
		cards.addArray(otherGetCards(hs.length));
	} else {
		cards.addArray(get.cards(hs.length));
	}

	if (event.gaintag?.[player.playerid]) {
		const gaintag = event.gaintag[player.playerid];
		const list = typeof gaintag == "function" ? gaintag(hs.length, cards) : [[cards, gaintag]];
		if (broadcast) {
			game.broadcastAll(
				(p, gainList) => {
					for (let i = gainList.length - 1; i >= 0; i--) {
						p.directgain(gainList[i][0], null, gainList[i][1]);
					}
				},
				player,
				list
			);
		} else {
			for (let i = list.length - 1; i >= 0; i--) {
				player.directgain(list[i][0], null, list[i][1]);
			}
		}
	} else if (broadcast) {
		// directgain 在联机无 gaintag 时仍走玩家方法（与现 replaceHandcardsOL else 分支一致）
		player.directgain(cards);
	} else {
		player.directgain(cards);
	}
	player._start_cards = player.getCards("h");
}
```

（若类型报错，按文件现有风格放宽类型；行为必须与现三处拷贝一致。）

- [ ] **Step 2: 截断 `gameDraw` 手气卡**

在 `await Promise.all(waitings);` 之后，**删除**从 `event.changeCard = get.config("change_card");` 起直到函数结束前手气卡循环/dialog 关闭的全部代码；`gameDraw` 在 `await Promise.all(waitings)` 后直接结束（保留函数闭合）。

删除前确认：发牌循环末尾已设置 `player._start_cards`；不要误删发牌/`doubleDraw`/`waitings`。

- [ ] **Step 3: 重写 `replaceHandcards`（单机多轮）**

```typescript
async replaceHandcards(event, trigger, player) {
	let remaining = event.changeCardRemaining ?? 0;
	if (remaining === 0) {
		return;
	}
	if (!event.players.includes(game.me) || _status.auto || !game.me.countCards("h")) {
		return;
	}

	while (remaining !== 0) {
		const result = await game.me.chooseBool("是否使用手气卡？").forResult();
		if (!result?.bool) {
			break;
		}
		if (typeof game.changeCoin === "function") {
			game.changeCoin(-3);
		}
		swapStartHand(game.me, event, { broadcast: false });
		if (remaining !== Infinity) {
			remaining -= 1;
		}
	}
},
```

- [ ] **Step 4: 重写 `replaceHandcardsOL` 使用 remaining + `swapStartHand`**

保留现有 `choose` / `chooseRemote` / `chooseMe`；将轮次控制改为：

```typescript
async replaceHandcardsOL(event, trigger, player) {
	let remaining = event.changeCardRemaining ?? 0;
	if (remaining === 0) {
		return;
	}

	const chooseRemote = () => {
		game.me.chooseBool({ prompt: "是否使用手气卡？" });
		game.resume();
	};
	const chooseMe = () => {
		return game.me.chooseBool({ prompt: "是否使用手气卡？" });
	};
	const choose = (current: Player) => {
		return new Promise<boolean>(resolve => {
			if (current.isOnline()) {
				current.wait(result => resolve(!!result?.bool));
				current.send(chooseRemote);
				return;
			} else if (current === game.me) {
				const next = chooseMe();
				game.me.wait(result => resolve(!!result?.bool));
				next.forResult()
					.then(result => game.me.unwait(result))
					.catch(() => resolve(false));
			} else {
				resolve(false);
			}
		});
	};

	event.activePlayers = event.players.filter(p => p.countCards("h") > 0);

	while (remaining !== 0 && event.activePlayers.length) {
		const decisions = await Promise.all(
			event.activePlayers.map(async current => {
				try {
					return (await choose(current)) ? current : null;
				} catch {
					return null;
				}
			})
		);
		const accepted = decisions.filter((current): current is Player => !!current);

		for (const current of accepted) {
			swapStartHand(current, event, { broadcast: true });
		}

		event.activePlayers = accepted;
		if (remaining !== Infinity) {
			remaining -= 1;
		}
	}
},
```

注意：若现实现要求「先 send 非 me 再 await me」以避免 OL 循环陷阱，而 `Promise.all`+`choose` 内已对 online 先 `send`、对 me 再 `forResult`，保持该结构即可；**不要**在单个 for 里 `await` 阻塞后续 `send`。

- [ ] **Step 5: 全文搜索 `content.ts` 确认无残留 `是否使用手气卡` 在 `gameDraw`、无 `event.changeCard == "once"` 状态机**

- [ ] **Step 6: Commit**

```bash
git add apps/core/noname/library/element/content.ts
git commit -m "refactor: unify hand-card swap into replaceHandcards events"
```

---

### Task 4: 菜单 — `custom` + 次数 input + update 显隐

**Files:**
- Modify: `apps/core/noname/library/index.js`

- [ ] **Step 1: 定义可复用 item / 次数配置工厂（放在 `lib.mode` 赋值前附近，避免 15 处手写漂移）**

在 `mode = {` 之前（或 `lib` 类字段区合适位置）增加：

```javascript
const CHANGE_CARD_ITEMS = {
	disabled: "禁用",
	once: "一次",
	twice: "两次",
	unlimited: "无限",
	custom: "自定义",
};

function makeChangeCardConfig({ connect = false, frequent = false } = {}) {
	const key = connect ? "connect_change_card" : "change_card";
	const numKey = connect ? "connect_change_card_num" : "change_card_num";
	const cfg = {
		[key]: {
			name: "开启手气卡",
			init: "disabled",
			item: CHANGE_CARD_ITEMS,
			restart: true,
			...(frequent ? { frequent: true } : {}),
		},
		[numKey]: {
			name: "手气卡次数",
			init: 3,
			input: true,
			restart: true,
			...(frequent ? { frequent: true } : {}),
			onblur(e) {
				let text = e.target,
					num = Number(text.innerText);
				if (isNaN(num) || num < 1) {
					num = 1;
				} else if (!Number.isInteger(num)) {
					num = Math.round(num);
				}
				text.innerText = num;
				const mode = this?._link?.config?.mode || get.mode();
				game.saveConfig(numKey, num, mode);
				if (connect && _status.connectMode && lib.configOL) {
					lib.configOL.change_card_num = num;
				}
			},
		},
	};
	return cfg;
}
```

若该文件结构不便挂 `this._link`，`onblur` 可仿现有 `connect_choice_zhu`：硬编码模式名的版本在各模式内联，工厂只生成 `item` + 基础字段；**以能保存到正确 mode 为准**。

更稳妥的落地（推荐执行时采用）：

1. 全局把所有 `change_card` / `connect_change_card` 的 `item` 增加 `custom: "自定义"`
2. 在每个已有 `change_card` 旁增加 `change_card_num`（`input: true`, `init: 3`, `onblur` 校验 ≥1 并 `game.saveConfig("change_card_num", num, "<mode>")`）
3. 每个已有 `connect_change_card` 旁增加 `connect_change_card_num`（同上，联机 `onclick`/`onblur` 写 `lib.configOL.change_card_num`）
4. 每个模式已有 `update(config, map)` 的，追加：

```javascript
const changeKey = /* connect 分支用 connect_change_card，否则 change_card */;
const numKey = /* 对应 _num */;
if (map[numKey]) {
	if (config[changeKey] === "custom") {
		map[numKey].show();
	} else {
		map[numKey].hide();
	}
}
```

斗地主 online 已有 `map.connect_change_card.hide()`：同步 `map.connect_change_card_num?.hide()`。

- [ ] **Step 2: 统计**

Run: `rg -c "custom: \"自定义\"" apps/core/noname/library/index.js`  
Expected: 与 `change_card`/`connect_change_card` 条目数一致（约 15）。

Run: `rg "change_card_num|connect_change_card_num" apps/core/noname/library/index.js | measure`  
Expected: 每个 change_card 旁都有对应 num 配置。

- [ ] **Step 3: Commit**

```bash
git add apps/core/noname/library/index.js
git commit -m "feat: add custom change_card count menu options"
```

---

### Task 5: `roomConfig` + `versus.js`

**Files:**
- Modify: `apps/core/noname/game/roomConfig.js`（约 421 行 `knownKeys`）
- Modify: `apps/core/mode/versus.js`（约 450–571 行）

- [ ] **Step 1: knownKeys 增加**

```javascript
const knownKeys = [
	"connect_choose_timeout",
	"connect_observe",
	"connect_observe_handcard",
	"connect_mount_combine",
	"connect_change_card",
	"connect_change_card_num",
];
```

检查 `syncConfigOL` / `pushConfigOLToRoom` / 应用云端配置路径是否需显式拷贝 `change_card_num`；若去前缀逻辑已通用拷贝 mode 配置，则 knownKeys 足够把该键从 modeSpecific 提出或纳入同步——按现有 `connect_change_card` 同等待遇处理。

- [ ] **Step 2: versus.js 全部替换**

把所有：

```javascript
if (get.config("change_card") != "disabled") {
	game.replaceHandcards(game.players.slice(0));
}
```

改为：

```javascript
game.replaceHandcardsAuto(game.players.slice(0));
```

（共 8 处。）

- [ ] **Step 3: Commit**

```bash
git add apps/core/noname/game/roomConfig.js apps/core/mode/versus.js
git commit -m "fix: sync change_card_num and unify versus hand-card entry"
```

---

### Task 6: 文档

**Files:**
- Modify: `docs/fork-features.md`
- Modify: `AGENTS.md`（手气卡相关 bullet）

- [ ] **Step 1: 更新 fork-features 手气卡段落**

要点写入：

- 开局只调 `replaceHandcardsAuto`；`gameDraw` 不再内联手气卡
- 次数：`getChangeCardRemaining()`；菜单含 `custom` + `change_card_num` / `connect_change_card_num`
- 联机仍用 `replaceHandcardsOL`（并行询问、串行换牌、`broadcastAll`）

- [ ] **Step 2: 更新 AGENTS.md 中「联机手气卡配置读取」「手气卡 / 开局」表行**，与上一致；删除「gameDraw 内联」暗示。

- [ ] **Step 3: Commit**

```bash
git add docs/fork-features.md AGENTS.md
git commit -m "docs: update hand-card flow for unified replaceHandcards"
```

---

### Task 7: 构建与回归

**Files:** 无新文件

- [ ] **Step 1: 再跑纯函数断言（Task 1 命令）** — Expected: `ok`

- [ ] **Step 2: Lint 触及包**

```bash
pnpm -F noname lint
```

Expected: 无 error 输出（或仅既有无关 warning）。

- [ ] **Step 3: 构建**

```bash
pnpm build
```

Expected: exit 0。

- [ ] **Step 4: 手测清单（打勾记入 PR/回复）**

1. 单机身份：禁用 / 一次 / 两次 / 无限 / 自定义 5 — 次数对，**无二次弹窗**
2. 联机身份：同上；客机手牌同步
3. 对抗模式开局走 Auto，无报错
4. 斗地主「智斗/online」菜单隐藏手气卡且不弹
5. （可选）陈寿 / 烈袁绍袁术标记或专属堆

- [ ] **Step 5: 若有未提交构建产物策略** — 本仓库通常不提交 `dist/` 手改；只提交源码。确认 `git status` 干净或仅预期文件。

---

## Spec coverage（self-review）

| Spec 要求 | Task |
|-----------|------|
| `gameDraw` 只发牌 | Task 3 Step 2 |
| Auto 唯一入口 + remaining | Task 2 |
| `swapStartHand` 共享 | Task 3 Step 1 |
| 单机多轮 + 文案 | Task 3 Step 3 |
| 联机多轮并行/串行 | Task 3 Step 4 |
| 配置归一含 custom/数字 | Task 1–2 |
| 菜单 custom + num | Task 4 |
| 无运行时黑名单、菜单隐藏 | Task 4 斗地主 update |
| roomConfig 键 | Task 5 |
| versus Auto | Task 5 |
| 文档 | Task 6 |
| 构建/手测 | Task 7 |

无 TBD/占位实现步骤；函数名与 spec 一致：`getChangeCardRemaining`、`changeCardRemaining`、`swapStartHand`、`change_card_num`。
