# Provenance and distribution boundary

## What this repository contains

The tracked public package contains its own Node.js patcher, a static Russian
dictionary, documentation and a pinned package dependency. It does **not**
contain an Antigravity binary, `app.asar`, a modified application archive,
account data, prompts, chats, browser state or local backup files.

## Third-party material

- `dicts/ru.json` is assembled from static `DICT` strings in
  `j46871417-ui/Antigravity-Localizer`, commit
  `8a6954cd1852397e893e9e60f08dea3f1f92fb35`, under MIT. The notice is in
  `THIRD_PARTY_NOTICES.md`.
- `@electron/asar` 4.3.0 is an MIT dependency installed from the pinned npm
  lock file. It is used as a local archive tool and is not vendored here.

## Compatibility research boundary

`Silas-02/antigravity-desktop-cn` was reviewed only to understand the expected
Antigravity 2.17.0 resource layout. Its local source checkout has no tracked
licence file. Therefore no source code, dictionary, binary or asset from that
project is included or accepted as a dependency in this repository.

As a reproducibility check during the 2026-09-26 publication hardening, an
exact whitespace/comment-normalized comparison found no common ten-line source
block between this patcher and that checkout. This is a technical provenance
check, not a legal opinion. Do not add material from that project unless a
compatible licence and the exact copied material are recorded first.

## Release rule

Distribute this repository only as source plus its dependency lock. Do not
bundle or upload Google Antigravity files. Recheck the then-current Google
terms and the target application's update/integrity behaviour before each
release.
