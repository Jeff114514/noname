/**
 * Agent 临时调试日志（浏览器安全：仅 console，无 HTTP / 无 ingest）。
 * 验证后删除调用处；持久化请用仓库根 scripts/agent-debug-append.mjs 写 .cursor/debug.log
 *
 * @param {Record<string, unknown>} payload
 */
export function agentDebugLog(payload) {
	const line = JSON.stringify({
		...payload,
		timestamp: Date.now(),
	});
	if (typeof console !== "undefined" && typeof console.debug === "function") {
		console.debug("[agent-debug]", line);
	}
}
