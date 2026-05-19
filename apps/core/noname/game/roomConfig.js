import { game, lib, _status } from "noname";

/**
 * 房间配置云端同步模块
 * 提供配置的保存、加载、应用和删除功能
 */
export const roomConfig = {
	/** 缓存的配置列表 */
	cachedConfigs: null,

	/** 事件监听器 */
	_listeners: new Map(),

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
			roomConfig._listeners.get(event).forEach(callback => callback(...args));
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
			}, 10000);

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
			}, 10000);

			const successHandler = (savedConfig) => {
				clearTimeout(timeout);
				roomConfig.off("roomConfigSaved", successHandler);
				roomConfig.off("roomConfigError", errorHandler);
				// 更新缓存
				if (roomConfig.cachedConfigs) {
					const index = roomConfig.cachedConfigs.findIndex(c => c.id === savedConfig.id);
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
			}, 10000);

			const successHandler = (deletedId) => {
				clearTimeout(timeout);
				roomConfig.off("roomConfigDeleted", successHandler);
				roomConfig.off("roomConfigError", errorHandler);
				// 更新缓存
				if (roomConfig.cachedConfigs) {
					roomConfig.cachedConfigs = roomConfig.cachedConfigs.filter(c => c.id !== deletedId);
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

		// 应用全局武将池
		if (cfg.characterPack && Array.isArray(cfg.characterPack)) {
			lib.config.connect_characters = lib.connectCharacterPack.filter(
				p => !cfg.characterPack.includes(p)
			);
			game.saveConfig("connect_characters", lib.config.connect_characters);
		}

		// 应用全局卡牌池
		if (cfg.cardPack && Array.isArray(cfg.cardPack)) {
			lib.config.connect_cards = lib.connectCardPack.filter(
				p => !cfg.cardPack.includes(p)
			);
			game.saveConfig("connect_cards", lib.config.connect_cards);
		}

		// 新格式：包含所有模式的配置
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
		} else if (cfg.bannedCharacters !== undefined || cfg.chooseTimeout !== undefined) {
			// 旧格式：兼容旧配置（单个模式的配置）
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

		// 应用单机武将包
		if (coverLocal && cfg.localCharacters && Array.isArray(cfg.localCharacters)) {
			lib.config.characters = cfg.localCharacters.slice(0);
			game.saveConfig("characters", lib.config.characters);
		}

		// 应用单机卡牌包
		if (coverLocal && cfg.localCards && Array.isArray(cfg.localCards)) {
			lib.config.cards = cfg.localCards.slice(0);
			game.saveConfig("cards", lib.config.cards);
		}

		roomConfig._emit("configApplied", config);
	},

	/**
	 * 从当前设置创建配置对象
	 * @param {string} name 配置名称
	 * @param {string} mode 游戏模式
	 * @returns {Object} 配置对象
	 */
	createFromCurrent(name) {
		// 获取启用的武将包
		const characterPack = lib.connectCharacterPack.filter(
			p => !lib.config.connect_characters.includes(p)
		);

		// 获取启用的卡牌包
		const cardPack = lib.connectCardPack.filter(
			p => !lib.config.connect_cards.includes(p)
		);

		// 收集所有模式的配置
		const modeConfigs = {};
		const knownKeys = ["connect_choose_timeout", "connect_observe", "connect_observe_handcard", "connect_mount_combine", "connect_change_card"];
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
	 * 显示共享配置对话框（使用iframe隔离CSS）
	 */
	showDialog() {
		var self = this;
		
		// 检查是否在线
		var isOnline = game.online;
		
		var onConfigsUpdated = function () {
			if (isOnline) refreshList();
		};

		// 创建遮罩
		var overlay = document.createElement("div");
		overlay.id = "room-config-overlay-" + Date.now();
		overlay.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:999999;background:rgba(0,0,0,0.5);";
		
		// 创建iframe完全隔离CSS
		var iframe = document.createElement("iframe");
		iframe.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;border:none;";
		iframe.sandbox = "allow-scripts allow-same-origin allow-modals";
		
		overlay.appendChild(iframe);
		document.body.appendChild(overlay);
		
		// 在iframe中创建弹窗内容
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
    alert('请输入配置名称');
    return;
  }
  window.parent.postMessage({type:'saveRoomConfig', name:name}, '*');
  cancelSave();
}
function refreshList() { window.parent.postMessage({type:'refreshRoomConfigs'}, '*'); }
function applyConfig(id) { window.parent.postMessage({type:'applyRoomConfig', id:id}, '*'); }
function saveAsConfig(id) { 
  var name = prompt('请输入新配置名称'); 
  if(name) window.parent.postMessage({type:'saveAsRoomConfig', id:id, name:name.trim()}, '*'); 
}
function deleteConfig(id) { 
  if(confirm('确定要删除此配置吗？')) window.parent.postMessage({type:'deleteRoomConfig', id:id}, '*'); 
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
window.addEventListener('message', function(e) {
  if(e.data.type === 'renderConfigs') renderConfigs(e.data.configs);
  if(e.data.type === 'showError') document.getElementById('configList').innerHTML = '<div class="error">' + escapeHtml(e.data.message) + '</div>';
  if(e.data.type === 'setMode') currentMode = e.data.mode;
});
window.parent.postMessage({type:'loadRoomConfigs'}, '*');
</script>
</body>
</html>`;
		
		iframe.srcdoc = html;
		
		var configCache = null;
		
		// iframe加载完成后发送当前模式
		iframe.onload = function() {
			if (iframe.contentWindow) {
				iframe.contentWindow.postMessage({type:'setMode', mode:lib.config.connect_mode || lib.config.mode || 'identity'}, '*');
			}
		};
		
		// 监听iframe消息
		var messageHandler = function(e) {
			if(!iframe.contentWindow || e.source !== iframe.contentWindow) return;
			
			switch(e.data.type) {
				case 'closeConfigDialog':
					cleanup();
					break;
				case 'loadRoomConfigs':
					refreshList();
					break;
			case 'saveRoomConfig':
				saveNewConfig(e.data.name);
				break;
				case 'refreshRoomConfigs':
					refreshList();
					break;
				case 'applyRoomConfig':
					applyById(e.data.id);
					break;
				case 'saveAsRoomConfig':
					saveAs(e.data.id, e.data.name);
					break;
				case 'deleteRoomConfig':
					deleteById(e.data.id);
					break;
			}
		};
		window.addEventListener('message', messageHandler);
		
		function refreshList() {
			roomConfig.getCloudConfigs().then(configs => {
				if (!iframe.contentWindow) return;
				iframe.contentWindow.postMessage({type:'renderConfigs', configs:configs}, '*');
				configCache = configs;
			}).catch(err => {
				if (!iframe.contentWindow) return;
				iframe.contentWindow.postMessage({type:'showError', message:err.message}, '*');
			});
		}
		
		function saveNewConfig(name) {
			var config = roomConfig.createFromCurrent(name);
			
			roomConfig.saveToCloud(config, true).then(() => {
				alert("配置保存成功");
				refreshList();
			}).catch(err => {
				alert("保存失败: " + err.message);
			});
		}
		
		function applyById(id) {
			var config = configCache ? configCache.find(c => c.id == id) : null;
			if(!config) { alert("配置未找到"); return; }
			
			var coverLocal = confirm("是否同时覆盖单机配置？");
			try {
				roomConfig.applyConfig(config, coverLocal);
				alert("配置已应用");
				cleanup();
			} catch (err) {
				alert("应用配置失败: " + err.message);
			}
		}
		
		function saveAs(id, name) {
			var config = configCache ? configCache.find(c => c.id == id) : null;
			if(!config) { alert("配置未找到"); return; }
			
			var newConfig = Object.assign({}, config, { id: null, name: name });
			roomConfig.saveToCloud(newConfig, true).then(() => {
				alert("配置已另存");
				refreshList();
			}).catch(err => {
				alert("另存失败: " + err.message);
			});
		}
		
		function deleteById(id) {
			roomConfig.deleteFromCloud(String(id)).then(() => {
				alert("配置已删除");
				refreshList();
			}).catch(err => {
				alert("删除失败: " + err.message);
			});
		}
		
		function cleanup() {
			roomConfig.off("roomConfigsUpdated", onConfigsUpdated);
			window.removeEventListener('message', messageHandler);
			if (overlay.parentNode) {
				overlay.parentNode.removeChild(overlay);
			}
		}
		
		roomConfig.on("roomConfigsUpdated", onConfigsUpdated);
	}
};
