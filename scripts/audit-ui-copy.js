"use strict";

// Offline audit of application code, never the profile, chat DOM, or running agent.
// The literal/context scan is a review aid, not a complete JavaScript parser.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { translateAuditedUiCopy } = require("../localize-antigravity-ru.js");
const ROOT = path.resolve(__dirname, "..");
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, "dicts", "ui-copy-fixtures.json"), "utf8"));
const normalize = value => value.replace(/\s+/g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim();

function embeddedMain(binary) {
  const marker = binary.indexOf(Buffer.from("main.js"));
  if (marker < 30) throw new Error("Embedded main.js not found; review the new package layout.");
  const header = binary.lastIndexOf(Buffer.from("PK\x03\x04", "binary"), marker);
  if (header < marker - 100 || header < 0 || binary.readUInt16LE(header + 6) !== 0 || binary.readUInt16LE(header + 8) !== 8) throw new Error("Unsupported embedded ZIP layout.");
  const crc = binary.readUInt32LE(header + 14);
  const compressed = binary.readUInt32LE(header + 18);
  const size = binary.readUInt32LE(header + 22);
  const nameLength = binary.readUInt16LE(header + 26);
  const extraLength = binary.readUInt16LE(header + 28);
  if (binary.subarray(header + 30, header + 30 + nameLength).toString() !== "main.js" || size > 40_000_000) throw new Error("Invalid embedded bundle metadata.");
  const start = header + 30 + nameLength + extraLength;
  if (start + compressed > binary.length) throw new Error("Truncated embedded bundle.");
  const source = zlib.inflateRawSync(binary.subarray(start, start + compressed), { maxOutputLength: 40_000_000 });
  if (source.length !== size || zlib.crc32(source) !== crc) throw new Error("Embedded bundle CRC or length mismatch.");
  return source;
}

function audit(source) {
  const exclusions = new Map(baseline.exclusions.map(item => [item.source, item.reason]));
  const rows = new Map();
  let literals = 0;
  for (const match of source.matchAll(/"(?:[^"\\]|\\.)*"/g)) {
    let value;
    try { value = JSON.parse(match[0]); } catch { continue; }
    if (value.length > 1500 || !/[A-Za-z]{3}/.test(value) || /[\uD800-\uDFFF]/.test(value)) continue;
    literals++;
    const context = source.slice(Math.max(0, match.index - 140), match.index + JSON.stringify(value).length + 180);
    const before = source.slice(Math.max(0, match.index - 80), match.index);
    const directProperty = /(?:children|tooltip|description|placeholder|title|content|label|message|text|helperText|aria-label)["']?\s*:\s*$/.test(before);
    const previousScope = /(?:tooltip|toast|notification|nux-card|description:|placeholder:|title:|content:|"aria-label":)/i.test(context) && /^[A-Z](?:[a-z]|\s)|^\d+x playback|^with ID/.test(value) && !/[{}\[\]<>\n\\]/.test(value);
    if (!(previousScope || directProperty && /^[A-Za-z(]/.test(value) && !/^[a-zA-Z]+[A-Z][a-zA-Z]+$/.test(value)) || /[{}<>\n\\]|^(?:https|var |function|SELECT )/.test(value)) continue;
    const normalized = normalize(value);
    const translation = translateAuditedUiCopy(normalized);
    const excluded = !translation && exclusions.get(normalized);
    rows.set(normalized, { source:normalized, offset:match.index, translation, exclusion:excluded || null });
  }
  const missing = [...rows.values()].filter(item => !item.translation && !item.exclusion);
  const templates = new Set();
  for (const match of source.matchAll(/`(?:[^`\\]|\\.)*`/g)) {
    const value=match[0];
    const context=source.slice(Math.max(0,match.index-140),match.index+value.length+180);
    if (value.length<550 && /^`[A-Z][a-z]/.test(value) && /tooltip|toast|notification|title:|description:|aria-label/.test(context)) templates.add(value.slice(1,-1).replace(/\s+/g," ").trim());
  }
  const observed=new Set(baseline.observedTemplates);
  const newTemplates=[...templates].filter(item=>!observed.has(item));
  return { sourceSha256:crypto.createHash("sha256").update(source).digest("hex"), reviewedVersion:baseline.appVersion, literals, candidates:rows.size, translated:[...rows.values()].filter(item=>item.translation).length, excluded:[...rows.values()].filter(item=>item.exclusion).length, missing, observedTemplates:templates.size, newTemplates, userDataRead:false, applicationLaunched:false, limitation:"Bounded literal/context audit; dynamic and server-provided notices require separate template tests.", rows:[...rows.values()] };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) { console.log("node scripts/audit-ui-copy.js (--bundle main.js | --binary language_server.exe) --out audit.json\nOffline only; missing copy fails the release gate. Never pass profile or conversation files."); return; }
  const index = args.includes("--binary") ? args.indexOf("--binary") : args.indexOf("--bundle");
  const output = args.indexOf("--out");
  if (index < 0 || output < 0 || !args[index + 1] || !args[output + 1]) throw new Error("Use --help for the required source and output arguments.");
  const sourcePath = path.resolve(args[index + 1]);
  const stat = fs.statSync(sourcePath);
  const binary = args[index] === "--binary";
  if (!stat.isFile() || stat.size > (binary ? 400_000_000 : 40_000_000)) throw new Error("Source exceeds the bounded file limit.");
  if (binary && !/^(language_server|language_server\.exe)$/.test(path.basename(sourcePath))) throw new Error("Only the application language_server binary is accepted.");
  if (!binary && path.basename(sourcePath) !== "main.js" && path.basename(sourcePath) !== "application-static-main.js") throw new Error("Only the application static main.js bundle is accepted.");
  const input = fs.readFileSync(sourcePath);
  const source = (binary ? embeddedMain(input) : input).toString("utf8");
  const report = audit(source);
  fs.writeFileSync(path.resolve(args[output + 1]), JSON.stringify(report, null, 2) + "\n");
  const { rows, missing, newTemplates, ...summary } = report;
  console.log(JSON.stringify({ ...summary, missing:missing.length, newTemplates:newTemplates.length }));
  if (missing.length || newTemplates.length) throw new Error(`${missing.length} unreviewed UI strings and ${newTemplates.length} new templates: see the audit report before publishing.`);
}

module.exports = { audit, embeddedMain };
if (require.main === module) try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
