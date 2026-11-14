"use strict";

// Parse only the static application bundle. No application launch, profile,
// conversation, credential, browser-content or network access is used here.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const acorn = require("acorn");
const { embeddedMain } = require("./audit-ui-copy.js");
const { translateAuditedUiCopy, explainAuditedUiCopy } = require("../localize-antigravity-ru.js");
const createTranslator = require("./interpolated-copy.js");
const { translateUiFragment } = require("./ui-fragments.js");
const templates = createTranslator(require("../dicts/ui-template-copy-2.32.1.json"));
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const normalize = value => value.replace(/\s+/g, " ").trim();
const properties = new Set(["children", "tooltip", "description", "placeholder", "title", "content", "label", "message", "text", "helperText", "aria-label", "aria-placeholder"]);

function collect(source) {
  if (typeof source !== "string" || Buffer.byteLength(source) > 40_000_000) throw new Error("Static source exceeds the review cap");
  const literals = new Map(), interpolated = new Map();
  function record(node, scope) {
    if (!node) return;
    if (node.type === "Literal" && typeof node.value === "string") {
      const value = normalize(node.value);
      if (value.length < 2 || value.length > 1500 || !/[A-Za-z]{2}/.test(value)) return;
      if (!literals.has(value)) literals.set(value, { source: value, scope, offset: node.start });
    } else if (node.type === "TemplateLiteral") {
      const value = normalize(node.quasis.map((part, index) => (part.value.cooked || part.value.raw) + (index < node.expressions.length ? "${value}" : "")).join(""));
      if (/[A-Za-z]{2}/.test(value) && !interpolated.has(value)) interpolated.set(value, { source: value, scope, offset: node.start });
    } else if (node.type === "ConditionalExpression") { record(node.consequent, scope); record(node.alternate, scope); }
    else if (node.type === "LogicalExpression" || node.type === "BinaryExpression" && node.operator === "+") { record(node.left, scope); record(node.right, scope); }
    else if (node.type === "ArrayExpression") for (const child of node.elements) record(child, scope);
  }
  const ast = acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  const stack = [ast];
  let astNodes = 0;
  while (stack.length) {
    const node = stack.pop();
    if (++astNodes > 10_000_000) throw new Error("Static syntax tree exceeds the review cap");
    if (node.type === "Property") {
      const key = node.key.name || node.key.value;
      if (!node.computed && properties.has(key)) record(node.value, "property:" + key);
    }
    if (node.type === "CallExpression" && node.callee.type === "MemberExpression" && node.callee.property.name === "createElement") {
      for (const child of node.arguments.slice(2)) record(child, "rendered-child");
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object" && typeof value.type === "string") stack.push(value);
      else if (Array.isArray(value)) for (const child of value) if (child && typeof child === "object" && typeof child.type === "string") stack.push(child);
    }
  }
  return { sourceSha256: sha(source), astNodes, literals: [...literals.values()].sort((a, b) => a.offset - b.offset), templates: [...interpolated.values()].sort((a, b) => a.offset - b.offset) };
}

function audit(source, baseline) {
  const found = collect(source);
  const literalRules = new Map(baseline.literals.map(item => [item.sha256, item]));
  const templateRules = new Map(baseline.templates.map(item => [item.sha256, item]));
  const literalRows = found.literals.map(row => {
    const reviewed = literalRules.get(sha(row.source));
    const explained = explainAuditedUiCopy(row.source), translation = explained.translation;
    return { ...row, translation, translationKind: explained.kind, category: reviewed?.category || (translation && explained.kind !== "generic-prefix" ? "translated" : "missing"), reason: reviewed?.reason || null };
  });
  const templateRows = found.templates.map(row => {
    const reviewed = templateRules.get(sha(row.source));
    if (!reviewed) return { ...row, category: "missing", reason: "Unreviewed interpolated UI frame" };
    if (reviewed.category === "preserved") return { ...row, category: "preserved", reason: reviewed.reason };
    const translation = reviewed.category === "activity" ? templates(reviewed.sample, "activity") : reviewed.category === "contextual" ? translateUiFragment(reviewed.sample, reviewed.contexts) : translateAuditedUiCopy(reviewed.sample);
    return { ...row, sample: reviewed.sample, translation, category: translation !== null ? reviewed.category : "missing", reason: reviewed.reason || null };
  });
  return { appVersion: "2.32.1", parser: "acorn@" + acorn.version, sourceSha256: found.sourceSha256,
    exactReviewedSource: found.sourceSha256 === baseline.sourceBundleSha256, astNodes: found.astNodes,
    literalCandidates: literalRows.length, translatedLiterals: literalRows.filter(row => row.category === "translated").length,
    contextualLiterals: literalRows.filter(row => row.category === "contextual").length,
    preservedLiterals: literalRows.filter(row => row.category === "preserved").length,
    templateCandidates: templateRows.length, translatedTemplates: templateRows.filter(row => ["ui", "activity", "contextual"].includes(row.category)).length,
    preservedTemplates: templateRows.filter(row => row.category === "preserved").length,
    missingLiterals: literalRows.filter(row => row.category === "missing"), missingTemplates: templateRows.filter(row => row.category === "missing"),
    userDataRead: false, applicationLaunched: false, scope: "Static UI properties, React rendered children and reviewed interpolated frames; live server metadata requires the separate runtime audit", literalRows, templateRows };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) { console.log("node scripts/audit-structural-ui.js (--bundle main.js | --binary language_server.exe) --out evidence.json\nOffline structural audit of the exact reviewed application source. No app, browser or profile access."); return; }
  const index = args.includes("--binary") ? args.indexOf("--binary") : args.indexOf("--bundle");
  const output = args.indexOf("--out");
  if (index < 0 || output < 0 || !args[index + 1] || !args[output + 1]) throw new Error("Use --help for the required source and output arguments");
  const input = path.resolve(args[index + 1]), destination = path.resolve(args[output + 1]);
  const binary = args[index] === "--binary", stat = fs.lstatSync(input);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > (binary ? 400_000_000 : 40_000_000)) throw new Error("Unexpected static source file");
  if (binary && !/^(language_server|language_server\.exe)$/.test(path.basename(input))) throw new Error("Only the application backend is accepted as a binary input");
  if (!binary && !["main.js", "application-static-main.js"].includes(path.basename(input))) throw new Error("Only the static application bundle is accepted");
  if (destination === input || fs.existsSync(destination)) throw new Error("Choose a fresh evidence output; existing files are preserved");
  const data = fs.readFileSync(input), source = (binary ? embeddedMain(data) : data).toString("utf8");
  const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, "../dicts/structural-ui-2.32.1.json"), "utf8"));
  const report = audit(source, baseline);
  fs.writeFileSync(destination, JSON.stringify(report, null, 2) + "\n");
  const { literalRows, templateRows, missingLiterals, missingTemplates, ...summary } = report;
  console.log(JSON.stringify({ ...summary, missingLiterals: missingLiterals.length, missingTemplates: missingTemplates.length }));
  if (!report.exactReviewedSource || missingLiterals.length || missingTemplates.length) throw new Error("Source or UI coverage requires review; do not treat the release as checked");
}

module.exports = { collect, audit };
if (require.main === module) try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
