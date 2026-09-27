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
