# Локальный русификатор Antigravity 2.17.0

Пакет переводит фиксированные подписи, статусы, уведомления, сообщения об ошибках и диалоги разрешений интерфейса Google Antigravity 2.17.0 на русском языке. Он использует только локальный словарь и не передаёт запросы, ответы, файлы, код или историю диалогов во внешние сервисы.

`localize-antigravity-ru.js` перед изменением создаёт резервную копию исходного приложения в `C:\Users\vlado\AppData\Local\Programs\antigravity\resources\app.asar.antigravity-ru-original.bak`. Для отката используется `node localize-antigravity-ru.js --restore` после закрытия Antigravity.

Словарь собран только из статических блоков `DICT` проверенного MIT-проекта `j46871417-ui/Antigravity-Localizer` (commit `8a6954cd1852397e893e9e60f08dea3f1f92fb35`). Его правила и функции онлайн-перевода не используются. Механизм распаковки адаптирован по структуре Antigravity 2.16.0 из `Silas-02/antigravity-desktop-cn` (commit `e78432b826d9561b9f79c1222bf7abb26eb6de50`), а точки встраивания отдельно проверены на установленной Antigravity 2.17.0. Инъекция написана заново для русского статического словаря.

Для пересборки словаря укажите оба файла-источника явно:

```powershell
node build-static-dictionary.js <путь-к-dom_translator.js> <путь-к-i18n-ru.js>
```
