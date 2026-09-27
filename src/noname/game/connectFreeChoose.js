import { game, get, lib, ui, _status } from "noname";

/**
 * 联机/单机下是否启用自由选将
 * @returns {boolean}
 */
export function isFreeChooseEnabled() {
	if (_status.connectMode) {
		return lib.configOL?.free_choose === true;
	}
	return get.config("free_choose") !== false;
}

/**
 * @param {string} link
 * @returns {string}
 */
export function normalizeCharacterLink(link) {
	if (link == null) {
		return "";
	}
	if (Array.isArray(link)) {
		link = link[2] ?? link[0];
	}
	return get.sourceCharacter(link) || link;
}

/**
 * 获取联机合法全将池
 * @param {((name: string) => boolean)=} extraFilter 返回 true 表示排除该武将
 * @returns {string[]}
 */
export function getOLCharacterPool(extraFilter) {
	/** @type {string[]} */
	let list;
	if (_status.characterlist?.length) {
		list = _status.characterlist.slice(0);
	} else {
		list = get.charactersOL(typeof extraFilter === "function" ? extraFilter : undefined);
	}
	if (typeof extraFilter === "function") {
		list = list.filter(name => !extraFilter(name));
	}
	return list;
}

/**
 * @param {GameEvent} event
 * @returns {boolean}
 */
export function isCharacterChooseDialog(event) {
	const dialog = event?.dialog;
	if (!dialog?.buttons?.length) {
		return false;
	}
	for (const button of dialog.buttons) {
		const link = button.link;
		if (typeof link === "string" && lib.character[link]) {
			return true;
		}
		if (typeof link === "string" && lib.characterReplace[link]) {
			return true;
		}
	}
	return false;
}

/**
 * @param {string} name
 * @param {Set<string>} poolSet
 * @param {string[]} pool
 * @returns {boolean}
 */
function isInOLPool(name, poolSet, pool) {
	if (!name) {
		return false;
	}
	const src = normalizeCharacterLink(name);
	if (poolSet.has(src) || poolSet.has(name)) {
		return true;
	}
	for (const p of pool) {
		if (lib.characterReplace[p]?.includes(name) || lib.characterReplace[p]?.includes(src)) {
			return true;
		}
		if (lib.characterReplace[src]?.includes(p)) {
			return true;
		}
	}
	return false;
}

/**
 * 记录某玩家在随机候选框中的武将列表（主机校验用）
 * @param {string} playerid
 * @param {string[]} list
 */
export function setOLChoicePool(playerid, list) {
	if (!game._olPlayerChoicePools) {
		game._olPlayerChoicePools = {};
	}
	game._olPlayerChoicePools[playerid] = list.slice(0);
}

/**
 * @param {string} playerid
 * @returns {string[] | undefined}
 */
export function getOLChoicePool(playerid) {
	return game._olPlayerChoicePools?.[playerid] || game._characterChoice?.[playerid];
}

/**
 * @param {Player} player
 * @param {any[]} links
 * @param {{
 *   freeChoose?: boolean,
 *   allowedRandom?: string[],
 *   poolFilter?: (name: string) => boolean,
 * }} [options]
 * @returns {boolean}
 */
export function validateOLCharacterLinks(player, links, options = {}) {
	if (!_status.connectMode || !links?.length) {
		return true;
	}
	const freeChoose = options.freeChoose ?? isFreeChooseEnabled();
	const normalized = links.map(normalizeCharacterLink).filter(Boolean);

	if (freeChoose) {
		const pool = getOLCharacterPool(options.poolFilter);
		const poolSet = new Set(pool);
		return normalized.every(name => isInOLPool(name, poolSet, pool));
	}

	const allowedRandom = options.allowedRandom ?? (player?.playerid ? getOLChoicePool(player.playerid) : undefined);
	if (allowedRandom?.length) {
		const allowedSet = new Set(allowedRandom.map(normalizeCharacterLink));
		return normalized.every(name => {
			if (allowedSet.has(name)) {
				return true;
			}
			for (const a of allowedRandom) {
				const src = normalizeCharacterLink(a);
				if (lib.characterReplace[src]?.includes(name) || lib.characterReplace[name]?.includes(a)) {
					return true;
				}
			}
			return false;
		});
	}

	// 联机且非自由选将时，无候选池记录则拒绝（避免漏接 setOLChoicePool 时默认放行）
	return false;
}

/**
 * @param {Player} player
 * @param {{ links?: any[] }} result
 * @param {Parameters<typeof validateOLCharacterLinks>[2]} [options]
 * @returns {{ links?: any[] } | null}
 */
export function sanitizeOLCharacterResult(player, result, options = {}) {
	if (!result?.links?.length) {
		return result;
	}
	if (validateOLCharacterLinks(player, result.links, options)) {
		return result;
	}
	return null;
}

/**
 * 切换自由选将 dialog 时清空选将状态，避免沿用随机框已选导致立刻出现确认键
 */
export function resetFreeChooseSelection() {
	ui.selected.buttons.length = 0;
	if (game._playerChoice) {
		delete game._playerChoice;
	}
	if (_status.event) {
		delete _status.event._buttonChoice;
	}
	if (ui.confirm) {
		ui.confirm.close();
	}
}

/**
 * 重新计算自由选将 dialog 的可选状态（须失效 _buttonChoice 缓存）
 */
export function refreshFreeChooseDialogCheck() {
	resetFreeChooseSelection();
	game.uncheck("button");
	game.check();
}

/**
 * 联机自由选将：仅全将池内武将可被 game.check 标为 selectable
 * @param {GameEvent} event
 */
function isOnFreeChooseDialog(event) {
	const dialog = event?.dialog ?? _status.event?.dialog;
	if (!dialog) {
		return false;
	}
	const dialogxx = resolveFreeChooseDialogxx(event ?? _status.event);
	if (dialogxx && dialog === dialogxx) {
		return true;
	}
	return ui.cheat2?.dialog === dialog;
}

export function installFreeChooseFilterButton(event) {
	if (!_status.connectMode) {
		return;
	}
	const pool = getOLCharacterPool();
	const poolSet = new Set(pool);
	const prevFilter = event.filterButton;
	event.filterButton = (button, player) => {
		if (isOnFreeChooseDialog(event)) {
			if (!pool.length) {
				return typeof prevFilter === "function" ? prevFilter(button, player) : lib.filter.filterButton(button, player);
			}
			const link = normalizeCharacterLink(button.link);
			return isInOLPool(link, poolSet, pool) || isInOLPool(button.link, poolSet, pool);
		}
		return typeof prevFilter === "function" ? prevFilter(button, player) : lib.filter.filterButton(button, player);
	};
}

/**
 * 自由选将全将池对话框中的按钮点击（单选/限选，避免 complexSelect 多选且无确认）
 * @param {Button} button
 */
export function handleFreeChooseCharacterButton(button) {
	if (!_status.event?.isMine?.()) {
		return;
	}
	if (!button.classList.contains("selectable")) {
		return;
	}
	const range = get.select(_status.event.selectButton);
	const max = range[1];
	if (button.classList.contains("selected")) {
		ui.selected.buttons.remove(button);
		button.classList.remove("selected");
	} else {
		if (max === 1) {
			for (const b of ui.selected.buttons.slice()) {
				b.classList.remove("selected");
			}
			ui.selected.buttons.length = 0;
		} else if (ui.selected.buttons.length >= max) {
			return;
		}
		button.classList.add("selected");
		ui.selected.buttons.add(button);
	}
	game.check();
}

/**
 * 为选将事件注入自由选将按钮逻辑（联机对决等在 showConfig 下也需调用）
 * @param {GameEvent} event
 */
export function installFreeChooseButtonHandler(event) {
	if (!isFreeChooseEnabled()) {
		return;
	}
	installFreeChooseFilterButton(event);
	if (!event.custom) {
		event.custom = {};
	}
	if (!event.custom.replace) {
		event.custom.replace = {};
	}
	const userButton = event.custom.replace.button;
	event.custom.replace.button = function (button) {
		if (isOnFreeChooseDialog(_status.event)) {
			handleFreeChooseCharacterButton(button);
			return;
		}
		if (typeof userButton === "function") {
			userButton(button);
			return;
		}
		// 非自由选将页且无自定义 handler：回退默认选中逻辑
		// （custom.replace.button 会完全接管 ui.click.button，若不处理则点将无反应）
		if (!_status.event.isMine()) {
			return;
		}
		if (!button.classList.contains("selectable")) {
			return;
		}
		if (button.classList.contains("selected")) {
			ui.selected.buttons.remove(button);
			button.classList.remove("selected");
			if (_status.multitarget || _status.event.complexSelect) {
				game.uncheck();
				game.check();
			}
		} else {
			button.classList.add("selected");
			ui.selected.buttons.add(button);
		}
		if (typeof _status.event.custom?.add?.button === "function") {
			_status.event.custom.add.button();
		}
		game.check();
	};
}

/**
 * @param {GameEvent} event
 * @returns {Dialog | undefined}
 */
function resolveFreeChooseDialogxx(event) {
	if (event?.dialogxx) {
		return event.dialogxx;
	}
	const parent = event?.getParent?.() ?? event?.parent;
	return parent?.dialogxx;
}

/**
 * 创建「自由选将」切换按钮（与联机选将 dialog 切换时保留 videoId / 隐藏而非 close）
 * @param {GameEvent} event chooseButton 事件（dialogxx 可在父事件上）
 */
export function createFreeChooseCheat2(event) {
	if (ui.cheat2) {
		ui.cheat2.close();
		delete ui.cheat2;
	}
	ui.create.cheat2 = function () {
		ui.cheat2 = ui.create.control("自由选将", function () {
			const evt = _status.event;
			const dialogxx = resolveFreeChooseDialogxx(evt);
			if (!dialogxx) {
				return;
			}
			if (this.dialog == evt.dialog) {
				if (game.changeCoin) {
					game.changeCoin(10);
				}
				this.dialog.close();
				evt.dialog = this.backup;
				if (this.backup?.videoId != null) {
					this.backup.style.display = "";
				}
				this.backup.open();
				delete this.backup;
				installFreeChooseFilterButton(evt);
				refreshFreeChooseDialogCheck();
				if (ui.cheat) {
					ui.cheat.addTempClass("controlpressdownx", 500);
					ui.cheat.classList.remove("disabled");
				}
			} else {
				if (game.changeCoin) {
					game.changeCoin(-10);
				}
				this.backup = evt.dialog;
				if (evt.dialog.videoId != null) {
					evt.dialog.style.display = "none";
				} else {
					evt.dialog.close();
				}
				evt.dialog = dialogxx;
				this.dialog = evt.dialog;
				evt.dialog.open();
				installFreeChooseFilterButton(evt);
				refreshFreeChooseDialogCheck();
				if (ui.cheat) {
					ui.cheat.classList.add("disabled");
				}
			}
		});
		if (lib.onfree) {
			ui.cheat2.classList.add("disabled");
		}
	};
	ui.create.cheat2();
}

/**
 * @param {GameEvent} event
 * @param {{
 *   filter?: (name: string) => boolean,
 *   expandall?: string,
 *   onlypack?: string,
 * }} [options]
 */
export function setupFreeChoose(event, options = {}) {
	if (!isFreeChooseEnabled()) {
		return;
	}
	installFreeChooseButtonHandler(event);
	if (event.showConfig) {
		return;
	}
	if (ui.cheat2) {
		ui.cheat2.close();
		delete ui.cheat2;
	}

	const defaultFilter = name => {
		if (!_status.connectMode) {
			return false;
		}
		const pool = getOLCharacterPool();
		if (!pool.length) {
			return false;
		}
		const poolSet = new Set(pool);
		const src = normalizeCharacterLink(name);
		return !isInOLPool(src, poolSet, pool) && !isInOLPool(name, poolSet, pool);
	};
	const filter = options.filter ?? event.freeChooseFilter ?? defaultFilter;
	const expandall = options.expandall ?? (_status.connectMode ? "expandall" : undefined);

	const createCharacterDialog = () => {
		event.dialogxx = ui.create.characterDialog("heightset", filter, expandall, options.onlypack);
		if (ui.cheat2) {
			ui.cheat2.addTempClass("controlpressdownx", 500);
			ui.cheat2.classList.remove("disabled");
		}
	};

	if (lib.onfree) {
		lib.onfree.push(createCharacterDialog);
	} else {
		createCharacterDialog();
	}

	createFreeChooseCheat2(event);
}

/**
 * 关闭联机选将相关 dialog（含自由选将隐藏的原 videoId dialog）
 * @param {GameEvent} [event]
 */
export function closeOLCharacterChooseDialogs(event) {
	const evt = event || _status.event;
	if (ui.cheat2?.backup) {
		const backup = ui.cheat2.backup;
		if (backup.delay) {
			clearInterval(backup.delay);
			delete backup.delay;
		}
		if (typeof backup.close === "function") {
			backup.close();
		}
		delete ui.cheat2.backup;
	}
	if (evt?.dialogxx) {
		if (evt.dialogxx.delay) {
			clearInterval(evt.dialogxx.delay);
			delete evt.dialogxx.delay;
		}
		if (typeof evt.dialogxx.close === "function" && evt.dialog !== evt.dialogxx) {
			evt.dialogxx.close();
		}
		delete evt.dialogxx;
	}
	if (game._characterDialogID != null) {
		const olDialog = get.idDialog(game._characterDialogID);
		if (olDialog && olDialog !== evt?.dialog) {
			if (olDialog.delay) {
				clearInterval(olDialog.delay);
				delete olDialog.delay;
			}
			olDialog.close();
		}
	}
}

/**
 * @param {GameEvent} [event]
 */
export function teardownFreeChoose(event) {
	closeOLCharacterChooseDialogs(event);
	if (ui.cheat2) {
		ui.cheat2.close();
		delete ui.cheat2;
	}
	if (ui.create.cheat2) {
		delete ui.create.cheat2;
	}
}

/**
 * 校验通过后为玩家初始化武将
 * @param {Player} player
 * @param {{ links?: any[] }} result
 * @param {Parameters<typeof validateOLCharacterLinks>[2] & { initThird?: boolean }} [options]
 * @returns {boolean}
 */
export function initPlayerFromOLResult(player, result, options = {}) {
	if (!result?.links?.length) {
		return false;
	}
	let sanitized = sanitizeOLCharacterResult(player, result, options);
	if (!sanitized) {
		const pool = options.allowedRandom ?? (player?.playerid ? getOLChoicePool(player.playerid) : null);
		if (pool?.length) {
			const pick = pool.randomGet();
			sanitized = { links: [pick] };
		} else {
			return false;
		}
	}
	const links = sanitized.links;
	if (typeof options.initArgs === "function") {
		player.init(...options.initArgs(links));
	} else if (links.length >= 2) {
		player.init(links[0], links[1], options.initThird);
	} else {
		player.init(links[0]);
	}
	return true;
}

export const connectFreeChoose = {
	isFreeChooseEnabled,
	normalizeCharacterLink,
	getOLCharacterPool,
	isCharacterChooseDialog,
	setOLChoicePool,
	getOLChoicePool,
	validateOLCharacterLinks,
	sanitizeOLCharacterResult,
	handleFreeChooseCharacterButton,
	resetFreeChooseSelection,
	refreshFreeChooseDialogCheck,
	installFreeChooseFilterButton,
	installFreeChooseButtonHandler,
	createFreeChooseCheat2,
	setupFreeChoose,
	teardownFreeChoose,
	closeOLCharacterChooseDialogs,
	initPlayerFromOLResult,
};
