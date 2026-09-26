# Contributing

## Scope

Contributions may improve only fixed Antigravity 2.17.0 interface labels,
installer safety and deterministic local checks. Do not add translation of user
prompts, assistant responses, source code, terminals, files, browser content or
network-backed translation.

## Source boundary

Never copy Antigravity binaries, `app.asar`, decompiled application source,
screenshots containing private content, account/session material or source and
assets from another localizer unless its licence is recorded and compatible.
Add third-party notices before accepting any externally sourced dictionary
entries or code.

## Before proposing a change

1. Run `npm ci` and `npm test` with Node.js 22.12+.
2. Confirm that the change is reversible and that it preserves the original
   backup before modifying a real application installation.
3. Test only with a disposable local copy. Copy both `app.asar` and its
   neighbouring `app.asar.unpacked` directory when it exists; set
   `ANTIGRAVITY_RU_MANIFEST_PATH` to an isolated absolute path and do not
   commit generated manifests, backups or archives.
4. Keep the README, `PROVENANCE.md` and `THIRD_PARTY_NOTICES.md` accurate.
