"use strict";

// Reviewed counters and fixed UI verbs. Identifiers and numeric spelling stay intact.
function translateUiCount(value) {
  if (typeof value !== "string" || value.length > 1000 || /[\r\n]/.test(value)) return null;
  const plural = (count, forms) => {
    const number = Number(count);
    return forms[number % 100 >= 11 && number % 100 <= 14 ? 2 : number % 10 === 1 ? 0 : number % 10 >= 2 && number % 10 <= 4 ? 1 : 2];
  };
  let match = /^([0-9]{1,10}) (seconds?|comments?|questions?|tools?|accounts?|rows?)$/.exec(value);
  if (match) {
    const unit = match[2].replace(/s$/, "");
    const forms = { second: ["секунда", "секунды", "секунд"], comment: ["комментарий", "комментария", "комментариев"], question: ["вопрос", "вопроса", "вопросов"], tool: ["инструмент", "инструмента", "инструментов"], account: ["аккаунт", "аккаунта", "аккаунтов"], row: ["строка", "строки", "строк"] };
    return match[1] + " " + plural(match[1], forms[unit]);
  }
  if ((match = /^([0-9]{1,10}) \/ ([0-9]{1,10}) rows$/.exec(value))) return "Строки: " + match[1] + " из " + match[2];
  if ((match = /^Step ([0-9]{1,10}) of ([0-9]{1,10})$/.exec(value))) return "Шаг " + match[1] + " из " + match[2];
  if ((match = /^(Turn|Bar|Line) ([0-9]{1,10})$/.exec(value))) return ({ Turn: "Ход", Bar: "Столбец", Line: "Линия" })[match[1]] + " " + match[2];
  if ((match = /^Downloads, ([0-9]{1,3}(?:\.[0-9]+)?)% complete$/.exec(value))) return "Загрузки: " + match[1] + "%";
  if ((match = /^Reset ([0-9]{1,10}) overrides?$/.exec(value))) return "Сбросить переопределения (" + match[1] + ")";
  if ((match = /^Show ([0-9]{1,10}) breakdowns?$/.exec(value))) return "Показать детализацию (" + match[1] + ")";
  if ((match = /^Stop ([0-9]{1,10}) selected$/.exec(value))) return "Остановить выбранные (" + match[1] + ")";
  if ((match = /^([0-9]{1,10}) files? changed$/.exec(value))) return "Изменено файлов: " + match[1];
  if ((match = /^\(([0-9]{1,10}) steps?\)$/.exec(value))) return "(шагов: " + match[1] + ")";
  if ((match = /^\+([0-9]{1,10}) (more|attachments)$/.exec(value))) return match[2] === "more" ? "Еще " + match[1] : "Вложений: " + match[1];
  if ((match = /^([^\r\n]{1,160}): ([0-9]{1,10}) tokens?$/.exec(value))) return match[1] + ": " + match[2] + " " + plural(match[2], ["токен", "токена", "токенов"]);
  if ((match = /^(Push|Pushed) ([0-9]{1,10}) commits? to ([^\r\n]{1,300})$/.exec(value))) {
    const destination = match[3];
    if (match[1] === "Pushed" && !destination.endsWith(".")) return null;
    return match[1] === "Push" ? "Отправить коммиты (" + match[2] + ") в " + destination : "Отправлено коммитов: " + match[2] + ". Ветка: " + destination;
  }
  if ((match = /^(Submit|Continue)([ \t]*\((?:[A-Za-z+⌘⌥⇧↵⏎ -]{1,80})\))$/.exec(value))) return (match[1] === "Submit" ? "Отправить" : "Продолжить") + match[2];
  return null;
}

module.exports = translateUiCount;
