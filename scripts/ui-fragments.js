"use strict";
const sources = ["the", "an", "An", "automation.", "and", "of", "at", "on the", "with", "in", "to", "projects", "workspaces"];

// Short grammatical fragments need a reviewed system context. They must not
// translate a project name, model label, code token or other standalone value.
function translateUiFragment(source, contexts) {
  if (!Array.isArray(contexts)) return null;
  const text = contexts.map(item => item.text || "").join("\n");
  const ids = new Set(contexts.flatMap(item => [item.testId, ...(item.controls || [])]));
  const inProduct = /^in ([^\r\n]{1,80})$/.exec(source);
  if (inProduct && /Plugins are packaged collections|work with Google developer products|Плагины.*(?:набор|комплект)|продуктами Google/.test(text)) return "в " + inProduct[1];
  if (["the", "an", "automation."].includes(source) && /This project was created for|(?:проект|Проект).*создан.*для/.test(text)) return source === "automation." ? "." : "";
  if (source === "An" && ids.has("new-sidecar-name-exists")) return "";
  if (source === "and" && /Terms of Service|Privacy Policy|Условия использования|Политик[аи] конфиденциальности/.test(text)) return "и";
  if (source === "of" && /(?:Card|Карточка|Карта)\s*[0-9]+\s+(?:of|из)\s*[0-9]+/.test(text)) return "из";
  if (["at", "on the"].includes(source) && /Repeat every|Повторять каждые|When should it run|Когда запускать|Schedule|Расписание/.test(text)) return source === "at" ? "в" : "числа";
  if (source === "with" && ids.has("automation-model-value")) return "с моделью";
  if (source === "in" && ids.has("sidecar-project-link") && /Runs a command|Выполняет команду/.test(text)) return "в";
  if (source === "to" && /(?:Commit|Коммит|Зафиксировать|Создать коммит).*?(?:file|файл|изменен)/.test(text)) return "в";
  if (["projects", "workspaces"].includes(source) && /No (?:matching |remote )?|Нет|Не найден/.test(text)) return source === "projects" ? "проектов" : "рабочих пространств";
  return null;
}

module.exports = { sources, translateUiFragment };
