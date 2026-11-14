"use strict";
const assert = require("node:assert/strict");
const vm = require("node:vm");
const translate = require("./settings-copy.js");
const { translateAuditedUiCopy } = require("../localize-antigravity-ru.js");

const cases = [
  ["You have used some of your 5-hour limit, it will fully refresh in 2 hours, 58 minutes.", "Вы использовали часть лимита на 5 часов. Он полностью восстановится через 2 часа, 58 минут."],
  ["You have used some of your 5-hour limit, it will fully refresh in 1 hour, 11 minutes and 21 seconds.", "Вы использовали часть лимита на 5 часов. Он полностью восстановится через 1 час, 11 минут, 21 секунду."],
  ["Version 3.0.0 on Antigravity 2.32.1.", "Версия 3.0.0 для Antigravity 2.32.1."],
  ["0 installed, 0 on.", "Установлено: 0. Включено: 0."],
  ["12 installed, 3 running.", "Установлено: 12. Работает: 3."],
  ["C:\\Example\\BetterGravity\nThis is outside Antigravity, so your themes and plugins survive updates and reinstalls.", "C:\\Example\\BetterGravity\nЭта папка находится вне Antigravity, поэтому темы и плагины сохраняются при обновлениях и переустановке."],
];
const isolated = vm.runInNewContext("(" + translate.toString() + ")");
for (const [source, expected] of cases) {
  assert.equal(translate(source), expected);
  assert.equal(isolated(source), expected, "Renderer function must have no missing closure dependencies");
  assert.equal(translateAuditedUiCopy(source), expected);
}
for (const text of [
  "Gemini 4 Carbon (High)",
  "You have used some of your 5-hour limit, it will fully refresh in PRIVATE_VALUE.",
  "Version custom on Antigravity 2.32.1.",
  "0 installed, 0 running.\nPRIVATE_VALUE",
  "You have used some of your 5-hour limit, it will fully refresh in 2 hours.\nPRIVATE_VALUE",
]) assert.equal(translate(text), null, "Unexpected or private input must not match a settings template");
assert.equal(translateAuditedUiCopy("Interface Layout"), "Вид интерфейса");
assert.equal(translateAuditedUiCopy("Software Engineering"), "Разработка ПО");
console.log("Settings copy passed: real limit/version/count/path examples, renderer serialization and rejected unrelated input.");
