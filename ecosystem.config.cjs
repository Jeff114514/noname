/**
 * PM2 进程管理配置文件
 * 用于管理 noname 游戏服务器的静态文件服务和 WebSocket 联机服务
 *
 * 使用 __dirname 固定项目根目录，避免「从别的目录执行 pm2」时 cwd 错误导致找不到 dist（404）。
 */

const path = require("path");

const root = __dirname;

module.exports = {
	apps: [
		{
			name: "noname-static",
			script: path.join(root, "packages/fs/dist/entry.cjs"),
			cwd: root,
			args: `--dirname=${path.join(root, "dist")} --port=8089`,
			instances: 1,
			autorestart: true,
			watch: false,
			max_memory_restart: "1G",
			env: {
				NODE_ENV: "production",
			},
			error_file: path.join(root, "logs/noname-static-error.log"),
			out_file: path.join(root, "logs/noname-static-out.log"),
			log_date_format: "YYYY-MM-DD HH:mm:ss Z",
			merge_logs: true,
		},
		{
			name: "noname-websocket",
			script: path.join(root, "packages/server/dist/cli.cjs"),
			cwd: root,
			instances: 1,
			autorestart: true,
			watch: false,
			max_memory_restart: "1G",
			env: {
				NODE_ENV: "production",
			},
			error_file: path.join(root, "logs/noname-websocket-error.log"),
			out_file: path.join(root, "logs/noname-websocket-out.log"),
			log_date_format: "YYYY-MM-DD HH:mm:ss Z",
			merge_logs: true,
		},
	],
};
