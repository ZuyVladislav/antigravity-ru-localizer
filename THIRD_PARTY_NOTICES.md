# Third-party notices

`dicts/ru.json` is assembled from static UI strings in
[`j46871417-ui/Antigravity-Localizer`](https://github.com/j46871417-ui/Antigravity-Localizer),
commit `8a6954cd1852397e893e9e60f08dea3f1f92fb35`.

The upstream project supplies those strings under the MIT License:

```text
MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

`@electron/asar` 4.3.0 is installed by `npm ci` from the lock file and is not
vendored in this repository. It is an MIT-licensed Electron Archive CLI:
<https://github.com/electron/asar>. It is used only to unpack, repack and list
the user's local ASAR archive.

The locked dependency graph was checked on 2026-09-26. In addition to
`@electron/asar` 4.3.0 (MIT), it contains `balanced-match` 4.0.4,
`brace-expansion` 5.0.12 and `minipass` 7.1.3 (MIT), plus `glob` 13.0.6,
`lru-cache` 11.5.3, `minimatch` 10.2.6 and `path-scurry` 2.0.2
(BlueOak-1.0.0). Every resolved package has an integrity value in
`package-lock.json`.
