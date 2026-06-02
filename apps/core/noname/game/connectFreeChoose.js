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

	return true;
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
	if (ui.cheat2) {
		return;
	}
	if (event.showConfig) {
		return;
	}

	const defaultFilter = name => {
		const pool = getOLCharacterPool();
		const src = normalizeCharacterLink(name);
		return !isInOLPool(src, new Set(pool), pool) && !isInOLPool(name, new Set(pool), pool);
	};
	const filter = options.filter ?? event.freeChooseFilter ?? defaultFilter;

	const createCharacterDialog = () => {
		event.dialogxx = ui.create.characterDialog("heightset", filter, options.expandall, options.onlypack);
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

	ui.create.cheat2 = function () {
		ui.cheat2 = ui.create.control("自由选将", function () {
			const evt = _status.event;
			const dialogxx = evt.dialogxx;
			if (!dialogxx) {
				return;
			}
			if (this.dialog == evt.dialog) {
				this.dialog.close();
				evt.dialog = this.backup;
				if (this.backup.videoId != null) {
					this.backup.style.display = "";
				}
				this.backup.open();
				delete this.backup;
				game.uncheck();
				game.check();
				if (ui.cheat) {
					ui.cheat.addTempClass("controlpressdownx", 500);
					ui.cheat.classList.remove("disabled");
				}
			} else {
				this.backup = evt.dialog;
				// 保留带 videoId 的联机选将 dialog，避免 get.idDialog 失效
				if (evt.dialog.videoId != null) {
					evt.dialog.style.display = "none";
				} else {
					evt.dialog.close();
				}
				evt.dialog = dialogxx;
				this.dialog = evt.dialog;
				evt.dialog.open();
				game.uncheck();
				game.check();
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
	setupFreeChoose,
	teardownFreeChoose,
	closeOLCharacterChooseDialogs,
	initPlayerFromOLResult,
};
