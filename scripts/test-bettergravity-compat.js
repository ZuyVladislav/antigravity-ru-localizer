"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const cp = require("node:child_process");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
if (process.platform !== "win32") { console.log("BetterGravity Windows compatibility tests skipped on " + process.platform); process.exit(0); }
const asar = require("@electron/asar");
const compat = require("../compat/bettergravity.js");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "antigravity-bg-compat-test-"));
const cli = path.join(root, "node_modules/@electron/asar/bin/asar.mjs");
const sha = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function command(args, env = {}) {
  const r = cp.spawnSync(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, encoding: "utf8", shell: false, windowsHide: true, timeout: 90000 });
  if (r.error) throw r.error;
  return r;
}
function pack(dir, out, ...args) { const r = command([cli, "pack", dir, out, ...args]); assert.equal(r.status, 0, r.stderr); }
function fixture(name) {
  const local = path.join(work, name), resources = path.join(local, "Programs/antigravity/resources"), source = path.join(local, "source");
  fs.mkdirSync(path.join(source, "dist"), { recursive: true }); fs.mkdirSync(resources, { recursive: true });
  fs.writeFileSync(path.join(source, "package.json"), JSON.stringify({ name: "antigravity", productName: "Antigravity", version: "2.28.0", main: "dist/main.js" }));
  fs.writeFileSync(path.join(source, "dist/main.js"), "'use strict';\n");
  fs.writeFileSync(path.join(source, "dist/preload.js"), "'use strict';\n");
  fs.writeFileSync(path.join(source, "dist/menu.js"), "const menu = { items: [] };\nelectron_1.Menu.setApplicationMenu(menu);\n");
  fs.mkdirSync(path.join(source, "native")); fs.writeFileSync(path.join(source, "native/native.node"), "synthetic native resource\n");
  fs.writeFileSync(path.join(source, "padding.bin"), Buffer.alloc(1100000, 65));
  const archive = path.join(resources, "app.asar"); pack(source, archive, "--unpack-dir=native");
  return { name, local, resources, archive, original: sha(archive), manifest: path.join(local, "manifest.json") };
}
function ru(f, ...args) { return command([path.join(root, "localize-antigravity-ru.js"), `--resources=${f.resources}`, ...args], { LOCALAPPDATA: f.local, ANTIGRAVITY_RU_MANIFEST_PATH: f.manifest }); }
function ok(r) { assert.equal(r.status, 0, r.stderr || r.stdout); return r; }
function bootstrap(f, hostAlreadyMoved = false, extra = {}) {
  const external = path.join(f.resources, "app.asar.unpacked/native/native.node"), externalBytes = fs.readFileSync(external);
  if (!hostAlreadyMoved) { asar.uncacheAll(); fs.copyFileSync(f.archive, path.join(f.resources, "_app.asar")); }
  const source = path.join(f.local, "bootstrap"); fs.mkdirSync(source, { recursive: true });
  fs.copyFileSync(path.join(__dirname, "fixtures/bettergravity-bootstrap-3.0.0.txt"), path.join(source, "index.js"));
  fs.writeFileSync(path.join(source, "package.json"), JSON.stringify({ name: "antigravity", productName: "Antigravity", version: "2.28.0", private: true, main: "index.js" }, null, 2));
  fs.writeFileSync(path.join(source, ".bettergravity.json"), JSON.stringify({ schemaVersion: 1, betterGravityVersion: "3.0.0", antigravityVersion: "2.28.0", originalAsarSha256: sha(path.join(f.resources, "_app.asar")), installedAt: "fixture", ...extra }, null, 2));
  pack(source, f.archive);
  // @electron/asar 4 clears stale sidecars; the upstream 3.4 installer preserves
  // the canonical unpacked directory when writing its bootstrap.
  fs.mkdirSync(path.dirname(external), { recursive: true }); fs.writeFileSync(external, externalBytes);
  const runtime = path.join(f.resources, ".bettergravity/runtime"); fs.mkdirSync(runtime, { recursive: true });
  for (const file of ["main.cjs", "preload.cjs", "repair.cjs", "overlay.html"]) fs.writeFileSync(path.join(runtime, file), "fixture");
}
try {
  for (const order of ["bg-first", "ru-first"]) {
    const f = fixture(order); if (order === "ru-first") ok(ru(f)); bootstrap(f);
    const baselineBootstrap = sha(f.archive), nativeHash = sha(path.join(f.resources, "app.asar.unpacked/native/native.node"));
    ok(ru(f)); const verified = JSON.parse(ok(ru(f, "--verify")).stdout); assert.equal(verified.compatibilityVerified, true);
    const localizedHost = sha(path.join(f.resources, "_app.asar")), localizedBootstrap = sha(f.archive);
    ok(ru(f)); ok(ru(f, "--verify"));
    assert.equal(sha(path.join(f.resources, "_app.asar")), localizedHost, "Reinstall changed the localized host");
    assert.equal(sha(f.archive), localizedBootstrap, "Reinstall changed the bootstrap");
    bootstrap(f, true, { installedAt: "reinstalled by BetterGravity" }); ok(ru(f, "--verify")); ok(ru(f));
    ok(ru(f, "--restore")); assert.equal(sha(path.join(f.resources, "_app.asar")), f.original);
    if (order === "bg-first") assert.equal(sha(f.archive), baselineBootstrap);
    assert.notEqual(ru(f, "--verify").status, 0);
    assert.equal(sha(path.join(f.resources, "app.asar.unpacked/native/native.node")), nativeHash);
  }
  const fault = fixture("transaction-failure"); bootstrap(fault);
  const beforeHost = sha(path.join(fault.resources, "_app.asar")), beforeBoot = sha(fault.archive);
  const write = fs.writeFileSync; let injected = false;
  fs.writeFileSync = function(file, ...args) { if (!injected && path.resolve(file) === fault.manifest) { injected = true; throw Error("injected manifest write failure"); } return write.call(this, file, ...args); };
  try { assert.throws(() => compat.handle({ resources: fault.resources, operation: "install", scriptDirectory: root, manifestPath: fault.manifest }), /injected manifest/); }
  finally { fs.writeFileSync = write; }
  assert.equal(injected, true); assert.equal(sha(path.join(fault.resources, "_app.asar")), beforeHost); assert.equal(sha(fault.archive), beforeBoot);
  assert.equal(fs.existsSync(path.join(fault.resources, "antigravity-ru-bettergravity.json")), false);
  assert.equal(fs.existsSync(path.join(fault.resources, "_app.asar.unpacked")), false);
  ok(ru(fault));
  const backup = path.join(fault.resources, "app.asar.antigravity-ru-original.bak"), bytes = fs.readFileSync(backup), localized = sha(path.join(fault.resources, "_app.asar"));
  fs.appendFileSync(backup, "tampered"); assert.notEqual(ru(fault, "--restore").status, 0); assert.equal(sha(path.join(fault.resources, "_app.asar")), localized); fs.writeFileSync(backup, bytes);
  const badMarker = fixture("bad-marker"); bootstrap(badMarker, false, { originalAsarSha256: "0".repeat(64) }); const badBefore = sha(badMarker.archive);
  assert.notEqual(ru(badMarker).status, 0); assert.equal(sha(badMarker.archive), badBefore);
  const unexpected = fixture("unknown-bootstrap"); bootstrap(unexpected); fs.appendFileSync(path.join(unexpected.local, "bootstrap/index.js"), "// unexpected runtime\n"); pack(path.join(unexpected.local, "bootstrap"), unexpected.archive);
  assert.notEqual(ru(unexpected).status, 0);
  console.log("BetterGravity compatibility passed: both orders, reapply, regenerated bootstrap, exact host rollback, injected transaction failure, altered backup/marker/bootstrap rejection.");
} finally {
  assert.equal(path.dirname(work), os.tmpdir()); assert.ok(path.basename(work).startsWith("antigravity-bg-compat-test-"));
  fs.rmSync(work, { recursive: true, force: true });
}
