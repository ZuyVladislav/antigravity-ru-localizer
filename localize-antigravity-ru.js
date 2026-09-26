"use strict";

// Local, static Russian UI localization for Google Antigravity 2.17.0.
// It never sends application content to a translator or any remote service.
// The sole external tool is the open-source @electron/asar package used to
// unpack and repack Electron's local app.asar archive.

const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const SCRIPT_DIR = __dirname;
const ASAR_VERSION = "4.3.0";
const START = "/* ANTIGRAVITY_RU_LOCALIZER_START */";
const END = "/* ANTIGRAVITY_RU_LOCALIZER_END */";
const MENU_START = "/* ANTIGRAVITY_RU_MENU_START */";
const MENU_END = "/* ANTIGRAVITY_RU_MENU_END */";
const TRAY_START = "/* ANTIGRAVITY_RU_TRAY_START */";
const TRAY_END = "/* ANTIGRAVITY_RU_TRAY_END */";
const ORIGINAL_BACKUP_NAME = "app.asar.antigravity-ru-original.bak";
function supportedResourceDirectories(platform = process.platform, home = os.homedir()) {
  if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.win32.join(home, "AppData", "Local");
    return [path.win32.join(localAppData, "Programs", "antigravity", "resources")];
  }
  if (platform === "linux") {
    const join = path.posix.join;
    return [
      "/opt/antigravity/resources",
      "/opt/Antigravity/resources",
      join(home, ".local", "opt", "antigravity", "resources"),
      join(home, ".local", "opt", "Antigravity", "resources"),
      join(home, ".local", "share", "antigravity", "resources"),
      join(home, "Applications", "antigravity", "resources"),
      join(home, "Applications", "Antigravity", "resources"),
    ];
  }
  if (platform === "darwin") {
    const join = path.posix.join;
    return [
      "/Applications/Antigravity.app/Contents/Resources",
      join(home, "Applications", "Antigravity.app", "Contents", "Resources"),
    ];
  }
  fail(`Unsupported platform: ${platform}. This localizer currently supports Windows, Linux, and macOS.`);
}

function fail(message) {
  throw new Error(message);
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function assertSupportedNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    fail(`Node.js 22.12 or newer is required; found ${process.versions.node}.`);
  }
}

function compactToolOutput(value, limit = 4000) {
  const text = String(value || "unknown error").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n… output truncated (${text.length} characters total)`;
}

function asar(args) {
  assertSupportedNode();
  const packagePath = path.join(SCRIPT_DIR, "node_modules", "@electron", "asar", "package.json");
  const cliPath = path.join(SCRIPT_DIR, "node_modules", "@electron", "asar", "bin", "asar.mjs");
  if (!fs.existsSync(packagePath) || !fs.existsSync(cliPath)) {
    fail(`Pinned @electron/asar ${ASAR_VERSION} is not installed. Run \"npm ci\" in the localizer directory first.`);
  }
  let installedVersion;
  try {
    installedVersion = JSON.parse(fs.readFileSync(packagePath, "utf8")).version;
  } catch (error) {
    fail(`Could not read the installed @electron/asar manifest: ${error.message}`);
  }
  if (installedVersion !== ASAR_VERSION) {
    fail(`Expected @electron/asar ${ASAR_VERSION}, found ${installedVersion || "unknown"}. Run \"npm ci\" to restore the locked dependency.`);
  }
  const result = childProcess.spawnSync(process.execPath, [cliPath, ...args], {
    cwd: SCRIPT_DIR,
    encoding: "utf8",
    stdio: "pipe",
    windowsHide: true,
    shell: false,
  });
  if (result.error) fail(`Could not run the pinned @electron/asar CLI: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`@electron/asar failed: ${compactToolOutput(result.stderr || result.stdout)}`);
  }
  return result.stdout || "";
}

function normalizeAsarEntry(entry) {
  const normalized = String(entry || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    fail(`Unsafe or invalid ASAR entry reported by @electron/asar: ${entry}`);
  }
  return normalized;
}

function parseAsarPackingEntries(output) {
  const entries = new Map();
  for (const line of String(output || "").split(/\r?\n/)) {
    const match = /^\s*(pack|unpack)\s*:\s*(.+?)\s*$/i.exec(line);
    if (!match) continue;
    const name = normalizeAsarEntry(match[2]);
    const mode = match[1].toLowerCase();
    if (entries.has(name) && entries.get(name) !== mode) {
      fail(`Conflicting ASAR packing status for ${name}.`);
    }
    entries.set(name, mode);
  }
  if (!entries.size) fail("@electron/asar did not return a readable packing layout.");
  return entries;
}

function getAsarPackingEntries(archivePath) {
  return parseAsarPackingEntries(asar(["list", "--is-pack", archivePath]));
}

function asarExternalPath(archivePath, entry) {
  return path.join(`${archivePath}.unpacked`, ...entry.split("/"));
}

function getAsarFilePackingLayout(archivePath, entries) {
  const files = new Map();
  for (const [entry, mode] of entries) {
    const externalPath = asarExternalPath(archivePath, entry);
    if (fs.existsSync(externalPath) && fs.lstatSync(externalPath).isDirectory()) continue;
    files.set(entry, mode);
  }
  return files;
}

function makeSingleGlob(paths, label) {
  if (!paths.length) return null;
  if (paths.some((value) => /[{},]/.test(value))) {
    fail(`Cannot safely preserve ${label}: an external path contains a glob control character.`);
  }
  if (paths.length > 1) {
    fail(`Cannot safely preserve ${label}: this Antigravity package uses multiple independent external paths.`);
  }
  const pattern = paths[0].split("/").join(path.sep);
  if (Buffer.byteLength(pattern, "utf8") > 24000) {
    fail(`Cannot safely preserve ${label}: the required matcher is too long.`);
  }
  return pattern;
}

function buildPackingArguments(archivePath) {
  const layout = getAsarPackingEntries(archivePath);
  const unpacked = [...layout.entries()].filter(([, mode]) => mode === "unpack").map(([entry]) => entry);
  if (!unpacked.length) return { layout, args: [] };

  const packed = new Set([...layout.entries()].filter(([, mode]) => mode === "pack").map(([entry]) => entry));
  const directoryCandidates = new Set();
  for (const entry of unpacked) {
    const parts = entry.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      directoryCandidates.add(parts.slice(0, index).join("/"));
    }
  }

  const unpackDirectories = [];
  for (const directory of [...directoryCandidates].sort((left, right) => left.length - right.length)) {
    if (unpackDirectories.some((parent) => directory.startsWith(`${parent}/`))) continue;
    const externalPath = asarExternalPath(archivePath, directory);
    const hasPackedFile = [...packed].some((entry) => {
      if (!entry.startsWith(`${directory}/`)) return false;
      const packedExternalPath = asarExternalPath(archivePath, entry);
      return !fs.existsSync(packedExternalPath) || !fs.lstatSync(packedExternalPath).isDirectory();
    });
    if (!hasPackedFile && fs.existsSync(externalPath) && fs.lstatSync(externalPath).isDirectory()) {
      unpackDirectories.push(directory);
    }
  }
  const unpackFiles = unpacked.filter((entry) => !unpackDirectories.some((directory) => entry.startsWith(`${directory}/`)));
  for (const entry of unpackFiles) {
    const externalPath = asarExternalPath(archivePath, entry);
    if (!fs.existsSync(externalPath)) {
      fail(`Required external Antigravity resource is missing: ${externalPath}. Restore the original application before localizing.`);
    }
  }
  if (!unpackDirectories.length && !unpackFiles.length) {
    fail("Could not identify the external Antigravity resources required by this app.asar.");
  }
  const args = [];
  const directoryPattern = makeSingleGlob(unpackDirectories, "the unpacked directory layout");
  const filePattern = makeSingleGlob(unpackFiles, "the unpacked file layout");
  if (directoryPattern) args.push(`--unpack-dir=${directoryPattern}`);
  if (filePattern) args.push(`--unpack=${filePattern}`);
  return { layout, args };
}

function assertSamePackingLayout(expectedArchive, expected, actualArchive, actual) {
  const expectedFiles = getAsarFilePackingLayout(expectedArchive, expected);
  const actualFiles = getAsarFilePackingLayout(actualArchive, actual);
  if (expectedFiles.size !== actualFiles.size) {
    fail("Repacked app.asar has a different file-entry count from the original package.");
  }
  for (const [entry, mode] of expectedFiles) {
    if (actualFiles.get(entry) !== mode) {
      fail(`Repacked app.asar changed the external-resource layout at ${entry}.`);
    }
  }
}

function macAppBundle(resources) {
  const contents = path.dirname(resources);
  const appBundle = path.dirname(contents);
  if (path.basename(contents) !== "Contents" || !path.basename(appBundle).endsWith(".app")) {
    fail("On macOS --resources must be inside Antigravity.app/Contents/Resources.");
  }
  if (!fs.existsSync("/usr/bin/codesign")) {
    fail("macOS codesign was not found at /usr/bin/codesign.");
  }
  return appBundle;
}

function signMacApp(appBundle) {
  const sign = childProcess.spawnSync("/usr/bin/codesign", ["--force", "--sign", "-", appBundle], {
    cwd: SCRIPT_DIR,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (sign.error || sign.status !== 0) {
    fail(`macOS ad-hoc signing failed: ${(sign.error?.message || sign.stderr || sign.stdout || "unknown error").trim()}`);
  }
  const verify = childProcess.spawnSync("/usr/bin/codesign", ["--verify", "--strict", appBundle], {
    cwd: SCRIPT_DIR,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (verify.error || verify.status !== 0) {
    fail(`macOS signature verification failed: ${(verify.error?.message || verify.stderr || verify.stdout || "unknown error").trim()}`);
  }
}

function resolveResources() {
  const argument = process.argv.find((value) => value.startsWith("--resources="));
  const candidates = supportedResourceDirectories();
  const provided = argument ? argument.slice("--resources=".length) : null;
  let resources;
  if (provided) {
    if (!path.isAbsolute(provided)) fail("--resources must be an absolute path to Antigravity's resources directory.");
    resources = path.resolve(provided);
    if (process.platform === "win32") {
      const expected = path.resolve(candidates[0]).toLowerCase();
      if (resources.toLowerCase() !== expected) {
        fail(`For safety the Windows target must be: ${candidates[0]}`);
      }
    } else if (path.basename(resources) !== "resources") {
      fail("For safety --resources must point exactly to a directory named resources.");
    }
  } else {
    resources = candidates.find((candidate) => fs.existsSync(path.join(candidate, "app.asar")));
    if (!resources) {
      fail(`Antigravity app.asar was not found. Pass --resources=/absolute/path/to/resources. Checked:\n${candidates.map((candidate) => `  - ${candidate}`).join("\n")}`);
    }
  }
  if (!fs.existsSync(path.join(resources, "app.asar"))) {
    fail(`Antigravity app.asar was not found at ${resources}.`);
  }
  if (process.platform === "darwin") macAppBundle(resources);
  return resources;
}

function resolveManifestPath() {
  const selected = process.env.ANTIGRAVITY_RU_MANIFEST_PATH;
  if (!selected) return path.join(SCRIPT_DIR, "install-manifest.json");
  if (!path.isAbsolute(selected)) {
    fail("ANTIGRAVITY_RU_MANIFEST_PATH must be an absolute path when supplied.");
  }
  return path.resolve(selected);
}

function inspect() {
  const resources = resolveResources();
  const asarPath = path.join(resources, "app.asar");
  const backupPath = path.join(resources, ORIGINAL_BACKUP_NAME);
  console.log(JSON.stringify({
    resources,
    appAsar: asarPath,
    appAsarSha256: sha256(asarPath),
    backupExists: fs.existsSync(backupPath),
    backupPath,
  }, null, 2));
}

function removeMarkedBlock(source, start, end) {
  let cleaned = source;
  while (true) {
    const first = cleaned.indexOf(start);
    if (first < 0) return cleaned;
    const last = cleaned.indexOf(end, first);
    if (last < 0) fail(`Found ${start} without its closing marker.`);
    cleaned = cleaned.slice(0, first) + cleaned.slice(last + end.length);
  }
}

function loadDictionary() {
  const dictionaryPath = path.join(SCRIPT_DIR, "dicts", "ru.json");
  const dictionary = JSON.parse(fs.readFileSync(dictionaryPath, "utf8"));
  if (Object.keys(dictionary).length < 4000) {
    fail("Russian dictionary is incomplete.");
  }
  for (const [key, value] of Object.entries(dictionary)) {
    if (typeof key !== "string" || typeof value !== "string") {
      fail("Russian dictionary contains a non-string entry.");
    }
  }
  return dictionary;
}

function makePreloadScript(dictionary) {
  const dictionaryJson = JSON.stringify(dictionary);
  return `${START}
(() => {
  "use strict";
  // Only exact fixed-interface labels are translated. User prompts, model
  // responses, source code, terminals, editors, and browser content are kept.
  const dictionary = ${dictionaryJson};
  const exact = new Map(Object.entries(dictionary));
  const lower = new Map(Object.entries(dictionary).map(([key, value]) => [key.toLowerCase(), value]));
  const blockedTags = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "INPUT", "TEXTAREA", "SVG", "CANVAS", "SYMBOL", "PATH"]);
  const blockedClasses = ["monaco-editor", "editor-container", "terminal", "output-view", "debug-console", "code-view", "artifact-container", "suggest-widget", "chat-message", "assistant-message", "user-message", "conversation-message", "markdown", "prose"];
  const blockedSelectors = ["[contenteditable='true']", "[data-testid='user-input-step']", "[data-ag-localization-skip]", "[data-message-id]", "[data-turn-id]", "[data-testid*='message']", "article", "pre", "code", "textarea", "input"];

  const normalize = (value) => String(value || "").replace(/\\s+/g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim();
  const permissionTitles = new Map([
    ["Allow checking Docker contexts and Postgres service path?", "Разрешить проверку контекстов Docker и пути к службе PostgreSQL?"],
  ]);
  const translatePermissionText = (value) => {
    const normalized = normalize(value);
    if (permissionTitles.has(normalized)) return permissionTitles.get(normalized);
    if (/^Allow\\s+.+\\?$/i.test(normalized)) return "Разрешить действие агента?";
    if (/^Yes, allow this time$/i.test(normalized)) return "Да, разрешить сейчас";
    if (/^No\\s*\\(tell the agent what to do instead\\)$/i.test(normalized)) return "Нет (указать агенту другой вариант)";
    if (/^Submit\\s+([↵⏎])$/i.test(normalized)) return "Отправить " + normalized.slice(-1);
    const templates = [
      [/^Yes, and always allow\\s+(.+?)\\s+in this conversation$/i, "Да, всегда разрешать $1 в этом диалоге"],
      [/^Yes, and always allow\\s+(.+?)\\s+when not in a project$/i, "Да, всегда разрешать $1 вне проекта"],
      [/^Yes, and always allow\\s+(.+?)\\s+in this project$/i, "Да, всегда разрешать $1 в этом проекте"],
      [/^Yes, and always allow\\s+(.+?)\\s+in all projects$/i, "Да, всегда разрешать $1 во всех проектах"],
      [/^Yes, and always allow\\s+(.+)$/i, "Да, всегда разрешать $1"],
    ];
    for (const [pattern, replacement] of templates) {
      if (pattern.test(normalized)) return normalized.replace(pattern, replacement);
    }
    return null;
  };
  const translationFor = (value) => {
    const normalized = normalize(value);
    if (!normalized) return null;
    const permissionTranslation = translatePermissionText(normalized);
    if (permissionTranslation) return permissionTranslation;
    return exact.get(normalized) || lower.get(normalized.toLowerCase()) || null;
  };
  const isBlocked = (node) => {
    let current = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    while (current) {
      if (current.nodeType !== Node.ELEMENT_NODE) return true;
      if (blockedTags.has(current.tagName)) return true;
      if (current.getAttribute("translate") === "no") return true;
      if (blockedSelectors.some((selector) => current.matches(selector))) return true;
      const classes = typeof current.className === "string" ? current.className : "";
      if (blockedClasses.some((className) => classes.includes(className))) return true;
      current = current.parentElement;
    }
    return false;
  };
  const translateText = (node) => {
    if (!node || isBlocked(node)) return;
    const source = node.nodeValue;
    const translated = translationFor(source);
    if (!translated || translated === source) return;
    const leading = (source.match(/^\\s*/) || [""])[0];
    const trailing = (source.match(/\\s*$/) || [""])[0];
    node.nodeValue = leading + translated + trailing;
  };
  const translateAttributes = (element) => {
    if (!element || isBlocked(element)) return;
    for (const attribute of ["placeholder", "aria-placeholder", "title", "aria-label", "data-placeholder"]) {
      const source = element.getAttribute(attribute);
      const translated = translationFor(source);
      if (translated && translated !== source) element.setAttribute(attribute, translated);
    }
  };
  const scan = (root) => {
    if (!root || !document.documentElement) return;
    const owner = root.ownerDocument || document;
    const walker = owner.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE && isBlocked(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let node = walker.currentNode;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) translateText(node);
      else if (node.nodeType === Node.ELEMENT_NODE) {
        translateAttributes(node);
        if (node.shadowRoot) scan(node.shadowRoot);
      }
      node = walker.nextNode();
    }
  };
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      scan(document.documentElement);
    });
  };
  const observe = () => {
    schedule();
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["title", "aria-label", "placeholder", "data-placeholder"] });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observe, { once: true });
  else observe();
})();
${END}`;
}

function patchMenu(content) {
  const cleaned = removeMarkedBlock(content, MENU_START, MENU_END);
  const target = "electron_1.Menu.setApplicationMenu(menu);";
  if (!cleaned.includes(target)) fail("Antigravity 2.17.0 menu insertion point was not found.");
  const translations = {
    File: "Файл", Edit: "Правка", View: "Вид", Window: "Окно", Help: "Справка",
    "New Window": "Новое окно", "Create Project": "Создать проект", "Command Palette": "Палитра команд",
    Docs: "Документация", "Check for Updates": "Проверить обновления", "Toggle Developer Tools": "Инструменты разработчика",
    Undo: "Отменить", Redo: "Повторить", Cut: "Вырезать", Copy: "Копировать", Paste: "Вставить", "Select All": "Выделить всё",
    Minimize: "Свернуть", Maximize: "Развернуть", Close: "Закрыть", Zoom: "Масштаб", "Reset Zoom": "Сбросить масштаб",
    "Zoom In": "Увеличить", "Zoom Out": "Уменьшить", "Toggle Full Screen": "Полный экран", Version: "Версия",
    "About Antigravity": "О программе Antigravity", Services: "Службы", "Hide Antigravity": "Скрыть Antigravity",
    "Hide Others": "Скрыть остальные", "Show All": "Показать все", "Quit Antigravity": "Выйти из Antigravity", Quit: "Выйти",
    "Connect to WSL": "Подключиться к WSL", "Reopen Locally": "Открыть локально",
  };
  const injection = `${MENU_START}
const antigravityRuMenu = ${JSON.stringify(translations)};
function localizeAntigravityMenu(items) {
  for (const item of items || []) {
    const source = item.label || "";
    const mnemonic = source.match(/&([a-zA-Z])/);
    const clean = source.replace("&", "");
    const translated = antigravityRuMenu[clean] || antigravityRuMenu[source];
    if (translated) item.label = translated + (mnemonic ? " (&" + mnemonic[1] + ")" : "");
    if (item.submenu && item.submenu.items) localizeAntigravityMenu(item.submenu.items);
  }
}
localizeAntigravityMenu(menu.items);
${MENU_END}`;
  return cleaned.replace(target, `${injection}\n${target}`)
    .replace("return { label: 'Connect to WSL', submenu };", "return { label: 'Подключиться к WSL', submenu };")
    .replace("return { label: 'Reopen Locally', click: () => relaunchWithWslDistro('') };", "return { label: 'Открыть локально', click: () => relaunchWithWslDistro('') };");
}

function patchTray(content) {
  let patched = removeMarkedBlock(content, TRAY_START, TRAY_END);
  const translations = {
    "No agents running": "Нет запущенных агентов",
    "Open Antigravity": "Открыть Antigravity",
    Quit: "Выйти",
    "Connect to WSL": "Подключиться к WSL",
    "Reopen Locally": "Открыть локально",
  };
  const createTarget = "function createTray(actions) {";
  if (patched.includes(createTarget)) {
    patched = patched.replace(createTarget, `${createTarget}\n${TRAY_START}\nconst antigravityRuTray = ${JSON.stringify(translations)};\nfor (const item of actions || []) if (antigravityRuTray[item.label]) item.label = antigravityRuTray[item.label];\n${TRAY_END}`);
  }
  const insertTarget = "function insertTrayMenuItem(position, options) {";
  if (patched.includes(insertTarget)) {
    patched = patched.replace(insertTarget, `${insertTarget}\n${TRAY_START}\nconst antigravityRuTrayDynamic = ${JSON.stringify(translations)};\nif (options && antigravityRuTrayDynamic[options.label]) options.label = antigravityRuTrayDynamic[options.label];\n${TRAY_END}`);
  }
  return patched.replace(/countItem\.label\s*=\s*\([\s\S]*?' running';/g, "countItem.label = count > 0 ? `${count} агентов запущено` : 'Нет запущенных агентов';");
}

function replaceOptionalFiles(unpacked) {
  const staticReplacements = [
    ["dist/loadingOverlay.js", "<div class=\"text\">Loading Antigravity</div>", "<div class=\"text\">Загрузка Antigravity</div>"],
    ["dist/updater.js", "title: 'Check for Updates',", "title: 'Проверить обновления',"],
    ["dist/updater.js", "message: 'No updates available',", "message: 'Нет доступных обновлений',"],
    ["dist/provisionSplash.js", "<div>Setting up WSL: ${escapeHtml(distro)}</div>", "<div>Настройка WSL: ${escapeHtml(distro)}</div>"],
    ["dist/wsl.js", "onStatus?.('Downloading the Antigravity binary\\u2026');", "onStatus?.('Скачивание Antigravity\\u2026');"],
    ["dist/wsl.js", "onStatus?.(`Installing into ${distro}\\u2026`);", "onStatus?.(`Установка в ${distro}\\u2026`);"],
    ["dist/main.js", "await electron_1.dialog.showErrorBox('WSL setup failed', msg);", "await electron_1.dialog.showErrorBox('Ошибка настройки WSL', msg);"],
  ];
  for (const [relativePath, source, replacement] of staticReplacements) {
    const filePath = path.join(unpacked, relativePath);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    fs.writeFileSync(filePath, content.replace(source, replacement), "utf8");
  }
}

function install() {
  const resources = resolveResources();
  const asarPath = path.join(resources, "app.asar");
  const backupPath = path.join(resources, ORIGINAL_BACKUP_NAME);
  const appBundle = process.platform === "darwin" ? macAppBundle(resources) : null;
  const dictionary = loadDictionary();
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(asarPath, backupPath);
  } else {
    fs.copyFileSync(backupPath, asarPath);
  }
  const originalHash = sha256(backupPath);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "antigravity-ru-"));
  const unpacked = path.join(work, "unpacked");
  const packed = path.join(work, "app.asar");
  try {
    const packing = buildPackingArguments(asarPath);
    asar(["extract", asarPath, unpacked]);
    const preloadPath = path.join(unpacked, "dist", "preload.js");
    if (!fs.existsSync(preloadPath)) fail("Antigravity 2.17.0 preload.js was not found after extraction.");
    const preload = removeMarkedBlock(fs.readFileSync(preloadPath, "utf8"), START, END);
    fs.writeFileSync(preloadPath, `${preload}\n${makePreloadScript(dictionary)}\n`, "utf8");
    const menuPath = path.join(unpacked, "dist", "menu.js");
    if (!fs.existsSync(menuPath)) fail("Antigravity 2.17.0 menu.js was not found after extraction.");
    fs.writeFileSync(menuPath, patchMenu(fs.readFileSync(menuPath, "utf8")), "utf8");
    const trayPath = path.join(unpacked, "dist", "tray.js");
    if (fs.existsSync(trayPath)) fs.writeFileSync(trayPath, patchTray(fs.readFileSync(trayPath, "utf8")), "utf8");
    replaceOptionalFiles(unpacked);
    asar(["pack", unpacked, packed, ...packing.args]);
    assertSamePackingLayout(asarPath, packing.layout, packed, getAsarPackingEntries(packed));
    if (fs.statSync(packed).size < 1000000) fail("Repacked app.asar is unexpectedly small.");
    fs.copyFileSync(packed, asarPath);
    if (appBundle) {
      try {
        signMacApp(appBundle);
      } catch (error) {
        fs.copyFileSync(backupPath, asarPath);
        try {
          signMacApp(appBundle);
        } catch (rollbackError) {
          fail(`macOS signing failed and the original app.asar was restored, but its signature could not be restored automatically: ${rollbackError.message}`);
        }
        throw error;
      }
    }
    const manifest = {
      product: "Google Antigravity",
      expectedVersion: "2.17.0",
      localizedAt: new Date().toISOString(),
      resources,
      originalSha256: originalHash,
      localizedSha256: sha256(asarPath),
      staticDictionaryEntries: Object.keys(dictionary).length,
      dataHandling: "Local static UI mapping only; no application data sent to a translation service.",
      externalResourceLayout: "Preserved and verified against the original app.asar before replacement.",
      rollback: path.join(resources, ORIGINAL_BACKUP_NAME),
      macAppBundle: appBundle,
    };
    fs.writeFileSync(resolveManifestPath(), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log(`Russian UI localization installed. Backup: ${backupPath}`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function restore() {
  const resources = resolveResources();
  const asarPath = path.join(resources, "app.asar");
  const backupPath = path.join(resources, ORIGINAL_BACKUP_NAME);
  const appBundle = process.platform === "darwin" ? macAppBundle(resources) : null;
  if (!fs.existsSync(backupPath)) fail(`Original backup was not found: ${backupPath}`);
  fs.copyFileSync(backupPath, asarPath);
  if (appBundle) signMacApp(appBundle);
  console.log(`Restored the original Antigravity app.asar from ${backupPath}`);
}

function selfTest() {
  const dictionary = loadDictionary();
  const injected = makePreloadScript(dictionary);
  new vm.Script(injected, { filename: "antigravity-ru-preload.js" });
  const windowsResources = supportedResourceDirectories("win32", "C:\\Users\\tester");
  const linuxResources = supportedResourceDirectories("linux", "/home/tester");
  const macResources = supportedResourceDirectories("darwin", "/Users/tester");
  if (windowsResources.length !== 1 || path.win32.basename(windowsResources[0]) !== "resources") {
    fail("Windows resource-directory resolution is invalid.");
  }
  for (const requiredLinuxPath of ["/opt/antigravity/resources", "/home/tester/.local/opt/antigravity/resources"]) {
    if (!linuxResources.includes(requiredLinuxPath)) fail(`Linux resource directory is missing: ${requiredLinuxPath}`);
  }
  for (const requiredMacPath of ["/Applications/Antigravity.app/Contents/Resources", "/Users/tester/Applications/Antigravity.app/Contents/Resources"]) {
    if (!macResources.includes(requiredMacPath)) fail(`macOS resource directory is missing: ${requiredMacPath}`);
  }
  if (dictionary["New Conversation"] !== "Новый диалог" || dictionary["No Project"] !== "Без проекта" || dictionary["Model"] !== "Модель" || dictionary["Agent terminated due to error"] !== "Агент остановлен из-за ошибки") {
    fail("Required Antigravity 2.17.0 UI labels are missing from the dictionary.");
  }
  if (/[\p{Script=Han}]/u.test(JSON.stringify(dictionary))) {
    fail("Russian dictionary unexpectedly contains Chinese text.");
  }
  const injectedWithoutDictionary = injected.replace(JSON.stringify(dictionary), "{}");
  if (/(fetch\(|XMLHttpRequest|translate\.googleapis|openrouter|ollama)/i.test(injectedWithoutDictionary)) {
    fail("Injected script contains a remote translation route.");
  }
  for (const expected of ["Разрешить действие агента?", "Да, разрешить сейчас", "Нет (указать агенту другой вариант)", "в этом диалоге", "вне проекта"]) {
    if (!injected.includes(expected)) fail(`Permission-dialog translation is missing: ${expected}`);
  }
  const menuFixture = "const menu = { items: [] };\nelectron_1.Menu.setApplicationMenu(menu);";
  const twicePatchedMenu = patchMenu(patchMenu(menuFixture));
  if ((twicePatchedMenu.match(/ANTIGRAVITY_RU_MENU_START/g) || []).length !== 1) {
    fail("Menu patch is not idempotent.");
  }
  const trayFixture = "function createTray(actions) {}\nfunction insertTrayMenuItem(position, options) {}";
  const twicePatchedTray = patchTray(patchTray(trayFixture));
  if ((twicePatchedTray.match(/ANTIGRAVITY_RU_TRAY_START/g) || []).length !== 2) {
    fail("Tray patch is not idempotent.");
  }
  const layoutFixture = parseAsarPackingEntries("pack   : \\dist\nunpack : \\node_modules\\native-addon\n");
  if (layoutFixture.get("dist") !== "pack" || layoutFixture.get("node_modules/native-addon") !== "unpack") {
    fail("ASAR external-resource layout parsing is invalid.");
  }
  if (!compactToolOutput("x".repeat(5000)).includes("output truncated")) {
    fail("ASAR diagnostic output is not bounded.");
  }
  console.log(`Self-test passed: ${Object.keys(dictionary).length} static entries; no remote translation route.`);
}

function dependencyCheck() {
  asar(["--version"]);
  console.log(`Pinned @electron/asar ${ASAR_VERSION} dependency check passed.`);
}

try {
  if (process.argv.includes("--self-test")) selfTest();
  else if (process.argv.includes("--dependency-check") || process.argv.includes("--npx-self-test")) dependencyCheck();
  else if (process.argv.includes("--inspect")) inspect();
  else if (process.argv.includes("--restore")) restore();
  else install();
} catch (error) {
  console.error(`Localization was not installed: ${error.message}`);
  process.exitCode = 1;
}
