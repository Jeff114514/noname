import "../../noname.js";
import { ui } from "../ui/index.js";
import { game } from "./index.js";
import { lib } from "../library/index.js";
import { _status } from "../status/index.js";
import { get } from "../get/index.js";
const roomConfig = {
  /** 缓存的配置列表 */
  cachedConfigs: null,
  /** 事件监听器 */
  _listeners: /* @__PURE__ */ new Map(),
  /**
   * 注册事件监听器
   * @param {string} event 事件名
   * @param {Function} callback 回调函数
   */
  on(event, callback) {
    if (!roomConfig._listeners.has(event)) {
      roomConfig._listeners.set(event, []);
    }
    roomConfig._listeners.get(event).push(callback);
  },
  /**
   * 移除事件监听器
   * @param {string} event 事件名
   * @param {Function} callback 回调函数
   */
  off(event, callback) {
    if (roomConfig._listeners.has(event)) {
      const callbacks = roomConfig._listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  },
  /**
   * 触发事件
   * @param {string} event 事件名
   * @param {...any} args 参数
   */
  _emit(event, ...args) {
    if (roomConfig._listeners.has(event)) {
      roomConfig._listeners.get(event).forEach((callback) => callback(...args));
    }
  },
  /**
   * 处理服务器消息（由 lib.roomConfigBridge 调用）
   * @param {string} type 消息类型
   * @param {...any} args 参数
   */
  handleServerMessage(type, ...args) {
    roomConfig._emit(type, ...args);
  },
  /**
   * 获取云端配置列表
   * @returns {Promise<Array>} 配置列表
   */
  async getCloudConfigs() {
    return new Promise((resolve, reject) => {
      if (!game.online && !game.onlineroom) {
        reject(new Error("未连接到服务器"));
        return;
      }
      if (!game.roomConfig) {
        reject(new Error("客户端未就绪，请刷新页面"));
        return;
      }
      const timeout = setTimeout(() => {
        roomConfig.off("roomConfigs", handler);
        reject(new Error("获取配置超时（请确认联机服务器已更新并支持共享配置）"));
      }, 1e4);
      const handler = (configs) => {
        clearTimeout(timeout);
        roomConfig.off("roomConfigs", handler);
        roomConfig.cachedConfigs = configs;
        resolve(configs);
      };
      roomConfig.on("roomConfigs", handler);
      game.send("server", "getRoomConfigs");
    });
  },
  /**
   * 保存配置到云端
   * @param {Object} config 配置对象
   * @param {boolean} asNew 是否作为新配置保存
   * @returns {Promise<Object>} 保存后的配置
   */
  async saveToCloud(config, asNew = false) {
    return new Promise((resolve, reject) => {
      if (!game.online && !game.onlineroom) {
        reject(new Error("未连接到服务器"));
        return;
      }
      const timeout = setTimeout(() => {
        roomConfig.off("roomConfigSaved", successHandler);
        roomConfig.off("roomConfigError", errorHandler);
        reject(new Error("保存配置超时"));
      }, 1e4);
      const successHandler = (savedConfig) => {
        clearTimeout(timeout);
        roomConfig.off("roomConfigSaved", successHandler);
        roomConfig.off("roomConfigError", errorHandler);
        if (roomConfig.cachedConfigs) {
          const index = roomConfig.cachedConfigs.findIndex((c) => c.id === savedConfig.id);
          if (index !== -1) {
            roomConfig.cachedConfigs[index] = savedConfig;
          } else {
            roomConfig.cachedConfigs.push(savedConfig);
          }
        }
        resolve(savedConfig);
      };
      const errorHandler = (error) => {
        clearTimeout(timeout);
        roomConfig.off("roomConfigSaved", successHandler);
        roomConfig.off("roomConfigError", errorHandler);
        reject(new Error(error));
      };
      roomConfig.on("roomConfigSaved", successHandler);
      roomConfig.on("roomConfigError", errorHandler);
      game.send("server", "saveRoomConfig", config, asNew);
    });
  },
  /**
   * 从云端删除配置
   * @param {string} id 配置ID
   * @returns {Promise<string>} 被删除的配置ID
   */
  async deleteFromCloud(id) {
    return new Promise((resolve, reject) => {
      if (!game.online && !game.onlineroom) {
        reject(new Error("未连接到服务器"));
        return;
      }
      const timeout = setTimeout(() => {
        roomConfig.off("roomConfigDeleted", successHandler);
        roomConfig.off("roomConfigError", errorHandler);
        reject(new Error("删除配置超时"));
      }, 1e4);
      const successHandler = (deletedId) => {
        clearTimeout(timeout);
        roomConfig.off("roomConfigDeleted", successHandler);
        roomConfig.off("roomConfigError", errorHandler);
        if (roomConfig.cachedConfigs) {
          roomConfig.cachedConfigs = roomConfig.cachedConfigs.filter((c) => c.id !== deletedId);
        }
        resolve(deletedId);
      };
      const errorHandler = (error) => {
        clearTimeout(timeout);
        roomConfig.off("roomConfigDeleted", successHandler);
        roomConfig.off("roomConfigError", errorHandler);
        reject(new Error(error));
      };
      roomConfig.on("roomConfigDeleted", successHandler);
      roomConfig.on("roomConfigError", errorHandler);
      game.send("server", "deleteRoomConfig", id);
    });
  },
  /**
   * 应用配置到当前房间设置
   * @param {Object} config 配置对象
   */
  applyConfig(config, coverLocal = true) {
    const { mode: configMode, config: cfg } = config;
    if (cfg.characterPack && Array.isArray(cfg.characterPack)) {
      lib.config.connect_characters = lib.connectCharacterPack.filter(
        (p) => !cfg.characterPack.includes(p)
      );
      game.saveConfig("connect_characters", lib.config.connect_characters);
    }
    if (cfg.cardPack && Array.isArray(cfg.cardPack)) {
      lib.config.connect_cards = lib.connectCardPack.filter(
        (p) => !cfg.cardPack.includes(p)
      );
      game.saveConfig("connect_cards", lib.config.connect_cards);
    }
    if (cfg.modeConfigs && typeof cfg.modeConfigs === "object") {
      for (const mode in cfg.modeConfigs) {
        const modeCfg = cfg.modeConfigs[mode];
        if (modeCfg.bannedCharacters && Array.isArray(modeCfg.bannedCharacters)) {
          game.saveConfig(`connect_${mode}_banned`, modeCfg.bannedCharacters);
        }
        if (modeCfg.bannedCards && Array.isArray(modeCfg.bannedCards)) {
          game.saveConfig(`connect_${mode}_bannedcards`, modeCfg.bannedCards);
        }
        if (typeof modeCfg.chooseTimeout === "number") {
          game.saveConfig("connect_choose_timeout", modeCfg.chooseTimeout.toString(), mode);
        }
        if (typeof modeCfg.observe === "boolean") {
          game.saveConfig("connect_observe", modeCfg.observe, mode);
        }
        if (typeof modeCfg.observeHandcard === "boolean") {
          game.saveConfig("connect_observe_handcard", modeCfg.observeHandcard, mode);
        }
        if (typeof modeCfg.mountCombine === "boolean") {
          game.saveConfig("connect_mount_combine", modeCfg.mountCombine, mode);
        }
        if (modeCfg.modeSpecific && typeof modeCfg.modeSpecific === "object") {
          for (const key in modeCfg.modeSpecific) {
            game.saveConfig(key, modeCfg.modeSpecific[key], mode);
          }
        }
      }
    } else if (cfg.bannedCharacters !== void 0 || cfg.chooseTimeout !== void 0) {
      const mode = configMode || lib.config.mode || "identity";
      if (mode && lib.config.mode !== mode) {
        lib.config.mode = mode;
        game.saveConfig("mode", mode);
      }
      if (cfg.bannedCharacters && Array.isArray(cfg.bannedCharacters)) {
        game.saveConfig(`connect_${mode}_banned`, cfg.bannedCharacters);
      }
      if (cfg.bannedCards && Array.isArray(cfg.bannedCards)) {
        game.saveConfig(`connect_${mode}_bannedcards`, cfg.bannedCards);
      }
      if (typeof cfg.chooseTimeout === "number") {
        game.saveConfig("connect_choose_timeout", cfg.chooseTimeout.toString(), mode);
      }
      if (typeof cfg.observe === "boolean") {
        game.saveConfig("connect_observe", cfg.observe, mode);
      }
      if (typeof cfg.observeHandcard === "boolean") {
        game.saveConfig("connect_observe_handcard", cfg.observeHandcard, mode);
      }
      if (typeof cfg.mountCombine === "boolean") {
        game.saveConfig("connect_mount_combine", cfg.mountCombine, mode);
      }
      if (cfg.modeSpecific && typeof cfg.modeSpecific === "object") {
        for (const key in cfg.modeSpecific) {
          game.saveConfig(key, cfg.modeSpecific[key], mode);
        }
      }
    }
    if (coverLocal && cfg.localCharacters && Array.isArray(cfg.localCharacters)) {
      lib.config.characters = cfg.localCharacters.slice(0);
      game.saveConfig("characters", lib.config.characters);
    }
    if (coverLocal && cfg.localCards && Array.isArray(cfg.localCards)) {
      lib.config.cards = cfg.localCards.slice(0);
      game.saveConfig("cards", lib.config.cards);
    }
    if (_status.connectMode && lib.configOL) {
      const olMode = configMode || lib.config.connect_mode || lib.configOL.mode;
      roomConfig.syncConfigOL(olMode);
      roomConfig.pushConfigOLToRoom();
    }
    roomConfig.refreshConnectNickname();
    roomConfig._emit("configApplied", config);
  },
  /**
   * 应用房间配置后刷新大厅/等待界面上的本机昵称与头像（不修改 lib.config.connect_nickname）
   */
  refreshConnectNickname() {
    const nickname = get.connectNickname();
    const avatar = lib.config.connect_avatar || "caocao";
    if (game.me) {
      game.me.nickname = nickname;
      game.me.setNickname();
    }
    if (game.connectPlayers?.length && game.onlineID) {
      for (const p of game.connectPlayers) {
        if (p.playerid === game.onlineID) {
          p.initOL(nickname, avatar);
          break;
        }
      }
    }
    if (game.online || game.onlineroom) {
      game.send("server", "changeAvatar", nickname, avatar);
    }
  },
  /**
   * 从已保存的联机配置（lib.config / mode_config）重建 lib.configOL
   * @param {string} [mode] 模式 id
   * @returns {boolean}
   */
  syncConfigOL(mode) {
    const name = mode || lib.configOL?.mode || lib.config.connect_mode;
    if (!_status.connectMode || !lib.configOL || !name || !lib.mode[name]?.connect) {
      return false;
    }
    lib.configOL.mode = name;
    for (const key in lib.mode[name].connect) {
      if (key === "update") {
        continue;
      }
      lib.configOL[key.slice(8)] = get.config(key, name);
    }
    lib.configOL.zhinang_tricks = lib.config.connect_zhinang_tricks;
    lib.configOL.characterPack = lib.connectCharacterPack.slice(0);
    lib.configOL.cardPack = lib.connectCardPack.slice(0);
    for (let i = 0; i < lib.config.connect_characters.length; i++) {
      lib.configOL.characterPack.remove(lib.config.connect_characters[i]);
    }
    for (let i = 0; i < lib.config.connect_cards.length; i++) {
      lib.configOL.cardPack.remove(lib.config.connect_cards[i]);
    }
    lib.configOL.banned = lib.config[`connect_${name}_banned`];
    lib.configOL.bannedcards = lib.config[`connect_${name}_bannedcards`];
    return true;
  },
  /**
   * 将当前 lib.configOL 推送到联机房间（等待界面 / 自建房）
   */
  pushConfigOLToRoom() {
    if (!_status.connectMode || !lib.configOL) {
      return;
    }
    const mode = lib.configOL.mode;
    if (!mode || !lib.mode[mode]?.connect) {
      return;
    }
    if (ui.connectStartBar) {
      ui.connectStartBar.firstChild.innerHTML = get.modetrans(lib.configOL, true);
    }
    if (!_status.waitingForPlayer) {
      if (game.onlineroom) {
        game.send("server", "config", lib.configOL);
      }
      return;
    }
    const patch = {};
    for (const key in lib.mode[mode].connect) {
      if (key === "update") {
        continue;
      }
      patch[key.slice(8)] = lib.configOL[key.slice(8)];
    }
    patch.zhinang_tricks = lib.configOL.zhinang_tricks;
    if (game.online) {
      if (game.onlinezhu) {
        game.send("changeRoomConfig", patch);
      }
    } else {
      game.broadcastAll(
        function(config) {
          for (const k in config) {
            lib.configOL[k] = config[k];
          }
          if (ui.connectStartBar) {
            ui.connectStartBar.firstChild.innerHTML = get.modetrans(lib.configOL, true);
          }
        },
        patch
      );
      if (lib.configOL.mode == "identity" && lib.configOL.identity_mode == "zhong" && game.connectPlayers) {
        for (let i = 0; i < game.connectPlayers.length; i++) {
          game.connectPlayers[i].classList.remove("unselectable2");
        }
        lib.configOL.number = 8;
        game.updateWaiting();
      }
      if (game.onlineroom) {
        game.send("server", "config", lib.configOL);
      }
      if (game.connectPlayers?.[0]) {
        game.connectPlayers[0].chat("房间设置已更改");
      }
    }
  },
  /**
   * 从当前设置创建配置对象
   * @param {string} name 配置名称
   * @param {string} mode 游戏模式
   * @returns {Object} 配置对象
   */
  createFromCurrent(name) {
    const characterPack = lib.connectCharacterPack.filter(
      (p) => !lib.config.connect_characters.includes(p)
    );
    const cardPack = lib.connectCardPack.filter(
      (p) => !lib.config.connect_cards.includes(p)
    );
    const modeConfigs = {};
    const knownKeys = ["connect_choose_timeout", "connect_observe", "connect_observe_handcard", "connect_mount_combine", "connect_change_card", "connect_change_card_num"];
    for (const mode in lib.config.mode_config) {
      const modeConfig = lib.config.mode_config[mode] || {};
      const modeSpecific = {};
      for (const key in modeConfig) {
        if (!knownKeys.includes(key)) {
          modeSpecific[key] = modeConfig[key];
        }
      }
      modeConfigs[mode] = {
        bannedCharacters: lib.config[`connect_${mode}_banned`] || [],
        bannedCards: lib.config[`connect_${mode}_bannedcards`] || [],
        chooseTimeout: parseInt(modeConfig.connect_choose_timeout) || 30,
        observe: modeConfig.connect_observe ?? true,
        observeHandcard: modeConfig.connect_observe_handcard ?? false,
        mountCombine: modeConfig.connect_mount_combine ?? false,
        modeSpecific
      };
    }
    return {
      id: null,
      name,
      mode: lib.config.connect_mode || lib.config.mode || "identity",
      createdBy: null,
      createdAt: null,
      updatedAt: null,
      config: {
        characterPack,
        cardPack,
        modeConfigs,
        localCharacters: lib.config.characters,
        localCards: lib.config.cards
      }
    };
  },
  /**
   * 格式化时间戳为可读字符串
   * @param {number} timestamp 时间戳
   * @returns {string} 格式化的时间字符串
   */
  formatTime(timestamp) {
    if (!timestamp) return "未知";
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  },
  /**
   * 获取模式名称翻译
   * @param {string} mode 模式ID
   * @returns {string} 模式名称
   */
  getModeName(mode) {
    const modeNames = {
      identity: "身份局",
      guozhan: "国战",
      doudizhu: "斗地主",
      versus: "对战",
      boss: "BOSS",
      chess: "棋局",
      tafang: "塔防",
      stone: "乱世",
      brawl: "乱斗",
      single: "单挑",
      connect: "联机"
    };
    return modeNames[mode] || mode;
  },
  /**
   * 当前打开的共享配置面板（形如 { cleanup }），未打开时为 null
   */
  _dialog: null,
  /**
   * 关闭共享配置面板（幂等，可安全地在任意退出路径调用：关闭按钮、房间断开、房间界面被销毁等）
   * @returns {boolean} 是否关闭了一个已打开的面板
   */
  closeDialog() {
    const dialog = roomConfig._dialog;
    if (dialog) {
      dialog.cleanup();
      return true;
    }
    roomConfig.removeLeakedDialogNodes();
    return false;
  },
  /**
   * 清理残留的共享配置覆盖层与 iframe，避免不可见的全屏节点吞掉整页点击
   */
  removeLeakedDialogNodes() {
    document.querySelectorAll('[id^="room-config-overlay-"]').forEach((node) => node.remove());
    document.querySelectorAll('iframe[data-room-config-panel="1"]').forEach((node) => node.remove());
  },
  /**
   * 显示共享配置对话框（使用iframe隔离CSS）
   */
  showDialog() {
    var self = this;
    if (roomConfig._dialog) {
      roomConfig._dialog.cleanup();
    }
    var opener = ui.roomConfigButton;
    var wasOnline = !!(game.online || game.onlineroom);
    var closed = false;
    var confirmSeq = 0;
    var confirmWaiters = /* @__PURE__ */ new Map();
    var isOnline = game.online;
    var onConfigsUpdated = function() {
      if (isOnline) refreshList();
    };
    var overlay = document.createElement("div");
    overlay.id = "room-config-overlay-" + Date.now();
    overlay.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:999999;background:rgba(0,0,0,0.5);";
    var iframe = document.createElement("iframe");
    iframe.setAttribute("data-room-config-panel", "1");
    iframe.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;border:none;";
    iframe.sandbox = "allow-scripts allow-same-origin";
    overlay.appendChild(iframe);
    document.body.appendChild(overlay);
    var html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: transparent;
}
.panel {
  width: 560px;
  max-width: calc(100vw - 32px);
  min-height: 280px;
  max-height: calc(100vh - 48px);
  overflow: auto;
  background: #3d3d3d;
  color: #fff;
  border-radius: 8px;
  box-shadow: 0 3px 10px rgba(0,0,0,0.45);
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.title { font-size: 18px; font-weight: bold; }
.close-btn {
  width: 30px;
  height: 30px;
  font-size: 20px;
  line-height: 26px;
  text-align: center;
  border-radius: 4px;
  background: linear-gradient(#4b4b4b,#464646);
  border: none;
  color: #fff;
  cursor: pointer;
}
.content { padding: 15px; }
.action-bar { display: flex; gap: 10px; margin-bottom: 15px; }
.btn {
  flex: 1;
  padding: 8px;
  background: linear-gradient(#4b4b4b,#464646);
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
}
.config-list { min-height: 100px; }
.config-item {
  padding: 12px;
  margin-bottom: 8px;
  background: rgba(255,255,255,0.05);
  border-radius: 5px;
}
.config-name { font-size: 16px; font-weight: bold; margin-bottom: 5px; }
.config-meta { font-size: 12px; color: #888; margin-bottom: 10px; }
.actions { display: flex; gap: 8px; }
.actions button {
  padding: 5px 15px;
  font-size: 12px;
  background: linear-gradient(#4b4b4b,#464646);
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
}
.actions .delete { background: rgba(244,67,54,0.5); }
.empty { text-align: center; padding: 20px; color: #888; }
.error { text-align: center; padding: 20px; color: #f66; }
.toast {
  position: fixed;
  left: 50%;
  bottom: 32px;
  transform: translateX(-50%);
  max-width: 80%;
  padding: 10px 16px;
  background: rgba(0,0,0,0.85);
  color: #fff;
  font-size: 14px;
  border-radius: 4px;
  z-index: 10;
}
.modal-mask {
  position: fixed;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.5);
  z-index: 20;
}
.modal-box {
  width: 320px;
  max-width: calc(100vw - 32px);
  padding: 16px;
  background: #3d3d3d;
  color: #fff;
  border-radius: 6px;
  box-shadow: 0 3px 10px rgba(0,0,0,0.45);
}
.modal-text { font-size: 14px; line-height: 1.5; margin-bottom: 12px; }
.modal-input {
  width: 100%;
  padding: 8px;
  margin-bottom: 12px;
  border: 1px solid #555;
  background: #2d2d2d;
  color: #fff;
  border-radius: 4px;
  box-sizing: border-box;
}
.modal-bar { display: flex; gap: 10px; }
</style>
</head>
<body>
<div class="panel">
  <div class="header">
    <div class="title">共享配置</div>
    <button class="close-btn" onclick="closeDialog()">×</button>
  </div>
    <div class="content">
      <div id="saveDialog" style="display:none;margin-bottom:15px;padding:10px;background:rgba(255,255,255,0.1);border-radius:4px;">
        <div style="margin-bottom:8px;font-size:14px;">请输入配置名称：</div>
        <input type="text" id="configNameInput" style="width:100%;padding:8px;margin-bottom:10px;border:1px solid #555;background:#2d2d2d;color:#fff;border-radius:4px;box-sizing:border-box;" placeholder="配置名称">
        <div style="display:flex;gap:10px;">
          <button class="btn" onclick="confirmSave()" style="flex:1;">确定</button>
          <button class="btn" onclick="cancelSave()" style="flex:1;background:#555;">取消</button>
        </div>
      </div>
      <div class="action-bar">
        <button class="btn" onclick="showSaveDialog()">保存当前配置</button>
        <button class="btn" onclick="refreshList()">刷新列表</button>
      </div>
    <div class="config-list" id="configList">
      <div class="empty">加载中...</div>
    </div>
  </div>
</div>
<script>
var currentMode = '';
function closeDialog() { window.parent.postMessage({type:'closeConfigDialog'}, '*'); }
function showSaveDialog() {
  document.getElementById('saveDialog').style.display = 'block';
  document.querySelector('.action-bar').style.display = 'none';
  var input = document.getElementById('configNameInput');
  input.value = '';
  input.focus();
}
function cancelSave() {
  document.getElementById('saveDialog').style.display = 'none';
  document.querySelector('.action-bar').style.display = 'flex';
  document.getElementById('configNameInput').value = '';
}
function confirmSave() {
  var name = document.getElementById('configNameInput').value.trim();
  if(!name) {
    showNotice('请输入配置名称');
    return;
  }
  window.parent.postMessage({type:'saveRoomConfig', name:name}, '*');
  cancelSave();
}
function refreshList() { window.parent.postMessage({type:'refreshRoomConfigs'}, '*'); }
function applyConfig(id) { window.parent.postMessage({type:'applyRoomConfig', id:id}, '*'); }
function saveAsConfig(id) { 
  showPrompt('请输入新配置名称').then(function(name) {
    if(name) window.parent.postMessage({type:'saveAsRoomConfig', id:id, name:name.trim()}, '*');
  });
}
function deleteConfig(id) { 
  showConfirm('确定要删除此配置吗？').then(function(ok) {
    if(ok) window.parent.postMessage({type:'deleteRoomConfig', id:id}, '*');
  });
}
function renderConfigs(configs) {
  var list = document.getElementById('configList');
  if(!configs || configs.length === 0) {
    list.innerHTML = '<div class="empty">暂无共享配置</div>';
    return;
  }
  list.innerHTML = configs.map(function(c) {
    return '<div class="config-item">' +
      '<div class="config-name">' + escapeHtml(c.name) + '</div>' +
      '<div class="config-meta">' + escapeHtml(c.mode) + ' | ' + escapeHtml(c.createdBy||'未知') + '</div>' +
      '<div class="actions">' +
        '<button onclick="applyConfig(' + c.id + ')">应用</button>' +
        '<button onclick="saveAsConfig(' + c.id + ')">另存为</button>' +
        '<button class="delete" onclick="deleteConfig(' + c.id + ')">删除</button>' +
      '</div>' +
    '</div>';
  }).join('');
}
function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
var activeModal = null;
function showNotice(message, onDismiss) {
  var toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(function() {
    if(toast.parentNode) toast.parentNode.removeChild(toast);
    if(onDismiss) onDismiss();
  }, onDismiss ? 1500 : 3000);
}
function openModal(options, callback) {
  if(activeModal) activeModal.cancel();
  var cancelValue = options.input ? null : false;
  var mask = document.createElement('div');
  mask.className = 'modal-mask';
  var box = document.createElement('div');
  box.className = 'modal-box';
  var text = document.createElement('div');
  text.className = 'modal-text';
  text.textContent = options.message;
  box.appendChild(text);
  var input = null;
  if(options.input) {
    input = document.createElement('input');
    input.type = 'text';
    input.className = 'modal-input';
    input.value = options.value || '';
    input.placeholder = options.placeholder || '';
    box.appendChild(input);
  }
  var bar = document.createElement('div');
  bar.className = 'modal-bar';
  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn';
  cancelBtn.textContent = '取消';
  var okBtn = document.createElement('button');
  okBtn.className = 'btn';
  okBtn.textContent = '确定';
  bar.appendChild(cancelBtn);
  bar.appendChild(okBtn);
  box.appendChild(bar);
  mask.appendChild(box);
  document.body.appendChild(mask);
  var modal = { cancel: null };
  function finish(result) {
    if(activeModal !== modal) return;
    activeModal = null;
    document.removeEventListener('keydown', onKeyDown);
    if(mask.parentNode) mask.parentNode.removeChild(mask);
    callback(result);
  }
  function onKeyDown(e) {
    if(e.key === 'Escape') finish(cancelValue);
    else if(e.key === 'Enter') finish(options.input ? input.value : true);
  }
  modal.cancel = function() { finish(cancelValue); };
  activeModal = modal;
  okBtn.addEventListener('click', function() { finish(options.input ? input.value : true); });
  cancelBtn.addEventListener('click', function() { finish(cancelValue); });
  mask.addEventListener('click', function(e) { if(e.target === mask) finish(cancelValue); });
  document.addEventListener('keydown', onKeyDown);
  if(input) { input.focus(); input.select(); } else { okBtn.focus(); }
}
function showConfirm(message) {
  return new Promise(function(resolve) { openModal({ message: message, input: false }, resolve); });
}
function showPrompt(message) {
  return new Promise(function(resolve) {
    openModal({ message: message, input: true, value: '', placeholder: '' }, function(result) {
      resolve(result === null || result === false ? null : String(result));
    });
  });
}
window.addEventListener('message', function(e) {
  if(e.data.type === 'renderConfigs') renderConfigs(e.data.configs);
  if(e.data.type === 'showError') document.getElementById('configList').innerHTML = '<div class="error">' + escapeHtml(e.data.message) + '</div>';
  if(e.data.type === 'setMode') currentMode = e.data.mode;
  if(e.data.type === 'showNotice') showNotice(e.data.message, e.data.thenClose ? function() { window.parent.postMessage({type:'closeConfigDialog'}, '*'); } : null);
  if(e.data.type === 'askConfirm') {
    var requestId = e.data.requestId;
    showConfirm(e.data.message).then(function(ok) {
      window.parent.postMessage({type:'confirmResult', requestId:requestId, ok:ok}, '*');
    });
  }
});
window.parent.postMessage({type:'loadRoomConfigs'}, '*');
<\/script>
</body>
</html>`;
    iframe.srcdoc = html;
    var configCache = null;
    iframe.onload = function() {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: "setMode", mode: lib.config.connect_mode || lib.config.mode || "identity" }, "*");
      }
    };
    function notify(message, thenClose) {
      if (!iframe.contentWindow) return;
      iframe.contentWindow.postMessage({ type: "showNotice", message, thenClose: !!thenClose }, "*");
    }
    function askConfirm(message) {
      return new Promise((resolve) => {
        if (closed || !iframe.contentWindow) {
          resolve(false);
          return;
        }
        var requestId = ++confirmSeq;
        confirmWaiters.set(requestId, resolve);
        iframe.contentWindow.postMessage({ type: "askConfirm", requestId, message }, "*");
      });
    }
    function resolveConfirm(requestId, ok) {
      const resolve = confirmWaiters.get(requestId);
      if (resolve) {
        confirmWaiters.delete(requestId);
        resolve(!!ok);
      }
    }
    var messageHandler = function(e) {
      if (!iframe.contentWindow || e.source !== iframe.contentWindow) return;
      switch (e.data.type) {
        case "closeConfigDialog":
          cleanup();
          break;
        case "loadRoomConfigs":
          refreshList();
          break;
        case "saveRoomConfig":
          saveNewConfig(e.data.name);
          break;
        case "refreshRoomConfigs":
          refreshList();
          break;
        case "applyRoomConfig":
          applyById(e.data.id);
          break;
        case "saveAsRoomConfig":
          saveAs(e.data.id, e.data.name);
          break;
        case "deleteRoomConfig":
          deleteById(e.data.id);
          break;
        case "confirmResult":
          resolveConfirm(e.data.requestId, e.data.ok);
          break;
      }
    };
    window.addEventListener("message", messageHandler);
    function refreshList() {
      roomConfig.getCloudConfigs().then((configs) => {
        if (!iframe.contentWindow) return;
        iframe.contentWindow.postMessage({ type: "renderConfigs", configs }, "*");
        configCache = configs;
      }).catch((err) => {
        if (!iframe.contentWindow) return;
        iframe.contentWindow.postMessage({ type: "showError", message: err.message }, "*");
      });
    }
    function saveNewConfig(name) {
      var config = roomConfig.createFromCurrent(name);
      roomConfig.saveToCloud(config, true).then(() => {
        notify("配置保存成功");
        refreshList();
      }).catch((err) => {
        notify("保存失败: " + err.message);
      });
    }
    function applyById(id) {
      var config = configCache ? configCache.find((c) => c.id == id) : null;
      if (!config) {
        notify("配置未找到");
        return;
      }
      askConfirm("是否同时覆盖单机配置？").then((coverLocal) => {
        try {
          if (coverLocal != null) roomConfig.applyConfig(config, coverLocal);
          notify("配置已应用", true);
        } catch (err) {
          notify("应用配置失败: " + err.message);
        }
      });
    }
    function saveAs(id, name) {
      var config = configCache ? configCache.find((c) => c.id == id) : null;
      if (!config) {
        notify("配置未找到");
        return;
      }
      var newConfig = Object.assign({}, config, { id: null, name });
      roomConfig.saveToCloud(newConfig, true).then(() => {
        notify("配置已另存");
        refreshList();
      }).catch((err) => {
        notify("另存失败: " + err.message);
      });
    }
    function deleteById(id) {
      roomConfig.deleteFromCloud(String(id)).then(() => {
        notify("配置已删除");
        refreshList();
      }).catch((err) => {
        notify("删除失败: " + err.message);
      });
    }
    function cleanup() {
      if (closed) return;
      closed = true;
      clearInterval(guardTimer);
      confirmWaiters.forEach((resolve) => resolve(null));
      confirmWaiters.clear();
      roomConfig.off("roomConfigsUpdated", onConfigsUpdated);
      window.removeEventListener("message", messageHandler);
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      if (roomConfig._dialog && roomConfig._dialog.cleanup === cleanup) {
        roomConfig._dialog = null;
        roomConfig.removeLeakedDialogNodes();
      }
    }
    roomConfig._dialog = { cleanup };
    roomConfig.on("roomConfigsUpdated", onConfigsUpdated);
    var guardTimer = setInterval(function() {
      if (closed) return;
      if (!overlay.isConnected || !iframe.isConnected) {
        cleanup();
        return;
      }
      if (opener && !opener.isConnected) {
        cleanup();
        return;
      }
      if (wasOnline && !game.online && !game.onlineroom) {
        cleanup();
      }
    }, 1e3);
  }
};
export {
  roomConfig
};
