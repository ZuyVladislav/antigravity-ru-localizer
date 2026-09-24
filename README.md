# Локальный русификатор Antigravity 2.17.0

Пакет переводит фиксированные подписи, статусы, уведомления, сообщения об ошибках и диалоги разрешений интерфейса Google Antigravity 2.17.0 на русском языке. Он работает на Windows и Linux, использует только локальный словарь и не передаёт запросы, ответы, файлы, код или историю диалогов во внешние сервисы.

Перед изменением `localize-antigravity-ru.js` сохраняет исходный `app.asar` как `app.asar.antigravity-ru-original.bak` в той же директории. Закройте Antigravity перед установкой, проверкой или откатом.

## Windows

Стандартная установка находится в `C:\Users\<имя>\AppData\Local\Programs\antigravity\resources`.

```powershell
node localize-antigravity-ru.js --inspect
node localize-antigravity-ru.js
```

Откат:

```powershell
node localize-antigravity-ru.js --restore
```

## Linux

Поддержаны распакованная и системная установки. Скрипт автоматически ищет `app.asar` в:

```text
/opt/antigravity/resources
/opt/Antigravity/resources
~/.local/opt/antigravity/resources
~/.local/opt/Antigravity/resources
~/.local/share/antigravity/resources
~/Applications/antigravity/resources
~/Applications/Antigravity/resources
```

Сначала проверьте выбранный путь без изменений:

```bash
node localize-antigravity-ru.js --inspect
```

Если Antigravity распакован в другую директорию, явно передайте абсолютный путь ровно к папке `resources`:

```bash
node localize-antigravity-ru.js --resources="$HOME/Applications/Antigravity/resources" --inspect
node localize-antigravity-ru.js --resources="$HOME/Applications/Antigravity/resources"
```

Для системной установки в `/opt` необходимы права на запись в эту папку:

```bash
sudo node localize-antigravity-ru.js --resources=/opt/antigravity/resources --inspect
sudo node localize-antigravity-ru.js --resources=/opt/antigravity/resources
```

Откат выполняется тем же путём:

```bash
sudo node localize-antigravity-ru.js --resources=/opt/antigravity/resources --restore
```

AppImage не изменяется в работающем смонтированном образе. Распакуйте его в постоянную директорию либо используйте tarball-установку, затем укажите папку `resources`.

Словарь собран только из статических блоков `DICT` проверенного MIT-проекта `j46871417-ui/Antigravity-Localizer` (commit `8a6954cd1852397e893e9e60f08dea3f1f92fb35`). Его правила и функции онлайн-перевода не используются. Механизм распаковки адаптирован по структуре Antigravity 2.16.0 из `Silas-02/antigravity-desktop-cn` (commit `e78432b826d9561b9f79c1222bf7abb26eb6de50`), а точки встраивания отдельно проверены на установленной Antigravity 2.17.0. Инъекция написана заново для русского статического словаря.

Для пересборки словаря укажите оба файла-источника явно:

```powershell
node build-static-dictionary.js <путь-к-dom_translator.js> <путь-к-i18n-ru.js>
```
