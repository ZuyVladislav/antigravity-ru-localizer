// Local follow-up suggestions, copy only.
;(() => {
  if (typeof location === 'undefined') return
  if (typeof process !== 'undefined' && process.isMainFrame === false) return
  if (location.protocol !== 'https:' || location.hostname !== '127.0.0.1' || window.agLocalTabInstalled) return
  window.agLocalTabInstalled = true
  const boxSel = '[data-testid="agent-input-box"]'
  const answerSel = '[data-testid="planner-response-text"]'
  const rowsSel = answerSel + ',[data-testid="user-message-bubble"]'
  const chip = document.createElement('div')
  chip.dataset.agLocalTab = '1'
  chip.setAttribute('aria-hidden','true')
  const style=document.createElement('style')
  style.textContent=`
    [data-testid="agent-input-box"] div:has(> [data-ag-local-tab]:not([hidden])) {display:grid}
    [data-testid="agent-input-box"] div:has(> [data-ag-local-tab]:not([hidden])) > [contenteditable] {grid-area:1/1}
    [data-testid="agent-input-box"] div:has(> [data-ag-local-tab]:not([hidden])) > p.pointer-events-none {visibility:hidden}
    [data-testid="agent-input-box"] [data-ag-local-tab]:not([hidden]) {grid-area:1/1;position:relative;inset:auto;align-self:start;min-width:0;white-space:normal;overflow-wrap:anywhere;margin:0;padding:.5rem;pointer-events:none}
  `
  chip.hidden = true
  let dismissed, raf = 0, shown
  // Use the most recent actionable statement. Keep paths and concrete subjects
  // from the answer, but never turn an arbitrary quoted command into a draft.
  function nextStep(lines) {
    const statements = lines.slice(-12).join(' ').split(/(?<=[.!?])\s+|\s+но\s+/iu).filter(Boolean)
    const text = statements.join(' ')
    const target = text.match(/(?:^|[\s«`(])([\w./-]+\.(?:js|ts|py|json|css|md|docx|xlsx))(?=$|[\s»`).,:])/i)?.[1]
    const where = target ? ' в '+target : ''
    for (const s of statements.reverse()) {
      if (/^(например|допустим|если|предположим)|\sесли\s|[?]$/iu.test(s)) continue
      const pending=s.match(/(?:^|[\s,;])(?:осталось|далее следует|следующий шаг\s*[:–-]?)\s+(проверить|сравнить|уточнить|разобрать|протестировать|сопоставить)\s+([^.!?]{3,130})/iu)
      if(pending && !/[<>`{}]|(?:\sи\s|[,;])\s*(?:удалить|отправить|опубликовать|запустить|установить)/iu.test(pending[2])) {
        const verb={проверить:'Проверь',сравнить:'Сравни',уточнить:'Уточни',разобрать:'Разбери',протестировать:'Протестируй',сопоставить:'Сопоставь'}[pending[1].toLowerCase()]
        return verb+' '+pending[2].trim().replace(/[:,;]+$/,'')+'.'
      }
      if (/(?:не\s+(?:прогонял|запускал|проверял|проверено|проверил)|(?:тесты|проверки)\s+не\s+(?:запущены|проводились|запускались|выполнялись))/iu.test(s))
        return 'Проверь изменение'+where+' на исходном примере и покажи результат.'
      if (/(?:тесты|проверки)\s+(?:прошли|проходят|успешны)|проверка прошла/iu.test(s))
        return 'Какие граничные случаи'+(target?' для '+target:'')+' еще не покрыты этими проверками?'
      if (/(?:исправил|устранил|исправлена|исправлено|добавил обработку)/iu.test(s) && !/не\s+(?:исправ|устран)/iu.test(s))
        return 'Повтори исходный сценарий'+where+' и покажи, что изменилось после исправления.'
      if (/(?:нашел|обнаружил|выявил)\s+(?:причину|ошибку|сбой)|(?:причина ошибки|причина сбоя)\s*[:–-]/iu.test(s))
        return 'Покажи минимальное исправление'+where+' и как проверить его на том же примере.'
      if (/(?:выше|ниже|снизил[аи]?сь|выросл[аио]?|сократил[аи]?сь)/iu.test(s) && /\d\s*%/.test(s))
        return 'Сравни абсолютные значения и размеры выборок, чтобы оценить эту разницу.'
      const missing=s.match(/(?:для (?:расчета|сравнения|оценки|проверки))\s+(?:не хватает|нужны|отсутствуют)\s+([^.!?]{4,100})/iu)
      if(missing) return 'Как получить недостающие данные («'+missing[1].trim()+'») и в каком формате их передать?'
      if (/расхождени|не совпада/iu.test(s) && /таблиц|отчет|итог|сумм/iu.test(s))
        return 'Покажи первую строку, где значения расходятся, и как из нее складывается разница в итоге.'
    }
    return ''
  }
  function suggest(answer) {
    const lines = answer.innerText.trim().split(/\n+/).map(v=>v.trim()).filter(Boolean)
    const end = lines.at(-1) || ''
    if (!end) return ''
    const options = [...answer.querySelectorAll('li')].map(el=>el.innerText.trim())
    if (/какой|какую|который|which|выбер/i.test(end) && options.length >= 2) {
      const title = options[0].split(/\s+[—–-]\s+|[:(.\n]/)[0].replace(/^\d+[.)]\s*/,'').trim()
      if (title.length >= 3 && title.length <= 100) return 'Разбери подробнее вариант «'+title+'».'
    }
    if (/провер|протестир|тест/i.test(end) && /\?$/.test(end)) return 'Покажи, как это проверить на конкретном примере.'
    if (/пример|example/i.test(end) && /\?$/.test(end)) return 'Да, покажи пример и объясни результат.'
    const next = nextStep(lines)
    if (next) return next
    const title = [...answer.querySelectorAll('h2,h3,h4,strong')].map(el=>el.innerText.trim().replace(/[:.]$/,'')).filter(t=>t.length>=5 && t.length<=85).at(-1)
    if (title) return 'Поясни подробнее пункт «'+title+'» на примере.'
    return ''
  }
  function current() {
    const edit = document.activeElement
    if (!/^\/c\/[^/]+\/?$/.test(location.pathname) || !edit?.closest(boxSel) ||
      !edit.matches('[contenteditable="true"],textarea') || (edit.value ?? edit.textContent).trim() ||
      edit.getAttribute('aria-expanded') === 'true' ||
      [...document.querySelectorAll('[role="listbox"],[role="menu"],[role="dialog"][aria-modal="true"],[data-testid="stop-button"]')].some(n=>n.getBoundingClientRect().width && n.getBoundingClientRect().height)) return null
    const row = [...document.querySelectorAll(rowsSel)].at(-1)
    if (!row?.matches(answerSel)) return null
    const text = suggest(row)
    if (!text || text.includes(':')) return null
    const key = location.pathname+'|'+text
    return key === dismissed ? null : {text,key,edit}
  }
  function draw() {
    raf=0
    shown=current()
    chip.hidden=!shown
    if(!shown)return
    const parent=shown.edit.parentElement
    const placeholder=parent.querySelector(':scope > p.pointer-events-none')
    if(!placeholder){chip.hidden=true;return}
    if(!style.isConnected)document.head.append(style)
    if(chip.parentElement!==parent)parent.append(chip)
    chip.className=placeholder.className
    if(chip.textContent!==shown.text)chip.textContent=shown.text
  }
  const schedule=()=>{if(!raf)raf=setTimeout(draw,40)}
  const events=['focusin','focusout','input','scroll','resize','popstate']
  for(const name of events)window.addEventListener(name,schedule,true)
  const observer=new MutationObserver(changes=>{
    if(document.activeElement?.closest(boxSel) && changes.some(m=>!chip.contains(m.target)&&m.target!==chip))schedule()
  })
  const observe=()=>observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true})
  if(document.documentElement)observe();else document.addEventListener('DOMContentLoaded',observe,{once:true})
  const onKeydown=e=>{
    if(e.isComposing || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented || !shown || chip.hidden)return
    const now=current()
    if(!now || now.key!==shown.key || now.edit!==e.target)return
    if(e.key==='Escape'){dismissed=now.key;schedule();return}
    if(e.key!=='Tab')return
    if(document.execCommand('insertText',false,now.text)){
      e.preventDefault();e.stopImmediatePropagation();schedule()
    }
  }
  window.addEventListener('keydown',onKeydown,true)
  plugin.onDispose(()=>{
    document.removeEventListener('DOMContentLoaded',observe)
    for(const name of events)window.removeEventListener(name,schedule,true)
    window.removeEventListener('keydown',onKeydown,true)
    observer.disconnect()
    clearTimeout(raf)
    chip.remove()
    style.remove()
    delete window.agLocalTabInstalled
  })
  schedule()
})()
