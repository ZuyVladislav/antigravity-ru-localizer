# Security policy

## Supported scope

Only the current `2.17.0` localizer source is maintained. It is intended for a
local copy of Antigravity 2.17.0 and must not be used to distribute Antigravity
binaries, `app.asar`, account data, browser profiles, session files, logs or
user prompts.

## Reporting a vulnerability

Do not publish a proof of concept containing private data. Use GitHub's private
security advisory for this repository when it is enabled; otherwise contact the
maintainer privately through GitHub. Include the localizer version, Node.js
version, operating system, minimal reproduction and whether rollback restored
the original archive.

## Maintainer rules

- Keep dependencies pinned in `package-lock.json` and install them with `npm ci`.
- Do not add network translation, telemetry, analytics or remote update code.
- Do not commit local manifests, backups, `node_modules`, screenshots containing
  private content, credentials or an Antigravity application archive.
- Treat a failure to create or restore the backup as a hard stop.
