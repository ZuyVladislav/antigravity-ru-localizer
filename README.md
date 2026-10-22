# Локальный русификатор Antigravity 2.25.0

Выпуск **2.25.0-r2** поддерживает Antigravity 2.25.0 и исправляет заголовок выполнения `Thinking` («Думает») и статус `Exited with code 1` («Завершено с кодом 1»), включая анимированные подписи. Название режима модели `Thinking`, сообщения, рассуждения и вывод команд сохраняются. Исправление продолжает выпуск r1 с 63 новыми переводами уведомлений, авторизации, голосового ввода, Google Drive и рабочих областей. В словаре 4869 переводов.

Офлайн-аудит статического интерфейса проверил 988 строк: 938 переводятся, 50 отдельно рассмотрены как технические имена, названия продуктов и режимов моделей, диагностические сообщения либо исходные инструкции. Проверены все 62 изменившихся шаблона: 58 сохранили текст при переименовании переменных сборки, три получили конкретные правила перевода, один является нативным уведомлением с генерируемым резюме агента и сохраняется без изменений. Всего учтено 186 шаблонов. Автоматические проверки включают 532 фиксированных, 93 динамических и 35 примеров заголовков операций.

Русификатор не меняет сообщения, мысли, ответы, команды, код и исходные инструкции навыков. Защищены фактические контейнеры потокового текста; слова внутри мыслей не подменяются по отдельности. `Thinking for 13s` переводится как «Думает: 13 с.», а обозначения режимов моделей остаются по-английски. Дополнительно проверяются восемь контекстных примеров статусов: отдельные заголовки, анимация и её обновления, сохранение числовых кодов и защита содержимого. Для русского языка новых видимых рассуждений и названий действий можно отдельно включить [правило](examples/russian-visible-reasoning.md) в `~/.gemini/config/rules/russian-visible-reasoning.md`. Оно не переводит старые мысли и не гарантирует язык рассуждений сервиса; патчер не устанавливает правило или переводчик автоматически.

Аудит `scripts/audit-ui-copy.js` читает только статический код приложения и останавливает выпуск при непроверенных строках или шаблонах. Проверка `scripts/audit-runtime-ui.js` читает только подписи и описания всех загруженных серверных моделей, включая недоступные модели, и метаданные системных карточек. Проверка не запускает приложение, не открывает меню и не читает переписку, введённые значения, ключи или сведения о лимитах. Закрытое приложение или незагруженные данные означают неполное покрытие. Нативные системные уведомления с резюме агента находятся вне области DOM-перевода и не переписываются.

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

Обновление Antigravity заменяет `app.asar` и сбрасывает русификацию. После обновления используйте выпуск русификатора для новой версии приложения и повторите установку; старый патчер остановится при несовпадении версий.

## Windows

Стандартная установка находится в `C:\Users\<имя>\AppData\Local\Programs\antigravity\resources`.

```powershell
node localize-antigravity-ru.js --inspect
node localize-antigravity-ru.js
node localize-antigravity-ru.js --verify
```

Откат:

```powershell
node localize-antigravity-ru.js --restore
```

## Linux

Официальные сборки x64 и ARM64 поддерживаются одинаково: русификатор изменяет JavaScript-архив приложения и не зависит от архитектуры процессора. Удобный установщик сам проверяет Node.js, при необходимости выполняет `npm ci --ignore-scripts`, находит приложение, не позволяет менять файлы запущенной Antigravity и после установки выполняет полную проверку:

```bash
chmod +x scripts/install-linux.sh scripts/install-unix.sh
./scripts/install-linux.sh inspect
./scripts/install-linux.sh install
```

Проверка и откат:

```bash
./scripts/install-linux.sh verify
./scripts/install-linux.sh restore
```

Для системной установки установщик сам вызывает `sudo` только для патчера. Зависимости всегда устанавливаются заранее от имени обычного пользователя.

Поддержаны официальные DEB/RPM-пакеты, распакованный tarball и пользовательские установки. Скрипт автоматически ищет `app.asar` в:

```text
/opt/antigravity/resources
/opt/Antigravity/resources
/opt/Antigravity/Antigravity-x64/resources
/opt/Antigravity/Antigravity-arm64/resources
/usr/share/antigravity/resources
/usr/lib/antigravity/resources
/usr/lib64/antigravity/resources
~/.local/opt/antigravity/resources
~/.local/opt/Antigravity/resources
~/.local/share/antigravity/resources
~/.local/share/Antigravity/resources
~/Applications/antigravity/resources
~/Applications/Antigravity/resources
```

Если Antigravity распакован в другую директорию, явно передайте абсолютный путь ровно к папке `resources`:

```bash
./scripts/install-linux.sh inspect --resources="$HOME/Applications/Antigravity/resources"
./scripts/install-linux.sh install --resources="$HOME/Applications/Antigravity/resources"
```

AppImage не изменяется в работающем смонтированном образе. Распакуйте его в постоянную директорию либо используйте tarball-установку, затем укажите папку `resources`.

## macOS

Поддерживаются Apple Silicon и Intel начиная с macOS 12 — код русификатора одинаков для обеих архитектур. Поддерживается самостоятельное приложение `Antigravity.app`, а не отдельная Antigravity IDE с распакованной структурой файлов. Скрипт ищет:

```text
/Applications/Antigravity.app/Contents/Resources
~/Applications/Antigravity.app/Contents/Resources
```

Закройте Antigravity, сделайте установщики исполняемыми и запустите:

```bash
chmod +x scripts/install-macos.command scripts/install-unix.sh
./scripts/install-macos.command inspect
./scripts/install-macos.command install
```

Проверка и откат:

```bash
./scripts/install-macos.command verify
./scripts/install-macos.command restore
```

Если приложение находится в `/Applications`, установщик сам запросит права администратора для изменения этой копии. Явный путь с правильным для macOS регистром также поддержан:

```bash
./scripts/install-macos.command install --resources=/Applications/Antigravity.app/Contents/Resources
```

После установки и отката скрипт автоматически применяет локальную ad-hoc подпись через системный `codesign`, сохраняет доступные метаданные предыдущей подписи и проверяет всю структуру приложения командами `--deep --strict`. Она заменяет подпись Google только у изменённой локальной копии приложения; следующая официальная установка или обновление вернёт исходный `app.asar`.

Ручные команды для диагностики остаются доступны на обеих системах:

```bash
node localize-antigravity-ru.js --resources=/absolute/path/to/resources --inspect
node localize-antigravity-ru.js --resources=/absolute/path/to/resources --verify
```

CI запускает одинаковые проверки словаря и структуры на Windows, Linux и macOS. На Linux и macOS дополнительно создаётся синтетическая Electron-установка, после чего проверяется полный цикл `install → verify → restore`; в macOS в этот цикл входит локальная подпись и её строгая проверка. Реальный интерфейс всё равно нужно визуально проверить на целевой машине после запуска приложения.

Словарь собран только из статических блоков `DICT` MIT-проекта `j46871417-ui/Antigravity-Localizer` (commit `8a6954cd1852397e893e9e60f08dea3f1f92fb35`). Его правила и функции онлайн-перевода не используются. Публичный пакет не содержит исходников, словарей или ресурсов других русификаторов; происхождение и границы сторонних материалов описаны в `PROVENANCE.md` и `THIRD_PARTY_NOTICES.md`. Точки встраивания отдельно проверяются для Antigravity 2.25.0.

Для пересборки словаря укажите оба файла-источника явно:

```powershell
node build-static-dictionary.js <путь-к-dom_translator.js> <путь-к-i18n-ru.js>
```
