#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
PATCHER="$SCRIPT_DIR/localize-antigravity-ru.js"
ACTION=install
RESOURCES=""

die() {
  printf 'Ошибка: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Установка русификатора Antigravity 2.22.0 на Linux и macOS.

Использование:
  ./scripts/install-unix.sh [install|inspect|verify|restore] [--resources=/absolute/path]

Команды:
  install   установить русификатор (по умолчанию)
  inspect   только показать найденную установку
  verify    проверить установленный русификатор и резервную копию
  restore   восстановить исходный app.asar
EOF
}

for argument in "$@"; do
  case "$argument" in
    install|inspect|verify|restore) ACTION=$argument ;;
    --resources=*) RESOURCES=${argument#--resources=} ;;
    --help|-h) usage; exit 0 ;;
    *) die "неизвестный аргумент: $argument" ;;
  esac
done

case "$(uname -s)" in
  Linux) PLATFORM=linux ;;
  Darwin) PLATFORM=darwin ;;
  *) die "этот установщик предназначен только для Linux и macOS" ;;
esac
command -v node >/dev/null 2>&1 || die "не найден Node.js 22.12 или новее"
NODE_BIN=$(command -v node)
"$NODE_BIN" -e 'const [major,minor]=process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 12) || major >= 23) process.exit(1)' \
  || die "нужен Node.js версии 22.12–22.x; найдена версия $(node --version)"

PATCH_ARGS=()
if [[ -n "$RESOURCES" ]]; then
  [[ "$RESOURCES" = /* ]] || die "--resources должен содержать абсолютный путь"
  PATCH_ARGS+=("--resources=$RESOURCES")
fi

INSPECTION=$($NODE_BIN "$PATCHER" "${PATCH_ARGS[@]}" --inspect) || exit $?
TARGET_RESOURCES=$(printf '%s' "$INSPECTION" | "$NODE_BIN" -e '
let data="";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => data += chunk);
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  if (!parsed.resources) process.exit(1);
  process.stdout.write(parsed.resources);
});
') || die "не удалось определить папку ресурсов Antigravity"

if [[ "$ACTION" = inspect ]]; then
  printf '%s\n' "$INSPECTION"
  exit 0
fi

if [[ "$ACTION" = install || "$ACTION" = verify ]]; then
  if [[ ! -f "$SCRIPT_DIR/node_modules/@electron/asar/package.json" ]]; then
    command -v npm >/dev/null 2>&1 || die "не найден npm; он нужен для установки закреплённой зависимости @electron/asar"
    printf 'Устанавливаю закреплённые зависимости локализатора...\n'
    (cd "$SCRIPT_DIR" && npm ci --ignore-scripts)
  fi
fi

if [[ "$ACTION" = install || "$ACTION" = restore ]]; then
  PROCESS_NAME=antigravity
  [[ "$PLATFORM" = darwin ]] && PROCESS_NAME=Antigravity
  if command -v pgrep >/dev/null 2>&1 && pgrep -x "$PROCESS_NAME" >/dev/null 2>&1; then
    die "Antigravity запущена. Закройте приложение полностью и повторите команду."
  fi
fi

if [[ "$PLATFORM" = darwin ]]; then
  STATE_DIR="$HOME/Library/Application Support/Antigravity RU Localizer"
else
  STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/antigravity-ru-localizer"
fi
mkdir -p "$STATE_DIR"
MANIFEST="$STATE_DIR/install-manifest.json"
[[ -e "$MANIFEST" ]] || : > "$MANIFEST"

run_patcher() {
  local mode=$1
  shift
  local command_args=("$PATCHER" "${PATCH_ARGS[@]}" "$mode" "$@")
  if [[ "$mode" = --verify || ( -w "$TARGET_RESOURCES" && -w "$TARGET_RESOURCES/app.asar" ) ]]; then
    ANTIGRAVITY_RU_MANIFEST_PATH="$MANIFEST" "$NODE_BIN" "${command_args[@]}"
    return
  fi
  command -v sudo >/dev/null 2>&1 || die "нет прав записи в $TARGET_RESOURCES и не найден sudo"
  printf 'Для изменения системной установки нужны права администратора: %s\n' "$TARGET_RESOURCES"
  sudo env "ANTIGRAVITY_RU_MANIFEST_PATH=$MANIFEST" "$NODE_BIN" "${command_args[@]}"
}

case "$ACTION" in
  install)
    run_patcher --install
    run_patcher --verify
    printf 'Русификатор установлен и проверен. Запустите Antigravity обычным способом.\n'
    ;;
  verify)
    run_patcher --verify
    ;;
  restore)
    run_patcher --restore
    printf 'Исходный app.asar восстановлен.\n'
    ;;
esac
