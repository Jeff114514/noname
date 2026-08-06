import "../../noname.js";
import { _status } from "../status/index.js";
import { lib } from "../library/index.js";
import { get } from "../get/index.js";
import { game } from "./index.js";
import { ui } from "../ui/index.js";
function isFreeChooseEnabled() {
  if (_status.connectMode) {
    return lib.configOL?.free_choose === true;
  }
  return get.config("free_choose") !== false;
}
function normalizeCharacterLink(link) {
  if (link == null) {
    return "";
  }
  if (Array.isArray(link)) {
    link = link[2] ?? link[0];
  }
  return get.sourceCharacter(link) || link;
}
function getOLCharacterPool(extraFilter) {
  let list;
  if (_status.characterlist?.length) {
    list = _status.characterlist.slice(0);
  } else {
    list = get.charactersOL(typeof extraFilter === "function" ? extraFilter : void 0);
  }
  if (typeof extraFilter === "function") {
    list = list.filter((name) => !extraFilter(name));
  }
  return list;
}
function isCharacterChooseDialog(event) {
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
function setOLChoicePool(playerid, list) {
  if (!game._olPlayerChoicePools) {
    game._olPlayerChoicePools = {};
  }
  game._olPlayerChoicePools[playerid] = list.slice(0);
}
function getOLChoicePool(playerid) {
  return game._olPlayerChoicePools?.[playerid] || game._characterChoice?.[playerid];
}
function validateOLCharacterLinks(player, links, options = {}) {
  if (!_status.connectMode || !links?.length) {
    return true;
  }
  const freeChoose = options.freeChoose ?? isFreeChooseEnabled();
  const normalized = links.map(normalizeCharacterLink).filter(Boolean);
  if (freeChoose) {
    const pool = getOLCharacterPool(options.poolFilter);
    const poolSet = new Set(pool);
    return normalized.every((name) => isInOLPool(name, poolSet, pool));
  }
  const allowedRandom = options.allowedRandom ?? (player?.playerid ? getOLChoicePool(player.playerid) : void 0);
  if (allowedRandom?.length) {
    const allowedSet = new Set(allowedRandom.map(normalizeCharacterLink));
    return normalized.every((name) => {
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
  return false;
}
function sanitizeOLCharacterResult(player, result, options = {}) {
  if (!result?.links?.length) {
    return result;
  }
  if (validateOLCharacterLinks(player, result.links, options)) {
    return result;
  }
  return null;
}
function resetFreeChooseSelection() {
  ui.selected.buttons.length = 0;
  if (game._playerChoice) {
    delete game._playerChoice;
  }
  if (_status.event) {
    delete _status.event._buttonChoice;
  }
  if (ui.confirm) {
    ui.confirm.close();
  }
}
function refreshFreeChooseDialogCheck() {
  resetFreeChooseSelection();
  game.uncheck("button");
  game.check();
}
function isOnFreeChooseDialog(event) {
  const dialog = event?.dialog ?? _status.event?.dialog;
  if (!dialog) {
    return false;
  }
  const dialogxx = resolveFreeChooseDialogxx(event ?? _status.event);
  if (dialogxx && dialog === dialogxx) {
    return true;
  }
  return ui.cheat2?.dialog === dialog;
}
function installFreeChooseFilterButton(event) {
  if (!_status.connectMode) {
    return;
  }
  const pool = getOLCharacterPool();
  const poolSet = new Set(pool);
  const prevFilter = event.filterButton;
  event.filterButton = (button, player) => {
    if (isOnFreeChooseDialog(event)) {
      if (!pool.length) {
        return typeof prevFilter === "function" ? prevFilter(button, player) : lib.filter.filterButton(button, player);
      }
      const link = normalizeCharacterLink(button.link);
      return isInOLPool(link, poolSet, pool) || isInOLPool(button.link, poolSet, pool);
    }
    return typeof prevFilter === "function" ? prevFilter(button, player) : lib.filter.filterButton(button, player);
  };
}
function handleFreeChooseCharacterButton(button) {
  if (!_status.event?.isMine?.()) {
    return;
  }
  if (!button.classList.contains("selectable")) {
    return;
  }
  const range = get.select(_status.event.selectButton);
  const max = range[1];
  if (button.classList.contains("selected")) {
    ui.selected.buttons.remove(button);
    button.classList.remove("selected");
  } else {
    if (max === 1) {
      for (const b of ui.selected.buttons.slice()) {
        b.classList.remove("selected");
      }
      ui.selected.buttons.length = 0;
    } else if (ui.selected.buttons.length >= max) {
      return;
    }
    button.classList.add("selected");
    ui.selected.buttons.add(button);
  }
  game.check();
}
function installFreeChooseButtonHandler(event) {
  if (!isFreeChooseEnabled()) {
    return;
  }
  installFreeChooseFilterButton(event);
  if (!event.custom) {
    event.custom = {};
  }
  if (!event.custom.replace) {
    event.custom.replace = {};
  }
  const userButton = event.custom.replace.button;
  event.custom.replace.button = function(button) {
    if (isOnFreeChooseDialog(_status.event)) {
      handleFreeChooseCharacterButton(button);
      return;
    }
    if (typeof userButton === "function") {
      userButton(button);
      return;
    }
    if (!_status.event.isMine()) {
      return;
    }
    if (!button.classList.contains("selectable")) {
      return;
    }
    if (button.classList.contains("selected")) {
      ui.selected.buttons.remove(button);
      button.classList.remove("selected");
      if (_status.multitarget || _status.event.complexSelect) {
        game.uncheck();
        game.check();
      }
    } else {
      button.classList.add("selected");
      ui.selected.buttons.add(button);
    }
    if (typeof _status.event.custom?.add?.button === "function") {
      _status.event.custom.add.button();
    }
    game.check();
  };
}
function resolveFreeChooseDialogxx(event) {
  if (event?.dialogxx) {
    return event.dialogxx;
  }
  const parent = event?.getParent?.() ?? event?.parent;
  return parent?.dialogxx;
}
function createFreeChooseCheat2(event) {
  if (ui.cheat2) {
    ui.cheat2.close();
    delete ui.cheat2;
  }
  ui.create.cheat2 = function() {
    ui.cheat2 = ui.create.control("自由选将", function() {
      const evt = _status.event;
      const dialogxx = resolveFreeChooseDialogxx(evt);
      if (!dialogxx) {
        return;
      }
      if (this.dialog == evt.dialog) {
        if (game.changeCoin) {
          game.changeCoin(10);
        }
        this.dialog.close();
        evt.dialog = this.backup;
        if (this.backup?.videoId != null) {
          this.backup.style.display = "";
        }
        this.backup.open();
        delete this.backup;
        installFreeChooseFilterButton(evt);
        refreshFreeChooseDialogCheck();
        if (ui.cheat) {
          ui.cheat.addTempClass("controlpressdownx", 500);
          ui.cheat.classList.remove("disabled");
        }
      } else {
        if (game.changeCoin) {
          game.changeCoin(-10);
        }
        this.backup = evt.dialog;
        if (evt.dialog.videoId != null) {
          evt.dialog.style.display = "none";
        } else {
          evt.dialog.close();
        }
        evt.dialog = dialogxx;
        this.dialog = evt.dialog;
        evt.dialog.open();
        installFreeChooseFilterButton(evt);
        refreshFreeChooseDialogCheck();
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
function setupFreeChoose(event, options = {}) {
  if (!isFreeChooseEnabled()) {
    return;
  }
  installFreeChooseButtonHandler(event);
  if (event.showConfig) {
    return;
  }
  if (ui.cheat2) {
    ui.cheat2.close();
    delete ui.cheat2;
  }
  const defaultFilter = (name) => {
    if (!_status.connectMode) {
      return false;
    }
    const pool = getOLCharacterPool();
    if (!pool.length) {
      return false;
    }
    const poolSet = new Set(pool);
    const src = normalizeCharacterLink(name);
    return !isInOLPool(src, poolSet, pool) && !isInOLPool(name, poolSet, pool);
  };
  const filter = options.filter ?? event.freeChooseFilter ?? defaultFilter;
  const expandall = options.expandall ?? (_status.connectMode ? "expandall" : void 0);
  const createCharacterDialog = () => {
    event.dialogxx = ui.create.characterDialog("heightset", filter, expandall, options.onlypack);
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
  createFreeChooseCheat2(event);
}
function closeOLCharacterChooseDialogs(event) {
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
function teardownFreeChoose(event) {
  closeOLCharacterChooseDialogs(event);
  if (ui.cheat2) {
    ui.cheat2.close();
    delete ui.cheat2;
  }
  if (ui.create.cheat2) {
    delete ui.create.cheat2;
  }
}
function initPlayerFromOLResult(player, result, options = {}) {
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
const connectFreeChoose = {
  isFreeChooseEnabled,
  normalizeCharacterLink,
  getOLCharacterPool,
  isCharacterChooseDialog,
  setOLChoicePool,
  getOLChoicePool,
  validateOLCharacterLinks,
  sanitizeOLCharacterResult,
  handleFreeChooseCharacterButton,
  resetFreeChooseSelection,
  refreshFreeChooseDialogCheck,
  installFreeChooseFilterButton,
  installFreeChooseButtonHandler,
  createFreeChooseCheat2,
  setupFreeChoose,
  teardownFreeChoose,
  closeOLCharacterChooseDialogs,
  initPlayerFromOLResult
};
export {
  closeOLCharacterChooseDialogs,
  connectFreeChoose,
  createFreeChooseCheat2,
  getOLCharacterPool,
  getOLChoicePool,
  handleFreeChooseCharacterButton,
  initPlayerFromOLResult,
  installFreeChooseButtonHandler,
  installFreeChooseFilterButton,
  isCharacterChooseDialog,
  isFreeChooseEnabled,
  normalizeCharacterLink,
  refreshFreeChooseDialogCheck,
  resetFreeChooseSelection,
  sanitizeOLCharacterResult,
  setOLChoicePool,
  setupFreeChoose,
  teardownFreeChoose,
  validateOLCharacterLinks
};
