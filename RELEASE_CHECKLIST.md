# Release checklist

Run this checklist before creating a GitHub release or merging a public pull
request.

- [ ] Confirm the change contains only source, dictionary entries and documents
      that we have the right to distribute.
- [ ] Confirm no Antigravity binary, `app.asar`, backup, account data, prompt,
      chat, screenshot with private content, manifest or local path is tracked.
- [ ] Run `npm ci` and `npm test` with Node.js 22.12+.
- [ ] Run `node scripts/audit-ui-copy.js --binary <application resources/bin/language_server[.exe]> --out <local evidence>/ui-copy-audit.json` on the exact new application version. Review all missing UI copy and explicit exclusions before publishing; do not commit the extracted application bundle. Preserve model names, modes, commands and private content.
- [ ] If the app is already running, run `node scripts/audit-runtime-ui.js --port-file <existing DevToolsActivePort> --out <local evidence>/runtime-ui-copy.json` to check server-provided model badges and loaded system notices, including disabled models. Do not launch or interact with the app just for this check; preserve incomplete coverage and review unknown notices rather than treating them as translated.
- [ ] Test install and rollback on an isolated copy of `app.asar` together
      with `app.asar.unpacked` when the application uses external ASAR files.
- [ ] Review `npm ls --all` and `THIRD_PARTY_NOTICES.md` after a dependency
      update; commit the new lock file only after licences and integrity fields
      are checked.
- [ ] Run a secret scan of the complete reachable Git history, not only the
      working tree.
- [ ] Test install and `--restore` on a disposable copy of the matching
      Antigravity 2.24.0 installation. Do not test on an active work profile.
- [ ] Confirm the GitHub Actions matrix passes on Windows, Linux and macOS,
      including the Linux/macOS synthetic `install -> verify -> restore` smoke
      test and macOS ad-hoc signature verification.
- [ ] Package Unix downloads as `.tar.gz` so executable bits on `.sh` and
      `.command` files are preserved.
- [ ] Recheck the current Google terms and application-integrity behaviour.
- [ ] Confirm that release notes state the supported Antigravity version and
      that the project is unofficial.
