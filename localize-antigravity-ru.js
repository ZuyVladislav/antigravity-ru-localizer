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
const TASK_ACTIVITY_TITLES = Object.freeze({
  "Find Yandex Browser executable": "Поиск исполняемого файла Яндекс Браузера",
  "Check npm global packages": "Проверка глобальных пакетов npm",
});

// Keep variable UI labels separate from the exact-match dictionary. This
// function is also embedded in the preload, so its behavior is tested here.
function translateDynamicUiText(value) {
  if (value === "Thinking..." || value === "Thinking…") return "Думает…";
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
  const activityCounts = /^Exploring ([0-9]+) tasks?, running ([0-9]+) commands?$/i.exec(value);
  if (activityCounts) return `Выполняется: задач — ${activityCounts[1]}; команд — ${activityCounts[2]}`;
  const thoughtDuration = /^Thought for (.+)$/i.exec(value);
  if (thoughtDuration) {
    const parts = thoughtDuration[1].match(/[0-9]+[ ]*[dhms]/gi);
    if (parts && parts.join(" ").replace(/ /g, "") === thoughtDuration[1].replace(/ /g, "")) {
      const units = { d: "д.", h: "ч.", m: "мин.", s: "с." };
      return "Думал: " + parts.map((part) => {
        const item = /^([0-9]+)[ ]*([dhms])$/i.exec(part);
        return `${item[1]} ${units[item[2].toLowerCase()]}`;
      }).join(" ");
    }
  }
  const checkedTask = /^Checked task (.+)$/i.exec(value);
  if (checkedTask) return `Проверена задача «${TASK_ACTIVITY_TITLES[checkedTask[1]] || checkedTask[1]}»`;
  const finishedTask = /^(.+) finished$/i.exec(value);
  if (finishedTask) {
    const title = TASK_ACTIVITY_TITLES[finishedTask[1]];
    if (title === "Поиск исполняемого файла Яндекс Браузера") return `${title} завершён`;
    if (title === "Проверка глобальных пакетов npm") return `${title} завершена`;
    if (title) return `Задача «${title}» завершена`;
    return `Задача завершена: ${finishedTask[1]}`;
  }
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
  ["Ask questions. Get answers. The MCP is a server", "Задавайте вопросы о данных PostHog прямо в редакторе: сервер MCP выполняет запросы и возвращает ответы без SQL и панелей с графиками. Например: сколько уникальных пользователей зарегистрировалось за последние 7 дней по дням; создать A/B-тест страницы цен с оценкой переходов к оплате; найти 5 самых частых ошибок проекта за неделю."],
  ["Search and reference over 600,000 real-world app", "Поиск и использование более 600 000 экранов реальных приложений, пользовательских сценариев и шаблонов интерфейса Mobbin прямо в инструментах ИИ."],
  ["Build, edit, deploy, and manage full-stack web apps with Lovable,", "Создание, редактирование, развёртывание и управление веб-приложениями с Lovable на естественном языке. Подключение клиента ИИ к проектам и рабочим пространствам, отправка заданий агенту Lovable, просмотр изменений кода и дерева файлов, чтение и запись знаний проекта, управление базами Postgres и подключениями."],
  ["Let your agents talk to your Splunk data.", "Работа агентов с данными Splunk: задавайте обычным языком вопросы о сбоях, их причинах и изменениях. Агенты ищут события, находят полезные сохранённые поиски и справочники и составляют запросы SPL."],
  ["The Wiz MCP Server connects multiple security data sources", "Сервер MCP Wiz объединяет источники данных безопасности в единое представление для расследования, реагирования на инциденты и устранения проблем. Доступ к облачным ресурсам, конфигурациям и проблемам безопасности с учётом бизнес-контекста помогает выбирать приоритетные меры защиты."],
  ["The GKE remote MCP server provides read write access", "Удалённый сервер MCP GKE предоставляет доступ для чтения и записи ресурсов Kubernetes в GKE. Агент ИИ может изучать и наблюдать за вашей средой."],
  ["The Dart and Flutter MCP server exposes", "Сервер MCP Dart и Flutter предоставляет совместимым клиентам ИИ-помощников действия инструментов разработки Dart и Flutter."],
  ["The Firebase Model Context Protocol (MCP) Server gives", "Сервер Firebase Model Context Protocol (MCP) позволяет инструментам разработки с ИИ работать с вашими проектами Firebase и кодом приложения."],
  ["The Genkit Model Context Protocol (MCP) Server gives", "Сервер Genkit Model Context Protocol (MCP) позволяет инструментам разработки с ИИ создавать, отлаживать и изучать приложение Genkit."],
  ["The gopls Model Context Protocol (MCP) server provides", "Сервер gopls Model Context Protocol (MCP) предоставляет инструменты семантического анализа кода, текущей диагностики и преобразования кода Go."],
  ["Interact with your BigQuery data using natural language.", "Работа с данными BigQuery на естественном языке: безопасное подключение к наборам данных, поиск, просмотр метаданных таблиц, выполнение SQL, прогнозирование временных рядов и анализ вклада факторов прямо из инструментов ИИ."],
  ["The AlloyDB for PostgreSQL remote MCP server lets", "Удалённый сервер MCP AlloyDB for PostgreSQL предоставляет инструменты управления кластерами, экземплярами и пользователями AlloyDB, создания и восстановления резервных копий, импорта и экспорта данных и выполнения SQL из сред разработки и платформ агентов ИИ."],
  ["The Bigtable Admin remote MCP server lets", "Удалённый сервер MCP Bigtable Admin позволяет управлять ресурсами Bigtable."],
  ["Manage Google Cloud resources with gcloud and bq CLI tools", "Управление ресурсами Google Cloud с помощью инструментов командной строки gcloud и bq в удалённой изолированной среде."],
  ["The Cloud SQL remote MCP server lets", "Удалённый сервер MCP Cloud SQL предоставляет инструменты управления экземплярами и пользователями Cloud SQL, создания и восстановления резервных копий, импорта и экспорта данных и выполнения SQL из сред разработки и платформ агентов ИИ."],
  ["The Spanner remote MCP server lets", "Удалённый сервер MCP Spanner предоставляет инструменты создания ресурсов Spanner, управления ими и выполнения запросов из сред разработки и платформ агентов ИИ."],
  ["The Apigee API hub remote MCP server lets", "Удалённый сервер MCP Apigee API hub позволяет на естественном языке создавать, читать, обновлять, удалять и искать API, версии, спецификации, операции, развёртывания, атрибуты, внешние API и зависимости, зарегистрированные в вашем API hub."],
  ["Connect your AI assistants to Looker business intelligence.", "Подключение ИИ-помощников к аналитике Looker: запросы на естественном языке, запуск сохранённых Looks, создание панелей и управление ими, проверка состояния экземпляра Looker."],
  ["Connect your AI assistants to the Knowledge Catalog", "Подключение ИИ-помощников к Knowledge Catalog (прежнее название — Dataplex). Поиск ресурсов данных, получение подробных метаданных, включая схемы и владельцев, и изучение типов аспектов распределённых данных."],
  ["The MCP Toolbox for Databases is an open-source MCP server", "MCP Toolbox for Databases — сервер MCP с открытым исходным кодом для упрощения и защиты разработки инструментов работы с базами данных."],
  ["Interact with your Oracle Database data using natural language.", "Работа с данными Oracle Database на естественном языке: безопасное подключение к базам, выполнение SQL, просмотр схем таблиц и диагностика проблем производительности прямо из инструментов ИИ."],
  ["The Dev Mode MCP Server brings Figma directly", "Сервер MCP Dev Mode предоставляет агентам ИИ данные и контекст дизайна Figma для генерации кода по файлам дизайна прямо в рабочем процессе."],
  ["The GitHub MCP Server is a Model Context Protocol", "Сервер GitHub Model Context Protocol (MCP) обеспечивает интеграцию с API GitHub для автоматизации и взаимодействия разработчиков и инструментов с GitHub."],
  ["The Google Home Developer MCP server allows", "Сервер MCP Google Home Developer позволяет искать сведения в документации Google Home и спецификациях OpenThread и Matter."],
  ["Manage your Neon backend with the Neon MCP Server:", "Управление серверной частью Neon через сервер MCP Neon: Lakebase Postgres, ветвление, Object Storage, Functions и AI Gateway."],
  ["The Stripe Model Context Protocol server allows", "Сервер Stripe Model Context Protocol позволяет работать с API Stripe через вызовы функций. Протокол предоставляет инструменты для взаимодействия с разными сервисами Stripe."],
  ["Interact with Redis key-value stores", "Работа с хранилищами пар «ключ — значение» Redis."],
  ["A Model Context Protocol server for interacting with MongoDB Atlas.", "Сервер Model Context Protocol для работы с MongoDB Atlas."],
  ["Official Notion MCP Server that allows", "Официальный сервер MCP Notion для работы с рабочими пространствами, страницами, базами данных и комментариями через API Notion."],
  ["Official Linear.app MCP Server for interacting", "Официальный сервер MCP Linear.app для работы с проектами, задачами и рабочими процессами Linear."],
  ["An MCP server implementation that integrates the Perplexity Sonar API", "Сервер MCP с интеграцией API Perplexity Sonar для исследования информации во всём интернете в реальном времени."],
  ["Official PayPal MCP Server that allows", "Официальный сервер MCP PayPal для работы с API PayPal: обработка платежей, управление транзакциями и операции с аккаунтом."],
  ["The Heroku Platform MCP Server enables", "Сервер MCP Heroku Platform позволяет языковым моделям просматривать ресурсы Heroku Platform, управлять приложениями, дополнениями, базами данных и другими ресурсами и выполнять операции с ними."],
  ["The Pinecone MCP Server enables AI tools", "Сервер MCP Pinecone позволяет инструментам ИИ искать документацию Pinecone, настраивать индексы, генерировать код с учётом конфигурации индекса, добавлять и обновлять данные и выполнять поиск в индексах."],
  ["Connect your Supabase projects to AI assistants.", "Подключение проектов Supabase к ИИ-помощникам: управление таблицами, получение конфигурации, выполнение SQL, управление edge-функциями и работа со схемой базы данных."],
  ["The Prisma MCP Server enables AI tools", "Сервер MCP Prisma позволяет инструментам ИИ работать с Prisma для создания баз данных Postgres и управления ими."],
  ["The Locofy MCP Server enables Locofy.ai code", "Сервер MCP Locofy позволяет интегрировать и расширять код Locofy.ai в вашей IDE."],
  ["Airweave lets agents search any app.", "Airweave позволяет агентам выполнять поиск в любом приложении."],
  ["Atlassian MCP Server for interacting with Atlassian products.", "Сервер MCP Atlassian для работы с продуктами Atlassian."],
  ["Interact with your Harness account using natural language.", "Работа с аккаунтом Harness на естественном языке: изучение и управление конвейерами CI/CD, запусками, сервисами, средами, подключениями, флагами функций, облачными расходами, результатами проверок безопасности, экспериментами отказоустойчивости и другими ресурсами Harness."],
  ["SonarQube MCP Server enables AI assistants", "Сервер MCP SonarQube позволяет ИИ-помощникам работать с экземплярами SonarQube: анализировать качество кода, управлять проектами и выполнять операции с проверками качества."],
  ["Netlify MCP Server enables AI assistants", "Сервер MCP Netlify позволяет ИИ-помощникам управлять сайтами, развёртываниями, доменами и другими рабочими процессами веб-разработки в Netlify."],
  ["A Model Context Protocol server that provides structured thinking", "Сервер Model Context Protocol для структурированного обдумывания и рассуждения в диалогах с языковыми моделями."],
  ["Sonatype MCP server for interacting with", "Сервер MCP Sonatype для работы с платформой управления зависимостями и анализа безопасности Sonatype."],
  ["The Google Maps Platform Code Assist MCP server provides", "Сервер MCP Google Maps Platform Code Assist предоставляет ИИ-помощнику актуальную официальную документацию Google Maps Platform, примеры кода и рекомендации. Официальные источники помогают генерировать более точный, надёжный и полезный код."],
  ["This MCP server provides your LLM with docs and examples", "Сервер MCP предоставляет языковой модели документацию и примеры подключения трассировки приложений ИИ к Arize AX, а также доступ к поддержке Arize. Подключение к IDE или языковой модели даёт готовые примеры и рекомендации по трассировке."],
  ["The Postman MCP Server connects Postman to AI tools,", "Сервер MCP Postman подключает Postman к инструментам ИИ: доступ к рабочим пространствам, управление коллекциями и средами, проверка API и автоматизация рабочих процессов на естественном языке."],
  ["The Stitch MCP server enables AI assistants", "Сервер MCP Stitch позволяет ИИ-помощникам создавать интерфейсы по тексту и изображениям и получать сведения о проектах и экранах Stitch. Подробнее: https://stitch.withgoogle.com/docs."],
  ["The Google Developer Knowledge MCP server gives", "Сервер MCP Google Developer Knowledge позволяет инструментам разработки с ИИ искать официальную документацию Google и получать сведения о Firebase, Google Cloud, Android, Maps и других продуктах. Прямое подключение к официальной библиотеке обеспечивает актуальный контекст для кода и рекомендаций."],
  ["The ClickHouse MCP server enables agents", "Сервер MCP ClickHouse обеспечивает безопасную работу агентов с базами ClickHouse: выполнение SQL, изучение данных, просмотр сведений о резервных копиях и оплате через единый интерфейс для аналитики."],
  ["Perform a range of infrastructure management tasks, including:", "Управление инфраструктурой Google Compute Engine: экземплярами виртуальных машин (VM), группами экземпляров и шаблонами, дисками и снимками; получение сведений о резервировании ресурсов и обязательствах."],
  ["Access enterprise mobility data using natural language queries", "Доступ к данным корпоративных мобильных устройств через запросы на естественном языке: сведения о парке устройств, автоматический аудит соответствия политикам и включение данных управления устройствами в автоматизированные рабочие процессы."],
  ["Search your Google Cloud projects using natural language.", "Поиск проектов Google Cloud на естественном языке."],
  ["Discover, manage, and audit organization policies and custom constraints", "Поиск, управление и аудит политик организации и пользовательских ограничений ресурсов Google Cloud на естественном языке."],
  ["Create, inspect, restrict, and manage the lifecycle of API keys", "Создание, просмотр, ограничение и управление жизненным циклом ключей API в проектах Google Cloud на естественном языке."],
  ["Perform searches on ingested data in Google-owned data stores.", "Поиск по загруженным данным в хранилищах Google."],
  ["Interact with documents stored in a Firestore database", "Работа с документами в базе данных Firestore на естественном языке."],
  ["Access resources in the Cloud Logging platform", "Доступ к ресурсам платформы Cloud Logging на естественном языке."],
  ["Manage clusters for Managed Service for Apache Kafka and Kafka Connect", "Управление кластерами Managed Service for Apache Kafka и Kafka Connect на естественном языке."],
  ["Access resources in the Cloud Monitoring platform", "Доступ к ресурсам платформы Cloud Monitoring на естественном языке."],
  ["Manage Pub/Sub resources and publish messages.", "Управление ресурсами Pub/Sub и публикация сообщений. Создание, просмотр списков, получение, обновление и удаление тем, подписок и снимков Pub/Sub; публикация сообщений в темы."],
  ["The Cloud Quotas MCP server allows", "Сервер MCP Cloud Quotas позволяет просматривать выделенные квоты, запрашивать их увеличение и управлять конфигурациями Quota Adjuster."],
  ["Access Personalized Service Health events impacting Google Cloud", "Доступ на естественном языке к событиям Personalized Service Health, которые затрагивают продукты и сервисы Google Cloud, используемые вашими проектами."],
  ["The Unified Maintenance MCP server allows", "Сервер MCP Unified Maintenance позволяет находить и запрашивать сведения о запланированном обслуживании ресурсов Google Cloud с перерывами в работе."],
  ["Interact with your Neo4j graph database using natural language.", "Работа с графовой базой Neo4j на естественном языке: прямое подключение к экземпляру Neo4j, изучение схемы графа, выполнение Cypher для чтения и записи, просмотр узлов, связей и путей из инструментов ИИ."],
  ["Author, run, and maintain mabl end-to-end tests", "Создание, запуск и сопровождение сквозных тестов mabl из инструментов ИИ. Подключение к рабочим пространствам mabl, генерация и изменение тестов, облачные и локальные запуски, диагностика с ИИ и просмотр результатов в разных средах. Запуски и доказательства сохраняются в mabl для аудита и контроля соответствия."],
  ["Connect your Miro boards to AI assistants.", "Подключение досок Miro к ИИ-помощникам: поиск и сводки, создание и обновление стикеров, фигур, рамок и соединителей, генерация диаграмм Mermaid и работа с комментариями с соблюдением существующих прав доступа Miro."],
  ["Search the live web and extract content from URLs", "Поиск актуальной информации в интернете и извлечение содержимого URL прямо в Antigravity. Parallel предоставляет агенту подходящие результаты поиска и читаемый текст страниц. Начать можно бесплатно, ключ API не требуется."],
  ["The Grafana Cloud MCP server is a remotely hosted", "Удалённый сервер Grafana Cloud Model Context Protocol (MCP) подключает внешних агентов ИИ к данным Grafana Cloud. Совместимые клиенты могут запрашивать метрики, журналы и другие данные наблюдаемости без локальной установки."],
  ["Give your agent real-time web search and content retrieval.", "Поиск в интернете и получение содержимого в реальном времени для вашего агента. Сервер MCP подключается к поисковому API Exa: веб-поиск, полный текст страниц в Markdown и многошаговое исследование для составления и дополнения списков из инструментов ИИ."],
  ["Use natural language to find hosts, review detections, search events,", "Поиск узлов, просмотр обнаружений, поиск событий и другие операции безопасности в Falcon на естественном языке. CrowdStrike MCP безопасно подключает приложения ИИ к возможностям платформы Falcon через Model Context Protocol (MCP)."],
  ["Interact with your Vercel projects using natural language.", "Работа с проектами Vercel на естественном языке: поиск документации, изучение проектов и развёртываний, анализ журналов сборки и развёртывания, безопасное управление поддерживаемыми ресурсами Vercel."],
  ["Connect to FactSet AI-Ready Data to search and read", "Подключение к FactSet AI-Ready Data для поиска и чтения финансовых данных профессионального уровня на естественном языке. Доступ к показателям компаний, прогнозам, мировым ценам, структуре владения, сделкам M&A, долговому капиталу, цепочкам поставок, фондам/ETF и неструктурированным материалам."],
  ["Stand up matters, shape workspace schema, govern access,", "Создание дел, настройка схем рабочих пространств, управление доступом и анализ использования RelativityOne. Безопасное подключение для поиска материалов, создания и изменения дел, рабочих пространств и клиентов, управления правами пользователей и групп и подготовки отчётов на естественном языке."],
  ["Connect to Daloopa to discover companies, series,", "Подключение к Daloopa для поиска компаний и рядов данных, получения показателей компаний и котировок, поиска финансовых документов. Проверенные финансовые данные и KPI из отчётности SEC, презентаций инвесторам и отчётов о результатах с указанием источников."],
  ["Search and retrieve real-time financial and stock market data from Finnhub", "Поиск и получение финансовых и биржевых данных Finnhub в реальном времени на естественном языке. Доступ к котировкам, историческим свечам OHLCV, профилям компаний, финансовой отчётности, расшифровкам обсуждений результатов, прогнозам и целевым ценам аналитиков, документам SEC, составу ETF и фондов, валютам, криптовалютам и экономическим показателям."],
  ["Search and retrieve comprehensive financial and corporate data from S&P Global", "Поиск и получение финансовых и корпоративных данных S&P Global на естественном языке. Подключение к S&P Global Market Intelligence через Kensho: профили компаний, идентификаторы CUSIP и ISIN, финансовая отчётность, исторические цены акций, капитализация, расшифровки обсуждений результатов, сделки M&A, раунды финансирования, прогнозы аналитиков и сведения о руководителях."],
  ["Explore deep global markets data and financial analytics from LSEG", "Данные мировых рынков и финансовая аналитика LSEG (London Stock Exchange Group). Подключение к LSEG Financial Analytics (LFA) для оценки облигаций и фьючерсов, анализа кривых доходности и кредитных кривых, валютных стратегий FX, оценки опционов и их чувствительности, получения прогнозов IBES, показателей компаний, исторических цен и макроэкономических данных."],
  ["Bring Harvey's legal intelligence into your AI tools", "Юридические возможности Harvey в инструментах ИИ: общие правовые вопросы, анализ документов проектов Vault и поиск по специализированным источникам юридических знаний."],
  ["Search Guidepoint's expert network for interview transcripts,", "Поиск расшифровок интервью в сети экспертов Guidepoint, просмотр отобранных мероприятий и личного расписания. Управление участием: регистрация, запрос одобрения или отмена участия в предстоящих мероприятиях Guidepoint из инструментов ИИ."],
  ["Access institutional-grade financial data in your AI tools,", "Финансовые данные профессионального уровня в инструментах ИИ: фундаментальные показатели, коэффициенты, KPI, сегменты, скорректированные метрики, отчётность SEC, обсуждения результатов и рыночные котировки через несколько минут после публикации результатов."],
  ["Connect with your Docusign account using natural language.", "Работа с аккаунтом Docusign на естественном языке: поиск пакетов документов, шаблонов и документов, чтение сведений и метаданных, создание и обновление пакетов, запуск или отмена экземпляров рабочих процессов из инструментов ИИ."],
  ["LegalZoom's MCP connector gives users instant access", "Подключение MCP LegalZoom предоставляет в диалоге сведения о юридических продуктах, рекомендации по регистрации бизнеса и консультации юристов по запросу."],
  ["Search and retrieve documents from your NetDocuments repository", "Поиск и получение документов из NetDocuments на естественном языке. Безопасный поиск документов и писем, фильтрация по метаданным и чтение содержимого и сведений с соблюдением действующих прав и правил управления NetDocuments."],
  ["Interact with your iManage Work platform using natural language.", "Работа с iManage Work на естественном языке: подключение к аккаунту, поиск рабочих пространств, папок и документов, просмотр профилей документов и истории версий, чтение содержимого и управление юридическими рабочими процессами и знаниями."],
  ["Search and manage Salesforce records from your Salesforce remote MCP server.", "Поиск и управление записями через удалённый сервер MCP Salesforce. Подключение к экземпляру Salesforce, поиск по объектам (SOSL), выполнение SOQL, изучение схем объектов и связанных записей, создание, обновление и удаление записей."],
  ["Civil legal guidance for people navigating court without a lawyer.", "Образовательные рекомендации для самостоятельного ведения гражданских дел в судах США во всех 50 штатах: первоначальная оценка дела, расчёт процессуальных сроков и выбор следующих шагов по приоритету из инструментов ИИ."],
  ["Intelligent DevSecOps automation for your development workflow,", "Автоматизация DevSecOps на естественном языке. Подключение агента Antigravity к более чем 150 инструментам DevOps через MCP: проверки безопасности, генерация конвейеров, аудит соответствия и документация из IDE. Анализ исходного кода выполняется локально; на портал возвращаются только структурированные результаты."],
  ["Forge is an AI-powered platform that automates", "Forge автоматизирует начальное планирование разработки «Day 0», которое обычно требует недель встреч и согласований. Предоставляет агенту ИИ связывание проектов и репозиториев, получение материалов PRD/BRD и архитектуры, управление заданиями, автоматизацию коммитов и PR и инструменты конвейеров CI/CD."],
  ["Bring Endor Labs security into your AI tools.", "Безопасность Endor Labs в инструментах ИИ: проверка зависимости перед добавлением пакета, поиск уязвимостей и вредоносного кода в открытых зависимостях, поиск случайно сохранённых секретов в истории Git, статический анализ SAST и проверки изменений кода с ИИ."],
  ["The Canva MCP server enables AI assistants", "Сервер MCP Canva предоставляет ИИ-помощникам инструменты дизайна Canva: создание и редактирование дизайнов, управление материалами и брендами, поиск в библиотеке, экспорт и комментарии. Возможности доступны на естественном языке через уже используемые инструменты ИИ."],
  ["Enable Antigravity to control and inspect a live Chrome browser,", "Управление открытым браузером Chrome и его изучение через Antigravity с возможностями Chrome DevTools для надёжной автоматизации, подробной отладки и анализа производительности."],
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
  const TASK_ACTIVITY_TITLES = ${JSON.stringify(TASK_ACTIVITY_TITLES)};
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
    const replacement = leading + translated + trailing;
    if (replacement !== source) node.nodeValue = replacement;
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
  const pendingRoots = new Set();
  const schedule = (root) => {
    if (!root || root.isConnected === false) return;
    const isFormField = root.nodeType === Node.ELEMENT_NODE && /^(INPUT|TEXTAREA)$/.test(root.tagName);
    if (isBlocked(root, isFormField)) return;
    pendingRoots.add(root);
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      const roots = Array.from(pendingRoots);
      pendingRoots.clear();
      for (const changedRoot of roots) {
        if (changedRoot.isConnected !== false) scan(changedRoot);
      }
    }, 16);
  };
  const handleMutations = (mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (const added of mutation.addedNodes) schedule(added);
      } else schedule(mutation.target);
    }
  };
  const observe = () => {
    new MutationObserver(handleMutations).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["title", "aria-label", "placeholder", "aria-placeholder", "data-placeholder"] });
    schedule(document.documentElement);
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
  const jobs = [];
  const scannedRoots = [];
  let mutationCallback;
  let observing = false;
  let pendingMutations = [];
  const emitMutation = (record) => {
    if (!observing) return;
    pendingMutations.push(record);
    if (pendingMutations.length === 1) jobs.push(() => {
      const records = pendingMutations;
      pendingMutations = [];
      mutationCallback(records);
    });
  };
  const element = (tag, attributes = {}, children = []) => {
    const node = {
      nodeType: Node.ELEMENT_NODE, tagName: tag.toUpperCase(),
      className: attributes.class || "", children, attributes: { ...attributes },
      parentElement: null, ownerDocument: document,
      getAttribute(name) { return this.attributes[name] ?? null; },
      setAttribute(name, value) {
        this.attributes[name] = value;
        emitMutation({ type: "attributes", target: this, attributeName: name });
      },
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
  const text = (value) => ({ nodeType: Node.TEXT_NODE, parentElement: null, ownerDocument: document, writes: 0,
    get nodeValue() { return value; },
    set nodeValue(next) {
      value = next;
      this.writes++;
      emitMutation({ type: "characterData", target: this });
    },
  });
  document = {
    readyState: "complete",
    createTreeWalker(root, _whatToShow, filter) {
      scannedRoots.push(root);
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
  const spacedBrandLabels = [" Firebase ", "\nChrome DevTools\t"].map(text);
  const spacedUiLabel = text("  Model \n");
  const activityLabels = [
    ["Exploring 2 tasks, running 5 commands", "Выполняется: задач — 2; команд — 5"],
    ["Thought for 16s", "Думал: 16 с."],
    ["Thought for 1m 2s", "Думал: 1 мин. 2 с."],
    ["Checked task Find Yandex Browser executable", "Проверена задача «Поиск исполняемого файла Яндекс Браузера»"],
    ["Find Yandex Browser executable finished", "Поиск исполняемого файла Яндекс Браузера завершён"],
    ["Checked task Check npm global packages", "Проверена задача «Проверка глобальных пакетов npm»"],
    ["Check npm global packages finished", "Проверка глобальных пакетов npm завершена"],
    ["Thinking...", "Думает…"],
    ["Thinking…", "Думает…"],
  ].map(([source, expected]) => ({ node: text(source), expected }));
  const splitPlan = [text("and select"), text("plan"), text("to have the agent generate a plan.")];
  const description = text(CATALOG_DESCRIPTIONS[3][0] + " interactive web panels...");
  const catalogueCards = CATALOG_DESCRIPTIONS.flatMap(([source, expected]) =>
    [source, source + " More information.", source + "...", source + "…"].map(value => ({ node: text(value), expected })));
  const unknownDescription = text("Unknown MCP server description with new capabilities.");
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
    const leaves = [text("Model"), text("24 tools enabled"), ...CATALOG_DESCRIPTIONS.map(([source]) => text(source + "..."))];
    if (attributes.class === "assistant-message markdown") {
      leaves.push(text("Playwright isn't installed. Identified the Yandex Browser executable path."));
      leaves.push(text("python -m pip show playwright"));
    }
    protectedText.push(...leaves.map(node => ({ node, original: node.nodeValue })));
    protectedContainers.push(element(tag, attributes, leaves));
  }
  const input = element("input", { placeholder: "Search MCP servers by name", title: "Model", "aria-label": "Model", value: "Model" });
  input.value = "User-entered Model";
  const textarea = element("textarea", { placeholder: "Describe the bug you encountered...", value: "Model" });
  textarea.value = "User-entered Medium";
  const protectedInput = element("input", { placeholder: "Search MCP servers by name" });
  const root = element("html", {}, [element("body", {}, [
    element("div", {}, [uiLabel, uiCount, ...spacedBrandLabels, spacedUiLabel, ...activityLabels.map(label => label.node), description, ...catalogueCards.map(card => card.node), unknownDescription, splitPlan[0], element("code", {}, [splitPlan[1]]), splitPlan[2], ...preservedModels, ...preservedNames]),
    input, textarea, element("div", { "data-ag-localization-skip": "" }, [protectedInput]), ...protectedContainers,
  ])]);
  document.documentElement = root;
  new vm.Script(injected).runInNewContext({ document, Node, NodeFilter,
    queueMicrotask(callback) { jobs.push(callback); },
    setTimeout(callback, delay) {
      if (!(delay > 0)) fail("Preload DOM test: localization must yield to the renderer event loop");
      jobs.push(callback);
    },
    MutationObserver: class { constructor(callback) { mutationCallback = callback; } observe() { observing = true; } },
  });
  const flush = () => {
    let executed = 0;
    while (jobs.length) {
      if (++executed > 20) fail("Preload DOM test: mutation feedback did not settle");
      jobs.shift()();
    }
  };
  flush();
  const assert = (condition, message) => { if (!condition) fail("Preload DOM test: " + message); };
  assert(uiLabel.nodeValue === "Изменения в доступе к сторонним моделям", "notification translation failed");
  assert(uiCount.nodeValue === "Инструментов включено: 24", "tool count translation failed");
  assert(spacedBrandLabels.every(node => node.writes === 0), "unchanged brand labels with whitespace were rewritten");
  assert(spacedUiLabel.nodeValue === "  Модель \n" && spacedUiLabel.writes === 1, "localized whitespace label was rewritten repeatedly");
  assert(scannedRoots.filter(node => node === root).length === 1, "localization rescanned the whole document after its own writes");
  for (const label of activityLabels) assert(label.node.nodeValue === label.expected, "agent activity label translation failed: " + label.node.nodeValue);
  assert(description.nodeValue === CATALOG_DESCRIPTIONS[3][1], "known catalogue description translation failed");
  for (const card of catalogueCards) assert(card.node.nodeValue === card.expected, "full or truncated catalogue card translation failed");
  assert(unknownDescription.nodeValue === "Unknown MCP server description with new capabilities.", "unknown catalogue description changed");
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
  const beforeInsertion = scannedRoots.length;
  mutationCallback([{ type: "childList", target: root.children[0], addedNodes: [inserted] }]);
  flush();
  assert(inserted.nodeValue === "Инструментов включено: 7", "new catalogue content was not translated");
  assert(scannedRoots.slice(beforeInsertion).every(node => node === inserted), "added content triggered a full-document scan");
  const beforeRepeatedChange = scannedRoots.length;
  inserted.nodeValue = "8 tools enabled";
  mutationCallback(Array.from({ length: 10 }, () => ({ type: "characterData", target: inserted })));
  flush();
  assert(inserted.nodeValue === "Инструментов включено: 8", "updated text was not translated");
  assert(scannedRoots.length - beforeRepeatedChange === 2, "repeated mutation records were not coalesced");
  const beforeProtectedChange = scannedRoots.length;
  const protectedNode = protectedText[0].node;
  protectedNode.nodeValue = "User-supplied updated content";
  flush();
  assert(scannedRoots.length === beforeProtectedChange, "protected content changes scheduled localization");
  input.setAttribute("placeholder", "Search MCP servers by name");
  flush();
  assert(input.getAttribute("placeholder") === "Поиск серверов MCP по имени", "updated field placeholder was not translated");
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
    ["Exploring 2 tasks, running 5 commands", "Выполняется: задач — 2; команд — 5"],
    ["Thought for 16s", "Думал: 16 с."],
    ["Thought for 1m 2s", "Думал: 1 мин. 2 с."],
    ["Checked task Find Yandex Browser executable", "Проверена задача «Поиск исполняемого файла Яндекс Браузера»"],
    ["Find Yandex Browser executable finished", "Поиск исполняемого файла Яндекс Браузера завершён"],
    ["Checked task Check npm global packages", "Проверена задача «Проверка глобальных пакетов npm»"],
    ["Check npm global packages finished", "Проверка глобальных пакетов npm завершена"],
    ["Thinking...", "Думает…"],
    ["Thinking…", "Думает…"],
    ["Thinking", null],
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
    ["python -m pip show playwright", null],
  ];
  for (const [source, expected] of dynamicFixtures) {
    if (translateDynamicUiText(source) !== expected) {
      fail(`Dynamic UI translation failed for ${JSON.stringify(source)}.`);
    }
  }
  for (const [source, expected] of CATALOG_DESCRIPTIONS) {
    if ([source, source + " More information...", source + "...", source + "…"].some(value => translateCatalogDescription(value) !== expected)) {
      fail("Known catalogue description is not translated: " + source);
    }
    if (translateCatalogDescription("User note: " + source) !== null || translateCatalogDescription(source + "Unknown") !== null) {
      fail("Catalogue translation matched text outside its known prefix boundary: " + source);
    }
    if (CATALOG_DESCRIPTIONS.filter(([other]) => other === source).length !== 1) fail("Duplicate catalogue description prefix: " + source);
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
