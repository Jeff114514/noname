# Noname 在线服务部署指南

## 一、环境准备

### 1. 安装 Node.js
```bash
# 需要 Node.js ^20.19.0 || >=22.12.0
node -v
npm -v
```

### 2. 安装 pnpm
```bash
npm install -g pnpm
pnpm -v
```

## 二、本地开发

### 1. 安装依赖
```bash
cd noname
pnpm install
```

### 2. 启动开发服务器
```bash
# 启动 Vite 开发服务器 (端口 8080)
pnpm dev
```

## 三、生产部署

### 方案一: 简单部署 (仅静态文件)

#### 1. 构建项目
```bash
# 构建生产版本
pnpm build

# 构建结果输出到 dist/ 文件夹
```

#### 2. 启动文件服务器
```bash
# 启动静态文件服务 (端口 8089)
pnpm serve
```

访问: `http://your-domain.com:8089`

### 方案二: 完整部署 (支持联机)

#### 1. 启动静态文件服务器
```bash
# 在 noname 目录下
pnpm serve
# 或指定端口
pnpm -F @noname/fs dev --dirname=../../dist --port=8089
```

#### 2. 启动 WebSocket 联机服务器
```bash
# 新终端窗口
pnpm -F @noname/server dev
# 默认端口 8082
```

#### 3. 配置联机地址

在游戏设置中配置联机服务器地址:
- 服务器地址: `ws://your-domain.com:8082`

## 四、生产环境推荐配置

### 1. 使用 PM2 管理进程

#### 安装 PM2
```bash
npm install -g pm2
```

#### 创建 PM2 配置文件
```bash
# 在 noname 目录创建 ecosystem.config.cjs
cat > ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [
    {
      name: 'noname-static',
      script: 'packages/fs/dist/entry.cjs',
      cwd: process.cwd(),
      args: '--dirname=../../dist --port=8089',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'noname-websocket',
      script: 'packages/server/dist/index.cjs',
      cwd: process.cwd(),
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
EOF
```

#### 先构建
```bash
pnpm build
pnpm -F @noname/fs build
pnpm -F @noname/server build
```

#### 启动服务
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

#### 常用命令
```bash
pm2 list              # 查看所有进程
pm2 logs noname-static    # 查看日志
pm2 restart noname-static # 重启服务
pm2 stop noname-static    # 停止服务
pm2 delete noname-static  # 删除服务
```

### 2. 使用 Nginx 反向代理

#### Nginx 配置示例
```nginx
# /etc/nginx/sites-available/noname
server {
    listen 80;
    server_name your-domain.com;

    # 静态文件
    location / {
        proxy_pass http://localhost:8089;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket 联机服务
    location /ws {
        proxy_pass http://localhost:8082;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
}
```

#### 启用配置
```bash
sudo ln -s /etc/nginx/sites-available/noname /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 3. 使用 Docker 部署

#### 创建 Dockerfile
```dockerfile
# 在 noname 目录创建 Dockerfile
FROM node:22-alpine

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm pm2

# 复制依赖文件
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/core/package.json ./apps/core/
COPY packages/fs/package.json ./packages/fs/
COPY packages/server/package.json ./packages/server/

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建
RUN pnpm build && \
    pnpm -F @noname/fs build && \
    pnpm -F @noname/server build

# 暴露端口
EXPOSE 8089 8082

# 启动服务
CMD ["pm2-runtime", "ecosystem.config.cjs"]
```

#### 构建并运行
```bash
docker build -t noname-server .
docker run -d -p 8089:8089 -p 8082:8082 --name noname noname-server
```

### 4. 使用 Docker Compose

#### 创建 docker-compose.yml
```yaml
version: '3.8'

services:
  noname:
    build: .
    ports:
      - "8089:8089"
      - "8082:8082"
    restart: always
    environment:
      - NODE_ENV=production
    volumes:
      - ./dist:/app/dist
```

#### 运行
```bash
docker-compose up -d
```

## 五、安全配置

### 1. 配置 HTTPS (推荐)

使用 Let's Encrypt 免费证书:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 2. 防火墙配置
```bash
# 开放必要端口
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 8089/tcp  # 游戏静态服务
sudo ufw allow 8082/tcp  # WebSocket 联机服务
sudo ufw enable
```

### 3. 修改默认端口

编辑 `packages/fs/src/index.ts`:
```typescript
export const defaultConfig = {
  server: false,
  port: 8089,  // 修改为其他端口
  debug: false,
  dirname: cwd(),
};
```

编辑 `packages/server/src/index.ts`:
```typescript
const wss = new WebSocketServer({ port: 8082 }); // 修改为其他端口
```

## 六、监控与维护

### 1. 日志管理
```bash
# PM2 日志位置
~/.pm2/logs/

# 查看实时日志
pm2 logs
```

### 2. 性能监控
```bash
pm2 monit
```

### 3. 自动重启
```bash
# PM2 已配置自动重启
# 如需手动重启
pm2 restart all
```

## 七、常见问题

### Q1: 端口被占用怎么办?
```bash
# 查看端口占用
sudo lsof -i :8089
sudo lsof -i :8082

# 杀死进程
sudo kill -9 <PID>
```

### Q2: 内存不足?
```bash
# PM2 配置中已设置 max_memory_restart: '1G'
# 可根据实际情况调整
```

### Q3: 无法访问联机服务?
检查:
1. WebSocket 服务是否启动
2. 防火墙是否开放 8082 端口
3. Nginx 反向代理配置是否正确

## 八、进阶功能

### 1. 负载均衡

使用 Nginx 配置多个实例:
```nginx
upstream noname_backend {
    server localhost:8089;
    server localhost:8090;
    server localhost:8091;
}

server {
    location / {
        proxy_pass http://noname_backend;
    }
}
```

### 2. 数据持久化

游戏数据存储在浏览器 localStorage,如需服务器端存储:
1. 实现用户系统
2. 使用数据库 (MongoDB/PostgreSQL)
3. 实现云存档功能

### 3. CDN 加速

将静态资源上传到 CDN:
```bash
# 构建后上传 dist 文件夹
aws s3 sync dist/ s3://your-bucket/noname/
```

---

## 快速启动命令总结

```bash
# 开发环境
pnpm dev

# 生产环境 (简单)
pnpm build && pnpm serve

# 生产环境 (完整)
pnpm build
pnpm -F @noname/fs build
pnpm -F @noname/server build
pm2 start ecosystem.config.cjs

# Docker
docker-compose up -d
```

部署完成后访问: `http://your-domain.com:8089`
