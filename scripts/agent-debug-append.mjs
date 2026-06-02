#!/usr/bin/env node
/**
 * 向工作区 .cursor/debug.log 追加一行 NDJSON（供 Agent 本地排查，勿用于生产）。
 *
 * 用法:
 *   node scripts/agent-debug-append.mjs '{"location":"test","message":"hello","data":{}}'
 *   echo '{"message":"stdin"}' | node scripts/agent-debug-append.mjs
 *
 * 环境变量 AGENT_DEBUG_LOG_PATH 可覆盖默认路径。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const defaultLog = path.resolve(repoRoot, "..", ".cursor", "debug.log");

async function readStdin() {
	const chunks = [];
	for await (const chunk of process.stdin) {
		chunks.push(chunk);
	}
	return Buffer.concat(chunks).toString("utf8").trim();
}

async function main() {
	const logPath = process.env.AGENT_DEBUG_LOG_PATH || defaultLog;
	let raw = process.argv[2];
	if (!raw) {
		raw = await readStdin();
	}
	if (!raw) {
		console.error("Usage: agent-debug-append.mjs '<json>'");
		process.exit(1);
	}
	let payload;
	try {
		payload = JSON.parse(raw);
	} catch (e) {
		console.error("Invalid JSON:", e.message);
		process.exit(1);
	}
	const line =
		JSON.stringify({
			...payload,
			timestamp: payload.timestamp ?? Date.now(),
		}) + "\n";
	fs.mkdirSync(path.dirname(logPath), { recursive: true });
	fs.appendFileSync(logPath, line, "utf8");
	console.error(`[agent-debug-append] ${logPath}`);
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
