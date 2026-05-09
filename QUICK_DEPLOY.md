# Noname 无名杀 - 生产环境部署指南

## 📋 架构说明

```
用户浏览器 (通过不同域名访问)
    ↓
Nginx (监听 8001 端口)
    └─ noname.your-domain.com        → Noname 游戏
                                        ├─ 静态文件 (localhost:8089)
                                        └─ WebSocket (localhost:8082/ws)
```

## 🚀 快速部署

### 1. 一键部署（推荐）

```bash
cd /root/sj-tmp/Jeff/nginx/noname
bash deploy.sh
```

部署脚本会自动完成：
- ✅ 检查并安装依赖 (Node.js、pnpm、PM2)
- ✅ 安装项目依赖
- ✅ 构建游戏核心
- ✅ 构建服务器组件
- ✅ 创建日志目录
- ✅ 启动服务并设置开机自启

### 2. 手动部署

```bash
# 1. 安装依赖
npm install -g pnpm pm2
pnpm install

# 2. 构建
pnpm build                        # 构建游戏核心
pnpm -F @noname/fs build          # 构建静态文件服务器
pnpm -F @noname/server build      # 构建 WebSocket 服务器

# 3. 启动服务
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

## 🔧 Nginx 配置

### 1. 修改配置文件

编辑 `noname.nginx.conf`，替换域名：

```nginx
# 第 30 行和第 32 行，修改为你的实际域名
server_name noname.your-domain.com;
if ($host != "noname.your-domain.com") {
    return 403;
}
```

### 2. 部署 Nginx 配置

```bash
# 复制配置文件
sudo cp noname.nginx.conf /etc/nginx/sites-available/noname

# 创建软链接
sudo ln -s /etc/nginx/sites-available/noname /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

### 3. DNS 解析

在域名服务商控制台添加 DNS 解析记录：

```
类型: A
主机记录: noname
记录值: 117.187.209.14  (你的服务器IP)
```

## 📊 服务管理

### PM2 常用命令

```bash
# 查看服务状态
pm2 list

# 查看日志
pm2 logs                    # 所有服务日志
pm2 logs noname-static      # 静态服务日志
pm2 logs noname-websocket   # WebSocket 日志

# 重启服务
pm2 restart all             # 重启所有
pm2 restart noname-static   # 重启单个服务

# 停止服务
pm2 stop all
pm2 stop noname-static

# 监控面板
pm2 monit
```

### 日志位置

```bash
logs/
├── noname-static-error.log      # 静态服务错误日志
├── noname-static-out.log        # 静态服务输出日志
├── noname-websocket-error.log   # WebSocket 错误日志
└── noname-websocket-out.log     # WebSocket 输出日志
```

## 🌐 访问地址

部署完成后：

- **本地测试**: http://localhost:8089
- **外部访问**: http://noname.your-domain.com:8001
- **联机服务器**: ws://noname.your-domain.com:8001/ws

### 公网 HTTP 白屏或反复刷新

浏览器只在 **HTTPS**（或 localhost / 127.0.0.1）下允许注册 Service Worker。若用 **公网 IP/域名的纯 HTTP** 打开，旧版 JIT 脚本会在注册失败时反复 `reload`，表现为白屏或控制台几乎无输出。

**当前仓库已修复**（`packages/jit`）：在非安全上下文下直接跳过 Service Worker，游戏用已构建的 JS 正常运行；**即时编译（JIT）** 在 HTTP 下不可用，属正常现象。

**推荐**：为域名配置 **HTTPS**（如 Let’s Encrypt / certbot），可同时启用 Service Worker 与 JIT。

若曾卡在白屏，请清除该站点数据或使用无痕窗口再打开。

## 🔐 安全配置（可选）

### 1. 配置 HTTPS

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 申请证书
sudo certbot --nginx -d noname.your-domain.com

# 自动续期测试
sudo certbot renew --dry-run
```

### 2. 防火墙配置

```bash
# 开放端口
sudo ufw allow 8001/tcp    # Nginx 服务端口
sudo ufw allow 22/tcp      # SSH
sudo ufw enable
```

## 🛠️ 故障排查

### 问题 0: 页面显示 `Sorry can't find that!` 或 404

说明静态服务**根目录里找不到 `dist`**。常见原因：在错误的工作目录下执行了 `pm2 start`（`cwd` 不是 `noname` 根目录，导致相对路径 `./dist` 指错位置）。

**已修复**：当前仓库里的 [ecosystem.config.cjs](ecosystem.config.cjs) 使用 `__dirname` 拼出**绝对路径**的 `dist`，从任意目录启动 PM2 都能正确找到 `index.html`。

请重新加载进程：

```bash
cd /path/to/noname
pm2 delete all
pm2 start ecosystem.config.cjs
pm2 save
```

自测应返回 200：

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8089/index.html
# 期望: 200
```

### 问题 1: 无法访问游戏

检查服务状态：
```bash
pm2 list                    # 查看 PM2 服务
pm2 logs noname-static      # 查看日志
```

检查端口占用：
```bash
sudo netstat -tunlp | grep 8089
sudo netstat -tunlp | grep 8082
```

### 问题 2: 联机功能无法使用

1. 检查 WebSocket 服务是否启动：
```bash
pm2 list | grep websocket
```

2. 检查 Nginx 配置中的 `/ws` 路由

3. 查看浏览器控制台网络请求

### 问题 3: PM2 服务异常

```bash
# 查看详细信息
pm2 show noname-static

# 重置服务
pm2 delete all
pm2 start ecosystem.config.cjs
```

## 📁 文件说明

```
noname/
├── ecosystem.config.cjs      # PM2 配置文件
├── noname.nginx.conf         # Nginx 配置文件
├── deploy.sh                 # 一键部署脚本
├── QUICK_DEPLOY.md           # 本文档
├── dist/                     # 游戏前端资源（构建后）
├── packages/
│   ├── fs/dist/              # 静态文件服务器
│   └── server/dist/          # WebSocket 服务器
└── logs/                     # 日志目录
```

## 🎮 游戏配置

**联机服务器地址已自动配置！**

修改后的版本会自动检测当前访问的域名和协议，生成对应的 WebSocket 地址：

| 访问地址 | 自动生成的联机地址 |
|----------|-------------------|
| `http://localhost:8089` | `ws://localhost:8089/ws` |
| `http://noname.your-domain.com:8001` | `ws://noname.your-domain.com:8001/ws` |
| `https://noname.your-domain.com` | `wss://noname.your-domain.com/ws` |

用户打开联机模式时，地址栏会**自动填入**正确的联机服务器地址，无需手动配置。

> **注意**：这依赖 Nginx 配置中 `/ws` 路径代理到 WebSocket 服务器（已在 `noname.nginx.conf` 中配置）。

## 📞 支持

- 项目地址: https://github.com/libnoname/noname
- 问题反馈: https://github.com/libnoname/noname/issues
