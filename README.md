# Локальный русификатор Antigravity 2.17.0

Пакет переводит фиксированные подписи, статусы, уведомления, сообщения об ошибках и диалоги разрешений интерфейса Google Antigravity 2.17.0 на русском языке. Он работает на Windows, Linux и macOS, использует только локальный словарь и не передаёт запросы, ответы, файлы, код или историю диалогов во внешние сервисы.

Это независимый неофициальный патчер, не связанный с Google. Он изменяет только локальную копию приложения, требует резервную копию для отката и поддерживает **только Antigravity 2.17.0**. Пакет не содержит `app.asar`, бинарники Antigravity, учётные данные, журналы или пользовательские материалы.

## Подготовка

Нужен Node.js **22.12+**. Зависимость `@electron/asar` зафиксирована в `package-lock.json`; автоматическое скачивание через `npx -y` не используется.

В корневой папке пакета один раз выполните:

```bash
npm ci
npm test
```

`npm ci` устанавливает ровно версии из lock-файла и не запускает сценарии зависимостей. Если проверка не проходит, не применяйте патч к Antigravity.

После установки создаётся `install-manifest.json`, который игнорируется Git. Для автоматизированной проверки его можно направить в отдельный абсолютный путь через переменную `ANTIGRAVITY_RU_MANIFEST_PATH`.

Перед изменением `localize-antigravity-ru.js` сохраняет исходный `app.asar` как `app.asar.antigravity-ru-original.bak` в той же директории. Если в установленной версии есть соседняя папка `app.asar.unpacked`, скрипт сначала сверяет её с архивом, сохраняет исходную схему распакованных файлов при пересборке и останавливается до замены архива при любом несовпадении. Закройте Antigravity перед установкой, проверкой или откатом.

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

## macOS

Поддерживается самостоятельное приложение `Antigravity.app`, а не отдельная Antigravity IDE с распакованной структурой файлов. Скрипт ищет:

```text
/Applications/Antigravity.app/Contents/Resources
~/Applications/Antigravity.app/Contents/Resources
```

Сначала проверьте путь:

```bash
node localize-antigravity-ru.js --inspect
```

Для приложения в `/Applications` обычно требуются права администратора:

```bash
sudo node localize-antigravity-ru.js --resources=/Applications/Antigravity.app/Contents/Resources --inspect
sudo node localize-antigravity-ru.js --resources=/Applications/Antigravity.app/Contents/Resources
```

После установки и отката скрипт автоматически применяет локальную ad-hoc подпись через системный `codesign`, а затем проверяет её. Она заменяет подпись Google только у изменённой локальной копии приложения; следующая официальная установка или обновление вернёт исходный `app.asar`.

Откат:

```bash
sudo node localize-antigravity-ru.js --resources=/Applications/Antigravity.app/Contents/Resources --restore
```

Словарь собран только из статических блоков `DICT` MIT-проекта `j46871417-ui/Antigravity-Localizer` (commit `8a6954cd1852397e893e9e60f08dea3f1f92fb35`). Его правила и функции онлайн-перевода не используются. Публичный пакет не содержит исходников, словарей или ресурсов других русификаторов; происхождение и границы сторонних материалов описаны в `PROVENANCE.md` и `THIRD_PARTY_NOTICES.md`. Точки встраивания отдельно проверяются для Antigravity 2.17.0.

Для пересборки словаря укажите оба файла-источника явно:

```powershell
node build-static-dictionary.js <путь-к-dom_translator.js> <путь-к-i18n-ru.js>
```
