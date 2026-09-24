"use strict";

// Extract only the fixed UI dictionary from the reviewed Russian phrase source.
// The source's rule engine and its online translation section are deliberately
// ignored: this build step accepts only JSON-like static key/value pairs.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const [baseArgument, expandedArgument, outputArgument] = process.argv.slice(2);
if (!baseArgument || !expandedArgument) {
  throw new Error("Usage: node build-static-dictionary.js <dom_translator.js> <i18n-ru.js> [output-file]");
}
const baseSourcePath = path.resolve(baseArgument);
const expandedSourcePath = path.resolve(expandedArgument);
const outputPath = path.resolve(outputArgument || path.join(__dirname, "dicts", "ru.json"));

function assertStringMap(dictionary, name) {
  for (const [key, value] of Object.entries(dictionary)) {
    if (typeof key !== "string" || typeof value !== "string") {
      throw new Error(`${name} contains a non-string entry.`);
    }
  }
  return dictionary;
}

function readBaseDictionary(sourcePath) {
  const source = fs.readFileSync(sourcePath, "utf8");
  const staticStart = source.indexOf("const DICT = {");
  const rulesStart = source.indexOf("const RULES = [");
  if (staticStart < 0 || rulesStart < 0 || rulesStart <= staticStart) {
    throw new Error("Base static dictionary markers were not found.");
  }
  const literalMatch = source
    .slice(staticStart, rulesStart)
    .match(/const DICT\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (!literalMatch) throw new Error("Base static dictionary literal was not found.");
  return assertStringMap(JSON.parse(literalMatch[1]), "Base dictionary");
}

function readExpandedDictionary(sourcePath) {
  const source = fs.readFileSync(sourcePath, "utf8");
  const staticStart = source.indexOf("const DICT = {");
  const nextSection = source.indexOf("// --- ПРЕФИКСНЫЙ ПЕРЕВОДЧИК", staticStart);
  if (staticStart < 0 || nextSection < 0 || nextSection <= staticStart) {
    throw new Error("Expanded static dictionary markers were not found.");
  }
  const literalMatch = source
    .slice(staticStart, nextSection)
    .match(/const DICT\s*=\s*(\{[\s\S]*\})\s*;/);
  if (!literalMatch) throw new Error("Expanded static dictionary literal was not found.");
  const dictionary = assertStringMap(
    vm.runInNewContext(`(${literalMatch[1]})`, Object.create(null), { timeout: 1000 }),
    "Expanded dictionary",
  );
  // Retain interface labels and static product statuses. Russian-to-Russian
  // repair entries in the source are intentionally excluded.
  return Object.fromEntries(Object.entries(dictionary).filter(([key, value]) => /[A-Za-z]/.test(key) && value.length > 0));
}

const dictionary = {
  ...readExpandedDictionary(expandedSourcePath),
  ...readBaseDictionary(baseSourcePath),
  // Present in Antigravity 2.17.0 but missing from the reviewed phrase source.
  "No Project": "Без проекта",
  "Model": "Модель",
  "View Usage": "Использование",
  "High capability": "Высокая точность",
  "High Capability": "Высокая точность",
  "High accuracy": "Высокая точность",
  "Fast": "Быстрый",
  "Medium": "Средний",
  "Economy": "Экономный",
  "Agent terminated due to error": "Агент остановлен из-за ошибки",
  "Agent execution terminated due to error": "Выполнение агента прервано из-за ошибки",
  "Agent execution terminated due to error.": "Выполнение агента прервано из-за ошибки.",
  "You can prompt the model to try again or start a new conversation if the error persists.": "Попросите модель повторить попытку или начните новый диалог, если ошибка повторится.",
  "See our troubleshooting guide for more help.": "Подробнее — в руководстве по устранению неполадок.",
  "Copy debug": "Копировать отладочные данные",
  "Copy debug info": "Копировать отладочные данные",
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(dictionary, null, 2)}\n`, "utf8");
console.log(`Created ${outputPath} with ${Object.keys(dictionary).length} static UI entries.`);
