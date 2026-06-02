#!/bin/bash

# ============================================================
# Noname 无名杀 - 快速部署脚本
# ============================================================
# 使用方式: bash deploy.sh
# ============================================================

set -e  # 遇到错误立即退出

# 无论从哪里执行，都切到本脚本所在目录（避免 PM2/构建路径不对）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        log_error "$1 未安装，正在安装..."
        return 1
    else
        log_success "$1 已安装: $(command -v $1)"
        return 0
    fi
}

# 主部署流程
main() {
    log_info "开始部署 Noname 无名杀游戏服务器..."
    echo ""

    # 1. 检查环境
    log_info "步骤 1/6: 检查运行环境"
    
    # 检查 Node.js
    if ! check_command node; then
        log_error "请先安装 Node.js (需要 ^20.19.0 || >=22.12.0)"
        log_info "推荐使用 nvm 安装: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
    if [ "$NODE_VERSION" -lt 20 ]; then
        log_error "Node.js 版本过低，需要 >= 20.19.0"
        exit 1
    fi
    log_success "Node.js 版本: $(node -v)"
    
    # 检查 pnpm
    if ! check_command pnpm; then
        log_info "正在安装 pnpm..."
        npm install -g pnpm
        check_command pnpm || exit 1
    fi
    log_success "pnpm 版本: $(pnpm -v)"
    
    # 检查 PM2
    if ! check_command pm2; then
        log_info "正在安装 PM2..."
        npm install -g pm2
        check_command pm2 || exit 1
    fi
    log_success "PM2 版本: $(pm2 -v)"
    
    echo ""

    # 2. 安装依赖
    log_info "步骤 2/6: 安装项目依赖"
    pnpm install
    log_success "依赖安装完成"
    echo ""

    # 3. 构建项目（始终执行：会编译本体并同步 mode/versus.js、noname/** 等到 dist）
    log_info "步骤 3/6: 构建游戏核心"
    pnpm build
    log_success "游戏核心构建完成（已合并 apps/core/dist → dist）"
    echo ""

    # 4. 构建服务器
    log_info "步骤 4/6: 构建服务器组件"
    
    log_info "构建静态文件服务器 (@noname/fs)..."
    pnpm -F @noname/fs build
    log_success "静态文件服务器构建完成"
    
    log_info "构建 WebSocket 联机服务器 (@noname/server)..."
    pnpm -F @noname/server build
    log_success "WebSocket 服务器构建完成"
    echo ""

    # 5. 创建日志目录
    log_info "步骤 5/6: 创建日志目录"
    mkdir -p logs
    log_success "日志目录创建完成"
    echo ""

    # 6. 启动服务
    log_info "步骤 6/6: 启动服务"
    
    # 检查是否已有服务在运行
    if pm2 list | grep -q "noname-static"; then
        log_warning "检测到已有 noname 服务在运行"
        read -p "是否重启服务? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            pm2 restart noname-static noname-websocket
            log_success "服务重启完成"
        else
            log_info "跳过启动，保持现有服务运行"
        fi
    else
        pm2 start ecosystem.config.cjs
        log_success "服务启动完成"
        
        # 保存 PM2 配置
        pm2 save
        log_success "PM2 配置已保存"
        
    fi
    echo ""

    # 显示服务状态
    log_info "服务状态:"
    pm2 list
    echo ""

    # 显示访问信息
    log_success "=========================================="
    log_success "  部署完成！"
    log_success "=========================================="
    echo ""
    log_info "访问地址:"
    echo "  - 本地访问: http://localhost:8089"
    echo "  - 外部访问: http://your-domain.com:8001"
    echo ""
    log_info "联机服务器地址 (在游戏设置中配置):"
    echo "  - ws://your-domain.com:8001/ws"
    echo ""
    log_info "常用命令:"
    echo "  - 查看日志:   pm2 logs"
    echo "  - 查看状态:   pm2 list"
    echo "  - 重启服务:   pm2 restart all"
    echo "  - 停止服务:   pm2 stop all"
    echo "  - 监控面板:   pm2 monit"
    echo ""
    log_warning "⚠️  重要提示:"
    echo "  1. 请修改 noname.nginx.conf 中的域名为你的实际域名"
    echo "  2. 请配置 Nginx 反向代理 (参考 noname.nginx.conf)"
    echo "  3. 建议配置 HTTPS 证书以增强安全性"
    echo ""
}

# 执行主流程
main
