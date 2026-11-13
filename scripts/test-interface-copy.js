"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { translateAuditedUiCopy: translate } = require("../localize-antigravity-ru.js");
const createTemplates = require("./interpolated-copy.js");
const count = require("./ui-counts.js");
const { translateUiFragment } = require("./ui-fragments.js");
const { mergeModelCopies } = require("./audit-runtime-ui.js");
const { audit } = require("./audit-structural-ui.js");
const specs = require("../dicts/ui-template-copy-2.31.2.json");
const catalog = require("../dicts/catalog-copy-2.31.2.json");
const templateTranslator = createTemplates(specs);
const serialized = vm.runInNewContext("(" + createTemplates.toString() + ")")(specs);

for (const spec of specs) {
  let index = 0;
  const values = [];
  const source = spec.source.replace(/\$\{value\}/g, () => {
    const value = "KEEP_" + index++ + "_C:/" + String.fromCharCode(0x451) + "/O'Neil  $&_${999}_<data>";
    values.push(value);
    return value;
  });
  const expected = spec.translation.replace(/\$\{([0-9]+)\}/g, (_, slot) => values[Number(slot)]);
  assert.equal(templateTranslator(source, spec.scope), expected);
  assert.equal(serialized(source, spec.scope), expected, "Renderer serialization lost a dependency or opaque value");
  for (const value of values) assert(expected.includes(value), "Opaque Unicode or path value changed");
  if (spec.scope === "activity") assert.equal(templateTranslator(source), null, "Activity frame escaped its scope");
}
assert.throws(() => createTemplates([{ source: "Value ${value}", translation: "Missing value" }]));
assert.equal(templateTranslator("An unknown new system notice"), null);
assert.equal(templateTranslator("Your Plan: value\nPRIVATE_INPUT"), null);

const golden = [
  ["Version 2.31.2", "Версия 2.31.2"],
  ["Carbon that may offload routine steps to Hydrogen. Same Carbon-level quality, fewer tokens used.", "Carbon может передавать обычные шаги модели Hydrogen. Качество остается на уровне Carbon, а расход токенов снижается."],
  ["Argon that may offload routine steps to Hydrogen. Same Argon-level quality, fewer tokens used.", "Argon может передавать обычные шаги модели Hydrogen. Качество остается на уровне Argon, а расход токенов снижается."],
  ["No matching workspaces", "Нет подходящих рабочих пространств"],
  ["No remote projects", "Нет удаленных проектов"],
  ["Enable read_file tool for Main", "Включить инструмент «read_file» для «Main»"],
  ["Show 2 more subagents", "Показать других субагентов (2)"],
  ["Your agent’s ability to execute commands is also controlled by enterprise security policies.", "Возможность агента выполнять команды также регулируется политиками безопасности организации."],
];
for (const [source, expected] of golden) assert.equal(translate(source), expected);
for (const name of ["Gemini 4 Carbon", "Orchestrator (Carbon)", "Thinking", "High", "mail-hub", "write-like-vlad"]) assert.equal(translate(name), null, "Model or skill identity changed");

const counters = [
  ["1 second", "1 секунда"], ["2 seconds", "2 секунды"], ["11 seconds", "11 секунд"],
  ["21 comments", "21 комментарий"], ["4 questions", "4 вопроса"], ["5 accounts", "5 аккаунтов"],
  ["2 / 12 rows", "Строки: 2 из 12"], ["Step 2 of 5", "Шаг 2 из 5"],
  ["Reset 3 overrides", "Сбросить переопределения (3)"], ["Show 2 breakdowns", "Показать детализацию (2)"],
  ["Push 2 commits to origin/main", "Отправить коммиты (2) в origin/main"],
  ["Submit (Ctrl+Enter)", "Отправить (Ctrl+Enter)"],
];
for (const [source, expected] of counters) assert.equal(count(source), expected);
assert.equal(count("2 seconds\nPRIVATE_VALUE"), null);

for (const entry of catalog) {
  const source = entry.nameSuffix ? entry.source + "Example Person" + entry.nameSuffix : entry.source;
  assert.equal(translate(source + " More details."), entry.translation);
  assert.equal(translate(source + "..."), entry.translation);
  assert.equal(translate(entry.id), null, "Skill identifier changed");
}
assert.equal(translateUiFragment("with", [{ text: "PRIVATE_project_name" }]), null);
assert.equal(translateUiFragment("and", [{ text: "Terms of Service and Privacy Policy" }]), "и");
assert.equal(translateUiFragment("in ExampleProduct", [{ text: "Plugins are packaged collections of skills and MCPs to help the Agent in ExampleProduct work with Google developer products." }]), "в ExampleProduct");

const modelRows = Object.freeze([{ model: "Orchestrator (Carbon)", field: "tagDescription", text: golden[1][0] }]);
const unloaded = { providerFound: false, notificationCards: 0, rows: [], modelLabels: [] };
const loaded = { providerFound: true, notificationCards: 0, rows: modelRows, modelLabels: ["Orchestrator (Carbon)"] };
const merged = mergeModelCopies([unloaded, loaded, loaded]);
assert.equal(merged.providerFound, true);
assert.equal(merged.rows.length, 1);
assert.equal(merged.serverModelsInspected, 1);
assert.equal(merged.rendererTargetsInspected, 3);
assert.equal(merged.missing.length, 0);
assert.equal(merged.modelLabels[0], "Orchestrator (Carbon)");

const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, "../dicts/structural-ui-2.31.2.json"), "utf8"));
const fixture = "React.createElement('div',null,'Reopen Closed Tab',true?'Save Video':'Download image');({title:'Don\\'t enter corp passwords'});React.createElement('p',null,`New unreviewed frame ${value}`);({label:'New unreviewed label'});";
const structural = audit(fixture, baseline);
assert.equal(structural.exactReviewedSource, false, "Synthetic evidence was accepted as the reviewed vendor source");
assert.equal(structural.missingLiterals.length, 1);
assert.equal(structural.missingTemplates.length, 1);
assert(structural.literalRows.some(row => row.source === "Don't enter corp passwords" && row.translation === "Не вводите корпоративные пароли"));
console.log("Interface copy passed: new model descriptions, version, counters, complete frames, Unicode/path preservation, catalog summaries, multi-window audit and structural unknown-copy detection.");
