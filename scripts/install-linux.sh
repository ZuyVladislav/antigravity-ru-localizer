#!/usr/bin/env bash
set -euo pipefail

[[ "$(uname -s)" = Linux ]] || { printf 'Этот установщик предназначен для Linux.\n' >&2; exit 1; }
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
exec "$SCRIPT_DIR/install-unix.sh" "$@"
