"use strict";

// Reuse the ordinary localizer against a private staging copy. Never replace
// BetterGravity's bootstrap with Antigravity's original application archive.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const cp = require("node:child_process");
const asar = require("@electron/asar");
const BACKUP = "app.asar.antigravity-ru-original.bak";
const STATE = "antigravity-ru-bettergravity.json";
const BOOT_BACKUP = "app.asar.antigravity-ru-bettergravity.bak";
const hash = data => crypto.createHash("sha256").update(data).digest("hex");
const sha = file => hash(fs.readFileSync(file));
const check = (condition, message) => { if (!condition) throw Error(message); };
function regular(file) {
  const stat = fs.lstatSync(file);
  check(stat.isFile() && !stat.isSymbolicLink(), `Expected a regular compatibility file: ${file}`);
}
function tree(root) {
  const rows = {};
  function visit(dir, relative = "") {
    check(!fs.lstatSync(dir).isSymbolicLink(), "Linked native directory is not supported");
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name), key = path.posix.join(relative, name), stat = fs.lstatSync(file);
      check(!stat.isSymbolicLink(), "Linked native resource is not supported");
      if (stat.isDirectory()) visit(file, key);
      else { check(stat.isFile(), "Unexpected native resource type"); rows[key] = sha(file); }
    }
  }
  visit(root);
  return rows;
}
function sameTree(a, b) { return JSON.stringify(tree(a)) === JSON.stringify(tree(b)); }
function readBootstrap(resources) {
  check(fs.lstatSync(resources).isDirectory() && !fs.lstatSync(resources).isSymbolicLink() && fs.realpathSync(resources).toLowerCase() === path.resolve(resources).toLowerCase(), "Linked application resources are not supported");
  const archive = path.join(resources, "app.asar");
  regular(archive);
  asar.uncacheAll();
  let bytes;
  try { bytes = asar.extractFile(archive, ".bettergravity.json"); }
  catch { return null; }
  const marker = JSON.parse(bytes.toString("utf8"));
  check(marker.schemaVersion === 1 && marker.betterGravityVersion === "3.0.0" && marker.antigravityVersion === "2.28.0", "Unsupported BetterGravity marker; preserve both bundles");
  const entries = asar.listPackage(archive).map(x => x.replace(/\\/g, "/").replace(/^\//, "")).sort();
  check(JSON.stringify(entries) === JSON.stringify([".bettergravity.json", "index.js", "package.json"]), "Unexpected BetterGravity bootstrap contents");
  const pkg = JSON.parse(asar.extractFile(archive, "package.json"));
  const index = asar.extractFile(archive, "index.js");
  check(pkg.name === "antigravity" && pkg.productName === "Antigravity" && pkg.version === "2.28.0" && pkg.main === "index.js", "Bootstrap identity mismatch");
  check(hash(index) === "cc8edd756e5b2a37a2b7cdc5b679c7c507231315ffb85e0694b15923a14febb6", "Unrecognized BetterGravity 3.0.0 bootstrap entry point");
  const host = path.join(resources, "_app.asar");
  regular(host);
  const hostPkg = JSON.parse(asar.extractFile(host, "package.json"));
  check(hostPkg.name === "antigravity" && hostPkg.productName === "Antigravity" && hostPkg.version === "2.28.0" && hostPkg.main === "dist/main.js", "Original host identity mismatch");
  for (const name of ["main.cjs", "preload.cjs", "repair.cjs", "overlay.html"]) regular(path.join(resources, ".bettergravity", "runtime", name));
  return { archive, host, marker, pkg, index };
}
function child(args, env, cwd) {
  const result = cp.spawnSync(process.execPath, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, shell: false, encoding: "utf8", timeout: 90000, maxBuffer: 2e6 });
  check(!result.error && result.status === 0, (result.error?.message || result.stderr || result.stdout || "Compatibility child failed").trim());
  return result.stdout;
}
function bootstrapWithHash(bootstrap, desired, work, scriptDirectory) {
  const dir = path.join(work, "bootstrap");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "index.js"), bootstrap.index);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(bootstrap.pkg, null, 2));
  fs.writeFileSync(path.join(dir, ".bettergravity.json"), JSON.stringify({ ...bootstrap.marker, originalAsarSha256: desired }, null, 2));
  const packed = path.join(work, "bootstrap.asar");
  child([path.join(scriptDirectory, "node_modules/@electron/asar/bin/asar.mjs"), "pack", dir, packed], {}, scriptDirectory);
  return packed;
}
function handle({ resources, operation, scriptDirectory, manifestPath }) {
  const bootstrap = readBootstrap(resources);
  if (!bootstrap) return false;
  check(process.platform === "win32", "BetterGravity compatibility is currently verified on Windows only");
  const stateFile = path.join(resources, STATE), backup = path.join(resources, BACKUP), bootBackup = path.join(resources, BOOT_BACKUP);
  const native = path.join(resources, "app.asar.unpacked"), alias = path.join(resources, "_app.asar.unpacked");
  if (fs.existsSync(stateFile)) regular(stateFile);
  let state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : null;
  if (state) {
    regular(stateFile); regular(backup); regular(bootBackup);
    check(state.schemaVersion === 1 && state.originalSha256 === sha(backup) && state.bootstrapBackupSha256 === sha(bootBackup), "Compatibility backup changed; refusing to overwrite it");
    check(state.hostSha256 === sha(bootstrap.host), "Antigravity changed since the checked transaction; compatibility must be reviewed again");
    // BetterGravity's own reinstall may regenerate only its timestamped marker.
    // readBootstrap pins the complete executable bootstrap and its identity;
    // the unchanged host and matching marker hash make that regeneration safe.
    check(state.nativeDigest === hash(JSON.stringify(tree(native))), "External native resources changed");
  }
  const targetSha = sha(bootstrap.host), bootSha = sha(bootstrap.archive);
  check(bootstrap.marker.originalAsarSha256 === targetSha, "BetterGravity marker does not match its original bundle");
  if (!state) check(!fs.existsSync(bootBackup), "Preserving an existing bootstrap backup without compatibility state");
  if (operation === "inspect") {
    console.log(JSON.stringify({ resources, betterGravity: "3.0.0", appVersion: "2.28.0", appAsar: bootstrap.archive, appAsarSha256: bootSha, hostAsar: bootstrap.host, hostAsarSha256: targetSha, backupExists: fs.existsSync(backup), compatibilityState: state?.status || "not-installed" }, null, 2));
    return true;
  }
  if (operation === "verify") check(state?.status === "localized", "BetterGravity localization has no completed compatibility transaction");
  if (operation === "restore") check(state && fs.existsSync(backup), "No checked BetterGravity localization backup exists");
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "antigravity-ru-bg-"));
  const staging = path.join(work, "Programs/antigravity/resources");
  fs.mkdirSync(staging, { recursive: true });
  const stageHost = path.join(staging, "app.asar"), stageBackup = path.join(staging, BACKUP);
  try {
    fs.copyFileSync(bootstrap.host, stageHost);
    fs.cpSync(native, stageHost + ".unpacked", { recursive: true });
    if (fs.existsSync(backup)) { regular(backup); fs.copyFileSync(backup, stageBackup); }
    const stageManifest = path.join(work, "manifest.json");
    const output = child([path.join(scriptDirectory, "localize-antigravity-ru.js"), `--resources=${staging}`, ...(operation === "install" ? [] : [`--${operation}`])], { LOCALAPPDATA: work, ANTIGRAVITY_RU_MANIFEST_PATH: stageManifest }, scriptDirectory);
    if (operation === "verify") {
      const verified = JSON.parse(output);
      check(fs.existsSync(alias) && sameTree(native, alias), "BetterGravity unpacked resource mirror is missing or changed");
      check(bootstrap.marker.originalAsarSha256 === targetSha, "BetterGravity marker no longer matches its active original bundle");
      console.log(JSON.stringify({ ...verified, resources, appAsarSha256: bootSha, hostAsarSha256: targetSha, betterGravity: "3.0.0", compatibilityVerified: true, bootstrapPreserved: true }, null, 2));
      return true;
    }
    check(sha(bootstrap.host) === targetSha && sha(bootstrap.archive) === bootSha, "Application changed while preparing the transaction");
    const newHostSha = sha(stageHost), originalSha = sha(stageBackup);
    const newBootstrap = bootstrapWithHash(bootstrap, newHostSha, work, scriptDirectory);
    let desiredBootstrap = fs.readFileSync(newBootstrap);
    if (operation === "restore" && fs.existsSync(bootBackup)) {
      asar.uncacheAll();
      const baseline = JSON.parse(asar.extractFile(bootBackup, ".bettergravity.json"));
      if (baseline.originalAsarSha256 === newHostSha) desiredBootstrap = fs.readFileSync(bootBackup);
    }
    if (fs.existsSync(alias)) check(sameTree(native, alias), "Refusing to replace a different original unpacked directory");
    const aliasCreated = state?.aliasCreated ?? !fs.existsSync(alias);
    const tracked = [bootstrap.host, bootstrap.archive, backup, bootBackup, stateFile, ...(operation === "install" ? [manifestPath] : [])];
    for (const file of tracked) if (fs.existsSync(file)) regular(file);
    const before = new Map(tracked.map(file => [file, fs.existsSync(file) ? fs.readFileSync(file) : null]));
    let createdNow = false;
    try {
      if (!fs.existsSync(alias)) { fs.cpSync(native, alias, { recursive: true }); createdNow = true; }
      if (!state) fs.copyFileSync(bootstrap.archive, bootBackup);
      fs.copyFileSync(stageBackup, backup);
      fs.copyFileSync(stageHost, bootstrap.host);
      fs.writeFileSync(bootstrap.archive, desiredBootstrap);
      state = { schemaVersion: 1, betterGravity: "3.0.0", appVersion: "2.28.0", status: operation === "restore" ? "restored" : "localized", originalSha256: originalSha, hostSha256: newHostSha, bootstrapSha256: sha(bootstrap.archive), bootstrapBackupSha256: sha(bootBackup), nativeDigest: hash(JSON.stringify(tree(native))), aliasCreated, updatedAt: new Date().toISOString() };
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");
      check(sha(bootstrap.host) === newHostSha && sameTree(native, alias), "Compatibility commit verification failed");
      if (operation === "install") {
        const manifest = JSON.parse(fs.readFileSync(stageManifest, "utf8"));
        fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, resources, betterGravity: "3.0.0", hostAsar: bootstrap.host, localizedSha256: newHostSha, bootstrapSha256: state.bootstrapSha256, rollback: backup, compatibilityState: stateFile }, null, 2) + "\n");
      }
    } catch (error) {
      for (const [file, data] of before) { if (data === null) fs.rmSync(file, { force: true }); else fs.writeFileSync(file, data); }
      if (createdNow) { check(path.resolve(alias) === path.join(path.resolve(resources), "_app.asar.unpacked"), "Unexpected cleanup target"); tree(alias); fs.rmSync(alias, { recursive: true }); }
      throw error;
    }
    console.log(`Russian localization ${operation === "restore" ? "restored" : "installed"} inside BetterGravity's _app.asar; bootstrap retained.`);
    return true;
  } finally {
    check(path.dirname(work) === os.tmpdir() && path.basename(work).startsWith("antigravity-ru-bg-"), "Unexpected staging cleanup target");
    fs.rmSync(work, { recursive: true, force: true });
  }
}
module.exports = { handle, readBootstrap, tree };
