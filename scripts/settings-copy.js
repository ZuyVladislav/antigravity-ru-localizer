'use strict';
function translateSettingsExtra(value) {
  let match = /^You have used some of your 5-hour limit, it will fully refresh in (.+?)\.?$/i.exec(value);
  if (match && /^[0-9]+\s+(?:days?|hours?|minutes?|seconds?)(?:(?:,\s*(?:and\s+)?|\s+(?:and\s+)?)[0-9]+\s+(?:days?|hours?|minutes?|seconds?))*$/i.test(match[1])) {
    const units = {day:['день','дня','дней'],hour:['час','часа','часов'],minute:['минуту','минуты','минут'],second:['секунду','секунды','секунд']};
    const parts = Array.from(match[1].matchAll(/([0-9]+)\s+(day|hour|minute|second)s?/gi), ([,count,unit]) => {
      const n=Number(count),form=n%100>=11&&n%100<=14?2:n%10===1?0:n%10>=2&&n%10<=4?1:2;
      return count+' '+units[unit.toLowerCase()][form];
    });
    return 'Вы использовали часть лимита на 5 часов. Он полностью восстановится через '+parts.join(', ')+'.';
  }
  match=/^Version ([0-9]+(?:\.[0-9]+){1,3}(?:[+-][A-Za-z0-9.-]+)?) on Antigravity ([0-9]+(?:\.[0-9]+){1,3})\.$/.exec(value);
  if(match)return 'Версия '+match[1]+' для Antigravity '+match[2]+'.';
  match=/^([0-9]{1,5}) installed, ([0-9]{1,5}) (on|running)\.$/.exec(value);
  if(match)return 'Установлено: '+match[1]+'. '+(match[3]==='on'?'Включено':'Работает')+': '+match[2]+'.';
  match=/^((?:[A-Za-z]:[\\/]|\/)[^\r\n]{0,511})\nThis is outside Antigravity, so your themes and plugins survive updates and reinstalls\.$/.exec(value);
  if(match)return match[1]+'\nЭта папка находится вне Antigravity, поэтому темы и плагины сохраняются при обновлениях и переустановке.';
  return null;
}
module.exports=translateSettingsExtra;
