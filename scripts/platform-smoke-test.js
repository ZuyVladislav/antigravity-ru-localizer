"use strict";

const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PATCHER = path.join(ROOT, "localize-antigravity-ru.js");
const ASAR_CLI = path.join(ROOT, "node_modules", "@electron", "asar", "bin", "asar.mjs");

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });
  if (result.error || result.status !== 0) {
    fail(`${path.basename(command)} failed: ${(result.error?.message || result.stderr || result.stdout || "unknown error").trim()}`);
  }
  return result.stdout || "";
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

if (!new Set(["linux", "darwin"]).has(process.platform)) {
  console.log(`Platform smoke test skipped on ${process.platform}.`);
  process.exit(0);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "antigravity-ru-platform-test-"));
try {
  const appBundle = process.platform === "darwin" ? path.join(work, "Antigravity.app") : null;
  const resources = appBundle ? path.join(appBundle, "Contents", "Resources") : path.join(work, "Antigravity", "resources");
  const source = path.join(work, "source");
  const dist = path.join(source, "dist");
  fs.mkdirSync(dist, { recursive: true });
  fs.mkdirSync(resources, { recursive: true });
  fs.writeFileSync(path.join(source, "package.json"), JSON.stringify({ name: "antigravity", version: "2.18.1" }), "utf8");
  fs.writeFileSync(path.join(dist, "preload.js"), "'use strict';\n", "utf8");
  fs.writeFileSync(path.join(dist, "menu.js"), "const menu = { items: [] };\nelectron_1.Menu.setApplicationMenu(menu);\n", "utf8");
  fs.writeFileSync(path.join(dist, "tray.js"), "function createTray(actions) {}\nfunction insertTrayMenuItem(position, options) {}\n", "utf8");
  fs.writeFileSync(path.join(dist, "native.node"), "synthetic external ASAR fixture\n", "utf8");
  fs.writeFileSync(path.join(source, "payload.bin"), Buffer.alloc(1_100_000, 0x41));

  const appAsar = path.join(resources, "app.asar");
  run(process.execPath, [ASAR_CLI, "pack", source, appAsar, "--unpack=dist/native.node"]);
  const originalHash = sha256(appAsar);

  if (appBundle) {
    const macOSDir = path.join(appBundle, "Contents", "MacOS");
    fs.mkdirSync(macOSDir, { recursive: true });
    fs.copyFileSync("/usr/bin/true", path.join(macOSDir, "Antigravity"));
    fs.chmodSync(path.join(macOSDir, "Antigravity"), 0o755);
    fs.writeFileSync(path.join(appBundle, "Contents", "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Antigravity</string>
<key>CFBundleIdentifier</key><string>test.antigravity.localizer</string>
<key>CFBundleName</key><string>Antigravity</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>2.18.1</string>
</dict></plist>
`, "utf8");
    run("/usr/bin/codesign", ["--force", "--sign", "-", appBundle]);
  }

  const manifest = path.join(work, "install-manifest.json");
  const resourceArgument = `--resources=${resources}`;
  const env = { ...process.env, ANTIGRAVITY_RU_MANIFEST_PATH: manifest };
  run(process.execPath, [PATCHER, resourceArgument], { env });
  const verification = JSON.parse(run(process.execPath, [PATCHER, resourceArgument, "--verify"], { env }));
  if (!verification.verified || verification.appVersion !== "2.18.1") fail("Installed fixture did not verify.");
  if (sha256(appAsar) === originalHash) fail("Install did not change the synthetic app.asar.");
  run(process.execPath, [PATCHER, resourceArgument, "--restore"], { env });
  if (sha256(appAsar) !== originalHash) fail("Restore did not reproduce the original synthetic app.asar.");
  console.log(`Platform smoke test passed on ${process.platform}: install, verify, restore.`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
