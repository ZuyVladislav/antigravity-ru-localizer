"use strict";

// Local, static Russian UI localization for Google Antigravity 2.19.1.
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
const SUPPORTED_APP_VERSION = "2.19.1";
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
      "/opt/Antigravity/Antigravity-x64/resources",
      "/opt/Antigravity/Antigravity-arm64/resources",
      "/usr/share/antigravity/resources",
      "/usr/lib/antigravity/resources",
      "/usr/lib64/antigravity/resources",
      join(home, ".local", "opt", "antigravity", "resources"),
      join(home, ".local", "opt", "Antigravity", "resources"),
      join(home, ".local", "share", "antigravity", "resources"),
      join(home, ".local", "share", "Antigravity", "resources"),
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

function assertResourcesDirectoryName(resources, platform = process.platform) {
  const expected = platform === "darwin" ? "Resources" : "resources";
  if (path.basename(resources) !== expected) {
    fail(`For safety --resources must point exactly to a directory named ${expected}.`);
  }
}

function verifyMacAppSignature(appBundle) {
  const verify = childProcess.spawnSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", appBundle], {
    cwd: SCRIPT_DIR,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (verify.error || verify.status !== 0) {
    fail(`macOS signature verification failed: ${(verify.error?.message || verify.stderr || verify.stdout || "unknown error").trim()}`);
  }
}

function signMacApp(appBundle) {
  const sign = childProcess.spawnSync("/usr/bin/codesign", [
    "--force",
    "--sign",
    "-",
    "--preserve-metadata=entitlements,flags,runtime",
    appBundle,
  ], {
    cwd: SCRIPT_DIR,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (sign.error || sign.status !== 0) {
    fail(`macOS ad-hoc signing failed: ${(sign.error?.message || sign.stderr || sign.stdout || "unknown error").trim()}`);
  }
  verifyMacAppSignature(appBundle);
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
    } else assertResourcesDirectoryName(resources);
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

function verifyInstallation() {
  const resources = resolveResources();
  const asarPath = path.join(resources, "app.asar");
  const backupPath = path.join(resources, ORIGINAL_BACKUP_NAME);
  if (!fs.existsSync(backupPath)) fail(`Original backup was not found: ${backupPath}`);
  const currentHash = sha256(asarPath);
  const backupHash = sha256(backupPath);
  if (currentHash === backupHash) fail("The active app.asar is identical to the backup; the Russian localization is not installed.");
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "antigravity-ru-verify-"));
  const unpacked = path.join(work, "unpacked");
  try {
    asar(["extract", asarPath, unpacked]);
    const appVersion = assertSupportedAppVersion(unpacked);
    const preloadPath = path.join(unpacked, "dist", "preload.js");
    const menuPath = path.join(unpacked, "dist", "menu.js");
    if (!fs.existsSync(preloadPath) || !fs.readFileSync(preloadPath, "utf8").includes(START)) {
      fail("The active app.asar does not contain the Russian preload localization marker.");
    }
    if (!fs.existsSync(menuPath) || !fs.readFileSync(menuPath, "utf8").includes(MENU_START)) {
      fail("The active app.asar does not contain the Russian application-menu localization marker.");
    }
    const appBundle = process.platform === "darwin" ? macAppBundle(resources) : null;
    if (appBundle) verifyMacAppSignature(appBundle);
    console.log(JSON.stringify({
      verified: true,
      platform: process.platform,
      appVersion,
      resources,
      appAsarSha256: currentHash,
      backupSha256: backupHash,
      macAppBundle: appBundle,
      macSignatureVerified: Boolean(appBundle),
    }, null, 2));
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
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

function assertSupportedAppVersion(unpacked) {
  const manifestPath = path.join(unpacked, "package.json");
  if (!fs.existsSync(manifestPath)) {
    fail("Antigravity package.json was not found after extraction.");
  }
  let appVersion;
  try {
    appVersion = String(JSON.parse(fs.readFileSync(manifestPath, "utf8")).version || "");
  } catch (error) {
    fail(`Could not read the Antigravity package version: ${error.message}`);
  }
  if (appVersion !== SUPPORTED_APP_VERSION) {
    fail(`This localizer supports only Antigravity ${SUPPORTED_APP_VERSION}; found ${appVersion || "unknown"}. Download a matching localizer release instead of patching an unverified version.`);
  }
  return appVersion;
}

const PERMISSION_SCOPES = [
  ["when not in a project", "вне проекта"],
  ["in this conversation", "в этом диалоге"],
  ["in this project", "в этом проекте"],
  ["in this workspace", "в этом рабочем пространстве"],
  ["in all projects", "во всех проектах"],
  ["globally", "глобально"],
];
const PERMISSION_PREFIXES = [
  ["Yes, and always allow", "Да, всегда разрешать"],
  ["Yes, save rule for", "Да, сохранить правило для"],
  ["Yes, save rule", "Да, сохранить правило"],
  ["Да, всегда разрешать", "Да, всегда разрешать"],
  ["Да, сохранить правило", "Да, сохранить правило"],
];

// Keep variable UI labels separate from the exact-match dictionary. This
// function is also embedded in the preload, so its behavior is tested here.
function translateDynamicUiText(value) {
  if (/^No\s*\(tell the agent what to do instead\)$/i.test(value)) {
    return "Нет (указать агенту другой вариант)";
  }
  if (/^\(tell the agent what to do instead\)$/i.test(value)) {
    return "(указать агенту другой вариант)";
  }
  if (/^tell the agent what to do instead$/i.test(value)) {
    return "указать агенту другой вариант";
  }

  const lowerValue = value.toLowerCase();
  for (const [english, russian] of PERMISSION_SCOPES) {
    if (lowerValue === english) return russian;
  }
  for (const [english, russian] of PERMISSION_PREFIXES) {
    if (lowerValue === english.toLowerCase()) return russian;
    if (!lowerValue.startsWith(english.toLowerCase() + " ")) continue;
    let remainder = value.slice(english.length);
    for (const [scope, translation] of PERMISSION_SCOPES) {
      if (remainder.toLowerCase().endsWith(" " + scope)) {
        remainder = remainder.slice(0, -scope.length) + translation;
        break;
      }
    }
    return russian + remainder;
  }

  let match = /^Show\s+(\d+)\s+breakdowns?$/i.exec(value);
  if (match) return "Показать детализацию (" + match[1] + ")";
  match = /^(\d+)\s+tools?\s+(enabled|disabled)$/i.exec(value);
  if (match) return "Инструментов " + (match[2].toLowerCase() === "enabled" ? "включено: " : "отключено: ") + match[1];
  match = /^([\d][\d.,\s]*)\/\s*([\d][\d.,\s]*)\s+tokens(?:\s+(\([^)]*\)))?$/i.exec(value);
  if (match) {
    const percentage = match[3] ? " " + match[3] : "";
    return match[1].trim() + " / " + match[2].trim() + " токенов" + percentage;
  }

  if (/^Searching web$/i.test(value)) return "Поиск в интернете";
  match = /^Explored\s+(\d+)\s+search(?:es)?,\s*ran\s+(\d+)\s+commands?$/i.exec(value);
  if (match) return `Выполнено поисковых запросов: ${match[1]}; команд: ${match[2]}`;
  match = /^Explored\s+(\d+)\s+search(?:es)?$/i.exec(value);
  if (match) return `Выполнено поисковых запросов: ${match[1]}`;
  match = /^Exploring\s+(\d+)\s+search(?:es)?$/i.exec(value);
  if (match) {
    const n = Number(match[1]);
    const word = n % 100 >= 11 && n % 100 <= 14 ? "запросов" : n % 10 === 1 ? "запрос" : n % 10 >= 2 && n % 10 <= 4 ? "запроса" : "запросов";
    return `Идёт поиск: ${match[1]} ${word}`;
  }
  match = /^Ran\s+(\d+)\s+commands?$/i.exec(value);
  if (match) return `Выполнено команд: ${match[1]}`;
  match = /^Running\s+(\d+)\s+commands?$/i.exec(value);
  if (match) return `Выполняется команд: ${match[1]}`;

  if (value === "Resets in") return "Сброс через";
  match = /^Resets in\s+(.+)$/i.exec(value);
  if (match) {
    if (match[1] === "<1m") return "Сброс менее чем через 1 мин.";
    const parts = match[1].match(/\d+\s*[dhms]/gi);
    if (parts && parts.join(" ").replace(/\s+/g, "") === match[1].replace(/\s+/g, "")) {
      const units = { d: "д.", h: "ч.", m: "мин.", s: "с." };
      return "Сброс через " + parts.map((part) => {
        const item = /^(\d+)\s*([dhms])$/i.exec(part);
        return `${item[1]} ${units[item[2].toLowerCase()]}`;
      }).join(" ");
    }
  }
  return null;
}

// Known public catalogue descriptions only. Some cards truncate their text
// before it reaches the DOM; show a fixed Russian summary for those entries.
// These mappings never edit a skill's source, instructions, ID or server name.
const CATALOG_DESCRIPTIONS = [
  ["Interactive guide to design and create a scheduled background automation.", "Руководство по созданию фоновых задач по расписанию: ежедневные сводки, еженедельные списки дел и другие повторяющиеся задания. Также открывается командой /automation."],
  ["Manage the separately connected second Gmail account used as a reserve mailbox and for service registrations, security notices, and account recovery.", "Работа с отдельно подключённым вторым Gmail для регистраций в сервисах, уведомлений безопасности и восстановления доступа. Поиск и чтение писем, очистка, метки, архивирование, вложения и подготовка сообщений в указанном втором ящике."],
  ["How to manage and create plugins — namespaced bundles of skills, agents, rules, MCP servers and hooks", "Управление и создание плагинов — комплектов навыков, агентов, правил, серверов MCP и обработчиков, которые устанавливаются, включаются и отключаются вместе. Установка, удаление и создание плагинов; команда /plugin. Для отдельных навыков и правил используйте руководство по кастомизации."],
  ["Build, package, run, and debug UI extensions for Antigravity:", "Создание, сборка, запуск и отладка расширений интерфейса Antigravity: интерактивных веб-панелей в боковой области. Панели обслуживаются отдельным процессом Node.js через встроенный Sidecar SDK."],
  ["Discover UI plugin panels relevant to the current task and surface a one-click pill in chat", "Поиск панелей плагинов, полезных для текущей задачи, и добавление в чат кнопки для открытия панели в боковой области. Также используется после включения новой панели плагина."],
  ["The Cloud Audit Manager remote MCP server allows you to enroll projects, generate audit and scope reports, and check resource enrollment statuses", "Удалённый сервер MCP Cloud Audit Manager позволяет подключать проекты к аудиту, создавать отчёты об аудите и его области и проверять состояние подключения ресурсов."],
  ["Investigate and fix software issues using AI-powered root cause analysis. This MCP server connects to your Antimetal account", "Поиск и исправление проблем программного обеспечения с помощью ИИ-анализа причин. Сервер MCP подключается к аккаунту Antimetal для поиска проблем и чтения отчётов расследования."],
  ["Query and act on your marketing, analytics, CRM, e-commerce, and warehouse data across 325+ connectors", "Запросы и операции с данными маркетинга, аналитики, CRM, интернет-магазинов и хранилищ через более 325 подключений, включая Meta Ads, Google Ads, TikTok Ads, GA4 и HubSpot."],
  ["Query your GitLab SDLC as a knowledge graph. Orbit indexes", "Запросы к данным жизненного цикла разработки в GitLab в виде графа знаний. Orbit объединяет группы, проекты, исходный код, запросы на слияние, сборки, задачи и результаты проверок безопасности."],
  ["Enable Antigravity to deploy apps to Google Cloud Run.", "Развёртывание приложений в Google Cloud Run через Antigravity."],
];

function translateCatalogDescription(value) {
  for (const [source, translated] of CATALOG_DESCRIPTIONS) {
    if (value === source || value.startsWith(source + " ") || value.startsWith(source + "...") || value.startsWith(source + "…")) return translated;
  }
  return null;
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
  const PERMISSION_SCOPES = ${JSON.stringify(PERMISSION_SCOPES)};
  const PERMISSION_PREFIXES = ${JSON.stringify(PERMISSION_PREFIXES)};
  const translateDynamicUiText = ${translateDynamicUiText.toString()};
  const CATALOG_DESCRIPTIONS = ${JSON.stringify(CATALOG_DESCRIPTIONS)};
  const translateCatalogDescription = ${translateCatalogDescription.toString()};
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
    const dynamicTranslation = translateDynamicUiText(normalized);
    if (dynamicTranslation) return dynamicTranslation;
    const permissionTranslation = translatePermissionText(normalized);
    if (permissionTranslation) return permissionTranslation;
    return exact.get(normalized) || lower.get(normalized.toLowerCase()) || translateCatalogDescription(normalized) || null;
  };
  const isBlocked = (node, allowFormFieldAttributes = false) => {
    const target = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    let current = target;
    while (current) {
      if (current.nodeType !== Node.ELEMENT_NODE) return true;
      const isTargetFormField = allowFormFieldAttributes && current === target && /^(INPUT|TEXTAREA)$/.test(current.tagName);
      if (blockedTags.has(current.tagName) && !isTargetFormField) return true;
      if (current.getAttribute("translate") === "no") return true;
      if (blockedSelectors.some((selector) => {
        if (isTargetFormField && (selector === "input" || selector === "textarea")) return false;
        return current.matches(selector);
      })) return true;
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
    const isFormField = element && /^(INPUT|TEXTAREA)$/.test(element.tagName);
    if (!element || isBlocked(element, isFormField)) return;
    for (const attribute of ["placeholder", "aria-placeholder", "title", "aria-label", "data-placeholder"]) {
      if (isFormField && attribute !== "placeholder" && attribute !== "aria-placeholder") continue;
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
        if (node.nodeType === Node.ELEMENT_NODE && isBlocked(node)) {
          const isFormField = /^(INPUT|TEXTAREA)$/.test(node.tagName);
          if (!isFormField || isBlocked(node, true)) return NodeFilter.FILTER_REJECT;
        }
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
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["title", "aria-label", "placeholder", "aria-placeholder", "data-placeholder"] });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observe, { once: true });
  else observe();
})();
${END}`;
}

function patchMenu(content) {
  const cleaned = removeMarkedBlock(content, MENU_START, MENU_END);
  const target = "electron_1.Menu.setApplicationMenu(menu);";
  if (!cleaned.includes(target)) fail(`Antigravity ${SUPPORTED_APP_VERSION} menu insertion point was not found.`);
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
  const createTarget = /function createTray\(actions(?:,\s*onClick)?\) \{/;
  if (createTarget.test(patched)) {
    patched = patched.replace(createTarget, (target) => `${target}\n${TRAY_START}\nconst antigravityRuTray = ${JSON.stringify(translations)};\nfor (const item of actions || []) if (antigravityRuTray[item.label]) item.label = antigravityRuTray[item.label];\n${TRAY_END}`);
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
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "antigravity-ru-"));
  const unpacked = path.join(work, "unpacked");
  const packed = path.join(work, "app.asar");
  try {
    const packing = buildPackingArguments(asarPath);
    asar(["extract", asarPath, unpacked]);
    const preloadPath = path.join(unpacked, "dist", "preload.js");
    const appVersion = assertSupportedAppVersion(unpacked);
    if (!fs.existsSync(preloadPath)) fail(`Antigravity ${SUPPORTED_APP_VERSION} preload.js was not found after extraction.`);
    const installedPreload = fs.readFileSync(preloadPath, "utf8");
    const alreadyLocalized = installedPreload.includes(START);
    if (!alreadyLocalized) {
      // An Antigravity update replaces app.asar. Refresh the rollback copy from
      // that new pristine archive instead of restoring a stale previous-version backup.
      fs.copyFileSync(asarPath, backupPath);
    } else if (!fs.existsSync(backupPath)) {
      fail("The installed archive is already localized, but its original backup is missing. Reinstall Antigravity before patching it again.");
    }
    const originalHash = sha256(backupPath);
    const preload = removeMarkedBlock(installedPreload, START, END);
    fs.writeFileSync(preloadPath, `${preload}\n${makePreloadScript(dictionary)}\n`, "utf8");
    const menuPath = path.join(unpacked, "dist", "menu.js");
    if (!fs.existsSync(menuPath)) fail(`Antigravity ${SUPPORTED_APP_VERSION} menu.js was not found after extraction.`);
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
      expectedVersion: SUPPORTED_APP_VERSION,
      actualVersion: appVersion,
      alreadyLocalized,
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
  const backupHash = sha256(backupPath);
  fs.copyFileSync(backupPath, asarPath);
  if (appBundle) signMacApp(appBundle);
  if (sha256(asarPath) !== backupHash) fail("The restored app.asar does not match the original backup.");
  console.log(`Restored the original Antigravity app.asar from ${backupPath}`);
}

function selfTestPreloadDom(injected) {
  // Execute the actual generated preload against a minimal DOM fixture.
  // The fixture contains no application data and requires no browser process.
  const Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  const NodeFilter = { SHOW_ELEMENT: 1, SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 };
  let document;
  const element = (tag, attributes = {}, children = []) => {
    const node = {
      nodeType: Node.ELEMENT_NODE, tagName: tag.toUpperCase(),
      className: attributes.class || "", children, attributes: { ...attributes },
      parentElement: null, ownerDocument: document,
      getAttribute(name) { return this.attributes[name] ?? null; },
      setAttribute(name, value) { this.attributes[name] = value; },
      matches(selector) {
        if (!selector.startsWith("[")) return selector === this.tagName.toLowerCase();
        const match = /^\[([\w-]+)(?:(\*?=)'([^']*)')?\]$/.exec(selector);
        if (!match) throw new Error("Unsupported DOM fixture selector: " + selector);
        const actual = this.getAttribute(match[1]);
        if (!match[2]) return actual !== null;
        return actual !== null && (match[2] === "*=" ? actual.includes(match[3]) : actual === match[3]);
      },
    };
    for (const child of children) child.parentElement = node;
    return node;
  };
  const text = (value) => ({ nodeType: Node.TEXT_NODE, nodeValue: value, parentElement: null, ownerDocument: document });
  const jobs = [];
  let mutationCallback;
  document = {
    readyState: "complete",
    createTreeWalker(root, _whatToShow, filter) {
      const nodes = [root];
      const visit = (node) => {
        if (filter.acceptNode(node) === NodeFilter.FILTER_REJECT) return;
        nodes.push(node);
        for (const child of node.children || []) visit(child);
      };
      for (const child of root.children || []) visit(child);
      let index = 0;
      return { currentNode: root, nextNode() { return nodes[++index] || null; } };
    },
  };
  const uiLabel = text("Changes to third-party model access");
  const uiCount = text("24 tools enabled");
  const splitPlan = [text("and select"), text("plan"), text("to have the agent generate a plan.")];
  const description = text(CATALOG_DESCRIPTIONS[3][0] + " interactive web panels...");
  const preservedModels = ["Medium", "Thinking", "Economy", "High accuracy"].map(text);
  const preservedNames = ["Windsor.ai", "Cloud Run", "ui-extension"].map(text);
  const protectedText = [];
  const protectedContainers = [];
  for (const [tag, attributes] of [
    ["pre", {}], ["code", {}], ["article", {}],
    ["div", { class: "chat-message" }], ["div", { class: "user-message" }],
    ["div", { class: "assistant-message markdown" }], ["div", { class: "prose" }],
    ["div", { class: "monaco-editor" }], ["div", { class: "terminal" }],
    ["div", { "data-message-id": "fixture-message" }], ["div", { "data-turn-id": "fixture-turn" }],
    ["div", { "data-testid": "user-input-step" }], ["div", { "data-ag-localization-skip": "" }],
    ["div", { contenteditable: "true" }], ["div", { translate: "no" }],
  ]) {
    const leaves = [text("Model"), text("24 tools enabled"), text(CATALOG_DESCRIPTIONS[3][0])];
    protectedText.push(...leaves.map(node => ({ node, original: node.nodeValue })));
    protectedContainers.push(element(tag, attributes, leaves));
  }
  const input = element("input", { placeholder: "Search MCP servers by name", title: "Model", "aria-label": "Model", value: "Model" });
  input.value = "User-entered Model";
  const textarea = element("textarea", { placeholder: "Describe the bug you encountered...", value: "Model" });
  textarea.value = "User-entered Medium";
  const protectedInput = element("input", { placeholder: "Search MCP servers by name" });
  const root = element("html", {}, [element("body", {}, [
    element("div", {}, [uiLabel, uiCount, description, splitPlan[0], element("code", {}, [splitPlan[1]]), splitPlan[2], ...preservedModels, ...preservedNames]),
    input, textarea, element("div", { "data-ag-localization-skip": "" }, [protectedInput]), ...protectedContainers,
  ])]);
  document.documentElement = root;
  new vm.Script(injected).runInNewContext({ document, Node, NodeFilter,
    queueMicrotask(callback) { jobs.push(callback); },
    MutationObserver: class { constructor(callback) { mutationCallback = callback; } observe() {} },
  });
  const flush = () => { while (jobs.length) jobs.shift()(); };
  flush();
  const assert = (condition, message) => { if (!condition) fail("Preload DOM test: " + message); };
  assert(uiLabel.nodeValue === "Изменения в доступе к сторонним моделям", "notification translation failed");
  assert(uiCount.nodeValue === "Инструментов включено: 24", "tool count translation failed");
  assert(description.nodeValue === CATALOG_DESCRIPTIONS[3][1], "known catalogue description translation failed");
  assert(splitPlan.map(node => node.nodeValue).join(" ") === "и выберите plan чтобы агент составил план.", "split plan hint translation failed");
  for (const entry of protectedText) assert(entry.node.nodeValue === entry.original, "protected message/code text changed");
  const expectedNames = ["Medium", "Thinking", "Economy", "High accuracy", "Windsor.ai", "Cloud Run", "ui-extension"];
  [...preservedModels, ...preservedNames].forEach((node, index) => assert(node.nodeValue === expectedNames[index], "model/server identifier changed"));
  assert(input.getAttribute("placeholder") === "Поиск серверов MCP по имени", "search placeholder translation failed");
  assert(input.value === "User-entered Model" && input.getAttribute("value") === "Model" && input.getAttribute("title") === "Model" && input.getAttribute("aria-label") === "Model", "form input data or label changed");
  assert(textarea.value === "User-entered Medium" && textarea.getAttribute("value") === "Model", "textarea content changed");
  assert(textarea.getAttribute("placeholder") === "Опишите обнаруженную ошибку...", "feedback placeholder translation failed");
  assert(protectedInput.getAttribute("placeholder") === "Search MCP servers by name", "protected field placeholder changed");
  const inserted = text("7 tools enabled");
  root.children[0].children.push(inserted);
  inserted.parentElement = root.children[0];
  mutationCallback();
  flush();
  assert(inserted.nodeValue === "Инструментов включено: 7", "new catalogue content was not translated");
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
  for (const requiredLinuxPath of ["/opt/antigravity/resources", "/opt/Antigravity/Antigravity-x64/resources", "/usr/share/antigravity/resources", "/home/tester/.local/opt/antigravity/resources"]) {
    if (!linuxResources.includes(requiredLinuxPath)) fail(`Linux resource directory is missing: ${requiredLinuxPath}`);
  }
  for (const requiredMacPath of ["/Applications/Antigravity.app/Contents/Resources", "/Users/tester/Applications/Antigravity.app/Contents/Resources"]) {
    if (!macResources.includes(requiredMacPath)) fail(`macOS resource directory is missing: ${requiredMacPath}`);
  }
  assertResourcesDirectoryName("/opt/antigravity/resources", "linux");
  assertResourcesDirectoryName("/Applications/Antigravity.app/Contents/Resources", "darwin");
  let rejectedWrongMacCase = false;
  try {
    assertResourcesDirectoryName("/Applications/Antigravity.app/Contents/resources", "darwin");
  } catch (error) {
    rejectedWrongMacCase = error.message.includes("Resources");
  }
  if (!rejectedWrongMacCase) fail("macOS resource-directory case validation is invalid.");
  if (dictionary["New Conversation"] !== "Новый диалог" || dictionary["No Project"] !== "Без проекта" || dictionary["Model"] !== "Модель" || dictionary["Agent terminated due to error"] !== "Агент остановлен из-за ошибки") {
    fail(`Required Antigravity ${SUPPORTED_APP_VERSION} UI labels are missing from the dictionary.`);
  }
  const screenshotTranslations = [
    ["Gemini 3.6 & 3.7 Flash Deprecation", "Скорое отключение Gemini 3.6 и 3.7 Flash"],
    ["Make sure you are using Gemini 3.8 Flash! We will be turning down Gemini 3.6 Flash and Gemini 3.7 Flash shortly.", "Убедитесь, что вы используете Gemini 3.8 Flash. В ближайшее время Gemini 3.6 Flash и Gemini 3.7 Flash будут отключены."],
    ["Changes to third-party model access", "Изменения в доступе к сторонним моделям"],
    ["Opus 5.5 and Sonnet 5.5 are available on paid Pro and Ultra plans. Third-party model access will no longer be available on your current plan starting on November 2, 2026.", "Opus 5.5 и Sonnet 5.5 доступны на платных тарифах Pro и Ultra. С 2 ноября 2026 года на вашем текущем тарифе больше не будет доступа к сторонним моделям."],
    ["Plan Review Policy", "Политика проверки плана"],
    ["Type / and select plan to have the agent generate a plan.", "Нажмите / и выберите команду plan, чтобы агент составил план."],
    ["Close", "Закрыть"],
    ["Notification Settings", "Настройки уведомлений"],
    ["To modify notification settings, open your operating system's system preferences.", "Для изменения настроек уведомлений откройте параметры операционной системы."],
    ["Open System Settings", "Открыть системные настройки"],
    ["Windows Subsystem for Linux", "Подсистема Windows для Linux"],
    ["Run the app against a Linux environment. Connecting relaunches the app into the selected WSL distro.", "Запуск приложения в среде Linux. При подключении приложение перезапустится в выбранном дистрибутиве WSL."],
    ["Other Customizations", "Другие настройки"],
    ["Remote Control Issue", "Проблема с удалённым управлением"],
    ["Describe the bug you encountered...", "Опишите обнаруженную ошибку..."],
    ["Please describe the issue in detail. The more actionable your feedback, the quicker our team can address your request. Some helpful information includes:", "Подробно опишите проблему. Чем точнее будут сведения, тем быстрее команда сможет её решить. Полезно указать:"],
    ["The breakdown below shows token usage from customizations like rules, skills, and MCP. If a budget is exceeded, large rules are demoted to path pointers and large customizations are excluded automatically.", "Здесь показан расход токенов на настройки: правила, навыки и MCP. При превышении лимита большие правила заменяются ссылками на файлы, а крупные настройки автоматически исключаются."],
  ];
  for (const [source, expected] of screenshotTranslations) {
    if (dictionary[source] !== expected) fail("Screenshot UI translation is missing for " + JSON.stringify(source) + ".");
  }
  const preserveModelTerms = ["Economy", "Fast", "High", "Low", "Medium", "Thinking", "high", "low", "medium", "High capability", "High Capability", "High accuracy", "High intelligence"];
  for (const term of preserveModelTerms) {
    if (Object.prototype.hasOwnProperty.call(dictionary, term)) fail("A model label should remain in English: " + term + ".");
  }
  const dynamicFixtures = [
    ["Yes, and always allow", "Да, всегда разрешать"],
    ["Yes, and always allow in this conversation", "Да, всегда разрешать в этом диалоге"],
    ["Да, всегда разрешать in this conversation", "Да, всегда разрешать в этом диалоге"],
    ["Yes, and always allow 'corsairs-harbour.ru' in this project", "Да, всегда разрешать 'corsairs-harbour.ru' в этом проекте"],
    ["Yes, save rule for 'corsairs-harbour.ru' globally", "Да, сохранить правило для 'corsairs-harbour.ru' глобально"],
    ["No (tell the agent what to do instead)", "Нет (указать агенту другой вариант)"],
    ["(tell the agent what to do instead)", "(указать агенту другой вариант)"],
    ["Explored 3 searches, ran 9 commands", "Выполнено поисковых запросов: 3; команд: 9"],
    ["Exploring 2 searches", "Идёт поиск: 2 запроса"],
    ["Ran 4 commands", "Выполнено команд: 4"],
    ["Searching web", "Поиск в интернете"],
    ["Resets in 1d", "Сброс через 1 д."],
    ["Resets in 57m", "Сброс через 57 мин."],
    ["Resets in 1d 2h", "Сброс через 1 д. 2 ч."],
    ["Resets in <1m", "Сброс менее чем через 1 мин."],
    ["Show 1 breakdown", "Показать детализацию (1)"],
    ["Show 3 breakdowns", "Показать детализацию (3)"],
    ["97 / 20 000 tokens (0.5%)", "97 / 20 000 токенов (0.5%)"],
    ["384 / 20,000 tokens (1.9%)", "384 / 20,000 токенов (1.9%)"],
    ["24 tools enabled", "Инструментов включено: 24"],
    ["1 tool enabled", "Инструментов включено: 1"],
    ["2 tools disabled", "Инструментов отключено: 2"],
    ["I explored 3 searches", null],
    ["pwsh -Command docker context ls", null],
  ];
  for (const [source, expected] of dynamicFixtures) {
    if (translateDynamicUiText(source) !== expected) {
      fail(`Dynamic UI translation failed for ${JSON.stringify(source)}.`);
    }
  }
  for (const [source, expected] of CATALOG_DESCRIPTIONS) {
    if (translateCatalogDescription(source) !== expected || translateCatalogDescription(source + " More information...") !== expected) {
      fail("Known catalogue description is not translated: " + source);
    }
  }
  for (const value of ["Unknown MCP server description", "My notes about GitLab SDLC", "Gemini 3.8 Flash Medium", "Cloud Audit Manager (us-central1)", "Antimetal", "Windsor.ai", "GitLab Orbit", "Cloud Run", "ui-extension", "gmail-services-recovery-mail"]) {
    if (translateCatalogDescription(value) !== null) fail("Catalogue translation changed an unknown description or identifier: " + value);
  }
  selfTestPreloadDom(injected);
  if (!injected.includes('attribute !== "placeholder" && attribute !== "aria-placeholder"') || !injected.includes("if (!isFormField || isBlocked(node, true))")) {
    fail("Form-field localization must translate only fixed placeholders while preserving entered values.");
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
  const trayFixture = "function createTray(actions, onClick) {}\nfunction insertTrayMenuItem(position, options) {}";
  const twicePatchedTray = patchTray(patchTray(trayFixture));
  if ((twicePatchedTray.match(/ANTIGRAVITY_RU_TRAY_START/g) || []).length !== 2) {
    fail("Tray patch is not idempotent.");
  }
  if (!twicePatchedTray.includes("const antigravityRuTray =")) {
    fail("Antigravity 2.19.1 tray menu was not localized.");
  }
  const layoutFixture = parseAsarPackingEntries("pack   : \\dist\nunpack : \\node_modules\\native-addon\n");
  if (layoutFixture.get("dist") !== "pack" || layoutFixture.get("node_modules/native-addon") !== "unpack") {
    fail("ASAR external-resource layout parsing is invalid.");
  }
  if (!compactToolOutput("x".repeat(5000)).includes("output truncated")) {
    fail("ASAR diagnostic output is not bounded.");
  }
  const versionFixture = fs.mkdtempSync(path.join(os.tmpdir(), "antigravity-ru-version-test-"));
  try {
    fs.writeFileSync(path.join(versionFixture, "package.json"), JSON.stringify({ version: SUPPORTED_APP_VERSION }), "utf8");
    if (assertSupportedAppVersion(versionFixture) !== SUPPORTED_APP_VERSION) {
      fail("Supported Antigravity version detection is invalid.");
    }
    fs.writeFileSync(path.join(versionFixture, "package.json"), JSON.stringify({ version: "0.0.0" }), "utf8");
    let rejected = false;
    try {
      assertSupportedAppVersion(versionFixture);
    } catch (error) {
      rejected = error.message.includes(SUPPORTED_APP_VERSION);
    }
    if (!rejected) fail("Unsupported Antigravity versions are not rejected.");
  } finally {
    fs.rmSync(versionFixture, { recursive: true, force: true });
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
  else if (process.argv.includes("--verify")) verifyInstallation();
  else if (process.argv.includes("--inspect")) inspect();
  else if (process.argv.includes("--restore")) restore();
  else install();
} catch (error) {
  console.error(`Localization was not installed: ${error.message}`);
  process.exitCode = 1;
}
