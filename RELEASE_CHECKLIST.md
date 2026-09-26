# Release checklist

Run this checklist before creating a GitHub release or merging a public pull
request.

- [ ] Confirm the change contains only source, dictionary entries and documents
      that we have the right to distribute.
- [ ] Confirm no Antigravity binary, `app.asar`, backup, account data, prompt,
      chat, screenshot with private content, manifest or local path is tracked.
- [ ] Run `npm ci` and `npm test` with Node.js 22.12+.
- [ ] Test install and rollback on an isolated copy of `app.asar` together
      with `app.asar.unpacked` when the application uses external ASAR files.
- [ ] Review `npm ls --all` and `THIRD_PARTY_NOTICES.md` after a dependency
      update; commit the new lock file only after licences and integrity fields
      are checked.
- [ ] Run a secret scan of the complete reachable Git history, not only the
      working tree.
- [ ] Test install and `--restore` on a disposable copy of the matching
      Antigravity 2.17.0 installation. Do not test on an active work profile.
- [ ] Recheck the current Google terms and application-integrity behaviour.
- [ ] Confirm that release notes state the supported Antigravity version and
      that the project is unofficial.
